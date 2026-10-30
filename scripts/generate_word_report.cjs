const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');
const OUTPUT_DOCX_1 = path.resolve(__dirname, '../Relatorio_Executivo_ShopRateio_Diretoria.docx');
const OUTPUT_DOCX_2 = path.resolve(__dirname, '../Relatorio_Executivo_ShopRateio_Fotos_Reais.docx');

function xmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getPngDimensions(buf) {
  // PNG IHDR chunk starts at byte 8 (length 4, 'IHDR' 4, width 4 at offset 16, height 4 at offset 20)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function wParagraph({
  text = '',
  runs = null,
  align = 'left',
  spaceBefore = 80,
  spaceAfter = 100,
  lineSpacing = 276,
  shadingFill = null,
  borderLeftColor = null,
  borderLeftSize = 24,
  borderBoxColor = null,
  keepNext = false,
  pageBreakBefore = false,
  indentLeft = 0,
  indentRight = 0
} = {}) {
  const pPrParts = [];
  if (keepNext) pPrParts.push('<w:keepNext/>');
  if (pageBreakBefore) pPrParts.push('<w:pageBreakBefore/>');

  if (borderLeftColor || borderBoxColor) {
    const bParts = [];
    if (borderBoxColor) {
      bParts.push(`<w:top w:val="single" w:sz="6" w:space="6" w:color="${borderBoxColor}"/>`);
      bParts.push(`<w:bottom w:val="single" w:sz="6" w:space="6" w:color="${borderBoxColor}"/>`);
      bParts.push(`<w:right w:val="single" w:sz="6" w:space="8" w:color="${borderBoxColor}"/>`);
    }
    if (borderLeftColor) {
      bParts.push(`<w:left w:val="single" w:sz="${borderLeftSize}" w:space="8" w:color="${borderLeftColor}"/>`);
    } else if (borderBoxColor) {
      bParts.push(`<w:left w:val="single" w:sz="6" w:space="8" w:color="${borderBoxColor}"/>`);
    }
    pPrParts.push(`<w:pBdr>${bParts.join('')}</w:pBdr>`);
  }

  if (shadingFill) {
    pPrParts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${shadingFill}"/>`);
  }

  pPrParts.push(`<w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}" w:line="${lineSpacing}" w:lineRule="auto"/>`);

  if (indentLeft || indentRight) {
    pPrParts.push(`<w:ind w:left="${indentLeft}" w:right="${indentRight}"/>`);
  }

  pPrParts.push(`<w:jc w:val="${align}"/>`);

  const runItems = runs || [{ text }];
  const runsXml = runItems
    .map(r => {
      const rPr = [];
      rPr.push('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>');
      if (r.bold) rPr.push('<w:b/>');
      if (r.italic) rPr.push('<w:i/>');
      if (r.color) rPr.push(`<w:color w:val="${r.color}"/>`);
      const sz = r.size || 21; // 10.5pt default (half-points)
      rPr.push(`<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`);
      if (r.highlight) {
        rPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${r.highlight}"/>`);
      }
      const brXml = r.breakBefore ? '<w:br/>' : '';
      return `<w:r><w:rPr>${rPr.join('')}</w:rPr>${brXml}<w:t xml:space="preserve">${xmlEscape(r.text)}</w:t></w:r>`;
    })
    .join('');

  return `<w:p><w:pPr>${pPrParts.join('')}</w:pPr>${runsXml}</w:p>`;
}

function wHeading1(numberAndTitle) {
  return wParagraph({
    keepNext: true,
    spaceBefore: 240,
    spaceAfter: 100,
    borderLeftColor: '0284C7',
    borderLeftSize: 36,
    shadingFill: 'F0F9FF',
    indentLeft: 120,
    indentRight: 120,
    runs: [
      { text: `  ${numberAndTitle}`, bold: true, size: 28, color: '0F172A' }
    ]
  });
}

function wHeading2(subtitle) {
  return wParagraph({
    keepNext: true,
    spaceBefore: 180,
    spaceAfter: 60,
    runs: [
      { text: subtitle, bold: true, size: 24, color: '0369A1' }
    ]
  });
}

function wBullet(boldLead, textBody, bulletColor = '0284C7') {
  return wParagraph({
    spaceBefore: 50,
    spaceAfter: 50,
    indentLeft: 280,
    runs: [
      { text: '•  ', bold: true, size: 21, color: bulletColor },
      { text: boldLead ? `${boldLead}: ` : '', bold: true, size: 21, color: '0F172A' },
      { text: textBody, bold: false, size: 21, color: '334155' }
    ]
  });
}

