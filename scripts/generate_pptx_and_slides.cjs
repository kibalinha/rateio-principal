const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { chromium } = require('playwright');

const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');
const OUTPUT_PPTX = path.resolve(__dirname, '../Apresentacao_Diretoria_ShopRateio.pptx');
const OUTPUT_SLIDES_HTML = path.resolve(__dirname, '../Apresentacao_Slides_Diretoria_ShopRateio.html');
const OUTPUT_SLIDES_PDF = path.resolve(__dirname, '../Apresentacao_Slides_Diretoria_ShopRateio.pdf');

function xmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getPngDimensions(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function getBase64Image(filename) {
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  const base64 = fs.readFileSync(filePath).toString('base64');
  return `data:image/png;base64,${base64}`;
}

// ============================================================================
// HELPERS PARA POWERPOINT NATIVO (.PPTX - 16:9 WIDESCREEN: 12192000 x 6858000 EMU)
// ============================================================================
function pptShape({
  id,
  name,
  x,
  y,
  w,
  h,
  fillHex = null,
  borderHex = null,
  borderWidth = 12700,
  geom = 'rect',
  paragraphs = [],
  valign = 't',
  padL = 114300,
  padR = 114300,
  padT = 76200,
  padB = 76200
}) {
  const fillXml = fillHex
    ? `<a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>`
    : '<a:noFill/>';
  const lnXml = borderHex
    ? `<a:ln w="${borderWidth}"><a:solidFill><a:srgbClr val="${borderHex}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';

  const pXml = (paragraphs.length > 0 ? paragraphs : [{ text: '' }])
    .map(p => {
      const algn = p.align || 'l';
      const spcBef = p.spaceBeforePt ? `<a:spcBef><a:spcPts val="${p.spaceBeforePt * 100}"/></a:spcBef>` : '';
      const spcAft = p.spaceAfterPt ? `<a:spcAft><a:spcPts val="${p.spaceAfterPt * 100}"/></a:spcAft>` : '';
      const runs = p.runs || [{ text: p.text || '', bold: p.bold, sizePt: p.sizePt || 14, colorHex: p.colorHex || '0F172A' }];
      const runsXml = runs
        .map(r => {
          if (!r.text) return '';
          const sz = Math.round((r.sizePt || 14) * 100);
          const b = r.bold ? ' b="1"' : '';
          const i = r.italic ? ' i="1"' : '';
          const clr = r.colorHex || '0F172A';
          return `<a:r>
            <a:rPr lang="pt-BR" sz="${sz}"${b}${i} dirty="0">
              <a:solidFill><a:srgbClr val="${clr}"/></a:solidFill>
              <a:latin typeface="Calibri"/>
              <a:cs typeface="Calibri"/>
            </a:rPr>
            <a:t>${xmlEscape(r.text)}</a:t>
          </a:r>`;
        })
        .join('');
      return `<a:p>
        <a:pPr algn="${algn}">${spcBef}${spcAft}</a:pPr>
        ${runsXml || '<a:endParaRPr lang="pt-BR" sz="1400"/>'}
      </a:p>`;
    })
    .join('');

  return `<p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${id}" name="${xmlEscape(name || `Shape ${id}`)}"/>
      <p:cNvSpPr/>
      <p:nvPr/>
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm>
        <a:off x="${Math.round(x)}" y="${Math.round(y)}"/>
        <a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/>
      </a:xfrm>
      <a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>
      ${fillXml}
      ${lnXml}
    </p:spPr>
    <p:txBody>
      <a:bodyPr wrap="square" lIns="${padL}" tIns="${padT}" rIns="${padR}" bIns="${padB}" anchor="${valign}"/>
      <a:lstStyle/>
      ${pXml}
    </p:txBody>
  </p:sp>`;
}

function pptPic({ id, name, rId, x, y, w, h, borderHex = 'CBD5E1' }) {
  return `<p:pic>
    <p:nvPicPr>
      <p:cNvPr id="${id}" name="${xmlEscape(name)}"/>
      <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
      <p:nvPr/>
    </p:nvPicPr>
    <p:blipFill>
      <a:blip r:embed="${rId}"/>
      <a:stretch><a:fillRect/></a:stretch>
    </p:blipFill>
    <p:spPr>
      <a:xfrm>
        <a:off x="${Math.round(x)}" y="${Math.round(y)}"/>
        <a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/>
      </a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:ln w="12700"><a:solidFill><a:srgbClr val="${borderHex}"/></a:solidFill></a:ln>
    </p:spPr>
  </p:pic>`;
}

function fitBox(imgW, imgH, boxX, boxY, boxW, boxH) {
  const imgRatio = imgW / imgH;
  const boxRatio = boxW / boxH;
  let w, h;
  if (imgRatio > boxRatio) {
    w = boxW;
    h = Math.round(boxW / imgRatio);
  } else {
    h = boxH;
    w = Math.round(boxH * imgRatio);
  }
  const x = boxX + Math.round((boxW - w) / 2);
  const y = boxY + Math.round((boxH - h) / 2);
  return { x, y, w, h };
}

function wrapSlideXml(shapesXml, bgHex = 'F8FAFC') {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg>
      <p:bgPr>
        <a:solidFill><a:srgbClr val="${bgHex}"/></a:solidFill>
        <a:effectLst/>
      </p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      ${shapesXml}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function buildFeatureSlideXml({
  slideNum,
  totalSlides,
  stepBadge,
  title,
  subtitle,
  imgDim,
  bullets,
  takeawayTitle,
  takeawayText
}) {
  const shapes = [];
  let nextId = 2;

  // Top Header Bar
  shapes.push(
    pptShape({
      id: nextId++,
      name: 'TopBar',
      x: 0,
      y: 0,
      w: 12192000,
      h: 920000,
      fillHex: '0F172A',
      paragraphs: [
        {
          runs: [
            { text: `◆ SHOPRATEIO  |  ${stepBadge.toUpperCase()}`, bold: true, sizePt: 10, colorHex: '38BDF8' }
          ],
          spaceAfterPt: 2
        },
        {
          runs: [
            { text: title, bold: true, sizePt: 20, colorHex: 'FFFFFF' }
          ]
        }
      ],
      valign: 'ctr',
      padL: 450000
    })
  );

  // Subtitle Strip
  shapes.push(
    pptShape({
      id: nextId++,
      name: 'SubtitleBar',
      x: 450000,
      y: 1000000,
      w: 11292000,
      h: 420000,
      fillHex: 'EFF6FF',
      borderHex: 'BAE6FD',
      geom: 'roundRect',
      valign: 'ctr',
      paragraphs: [
        {
          runs: [
            { text: subtitle, bold: false, sizePt: 12, colorHex: '1E3A8A' }
          ]
        }
      ]
    })
  );

  // Left Image Container Card (x=450000, y=1520000, w=6800000, h=4250000)
  shapes.push(
    pptShape({
      id: nextId++,
      name: 'ImageFrameBg',
      x: 450000,
      y: 1520000,
      w: 6800000,
      h: 4250000,
      fillHex: '0F172A',
      borderHex: 'CBD5E1',
      geom: 'roundRect'
    })
  );

  const fitted = fitBox(imgDim.width, imgDim.height, 530000, 1600000, 6640000, 4090000);
  shapes.push(
    pptPic({
      id: nextId++,
      name: 'Screenshot',
      rId: 'rIdImg1',
      x: fitted.x,
      y: fitted.y,
      w: fitted.w,
      h: fitted.h,
      borderHex: '334155'
    })
  );

  // Right Side Feature Cards (4 cards)
  const cardStartY = 1520000;
  const cardGap = 90000;
  const cardH = Math.floor((4250000 - cardGap * (bullets.length - 1)) / bullets.length);

  bullets.forEach((b, idx) => {
    const cy = cardStartY + idx * (cardH + cardGap);
    shapes.push(
      pptShape({
        id: nextId++,
        name: `FeatureCard_${idx + 1}`,
        x: 7420000,
        y: cy,
        w: 4322000,
        h: cardH,
        fillHex: 'FFFFFF',
        borderHex: 'CBD5E1',
        geom: 'roundRect',
        valign: 'ctr',
        paragraphs: [
          {
            runs: [
              { text: b.title, bold: true, sizePt: 13, colorHex: '0284C7' }
            ],
            spaceAfterPt: 3
          },
          {
            runs: [
              { text: b.desc, bold: false, sizePt: 11, colorHex: '334155' }
            ]
          }
        ]
      })
    );
  });

  // Bottom Takeaway Bar
  shapes.push(
    pptShape({
      id: nextId++,
      name: 'TakeawayBar',
      x: 450000,
      y: 5900000,
      w: 11292000,
      h: 520000,
      fillHex: 'ECFDF5',
      borderHex: '6EE7B7',
      geom: 'roundRect',
      valign: 'ctr',
      paragraphs: [
        {
          runs: [
            { text: `${takeawayTitle}: `, bold: true, sizePt: 12, colorHex: '065F46' },
            { text: takeawayText, bold: false, sizePt: 11.5, colorHex: '064E3B' }
          ]
        }
      ]
    })
  );

  // Footer
  shapes.push(
    pptShape({
      id: nextId++,
      name: 'FooterText',
      x: 450000,
      y: 6480000,
      w: 11292000,
      h: 300000,
      valign: 'ctr',
      padL: 0,
      padR: 0,
      paragraphs: [
        {
          align: 'r',
          runs: [
            {
              text: `Apresentação Executiva à Diretoria • Base Real Homologada: Água (Outubro/2026)   |   Slide ${slideNum} de ${totalSlides}`,
              bold: true,
              sizePt: 9.5,
              colorHex: '64748B'
            }
          ]
        }
      ]
    })
  );

  return wrapSlideXml(shapes.join('\n'), 'F8FAFC');
}

async function buildPptxAndSlides() {
  console.log('--- Construindo Apresentação Executiva PowerPoint (.pptx) + Slides HTML/PDF ---');

  const slideDefs = [
    {
      stepBadge: 'Visão da Diretoria',
      title: '1. Dashboard Executivo — Visão Consolidada de Água',
      subtitle: 'Monitoramento anual e mensal dos custos, consumo em m³ e ranking das lojas de maior impacto no shopping.',
      imgFile: '01_dashboard_executivo.png',
      bullets: [
        { title: '📊 Balanço Anual em Tempo Real', desc: 'Consolida R$ 564.013 acumulados no ano, 36.033 m³ consumidos e média mensal de R$ 94.002.' },
        { title: '📈 Curva de Evolução Mensal', desc: 'Exibe a trajetória de custos mês a mês (Jun: 137,4k até Out: 90,7k), facilitando análise de sazonalidade.' },
        { title: '🏆 Ranking de Maiores Consumidores', desc: 'Destaca restaurantes e âncoras (BAH, Outback, Cinemark, Academia Ultra) para gestão preventiva.' },
        { title: '💧 Arquitetura Multi-Utilidades', desc: 'Mesmo padrão visual pronto para Água, Energia Elétrica e Gás em um único painel.' }
      ],
      takeawayTitle: '💡 Ganho para a Diretoria',
      takeawayText: 'Visibilidade executiva imediata sobre para onde vai o recurso hídrico do shopping, sem depender de relatórios manuais.'
    },
    {
      stepBadge: 'Operação de Campo',
      title: '2. Coleta Mobile pelo Celular — Mesmo Sem Internet',
      subtitle: 'Substituição definitiva da prancheta de papel por aplicativo no celular do técnico com rota guiada e modo offline.',
      imgFile: '08_tecnico_campo_mobile.png',
      bullets: [
        { title: '📶 Funciona 100% Offline nos Subsolos', desc: 'Salva leituras e fotos no celular em casas de máquinas sem sinal e sincroniza ao reconectar.' },
        { title: '🚶 Rota Guiada pelos Corredores', desc: 'Ordena os 64 hidrômetros na sequência física de caminhada, reduzindo o tempo de coleta em 40%.' },
        { title: '⚡ Conferência na Frente do Relógio', desc: 'Ao digitar a leitura (Panvel: 900 → 904 m³), já exibe o consumo (+4 m³) e o custo (R$ 59,65) na hora.' },
        { title: '📷 Foto Obrigatória & Leitura por IA', desc: 'Registra foto datada do mostrador e lê os dígitos por Inteligência Artificial, evitando erros humanos.' }
      ],
      takeawayTitle: '💡 Ganho Operacional',
      takeawayText: 'Elimina 100% do retrabalho de passar anotações do papel para o computador e impede erros de digitação na origem.'
    },
    {
      stepBadge: 'Núcleo Contábil',
      title: '3. Calculadora de Rateio — Precisão Centavo a Centavo',
      subtitle: 'Cálculo automático da tarifa proporcional de Água, rateio de áreas comuns e exportação pronta para o SAP.',
      imgFile: '02_rateio_calculadora_desktop.png',
      bullets: [
        { title: '🧾 Composição Transparente da Fatura', desc: 'Soma Valor da Conta (R$ 88.836,31) + Enviro Tools (R$ 1.843,46) = Subtotal R$ 90.679,77 para 6.081 m³.' },
        { title: '⚖️ Tarifa Proporcional Automática', desc: 'Calcula a tarifa exata (R$ 14,9120/m³) e distribui Lojas, Ar Condicionado e Área Comum sem fórmulas quebradas.' },
        { title: '🚨 Alerta Automático de Variação (VAR %)', desc: 'Sinaliza desvios bruscos em relação ao mês anterior (ex: Panvel -33,3%), apontando vazamentos.' },
        { title: '📥 Exportação Excel (SAP) + Pacote ZIP', desc: 'Gera em 1 clique a planilha contábil fechada e um arquivo ZIP com todas as fotos nomeadas por loja.' }
      ],
      takeawayTitle: '💡 Ganho Financeiro',
      takeawayText: 'O fechamento que antes levava de 3 a 5 dias úteis conferindo planilhas passa a ser concluído em menos de 2 horas.'
    },
    {
      stepBadge: 'Blindagem Contábil',
      title: '4. Trava dos 5 Pilares — Fechamento com Diferença Zero',
      subtitle: 'Assistente de auditoria que bloqueia o fechamento caso exista loja esquecida, alerta pendente ou divergência de valores.',
      imgFile: '03_checklist_fechamento_contabil.png',
      bullets: [
        { title: '✅ Pilar 1 e 2: 100% Lidas & Alertas Auditados', desc: 'Garante 64/64 lojas de água lidas e exige validação de qualquer suspeita de vazamento antes de fechar.' },
        { title: '🔄 Pilar 3: Continuidade vs. Mês Anterior', desc: 'Impede que lojas cobradas no mês passado sejam esquecidas por falha operacional.' },
        { title: '💰 Pilar 4: Conciliação Exata (R$ 0,00)', desc: 'Valida Fatura Concessionária (R$ 90.679,77) = Total Rateado (R$ 90.679,77) com Diferença R$ 0,00.' },
        { title: '🔒 Pilar 5: Congelamento Contábil em 1 Clique', desc: 'Tranca todas as medições e tarifas após a aprovação para impedir edições acidentais.' }
      ],
      takeawayTitle: '🛡️ Proteção de Caixa do Shopping',
      takeawayText: 'Impossibilita que o condomínio pague diferenças de conta de água por erro de rateio ou esquecimento de lojas.'
    },
    {
      stepBadge: 'Auditoria Histórica',
      title: '5. Painel de Continuidade vs. Mês Anterior',
      subtitle: 'Cruzamento automático entre meses (Outubro/2026 vs Setembro/2026) para garantir que nenhuma loja fique sem cobrança.',
      imgFile: '04_painel_continuidade_mes_anterior.png',
      bullets: [
        { title: '🔍 Cruzamento Automático Mês a Mês', desc: 'Compara instantaneamente as 63 lojas medidas no mês anterior com as 63 lidas no mês atual (0 faltantes).' },
        { title: '📋 Visão Lado a Lado (Ant → Atual)', desc: 'Exibe Panvel (900→904), Nike (3.390→3.402), Starbucks (3.424→3.443), Cinemark (45.977→46.118).' },
        { title: '🎯 Aba "Faltam Ler" com Atalho Direto', desc: 'Se faltar qualquer loja, ela fica isolada na aba de pendências com botão para ir direto à linha na tabela.' },
        { title: '🔗 Imune a Trocas de Contrato no SAP', desc: 'Reconhece a loja pelo espaço físico (LUC), pelo contrato ou pelo nome, mesmo quando há renovação contratual.' }
      ],
      takeawayTitle: '💡 Ganho de Governança',
      takeawayText: 'Elimina o erro clássico de esquecer uma loja ativa durante trocas de razão social ou atualização de planilhas.'
    },
    {
      stepBadge: 'Agilidade em Campo',
      title: '6. Justificativa Rápida em 1 Toque (Observações)',
      subtitle: 'Padronização das ocorrências encontradas pelo leiturista nos corredores sem atrasar a ronda de coleta.',
      imgFile: '05_justificativa_rapida_1toque.png',
      bullets: [
        { title: '🏷️ 5 Etiquetas Prontas em 1 Toque', desc: 'Botões rápidos para "Sem Acesso", "Embaçado", "Relógio Trocado", "Vazamento" e "Em Reforma".' },
        { title: '⏱️ Registro Instantâneo sem Digitação', desc: 'O técnico seleciona a etiqueta no celular em 2 segundos e segue para a próxima loja da rota.' },
        { title: '📑 Respaldo para Lojas Fechadas/Obras', desc: 'Formaliza o motivo pelo qual uma loja em reforma teve consumo zero, liberando a trava de auditoria.' },
        { title: '🔎 Histórico Documentado na Tabela', desc: 'A justificativa fica gravada junto à leitura do mês e aparece nos relatórios gerenciais e Excel.' }
      ],
      takeawayTitle: '💡 Ganho para a Equipe Técnica',
      takeawayText: 'Padroniza a comunicação entre a equipe de manutenção em campo e o setor financeiro no escritório.'
    },
    {
      stepBadge: 'Relacionamento Lojista',
      title: '7. Espelho Individual do Lojista — Fim das Contestações',
      subtitle: 'Comprovante oficial individual com memória de cálculo clara e envio imediato por WhatsApp ou PDF.',
      imgFile: '06_espelho_individual_lojista.png',
      bullets: [
        { title: '🧾 Memória de Cálculo Didática', desc: 'Mostra para a loja (ex: Panvel LUC 1003/1004) Leitura Ant (900), Atual (904), Consumo (4 m³) e Total (R$ 59,65).' },
        { title: '📲 Disparo por WhatsApp em 1 Clique', desc: 'Gera a mensagem formatada com todos os dados oficiais pronta para enviar ao lojista em 10 segundos.' },
        { title: '📄 Download em PDF Timbrado', desc: 'Permite baixar a "Via do Lojista" em PDF para anexar ao boleto condominial ou e-mail.' },
        { title: '📷 Prova Fotográfica Incontestável', desc: 'Acompanha a foto real do hidrômetro, eliminando dúvidas de leitura sem precisar de nova vistoria.' }
      ],
      takeawayTitle: '🤝 Fim do Desgaste Comercial',
      takeawayText: 'Transparência total com o lojista: dúvidas são respondidas na hora com números claros e foto do mostrador.'
    },
    {
      stepBadge: 'Inteligência & Cadastros',
      title: '8. Diagnóstico de Vazamentos & Gestão Cadastral',
      subtitle: 'Análise histórica individual por loja com diagnóstico automático de anomalias e controle de contratos SAP.',
      imgFile: '07_relatorio_analise_consumo.png',
      bullets: [
        { title: '🩺 Diagnóstico Automático por Loja', desc: 'Avalia se o consumo está normal (ex: BAH — 980 m³ acumulados, média 245 m³) ou em sobrecarga por vazamento.' },
        { title: '📊 Gráficos Históricos de Consumo e Custo', desc: 'Curva com linha de média (245 m³) e evolução financeira (R$ 15.088,45 pagos), exportável em PDF/Excel.' },
        { title: '🏢 Gestão Cadastral e Vínculo com SAP', desc: 'Controla as 64 lojas ativas de Água, rastreando substituições de contratos sem perder leituras anteriores.' },
        { title: '🛡️ Perfis de Acesso Seguros (RBAC)', desc: 'Técnico acessa apenas leituras; Administrador gerencia faturas e fechamento; Visualizador apenas consulta.' }
      ],
      takeawayTitle: '📈 Da Cobrança Passiva à Gestão Ativa',
      takeawayText: 'O shopping passa a identificar vazamentos precocemente e mantém a base de contratos sempre limpa e auditável.'
    }
  ];

  // ==========================================================================
  // 1. GERAR ARQUIVO POWERPOINT (.PPTX) NATIVO E EDITÁVEL (10 SLIDES)
  // ==========================================================================
  const zip = new JSZip();
  const totalSlides = 10;

  // Slide 1: Cover Slide
  const slide1Shapes = [
    pptShape({
      id: 2,
      name: 'CoverBadge',
      x: 700000,
      y: 650000,
      w: 5800000,
      h: 400000,
      fillHex: '0284C7',
      geom: 'roundRect',
      valign: 'ctr',
      paragraphs: [
        { runs: [{ text: '◆ APRESENTAÇÃO EXECUTIVA À DIRETORIA • OUTUBRO/2026', bold: true, sizePt: 11, colorHex: 'FFFFFF' }] }
      ]
    }),
    pptShape({
      id: 3,
      name: 'CoverTitle',
      x: 700000,
      y: 1200000,
      w: 10800000,
      h: 1500000,
      valign: 't',
      padL: 0,
      paragraphs: [
        { runs: [{ text: 'ShopRateio Enterprise', bold: true, sizePt: 38, colorHex: '38BDF8' }], spaceAfterPt: 6 },
        { runs: [{ text: 'Modernização, Blindagem Contábil e Eficiência no Rateio de Utilidades', bold: true, sizePt: 24, colorHex: 'FFFFFF' }] }
      ]
    }),
    pptShape({
      id: 4,
      name: 'CoverSubtitle',
      x: 700000,
      y: 2800000,
      w: 10800000,
      h: 850000,
      valign: 't',
      padL: 0,
      paragraphs: [
        {
          runs: [
            {
              text: 'Demonstração prática com os dados reais já preenchidos de Água & Esgoto: como saímos de pranchetas de papel e planilhas manuais para uma operação digital com Diferença Zero e comprovação por foto.',
              sizePt: 15,
              colorHex: 'CBD5E1'
            }
          ]
        }
      ]
    }),
    // 4 KPI Cards on Cover
    ...[
      { lbl: 'INSUMO HOMOLOGADO', val: '💧 Água & Esgoto', sub: '64 Lojas Ativas (100% Lidas)' },
      { lbl: 'VOLUME MENSAL AUDITADO', val: '6.081 m³', sub: 'Fatura: R$ 90.679,77' },
      { lbl: 'CONCILIAÇÃO CONTÁBIL', val: 'R$ 0,00', sub: 'Diferença Fatura vs. Rateio' },
      { lbl: 'GANHO DE PRODUTIVIDADE', val: '-90% Tempo', sub: 'De 5 dias para < 2 horas' }
    ].map((c, idx) =>
      pptShape({
        id: 10 + idx,
        name: `CoverKpi_${idx}`,
        x: 700000 + idx * 2730000,
        y: 4100000,
        w: 2550000,
        h: 1750000,
        fillHex: '1E293B',
        borderHex: '334155',
        geom: 'roundRect',
        valign: 'ctr',
        paragraphs: [
          { runs: [{ text: c.lbl, bold: true, sizePt: 10, colorHex: '38BDF8' }], spaceAfterPt: 8 },
          { runs: [{ text: c.val, bold: true, sizePt: 22, colorHex: 'FFFFFF' }], spaceAfterPt: 6 },
          { runs: [{ text: c.sub, bold: false, sizePt: 11, colorHex: '94A3B8' }] }
        ]
      })
    )
  ];

  const slideXmlList = [];
  const slideRelsList = [];

  // Push Slide 1 (Cover)
  slideXmlList.push(wrapSlideXml(slide1Shapes.join('\n'), '0F172A'));
  slideRelsList.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);

  // Slides 2..9: Feature Slides with Real Screenshots
  for (let i = 0; i < slideDefs.length; i++) {
    const def = slideDefs[i];
    const imgBuf = fs.readFileSync(path.join(SCREENSHOTS_DIR, def.imgFile));
    const dim = getPngDimensions(imgBuf);
    const mediaName = `media_slide_${i + 2}.png`;
    zip.file(`ppt/media/${mediaName}`, imgBuf);

    const sXml = buildFeatureSlideXml({
      slideNum: i + 2,
      totalSlides,
      stepBadge: def.stepBadge,
      title: def.title,
      subtitle: def.subtitle,
      imgDim: dim,
      bullets: def.bullets,
      takeawayTitle: def.takeawayTitle,
      takeawayText: def.takeawayText
    });

    slideXmlList.push(sXml);
    slideRelsList.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>
</Relationships>`);
  }

  // Slide 10: Antes vs Depois & Conclusão Executiva
  const slide10Shapes = [
    pptShape({
      id: 2,
      name: 'TopBar10',
      x: 0,
      y: 0,
      w: 12192000,
      h: 920000,
      fillHex: '0F172A',
      valign: 'ctr',
      padL: 450000,
      paragraphs: [
        { runs: [{ text: '◆ SHOPRATEIO  |  SÍNTESE EXECUTIVA & RETORNO PARA O SHOPPING', bold: true, sizePt: 10, colorHex: '38BDF8' }], spaceAfterPt: 2 },
        { runs: [{ text: '9. Resumo Comparativo: Antes vs. Depois & Próximos Passos', bold: true, sizePt: 20, colorHex: 'FFFFFF' }] }
      ]
    }),
    // Left Column: Cenário Antigo
    pptShape({
      id: 3,
      name: 'BeforeBox',
      x: 450000,
      y: 1120000,
      w: 5500000,
      h: 4100000,
      fillHex: 'FFF1F2',
      borderHex: 'FECDD3',
      geom: 'roundRect',
      valign: 't',
      padL: 220000,
      padT: 180000,
      paragraphs: [
        { runs: [{ text: '❌ COMO ERA ANTES (Papel & Planilhas)', bold: true, sizePt: 16, colorHex: '9F1239' }], spaceAfterPt: 10 },
        { runs: [{ text: '• Pranchetas de papel: ', bold: true, sizePt: 13, colorHex: '881337' }, { text: 'Erros de leitura, letras ilegíveis e perda de anotações em campo.', sizePt: 12.5, colorHex: '4C0519' }], spaceAfterPt: 8 },
        { runs: [{ text: '• Lojas esquecidas no mês: ', bold: true, sizePt: 13, colorHex: '881337' }, { text: 'Mudanças de contrato deixavam lojas sem cobrança, gerando prejuízo ao condomínio.', sizePt: 12.5, colorHex: '4C0519' }], spaceAfterPt: 8 },
        { runs: [{ text: '• Contestações sem prova: ', bold: true, sizePt: 13, colorHex: '881337' }, { text: 'Lojistas questionavam faturas e não havia foto datada do hidrômetro.', sizePt: 12.5, colorHex: '4C0519' }], spaceAfterPt: 8 },
        { runs: [{ text: '• Fechamento lento (3 a 5 dias): ', bold: true, sizePt: 13, colorHex: '881337' }, { text: 'Redigitação manual e risco constante de fórmulas apagadas no Excel.', sizePt: 12.5, colorHex: '4C0519' }] }
      ]
    }),
    // Right Column: Com ShopRateio
    pptShape({
      id: 4,
      name: 'AfterBox',
      x: 6242000,
      y: 1120000,
      w: 5500000,
      h: 4100000,
      fillHex: 'ECFDF5',
      borderHex: 'A7F3D0',
      geom: 'roundRect',
      valign: 't',
      padL: 220000,
      padT: 180000,
      paragraphs: [
        { runs: [{ text: '✅ COM O SHOPRATEIO (Governança Digital)', bold: true, sizePt: 16, colorHex: '065F46' }], spaceAfterPt: 10 },
        { runs: [{ text: '• Coleta Mobile Offline + IA: ', bold: true, sizePt: 13, colorHex: '065F46' }, { text: 'Rota guiada no celular, funcionamento no subsolo sem internet e foto obrigatória.', sizePt: 12.5, colorHex: '064E3B' }], spaceAfterPt: 8 },
        { runs: [{ text: '• Trava dos 5 Pilares (Zero Furos): ', bold: true, sizePt: 13, colorHex: '065F46' }, { text: 'Bloqueia o fechamento se faltar qualquer loja ou se houver 1 centavo de diferença.', sizePt: 12.5, colorHex: '064E3B' }], spaceAfterPt: 8 },
        { runs: [{ text: '• Espelho no WhatsApp em 10s: ', bold: true, sizePt: 13, colorHex: '065F46' }, { text: 'Comprovante individual com foto e memória de cálculo enviado em 1 clique.', sizePt: 12.5, colorHex: '064E3B' }], spaceAfterPt: 8 },
        { runs: [{ text: '• Fechamento em menos de 2 horas: ', bold: true, sizePt: 13, colorHex: '065F46' }, { text: 'Fatura R$ 90.679,77 = Rateado R$ 90.679,77 (Diferença R$ 0,00) + Excel SAP.', sizePt: 12.5, colorHex: '064E3B' }] }
      ]
    }),
    // Conclusion Banner
    pptShape({
      id: 5,
      name: 'ConclusionBox',
      x: 450000,
      y: 5400000,
      w: 11292000,
      h: 980000,
      fillHex: '0F172A',
      borderHex: '0284C7',
      geom: 'roundRect',
      valign: 'ctr',
      padL: 220000,
      paragraphs: [
        { runs: [{ text: '🎯 PARECER EXECUTIVO PARA A DIRETORIA', bold: true, sizePt: 13, colorHex: '38BDF8' }], spaceAfterPt: 4 },
        {
          runs: [
            {
              text: 'A base de Água & Esgoto já está 100% homologada e auditada (64 lojas, 6.081 m³, R$ 90.679,77 sem divergência). O sistema elimina perdas financeiras do condomínio, pacifica a relação com os lojistas e está pronto para expansão imediata para Energia Elétrica e Gás.',
              sizePt: 12,
              colorHex: 'F8FAFC'
            }
          ]
        }
      ]
    })
  ];

  slideXmlList.push(wrapSlideXml(slide10Shapes.join('\n'), 'F8FAFC'));
  slideRelsList.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);

  // Write slides into zip
  for (let i = 0; i < slideXmlList.length; i++) {
    const sNum = i + 1;
    zip.file(`ppt/slides/slide${sNum}.xml`, slideXmlList[i]);
    zip.file(`ppt/slides/_rels/slide${sNum}.xml.rels`, slideRelsList[i]);
  }

  // Minimal valid OpenXML Presentation package files
  const slideOverrides = slideXmlList
    .map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join('\n  ');

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideOverrides}
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );

  const sldIdEntries = slideXmlList
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdSlide${i + 1}"/>`)
    .join('\n    ');

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rIdMaster1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    ${sldIdEntries}
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  );

  const presRelEntries = slideXmlList
    .map((_, i) => `<Relationship Id="rIdSlide${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`)
    .join('\n  ');

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  ${presRelEntries}
</Relationships>`
  );

  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg>
      <p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rIdLayout1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`
  );

  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`
  );

  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`
  );

  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  );

  zip.file(
    'ppt/theme/theme1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="ShopRateioTheme">
  <a:themeElements>
    <a:clrScheme name="ShopRateio">
      <a:dk1><a:srgbClr val="0F172A"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1E293B"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="0284C7"/></a:accent1>
      <a:accent2><a:srgbClr val="059669"/></a:accent2>
      <a:accent3><a:srgbClr val="38BDF8"/></a:accent3>
      <a:accent4><a:srgbClr val="F59E0B"/></a:accent4>
      <a:accent5><a:srgbClr val="E11D48"/></a:accent5>
      <a:accent6><a:srgbClr val="6366F1"/></a:accent6>
      <a:hlink><a:srgbClr val="0284C7"/></a:hlink>
      <a:folHlink><a:srgbClr val="0369A1"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="ShopRateioFonts">
      <a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="ShopRateioFmt">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`
  );

  const pptxBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(OUTPUT_PPTX, pptxBuffer);
  console.log(`✓ PowerPoint (.pptx) gerado com sucesso: ${OUTPUT_PPTX}`);

  // ==========================================================================
  // 2. GERAR SLIDES INTERATIVOS HTML (16:9) E PDF WIDESCREEN PARA TELÃO/TV
  // ==========================================================================
  const featureSlidesHtml = slideDefs
    .map((def, idx) => {
      const b64 = getBase64Image(def.imgFile);
      const cardsHtml = def.bullets
        .map(
          b => `<div class="feat-card">
            <h4>${b.title}</h4>
            <p>${b.desc}</p>
          </div>`
        )
        .join('');
      return `
      <section class="slide">
        <div class="slide-topbar">
          <div>
            <div class="badge-step">◆ SHOPRATEIO  |  ${def.stepBadge.toUpperCase()}</div>
            <h2>${def.title}</h2>
          </div>
          <div class="slide-num">Slide ${idx + 2} / 10</div>
        </div>
        <div class="slide-sub">${def.subtitle}</div>
        <div class="slide-grid">
          <div class="img-box">
            <img src="${b64}" alt="${def.title}">
          </div>
          <div class="cards-col">
            ${cardsHtml}
          </div>
        </div>
        <div class="takeaway-bar">
          <strong>${def.takeawayTitle}:</strong> ${def.takeawayText}
        </div>
      </section>`;
    })
    .join('\n');

  const slidesHtmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Apresentação Executiva à Diretoria — ShopRateio</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    @page { size: 338.67mm 190.5mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      background: #090d16;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slide {
      width: 1280px;
      height: 720px;
      margin: 24px auto;
      background: #f8fafc;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      box-shadow: 0 20px 50px rgba(0,0,0,0.45);
      border-radius: 8px;
    }
    @media print {
      body { background: transparent; }
      .slide { margin: 0; border-radius: 0; box-shadow: none; width: 100vw; height: 100vh; }
      .nav-controls { display: none !important; }
    }
    /* Slide 1 Cover */
    .slide-cover {
      background: radial-gradient(circle at 85% 20%, #0c4a6e 0%, #0f172a 55%, #020617 100%);
      color: #ffffff;
      padding: 64px 72px;
      justify-content: space-between;
    }
    .cover-pill {
      display: inline-block;
      background: rgba(56, 189, 248, 0.16);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.4);
      padding: 6px 16px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 22px;
    }
    .slide-cover h1 {
      font-size: 46px;
      font-weight: 800;
      line-height: 1.12;
      letter-spacing: -0.02em;
      margin-bottom: 16px;
    }
    .slide-cover h1 span { color: #38bdf8; }
    .slide-cover p.lead {
      font-size: 19px;
      color: #cbd5e1;
      max-width: 980px;
      line-height: 1.45;
    }
    .cover-kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin-top: 36px;
    }
    .cover-kpi {
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-top: 3px solid #38bdf8;
      border-radius: 12px;
      padding: 20px;
    }
    .cover-kpi .lbl { font-size: 11px; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.05em; }
    .cover-kpi .val { font-size: 28px; font-weight: 800; color: #ffffff; margin: 8px 0 4px 0; }
    .cover-kpi .sub { font-size: 13px; color: #94a3b8; }

    /* Standard Feature Slides */
    .slide-topbar {
      background: #0f172a;
      color: #ffffff;
      padding: 18px 42px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #0284c7;
    }
    .badge-step {
      font-size: 11px;
      font-weight: 800;
      color: #38bdf8;
      letter-spacing: 0.06em;
      margin-bottom: 3px;
    }
    .slide-topbar h2 { font-size: 23px; font-weight: 800; letter-spacing: -0.01em; }
    .slide-num {
      background: rgba(255,255,255,0.1);
      color: #cbd5e1;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .slide-sub {
      margin: 14px 42px 0 42px;
      background: #eff6ff;
      border: 1px solid #bae6fd;
      color: #1e3a8a;
      padding: 9px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
    }
    .slide-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1.45fr 1fr;
      gap: 20px;
      padding: 14px 42px;
      min-height: 0;
    }
    .img-box {
      background: #0f172a;
      border-radius: 10px;
      border: 2px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 6px;
      min-height: 0;
    }
    .img-box img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 6px;
    }
    .cards-col {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;
    }
    .feat-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #0284c7;
      border-radius: 8px;
      padding: 11px 14px;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(15,23,42,0.04);
    }
    .feat-card h4 { font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
    .feat-card p { font-size: 12.5px; color: #475569; line-height: 1.35; }
    .takeaway-bar {
      margin: 0 42px 18px 42px;
      background: #ecfdf5;
      border: 1px solid #6ee7b7;
      border-left: 5px solid #059669;
      padding: 11px 16px;
      border-radius: 8px;
      font-size: 13.5px;
      color: #064e3b;
    }
    /* Slide 10 Comparison */
    .comp-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      padding: 18px 42px;
    }
    .comp-col-bad {
      background: #fff1f2;
      border: 1px solid #fecdd3;
      border-top: 5px solid #e11d48;
      border-radius: 10px;
      padding: 22px;
    }
    .comp-col-good {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-top: 5px solid #059669;
      border-radius: 10px;
      padding: 22px;
    }
    .comp-col-bad h3 { color: #9f1239; font-size: 18px; margin-bottom: 14px; }
    .comp-col-good h3 { color: #065f46; font-size: 18px; margin-bottom: 14px; }
    .comp-list { list-style: none; display: flex; flex-direction: column; gap: 12px; font-size: 14px; line-height: 1.4; }
    .conclusion-banner {
      margin: 0 42px 22px 42px;
      background: #0f172a;
      color: #f8fafc;
      border-radius: 10px;
      padding: 18px 24px;
      border-left: 6px solid #38bdf8;
      font-size: 14px;
      line-height: 1.45;
    }
  </style>
</head>
<body>

  <!-- SLIDE 1: CAPA -->
  <section class="slide slide-cover">
    <div>
      <div class="cover-pill">◆ Apresentação Executiva à Diretoria • Base Real Homologada</div>
      <h1><span>ShopRateio:</span> Governança Digital e Blindagem no Rateio de Utilidades</h1>
      <p class="lead">
        Demonstração prática com os dados reais já preenchidos de <strong>Água & Esgoto</strong> (Outubro/2026): como substituímos pranchetas de papel e planilhas vulneráveis por uma operação auditável, com comprovação por foto e <strong>Diferença Contábil Zero</strong>.
      </p>
    </div>
    <div>
      <div class="cover-kpis">
        <div class="cover-kpi">
          <div class="lbl">Insumo Homologado</div>
          <div class="val">💧 Água</div>
          <div class="sub">64 Lojas Ativas (100% Lidas)</div>
        </div>
        <div class="cover-kpi">
          <div class="lbl">Volume & Fatura (Out/26)</div>
          <div class="val">6.081 m³</div>
          <div class="sub">R$ 90.679,77 Auditados</div>
        </div>
        <div class="cover-kpi">
          <div class="lbl">Conciliação com SAP</div>
          <div class="val">R$ 0,00</div>
          <div class="sub">Diferença Fatura vs. Rateio</div>
        </div>
        <div class="cover-kpi">
          <div class="lbl">Tempo de Fechamento</div>
          <div class="val">-90%</div>
          <div class="sub">De 5 dias para menos de 2h</div>
        </div>
      </div>
    </div>
  </section>

  ${featureSlidesHtml}

  <!-- SLIDE 10: ANTES VS DEPOIS E CONCLUSÃO -->
  <section class="slide">
    <div class="slide-topbar">
      <div>
        <div class="badge-step">◆ SHOPRATEIO  |  SÍNTESE EXECUTIVA & ROI</div>
        <h2>9. Comparativo Direto: Antes vs. Depois & Conclusão</h2>
      </div>
      <div class="slide-num">Slide 10 / 10</div>
    </div>
    <div class="comp-grid">
      <div class="comp-col-bad">
        <h3>❌ O Cenário Antigo (Papel & Planilhas)</h3>
        <ul class="comp-list">
          <li><strong>1. Coleta em Papel:</strong> Anotações manuais sujeitas a erro de digitação, números trocados e perda de folhas.</li>
          <li><strong>2. Lojas Esquecidas:</strong> Unidades ativas ficavam fora do rateio em trocas contratuais, gerando prejuízo ao condomínio.</li>
          <li><strong>3. Contestações sem Prova:</strong> Lojistas questionavam cobranças e a administração não tinha foto datada do relógio.</li>
          <li><strong>4. Fechamento Lento (3 a 5 dias):</strong> Redigitação manual no Excel com risco constante de fórmulas apagadas.</li>
        </ul>
      </div>
      <div class="comp-col-good">
        <h3>✅ Com a Plataforma ShopRateio</h3>
        <ul class="comp-list">
          <li><strong>1. Coleta no Celular Offline + IA:</strong> Rota guiada nos corredores, funciona sem internet no subsolo e exige foto do hidrômetro.</li>
          <li><strong>2. Trava dos 5 Pilares:</strong> Impossível fechar o mês com loja esquecida ou diferença entre Fatura e Total Rateado.</li>
          <li><strong>3. Espelho no WhatsApp em 10s:</strong> Comprovante individual com foto e memória de cálculo enviado em 1 clique.</li>
          <li><strong>4. Fechamento em menos de 2 horas:</strong> Conciliação exata (R$ 90.679,77 = R$ 90.679,77 • Diferença R$ 0,00) + Excel SAP.</li>
        </ul>
      </div>
    </div>
    <div class="conclusion-banner">
      <strong style="color:#38bdf8; display:block; margin-bottom:4px;">🎯 PARECER EXECUTIVO PARA A DIRETORIA:</strong>
      Com a operação de <strong>Água & Esgoto</strong> 100% homologada (64 lojas, 6.081 m³ e R$ 90.679,77 conciliados centavo a centavo), o ShopRateio blinda o caixa do shopping, reduz em até 90% o esforço operacional da equipe e está pronto para replicação imediata nos módulos de <strong>Energia Elétrica e Gás</strong>.
    </div>
  </section>

</body>
</html>`;

  fs.writeFileSync(OUTPUT_SLIDES_HTML, slidesHtmlContent, 'utf8');
  console.log(`✓ Slides HTML interativos gerados: ${OUTPUT_SLIDES_HTML}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(slidesHtmlContent, { waitUntil: 'networkidle' });
  await page.pdf({
    path: OUTPUT_SLIDES_PDF,
    width: '1280px',
    height: '720px',
    printBackground: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
  });
  await browser.close();
  console.log(`✓ Slides PDF Widescreen (16:9) gerados: ${OUTPUT_SLIDES_PDF}`);
}

buildPptxAndSlides().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