function wCalloutBox(title, body, bgFill = 'EFF6FF', borderColor = '0284C7', titleColor = '0369A1') {
  return wParagraph({
    spaceBefore: 120,
    spaceAfter: 160,
    shadingFill: bgFill,
    borderLeftColor: borderColor,
    borderLeftSize: 36,
    borderBoxColor: 'BAE6FD',
    indentLeft: 180,
    indentRight: 180,
    runs: [
      { text: `${title} — `, bold: true, size: 21, color: titleColor },
      { text: body, bold: false, size: 20, color: '1E293B' }
    ]
  });
}

function wImageParagraph(rId, docPrId, filename, widthEmu, heightEmu, captionText) {
  const drawingXml = `<w:p>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="100" w:after="60"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:rPr><w:noProof/></w:rPr>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="${docPrId}" name="Picture ${docPrId}" descr="${xmlEscape(captionText)}"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
          </wp:cNvGraphicFramePr>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="${docPrId}" name="${xmlEscape(filename)}"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${rId}"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="${widthEmu}" cy="${heightEmu}"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  <a:ln w="9525">
                    <a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill>
                  </a:ln>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;

  const captionXml = wParagraph({
    align: 'center',
    spaceBefore: 20,
    spaceAfter: 140,
    runs: [
      { text: captionText, italic: true, size: 18, color: '64748B' }
    ]
  });

  return drawingXml + captionXml;
}

function wTable(headers, rows, colWidthsTwips) {
  const totalWidth = colWidthsTwips.reduce((a, b) => a + b, 0);
  const gridCols = colWidthsTwips.map(w => `<w:gridCol w:w="${w}"/>`).join('');

  const headerCells = headers
    .map((h, i) => `<w:tc>
      <w:tcPr>
        <w:tcW w:w="${colWidthsTwips[i]}" w:type="dxa"/>
        <w:shd w:val="clear" w:color="auto" w:fill="0F172A"/>
        <w:tcMar>
          <w:top w:w="100" w:type="dxa"/>
          <w:bottom w:w="100" w:type="dxa"/>
          <w:left w:w="140" w:type="dxa"/>
          <w:right w:w="140" w:type="dxa"/>
        </w:tcMar>
        <w:vAlign w:val="center"/>
      </w:tcPr>
      ${wParagraph({
        spaceBefore: 0,
        spaceAfter: 0,
        runs: [{ text: h, bold: true, size: 19, color: 'FFFFFF' }]
      })}
    </w:tc>`)
    .join('');

  const bodyRows = rows
    .map((row, rIdx) => {
      const fill = rIdx % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
      const cells = row
        .map((cell, cIdx) => {
          const isObj = typeof cell === 'object' && cell !== null;
          const runs = isObj
            ? cell.runs
            : [{ text: String(cell), bold: cIdx === 0, size: 19, color: cIdx === 0 ? '0F172A' : '334155' }];
          const cellFill = (isObj && cell.fill) ? cell.fill : fill;
          return `<w:tc>
            <w:tcPr>
              <w:tcW w:w="${colWidthsTwips[cIdx]}" w:type="dxa"/>
              <w:shd w:val="clear" w:color="auto" w:fill="${cellFill}"/>
              <w:tcMar>
                <w:top w:w="90" w:type="dxa"/>
                <w:bottom w:w="90" w:type="dxa"/>
                <w:left w:w="140" w:type="dxa"/>
                <w:right w:w="140" w:type="dxa"/>
              </w:tcMar>
              <w:vAlign w:val="center"/>
            </w:tcPr>
            ${wParagraph({ spaceBefore: 0, spaceAfter: 0, runs })}
          </w:tc>`;
        })
        .join('');
      return `<w:tr>${cells}</w:tr>`;
    })
    .join('');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${totalWidth}" w:type="dxa"/>
      <w:jc w:val="center"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>${gridCols}</w:tblGrid>
    <w:tr><w:trPr><w:tblHeader/></w:trPr>${headerCells}</w:tr>
    ${bodyRows}
  </w:tbl>`;
}

async function generateWordReport() {
  console.log('--- Gerando Relatório Executivo em Formato WORD (.docx) para a Diretoria ---');

  const screenshots = [
    { id: 'rIdImg1', file: '01_dashboard_executivo.png', isMobile: false },
    { id: 'rIdImg2', file: '08_tecnico_campo_mobile.png', isMobile: true },
    { id: 'rIdImg3', file: '02_rateio_calculadora_desktop.png', isMobile: false },
    { id: 'rIdImg4', file: '03_checklist_fechamento_contabil.png', isMobile: false },
    { id: 'rIdImg5', file: '04_painel_continuidade_mes_anterior.png', isMobile: false },
    { id: 'rIdImg6', file: '05_justificativa_rapida_1toque.png', isMobile: false },
    { id: 'rIdImg7', file: '06_espelho_individual_lojista.png', isMobile: false },
    { id: 'rIdImg8', file: '07_relatorio_analise_consumo.png', isMobile: false },
    { id: 'rIdImg9', file: '09_gestao_cadastral_lojas.png', isMobile: false }
  ];

  const zip = new JSZip();

  // Load images & compute EMU dimensions preserving exact aspect ratio
  const imgMeta = {};
  for (let i = 0; i < screenshots.length; i++) {
    const item = screenshots[i];
    const fullPath = path.join(SCREENSHOTS_DIR, item.file);
    const buf = fs.readFileSync(fullPath);
    const { width, height } = getPngDimensions(buf);
    const mediaName = `image${i + 1}.png`;
    zip.file(`word/media/${mediaName}`, buf);

    let cx, cy;
    if (item.isMobile) {
      // Mobile screenshot: ~62mm wide, proportional height
      cx = 2250000;
      cy = Math.round(cx * (height / width));
    } else {
      // Desktop screenshot: 170mm wide (6,120,000 EMUs), proportional height
      cx = 6120000;
      cy = Math.round(cx * (height / width));
    }
    imgMeta[item.id] = { mediaName, cx, cy, file: item.file, docPrId: i + 1 };
  }

  // Build document body parts
  const body = [];

  // =========================================================================
  // CAPA E SUMÁRIO EXECUTIVO PARA A DIRETORIA
  // =========================================================================
  body.push(
    wParagraph({
      shadingFill: '0F172A',
      spaceBefore: 0,
      spaceAfter: 40,
      indentLeft: 200,
      indentRight: 200,
      runs: [
        { text: 'RELATÓRIO EXECUTIVO DE APRESENTAÇÃO À DIRETORIA', bold: true, size: 20, color: '38BDF8' },
        { text: 'ShopRateio — Gestão Inteligente e Blindagem do Rateio de Utilidades', bold: true, size: 32, color: 'FFFFFF', breakBefore: true },
        { text: 'Demonstração prática com dados reais de Água & Esgoto (Outubro/2026 • 64 Lojas • 6.081 m³ • R$ 90.679,77)', bold: false, size: 20, color: 'CBD5E1', breakBefore: true }
      ]
    })
  );

  body.push(
    wParagraph({
      spaceBefore: 100,
      spaceAfter: 120,
      runs: [
        {
          text: 'Este documento apresenta à Diretoria, em linguagem direta e orientada a resultados de negócio, todas as funcionalidades e melhorias operacionais, financeiras e jurídicas proporcionadas pelo sistema ShopRateio. Todas as telas abaixo foram capturadas diretamente do sistema utilizando a base real já preenchida de Água & Esgoto.',
          size: 21,
          color: '334155'
        }
      ]
    })
  );

  // Tabela Resumo dos Indicadores Reais Homologados (Água)
  body.push(
    wTable(
      ['Indicador Executado (Base Água)', 'Resultado no Sistema', 'Benefício Direto para a Diretoria'],
      [
        ['Fatura Mensal Auditada (Out/2026)', 'R$ 90.679,77 (6.081 m³)', '100% conciliada com a concessionária e o SAP'],
        ['Universo de Lojas de Água', '64 lojas ativas (64/64 lidas)', 'Zero lojas esquecidas sem cobrança no fechamento'],
        ['Divergência de Caixa no Rateio', 'R$ 0,00 (Centavo a Centavo)', 'O condomínio não paga sobras por falha de planilha'],
        ['Redução no Tempo de Fechamento', 'De 3 a 5 dias para menos de 2 horas', 'Economia de até 90% do tempo da equipe técnica e contábil'],
        ['Comprovação contra Contestações', 'Foto do hidrômetro + Espelho WhatsApp', 'Fim dos atritos comerciais e questionamentos de lojistas']
      ],
      [3000, 2800, 4400]
    )
  );

  // =========================================================================
  // 1. O PROBLEMA ANTERIOR VS A NOVA REALIDADE COM O SHOPRATEIO
  // =========================================================================
  body.push(wHeading1('1. Por que mudar? O Cenário Antigo vs. A Solução ShopRateio'));

  body.push(
    wParagraph({
      runs: [
        {
          text: 'Historicamente, o processo de leitura de medidores e rateio mensal em shopping centers dependia de anotações em pranchetas de papel e digitação manual em planilhas de Excel. Esse modelo expunha o shopping a quatro grandes riscos financeiros e operacionais:',
          size: 21,
          color: '334155'
        }
      ]
    })
  );

  body.push(wBullet('Erros de digitação e pranchetas de papel', 'Leituras anotadas à mão em locais escuros geravam números trocados, zeros digitados a mais ou perda de anotações, distorcendo a cobrança.', 'E11D48'));
  body.push(wBullet('Lojas esquecidas no fechamento', 'Mudanças de lojistas, reformas ou simples esquecimento faziam com que lojas ativas ficassem fora da planilha do mês — gerando prejuízo direto para o condomínio.', 'E11D48'));
  body.push(wBullet('Questionamentos sem prova visual', 'Quando o lojista reclamava do valor cobrado, a administração não tinha a foto imediata do mostrador nem a memória de cálculo pronta para responder na hora.', 'E11D48'));
  body.push(wBullet('Planilhas frágeis e fechamento demorado', 'Fórmulas apagadas por acidente e até 5 dias úteis gastos conferindo linha por linha antes de enviar ao faturamento.', 'E11D48'));

  body.push(
    wCalloutBox(
      '✅ O que o ShopRateio resolve de imediato',
      'Substitui o papel pelo celular do técnico (mesmo sem internet no subsolo), exige foto do hidrômetro, calcula a tarifa proporcional automaticamente e bloqueia o fechamento caso falte qualquer loja ou haja 1 centavo de diferença.',
      'ECFDF5',
      '059669',
      '065F46'
    )
  );

  // =========================================================================
  // 2. VISÃO EXECUTIVA DA DIRETORIA (TELA 01)
  // =========================================================================
  body.push(wHeading1('2. Visão Geral para a Diretoria — Dashboard Executivo (Tela 01)'));

  body.push(
    wParagraph({
      runs: [
        {
          text: 'Logo ao abrir o sistema, a Diretoria e a Gerência têm um painel executivo limpo e intuitivo que consolida todos os gastos de Água, Luz e Gás do shopping, permitindo acompanhar a evolução do ano ou de cada mês específico.',
          size: 21,
          color: '334155'
        }
      ]
    })
  );

  const m1 = imgMeta.rIdImg1;
  body.push(
    wImageParagraph(
      'rIdImg1',
      m1.docPrId,
      m1.file,
      m1.cx,
      m1.cy,
      'Figura 1 — Dashboard Executivo (Insumo Água): Custo acumulado (R$ 564.013), Consumo (36.033 m³), Evolução Mensal e Ranking de Lojas.'
    )
  );

  body.push(wBullet('Resumo Global Instantâneo', 'Apresenta no topo o Custo Total de Água no ano (R$ 564.013), o Consumo Total (36.033 m³), o Custo Médio Mensal (R$ 94.002) e destaca automaticamente o Mês de Maior Gasto (Junho — R$ 137.355,29).'));
  body.push(wBullet('Gráfico de Evolução Mensal de Custos', 'Mostra mês a mês o comportamento da conta de água do shopping (Jun: R$ 137,4 mil; Jul: R$ 124,8 mil; Ago: R$ 103,4 mil; Set: R$ 107,8 mil; Out: R$ 90,7 mil), facilitando a percepção de economia ou sazonalidade.'));
  body.push(wBullet('Ranking dos Maiores Consumidores (Curva ABC)', 'Lista automaticamente as operações de maior impacto no consumo de água (BAH, Outback Steakhouse, Cinemark, Academia Ultra, Barolo Trattoria, Divino Fogão), direcionando onde a equipe de manutenção deve focar ações preventivas.'));

  // =========================================================================
  // 3. COLETA EM CAMPO PELO CELULAR E MODO OFFLINE (TELA 02)
  // =========================================================================
  body.push(wHeading1('3. Coleta Moderna em Campo pelo Celular — Mesmo Sem Internet (Tela 02)'));

  body.push(
    wParagraph({
      runs: [
        {
          text: 'O leiturista não usa mais papel e caneta. Ele percorre os corredores e galerias técnicas usando o celular ou tablet com o aplicativo do ShopRateio, projetado especialmente para o ambiente físico do shopping:',
          size: 21,
          color: '334155'
        }
      ]
    })
  );

  const m2 = imgMeta.rIdImg2;
  body.push(
    wImageParagraph(
      'rIdImg2',
      m2.docPrId,
      m2.file,
      m2.cx,
      m2.cy,
      'Figura 2 — Tela do Técnico no Celular (Modo Mobile): Rota ordenada, status 64/64 lojas lidas (100%) e cartão da loja Panvel (900 → 904 m³).'
    )
  );

  body.push(wBullet('Funciona 100% Offline nos Subsolos e Casas de Máquinas', 'Subsolos e shafts hidráulicos raramente têm sinal de celular. O sistema guarda todas as leituras e fotos com segurança no próprio aparelho e sincroniza tudo com a nuvem assim que o técnico volta para uma área com Wi-Fi ou 4G.'));
  body.push(wBullet('Rota Guiada pelos Corredores', 'As 64 lojas de água são apresentadas na ordem exata de caminhada do técnico pelo shopping (Modo Lista ou Modo Rota Guiada 1 por vez), reduzindo em até 40% o tempo de coleta.'));
  body.push(wBullet('Conferência Instantânea na Frente do Relógio', 'Ao digitar a leitura atual (exemplo da loja PANVEL: Leitura Anterior 900 m³ → Leitura Atual 904 m³), o celular já calcula na hora a Diferença (+4 m³) e o Custo Estimado (R$ 59,65). Se o técnico digitar um número errado por engano, o sistema avisa imediatamente enquanto ele ainda está diante do hidrômetro.'));
  body.push(wBullet('Leitura por Foto com Inteligência Artificial (OCR)', 'Além de guardar a foto como prova, o sistema conta com leitura automática dos números do relógio por Inteligência Artificial, reduzindo erros humanos.'));

  // =========================================================================
  // 4. MOTOR DE CÁLCULO E RATEIO CONTÁBIL (TELA 03)
  // =========================================================================
  body.push(wHeading1('4. Calculadora de Rateio — Transparência e Precisão Contábil (Tela 03)'));

  body.push(
    wParagraph({
      runs: [
        {
          text: 'No computador da administração, todas as leituras coletadas em campo aparecem prontas e organizadas na Calculadora de Rateio. Basta informar os valores da fatura da concessionária para que todo o rateio seja processado automaticamente:',
          size: 21,
          color: '334155'
        }
      ]
    })
  );

  const m3 = imgMeta.rIdImg3;
  body.push(
    wImageParagraph(
      'rIdImg3',
      m3.docPrId,
      m3.file,
      m3.cx,
      m3.cy,
      'Figura 3 — Calculadora de Rateio de Água (Outubro/2026): Fatura de R$ 90.679,77 (6.081 m³) e 64 de 64 lojas concluídas.'
    )
  );

  body.push(wBullet('Composição Completa da Conta da Concessionária', 'Permite lançar o valor principal da conta (R$ 88.836,31) somado a despesas acessórias de tratamento/gestão hídrica como Enviro Tools (R$ 1.843,46), totalizando o Subtotal exato de R$ 90.679,77 para 6.081 m³.'));
  body.push(wBullet('Cálculo Automático de Tarifa e Áreas Comuns', 'O sistema apura sozinho a tarifa efetiva por metro cúbico (R$ 14,9120/m³) e separa com precisão o consumo das lojas, do Ar Condicionado e das Áreas Comuns do shopping.'));
  body.push(wBullet('Alertas Visuais de Variação (Coluna VAR %)', 'Compara automaticamente o consumo de cada loja com o mês anterior (ex.: Panvel -33,3%), destacando em vermelho qualquer salto suspeito de vazamento.'));
  body.push(wBullet('Exportação Pronta para o SAP / Excel e Pacote ZIP de Fotos', 'Com um clique nos botões "Exportar Excel" ou "Pacote ZIP", a administração baixa a planilha contábil fechada e uma pasta compactada com todas as fotos dos hidrômetros organizadas por loja.'));

  // =========================================================================
  // 5. BLINDAGEM CONTÁBIL: TRAVA DOS 5 PILARES E CONTINUIDADE (TELAS 04 E 05)
  // =========================================================================
  body.push(wHeading1('5. Blindagem Anti-Prejuízo: Auditoria dos 5 Pilares e Radar de Lojas (Telas 04 e 05)'));

  body.push(
    wParagraph({
      runs: [
        {
          text: 'Uma das maiores inovações do ShopRateio para a tranquilidade da Diretoria é a Trava de Auditoria e Fechamento do Mês. O sistema impede que o rateio seja encerrado se houver qualquer furo operacional ou diferença financeira:',
          size: 21,
          color: '334155'
        }
      ]
    })
  );

  const m4 = imgMeta.rIdImg4;
  body.push(
    wImageParagraph(
      'rIdImg4',
      m4.docPrId,
      m4.file,
      m4.cx,
      m4.cy,
      'Figura 4 — Checklist de Auditoria e Fechamento (Os 5 Pilares): Fatura R$ 90.679,77 vs Total Rateado R$ 90.679,77 (Diferença R$ 0,00).'
    )
  );

  body.push(wBullet('Pilar 1 — Medição das Lojas (100% Concluído)', 'Garante que todas as 64 lojas ativas de água tenham leitura registrada no mês.'));
  body.push(wBullet('Pilar 2 — Inconsistências e Alertas Auditados (Zero Pendências)', 'Exige que qualquer alerta de vazamento ou leitura fora do padrão tenha sido conferido e validado pela equipe antes de gerar cobrança.'));
  body.push(wBullet('Pilar 3 — Continuidade vs. Mês Anterior (100% Conferido)', 'Verifica automaticamente se alguma loja que pagou água no mês passado ficou sem leitura neste mês.'));
  body.push(wBullet('Pilar 4 — Conciliação com Concessionária e SAP (Diferença R$ 0,00)', 'Comprova na tela que a Fatura da Concessionária (R$ 90.679,77) é exatamente igual ao Total Rateado entre Lojas + Ar Condicionado + Área Comum (R$ 90.679,77), com Diferença de Balanço igual a R$ 0,00.'));
  body.push(wBullet('Pilar 5 — Congelamento Contábil em 1 Clique', 'Após aprovado, o botão "Fechar e Congelar Mês" tranca os números para impedir alterações acidentais posteriores.'));

  const m5 = imgMeta.rIdImg5;
  body.push(
    wImageParagraph(
      'rIdImg5',
      m5.docPrId,
      m5.file,
      m5.cx,
      m5.cy,
      'Figura 5 — Painel de Conferência vs. Mês Anterior (2026-10 vs 2026-09): 63 lojas medidas no mês anterior, 63 já lidas e 0 faltantes.'
    )
  );

  body.push(
    wParagraph({
      runs: [
        {
          text: 'Na Figura 5 acima, o Painel de Conferência vs. Mês Anterior coloca uma lupa sobre todas as lojas que tiveram consumo em Setembro/2026 (Panvel, Nike, Starbucks, Cinemark, Boss, Quiero Café, Gelato Borelli, Youu Concept), mostrando lado a lado a leitura anterior, a leitura atual e o consumo em m³. Se faltasse ler qualquer loja, ela apareceria destacada na aba "Faltam Ler".',
          size: 21,
          color: '334155'
        }
      ]
    })
  );

  // =========================================================================
  // 6. AGILIDADE OPERACIONAL E FIM DAS CONTESTAÇÕES DE LOJISTAS (TELAS 06 E 07)
  // =========================================================================
  body.push(wHeading1('6. Agilidade em Campo e Fim dos Conflitos com Lojistas (Telas 06 e 07)'));

  body.push(
    wParagraph({
      runs: [
        {
          text: 'No dia a dia do shopping, ocorrem situações como lojas trancadas em reforma, visores de hidrômetros embaçados ou dúvidas de lojistas sobre o valor cobrado. O sistema resolve ambos os casos em segundos:',
          size: 21,
          color: '334155'
        }
      ]
    })
  );

  const m6 = imgMeta.rIdImg6;
  body.push(
    wImageParagraph(
      'rIdImg6',
      m6.docPrId,
      m6.file,
      m6.cx,
      m6.cy,
      'Figura 6 — Observação de Campo em 1 Toque: Etiquetas rápidas padronizadas (Sem Acesso, Embaçado, Relógio Trocado, Vazamento, Em Reforma).'
    )
  );

  body.push(wBullet('Etiquetas Rápidas de Campo em 1 Toque (Figura 6)', 'Em vez de o técnico perder tempo digitando textos longos no corredor, basta tocar em uma etiqueta pronta ("Sem Acesso", "Embaçado", "Relógio Trocado", "Vazamento" ou "Em Reforma") para registrar uma justificativa padronizada e auditável.'));

  const m7 = imgMeta.rIdImg7;
  body.push(
    wImageParagraph(
      'rIdImg7',
      m7.docPrId,
      m7.file,
      m7.cx,
      m7.cy,
      'Figura 7 — Espelho Individual do Lojista (PANVEL - LUC 1003/1004): Memória de cálculo detalhada e botões para PDF e WhatsApp.'
    )
  );

  body.push(wBullet('Espelho Individual do Lojista Pronto para WhatsApp e PDF (Figura 7)', 'Quando um lojista pede explicação da sua cobrança de água, a administração abre o "Espelho Individual" (exemplo da PANVEL: Leitura Anterior 900 → Leitura Atual 904 = 4 m³ × Tarifa R$ 14,9120/m³ = Total a Pagar R$ 59,65, comparado aos R$ 92,77 do mês anterior). Com um clique no botão verde "WhatsApp" ou "Baixar PDF", o comprovante oficial é enviado na hora ao lojista, encerrando qualquer discussão.'));

  // =========================================================================
  // 7. INTELIGÊNCIA ANALÍTICA, DIAGNÓSTICO DE VAZAMENTOS E CADASTROS (TELAS 08 E 09)
  // =========================================================================
  body.push(wHeading1('7. Diagnóstico de Vazamentos e Governança de Cadastros (Telas 08 e 09)'));

  body.push(
    wParagraph({
      runs: [
        {
          text: 'Além de garantir o fechamento contábil perfeito, o ShopRateio transforma os dados de leitura em inteligência preventiva para o shopping e mantém o cadastro de lojas sincronizado com os contratos do SAP:',
          size: 21,
          color: '334155'
        }
      ]
    })
  );

  const m8 = imgMeta.rIdImg8;
  body.push(
    wImageParagraph(
      'rIdImg8',
      m8.docPrId,
      m8.file,
      m8.cx,
      m8.cy,
      'Figura 8 — Relatório Individual por Loja (BAH - LUC 2096): Diagnóstico automático de estabilidade, métricas acumuladas (980 m³ / R$ 15.088,45) e gráficos.'
    )
  );

  body.push(wBullet('Relatório Individual por Loja com Diagnóstico Automático (Figura 8)', 'Ao selecionar qualquer loja (como o restaurante BAH — LUC 2096), o sistema analisa automaticamente a curva histórica, informa se o consumo está normal ou se há indício crítico de vazamento hidráulico, exibe o Consumo Acumulado (980 m³), a Média Histórica (245 m³), o Valor Total Pago (R$ 15.088,45) e o Gasto Médio Mensal (R$ 3.772,11), além de exportar dossiês individuais em PDF e Excel.'));

  const m9 = imgMeta.rIdImg9;
  body.push(
    wImageParagraph(
      'rIdImg9',
      m9.docPrId,
      m9.file,
      m9.cx,
      m9.cy,
      'Figura 9 — Gestão de Lojas de Água (64 ativas em Outubro/2026): Rastreabilidade automática de contratos substituídos no SAP.'
    )
  );

  body.push(wBullet('Rastreabilidade de Contratos e Histórico Mensal (Figura 9)', 'Quando uma loja troca de contrato no SAP (como visível em Panvel, Nike, Starbucks, Cinemark e Boss), o sistema registra o vínculo automaticamente ("Substituída por Contrato...") sem perder a leitura do hidrômetro do mês anterior.'));
  body.push(wBullet('Separação de Perfis de Acesso por Segurança', 'O sistema possui três níveis de permissão: Administrador (acesso total a custos e fechamento), Técnico de Campo (acesso exclusivo para lançar leituras e fotos, sem poder alterar valores de faturas) e Visualizador (consulta executiva somente leitura).'));

  // =========================================================================
  // 8. QUADRO COMPARATIVO FINAL E CONCLUSÃO PARA A DIRETORIA
  // =========================================================================
  body.push(wHeading1('8. Quadro Comparativo de Ganhos: Antes vs. Depois'));

  body.push(
    wTable(
      ['Etapa do Processo', 'Como Era Antes (Papel & Planilhas)', 'Como Funciona no ShopRateio'],
      [
        [
          '1. Coleta nos Hidrômetros',
          { runs: [{ text: 'Anotação manual em papel, sujeita a erro de leitura, perda de folhas e retrabalho.', size: 19, color: '9F1239' }], fill: 'FFF1F2' },
          { runs: [{ text: 'Coleta no celular com rota guiada, funcionamento offline no subsolo, foto e leitura por IA.', size: 19, color: '065F46' }], fill: 'ECFDF5' }
        ],
        [
          '2. Risco de Esquecer Lojas',
          { runs: [{ text: 'Lojas ficavam sem medição por falha humana e o condomínio pagava a diferença.', size: 19, color: '9F1239' }], fill: 'FFF1F2' },
          { runs: [{ text: 'Painel de Continuidade e Trava dos 5 Pilares exigem 100% das lojas lidas (64/64).', size: 19, color: '065F46' }], fill: 'ECFDF5' }
        ],
        [
          '3. Fechamento da Conta',
          { runs: [{ text: '3 a 5 dias úteis redigitando números e conferindo fórmulas quebradas no Excel.', size: 19, color: '9F1239' }], fill: 'FFF1F2' },
          { runs: [{ text: 'Menos de 2 horas com conciliação exata: Fatura R$ 90.679,77 = Rateado (Diferença R$ 0,00).', size: 19, color: '065F46' }], fill: 'ECFDF5' }
        ],
        [
          '4. Relação com Lojistas',
          { runs: [{ text: 'Desgaste comercial quando o lojista questionava a conta sem foto do relógio.', size: 19, color: '9F1239' }], fill: 'FFF1F2' },
          { runs: [{ text: 'Espelho individual com memória de cálculo e foto enviado em 10 segundos via WhatsApp.', size: 19, color: '065F46' }], fill: 'ECFDF5' }
        ],
        [
          '5. Detecção de Vazamentos',
          { runs: [{ text: 'Descobertos apenas meses depois, quando a conta já havia explodido.', size: 19, color: '9F1239' }], fill: 'FFF1F2' },
          { runs: [{ text: 'Alerta automático de salto de consumo na hora da leitura e diagnóstico por loja.', size: 19, color: '065F46' }], fill: 'ECFDF5' }
        ]
      ],
      [2300, 3950, 3950]
    )
  );

  body.push(
    wCalloutBox(
      '🎯 Conclusão Executiva para a Diretoria',
      'Com os dados reais de Água já operantes (64 lojas, 6.081 m³ e R$ 90.679,77 conciliados com diferença zero), o ShopRateio elimina perdas financeiras do condomínio, reduz em até 90% o tempo operacional da equipe, oferece transparência total aos lojistas e já está pronto para expandir a mesma governança para Energia Elétrica e Gás.',
      'F0F9FF',
      '0284C7',
      '0F172A'
    )
  );

  // Section properties (A4 Portrait, margins 15mm)
  const sectPrXml = `<w:sectPr>
    <w:headerReference w:type="default" r:id="rIdHeader1"/>
    <w:footerReference w:type="default" r:id="rIdFooter1"/>
    <w:pgSz w:w="11906" w:h="16838"/>
    <w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="450" w:footer="450" w:gutter="0"/>
  </w:sectPr>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
  <w:body>
    ${body.join('\n')}
    ${sectPrXml}
  </w:body>
</w:document>`;

  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="0284C7"/></w:pBdr>
      <w:spacing w:before="0" w:after="80"/>
      <w:jc w:val="right"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:b/>
        <w:color w:val="0284C7"/>
        <w:sz w:val="17"/>
      </w:rPr>
      <w:t xml:space="preserve">SHOPRATEIO • </w:t>
    </w:r>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:color w:val="64748B"/>
        <w:sz w:val="17"/>
      </w:rPr>
      <w:t xml:space="preserve">Relatório Executivo de Funcionalidades e Melhorias para a Diretoria (Base Água)</w:t>
    </w:r>
  </w:p>
</w:hdr>`;

  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="CBD5E1"/></w:pBdr>
      <w:spacing w:before="60" w:after="0"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:color w:val="64748B"/>
        <w:sz w:val="17"/>
      </w:rPr>
      <w:t xml:space="preserve">Documento Corporativo — Apresentação à Diretoria • ShopRateio Enterprise (Outubro/2026)</w:t>
    </w:r>
  </w:p>
</w:ftr>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="21"/>
        <w:szCs w:val="21"/>
        <w:lang w:val="pt-BR"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="100" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const imageRelEntries = screenshots
    .map(s => `<Relationship Id="${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgMeta[s.id].mediaName}"/>`)
    .join('\n  ');

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  ${imageRelEntries}
</Relationships>`;

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/header1.xml', headerXml);
  zip.file('word/footer1.xml', footerXml);
  zip.file('word/_rels/document.xml.rels', docRelsXml);

  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  fs.writeFileSync(OUTPUT_DOCX_1, content);
  fs.writeFileSync(OUTPUT_DOCX_2, content);

  console.log('================================================================');
  console.log('✓ RELATÓRIO EXECUTIVO EM WORD (.DOCX) GERADO COM SUCESSO:');
  console.log(`  ${OUTPUT_DOCX_1}`);
  console.log(`  ${OUTPUT_DOCX_2}`);
  console.log('================================================================');
}

generateWordReport().catch(err => {
  console.error('Erro ao gerar Word:', err);
  process.exit(1);
});
