const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(ROOT, 'screenshots');

function getBase64Image(filename) {
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  return 'data:image/png;base64,' + fs.readFileSync(filePath).toString('base64');
}

function getPngDimensions(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// AUXILIAR DOCX (OpenXML nativo via JSZip)
// ============================================================================
async function createDocxFile(outputPath, title, bodyXml, imagesToEmbed = []) {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`);

  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${esc(title)}</dc:title>
  <dc:creator>ShopRateio</dc:creator>
</cp:coreProperties>`);

  const relsEntries = [
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
  ];

  imagesToEmbed.forEach((img, idx) => {
    const rId = `rIdImg${idx + 1}`;
    const mediaName = `image${idx + 1}.png`;
    const buf = fs.readFileSync(path.join(SCREENSHOTS_DIR, img.file));
    zip.file(`word/media/${mediaName}`, buf);
    relsEntries.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/>`);
  });

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relsEntries.join('\n  ')}
</Relationships>`);

  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="21"/>
        <w:color w:val="1E293B"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`);

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="400" w:footer="400" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`);

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outputPath, buf);
}

function wBanner(kicker, title, subtitle, bgHex = '0F172A', accentHex = '38BDF8') {
  return `
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:shd w:val="clear" w:color="auto" w:fill="${bgHex}"/>
      <w:tblCellMar>
        <w:top w:w="180" w:type="dxa"/>
        <w:bottom w:w="180" w:type="dxa"/>
        <w:left w:w="240" w:type="dxa"/>
        <w:right w:w="240" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
    <w:tr>
      <w:tc>
        <w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${bgHex}"/></w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="${accentHex}"/><w:sz w:val="18"/></w:rPr><w:t>${esc(kicker)}</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="32"/></w:rPr><w:t>${esc(title)}</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
          <w:r><w:rPr><w:color w:val="CBD5E1"/><w:sz w:val="20"/></w:rPr><w:t>${esc(subtitle)}</w:t></w:r>
        </w:p>
      </w:tc>
    </w:tr>
  </w:tbl>`;
}

function wHeading(text, colorHex = '0F172A') {
  return `
  <w:p>
    <w:pPr>
      <w:spacing w:before="180" w:after="80"/>
      <w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="CBD5E1"/></w:pBdr>
    </w:pPr>
    <w:r><w:rPr><w:b/><w:color w:val="${colorHex}"/><w:sz w:val="24"/></w:rPr><w:t>${esc(text)}</w:t></w:r>
  </w:p>`;
}

function wPara(boldPrefix, text, after = 80) {
  return `
  <w:p>
    <w:pPr><w:spacing w:before="20" w:after="${after}"/></w:pPr>
    ${boldPrefix ? `<w:r><w:rPr><w:b/><w:color w:val="0F172A"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${esc(boldPrefix)} </w:t></w:r>` : ''}
    <w:r><w:rPr><w:color w:val="334155"/><w:sz w:val="20"/></w:rPr><w:t>${esc(text)}</w:t></w:r>
  </w:p>`;
}

function wCallout(title, text, bgFill = 'EFF6FF', borderColor = '0284C7', titleColor = '0369A1') {
  return `
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
        <w:left w:val="single" w:sz="18" w:space="0" w:color="${borderColor}"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
      </w:tblBorders>
      <w:shd w:val="clear" w:color="auto" w:fill="${bgFill}"/>
      <w:tblCellMar>
        <w:top w:w="100" w:type="dxa"/>
        <w:bottom w:w="100" w:type="dxa"/>
        <w:left w:w="150" w:type="dxa"/>
        <w:right w:w="150" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
    <w:tr>
      <w:tc>
        <w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${bgFill}"/></w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:before="0" w:after="30"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="${titleColor}"/><w:sz w:val="20"/></w:rPr><w:t>${esc(title)}</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
          <w:r><w:rPr><w:color w:val="1E293B"/><w:sz w:val="19"/></w:rPr><w:t>${esc(text)}</w:t></w:r>
        </w:p>
      </w:tc>
    </w:tr>
  </w:tbl>
  <w:p><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr></w:p>`;
}

function wImage(rId, idNum, fileName, caption, maxWidthInches = 6.2, maxHeightInches = 3.2) {
  const buf = fs.readFileSync(path.join(SCREENSHOTS_DIR, fileName));
  const dims = getPngDimensions(buf);
  let widthIn = maxWidthInches;
  let heightIn = widthIn * (dims.height / dims.width);
  if (heightIn > maxHeightInches) {
    heightIn = maxHeightInches;
    widthIn = heightIn * (dims.width / dims.height);
  }
  const cx = Math.round(widthIn * 914400);
  const cy = Math.round(heightIn * 914400);

  return `
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="40"/></w:pPr>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="${cx}" cy="${cy}"/>
          <wp:docPr id="${idNum}" name="Img${idNum}"/>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="${idNum}" name="${esc(fileName)}"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${rId}"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="100"/></w:pPr>
    <w:r><w:rPr><w:i/><w:color w:val="64748B"/><w:sz w:val="17"/></w:rPr><w:t>${esc(caption)}</w:t></w:r>
  </w:p>`;
}

// ============================================================================
// 1. ROTEIRO DE APRESENTAÇÃO (5 MINUTOS) + FAQ EXECUTIVO DA DIRETORIA
// ============================================================================
function buildRoteiroFaqHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Roteiro de Reunião e FAQ da Diretoria — ShopRateio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; color: #0f172a; background: #fff; font-size: 9.2pt; line-height: 1.42; }
  @page { size: A4 portrait; margin: 0; }
  .page { width: 210mm; height: 297mm; padding: 11mm 13mm; page-break-after: always; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .banner { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: #fff; padding: 14px 18px; border-radius: 10px; border-bottom: 3px solid #38bdf8; }
  .banner-kicker { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1.2px; color: #38bdf8; font-weight: 800; margin-bottom: 3px; }
  .banner h1 { font-size: 15pt; font-weight: 800; margin-bottom: 3px; }
  .banner p { font-size: 8.5pt; color: #cbd5e1; }
  .sec-title { font-size: 10.5pt; font-weight: 800; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin: 8px 0 6px 0; display: flex; align-items: center; justify-content: space-between; }
  .sec-title span { font-size: 7.5pt; color: #0284c7; background: #e0f2fe; padding: 2px 8px; border-radius: 99px; font-weight: 700; }
  .pitch-box { background: #f0fdf4; border: 1px solid #86efac; border-left: 4px solid #16a34a; border-radius: 8px; padding: 9px 12px; font-size: 8.7pt; color: #14532d; }
  .pitch-box strong { color: #166534; }
  .timeline { display: flex; flex-direction: column; gap: 6px; }
  .step-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 11px; background: #f8fafc; display: grid; grid-template-columns: 78px 1fr; gap: 10px; align-items: center; }
  .time-pill { background: #0f172a; color: #38bdf8; font-weight: 800; font-size: 7.8pt; text-align: center; padding: 6px 4px; border-radius: 6px; line-height: 1.2; }
  .time-pill small { display: block; color: #cbd5e1; font-size: 6.5pt; font-weight: 600; margin-top: 2px; }
  .step-body h3 { font-size: 9pt; font-weight: 800; color: #0f172a; margin-bottom: 2px; }
  .step-body p { font-size: 8.2pt; color: #334155; }
  .step-body .quote { color: #0369a1; font-weight: 600; font-style: italic; margin-top: 2px; display: block; }
  .kpi-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .kpi { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 7px 9px; text-align: center; }
  .kpi .val { font-size: 11pt; font-weight: 800; color: #1d4ed8; }
  .kpi .lbl { font-size: 7pt; color: #475569; font-weight: 600; text-transform: uppercase; }
  .faq-grid { display: flex; flex-direction: column; gap: 6px; }
  .faq-item { border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 11px; background: #ffffff; }
  .faq-q { font-size: 8.7pt; font-weight: 800; color: #0f172a; margin-bottom: 2px; display: flex; align-items: center; gap: 6px; }
  .faq-q .q-badge { background: #0284c7; color: #fff; font-size: 7pt; padding: 1px 6px; border-radius: 4px; font-weight: 800; }
  .faq-a { font-size: 8.1pt; color: #334155; }
  .faq-a strong { color: #0f172a; }
  .footer { border-top: 1px solid #cbd5e1; padding-top: 5px; display: flex; justify-content: space-between; font-size: 7.2pt; color: #64748b; font-weight: 600; }
</style>
</head>
<body>

<!-- PÁGINA 1: ROTEIRO DE 5 MINUTOS -->
<div class="page">
  <div class="banner">
    <div class="banner-kicker">Guia de Reunião Executiva • Material de Apoio ao Apresentador</div>
    <h1>Roteiro de Apresentação (5 Minutos) & Argumentário da Diretoria</h1>
    <p>Guia prático do que falar em cada etapa da reunião para demonstrar ganho financeiro, blindagem jurídica e eficiência operacional.</p>
  </div>

  <div>
    <div class="sec-title">1. Abertura de Impacto (Primeiros 30 Segundos) <span>Quebra-Gelo Executivo</span></div>
    <div class="pitch-box">
      <strong>O que falar ao abrir a reunião:</strong><br/>
      “Pessoal, trouxemos hoje o fechamento real de <strong>Água de Outubro/2026 (R$ 90.679,77 e 6.081 m³ em 64 lojas)</strong> já rodando no novo sistema <strong>ShopRateio</strong>. Nosso objetivo com essa ferramenta não é apenas modernizar telas: é <strong>garantir Diferença Zero (R$ 0,00)</strong> entre a fatura da concessionária e o rateio cobrado, <strong>eliminar o risco de esquecer lojas</strong> na virada do mês e <strong>acabar com as contestações por falta de foto do medidor</strong>.”
    </div>
  </div>

  <div>
    <div class="sec-title">2. Números-Chave na Ponta da Língua (Outubro/2026) <span>Métricas Reais da Água</span></div>
    <div class="kpi-bar">
      <div class="kpi"><div class="val">R$ 90.679,77</div><div class="lbl">Fatura Total Rateada</div></div>
      <div class="kpi"><div class="val">6.081 m³</div><div class="lbl">Consumo • R$ 14,9120/m³</div></div>
      <div class="kpi"><div class="val">64 / 64 Lojas</div><div class="lbl">100% Auditadas com Foto</div></div>
      <div class="kpi"><div class="val">R$ 0,00</div><div class="lbl">Diferença Contábil</div></div>
    </div>
  </div>

  <div>
    <div class="sec-title">3. Passo a Passo do Que Falar em Cada Tela (Roteiro de 5 Minutos) <span>Guia de Condução</span></div>
    <div class="timeline">
      <div class="step-card">
        <div class="time-pill">Minuto 1<small>Slides 1 a 3</small></div>
        <div class="step-body">
          <h3>O Problema Antigo vs. A Visão Geral Executiva</h3>
          <p>Mostre que antes a leitura em papel/planilha gerava retrabalho de digitação e risco de erro humano. Aponte para o <strong>Dashboard Executivo</strong> mostrando o faturamento consolidado e os alertas automáticos.</p>
          <span class="quote">Frase-chave: “Hoje a Diretoria bate o olho em uma tela e sabe quanto o shopping gastou, a tarifa efetiva por m³ e se 100% das lojas foram lidas.”</span>
        </div>
      </div>

      <div class="step-card">
        <div class="time-pill">Minuto 2<small>Slide 4</small></div>
        <div class="step-body">
          <h3>Coleta em Campo pelo Celular + IA + Modo Offline</h3>
          <p>Destaque a tela do celular do técnico: ele segue uma rota guiada, digita a leitura vendo o consumo na hora e tira a foto obrigatória (ou usa a IA para ler os dígitos). Tudo funciona sem internet nos subsolos.</p>
          <span class="quote">Frase-chave: “O técnico já descobre na frente do hidrômetro se houve vazamento ou erro de digitação, e a foto fica arquivada como prova.”</span>
        </div>
      </div>

      <div class="step-card">
        <div class="time-pill">Minuto 3<small>Slides 5 e 6</small></div>
        <div class="step-body">
          <h3>Cálculo Automático (R$ 90.679,77) & Painel Anti-Esquecimento</h3>
          <p>Mostre a calculadora: inserimos a conta (R$ 88.836,31) + Enviro Tools (R$ 1.843,46) e o sistema calcula R$ 14,9120/m³. Destaque o <strong>Painel de Continuidade</strong> que vigia as 63 lojas medidas no mês anterior.</p>
          <span class="quote">Frase-chave: “Nenhuma loja que pagou no mês passado passa despercebida neste mês. O sistema bloqueia esquecimentos de cobrança.”</span>
        </div>
      </div>

      <div class="step-card">
        <div class="time-pill">Minuto 4<small>Slide 7</small></div>
        <div class="step-body">
          <h3>Trava de Fechamento Contábil (5 Pilares = Diferença R$ 0,00)</h3>
          <p>Aponte o Checklist de Fechamento: mostra que Fatura da Concessionária (R$ 90.679,77) bate até o último centavo com o Total Rateado (R$ 90.679,77), além de permitir congelar o mês com 1 clique.</p>
          <span class="quote">Frase-chave: “O shopping não absorve prejuízo por arredondamento ou furo de planilha. Só fechamos o mês quando os 5 pilares estão verdes.”</span>
        </div>
      </div>

      <div class="step-card">
        <div class="time-pill">Minuto 5<small>Slides 8 a 10</small></div>
        <div class="step-body">
          <h3>Relacionamento com o Lojista (Espelho + Gráficos) e Próximos Passos</h3>
          <p>Mostre o <strong>Espelho da PANVEL</strong> (pronto para enviar por WhatsApp/PDF com foto) e o <strong>Relatório Individual do BAH</strong> (980 m³ em 4 meses). Feche mostrando que a plataforma já está pronta para Energia e Gás.</p>
          <span class="quote">Frase-chave: “Quando o lojista recebe o espelho com foto e histórico gráfico, a dúvida acaba na hora e a inadimplência cai.”</span>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>ShopRateio • Roteiro Executivo de Reunião com a Diretoria</span>
    <span>Página 1 de 2</span>
  </div>
</div>

<!-- PÁGINA 2: FAQ EXECUTIVO (PERGUNTAS DIFÍCEIS DA DIRETORIA) -->
<div class="page">
  <div class="banner">
    <div class="banner-kicker">Respostas Estratégicas • Blindagem na Reunião</div>
    <h1>FAQ Executivo: 9 Perguntas que a Diretoria Pode Fazer</h1>
    <p>Respostas diretas, seguras e focadas em resultado financeiro e operacional para responder qualquer questionamento na hora.</p>
  </div>

  <div class="faq-grid">
    <div class="faq-item">
      <div class="faq-q"><span class="q-badge">P1</span> “E se o técnico estiver no subsolo ou galeria técnica onde não pega Wi-Fi nem 4G?”</div>
      <div class="faq-a"><strong>Resposta:</strong> O sistema possui <strong>Modo Offline nativo</strong>. O técnico faz 100% das leituras e tira as fotos normalmente sem sinal. Tudo fica salvo com segurança no aparelho e sincroniza sozinho assim que ele volta para uma área com cobertura.</div>
    </div>

    <div class="faq-item">
      <div class="faq-q"><span class="q-badge">P2</span> “Como garantimos que o técnico não vai inventar um número da cabeça dele sem ir até o medidor?”</div>
      <div class="faq-a"><strong>Resposta:</strong> O sistema exige a <strong>foto do medidor no ato da leitura</strong> e conta com leitura por <strong>Inteligência Artificial (OCR)</strong>. Além disso, o Checklist de Fechamento aponta exatamente se alguma loja ficou sem evidência fotográfica antes de liberar o faturamento.</div>
    </div>

    <div class="faq-item">
      <div class="faq-q"><span class="q-badge">P3</span> “Como esse sistema conversa com o nosso ERP / SAP e com a Contabilidade?”</div>
      <div class="faq-a"><strong>Resposta:</strong> A integração já é 100% compatível via planilha padrão SAP: nós <strong>importamos a listagem mensal do SAP</strong> (atualizando contratos e LUCs em segundos) e, no fechamento, <strong>exportamos o Excel final auditado + pacote ZIP com todas as fotos</strong> nomeadas por loja.</div>
    </div>

    <div class="faq-item">
      <div class="faq-q"><span class="q-badge">P4</span> “O que acontece quando uma loja troca de razão social ou número de contrato no meio do ano?”</div>
      <div class="faq-a"><strong>Resposta:</strong> O sistema possui <strong>inteligência de vínculo histórico (LUC + Contrato + Nome Fantasia)</strong>. Mesmo que o contrato mude na virada do mês, o sistema mantém a leitura anterior do hidrômetro e preserva todo o histórico de consumo daquela unidade.</div>
    </div>

    <div class="faq-item">
      <div class="faq-q"><span class="q-badge">P5</span> “E se um lojista questionar que a conta dele veio alta neste mês?”</div>
      <div class="faq-a"><strong>Resposta:</strong> Em 5 segundos emitimos dois documentos oficiais: o <strong>Espelho Individual</strong> (com leitura anterior, atual, foto do hidrômetro e tarifa exata) e o <strong>Relatório de Evolução da Loja</strong> (comparando vários meses em gráfico). A conversa passa a ser baseada em prova visual irrefutável.</div>
    </div>

    <div class="faq-item">
      <div class="faq-q"><span class="q-badge">P6</span> “Como evitamos que alguém altere uma leitura por engano depois que a cobrança já foi enviada?”</div>
      <div class="faq-a"><strong>Resposta:</strong> Assim que os 5 pilares do Checklist ficam verdes, a Administração clica em <strong>“Congelar Mês”</strong>. Isso tranca todas as leituras, tarifas e fotos daquela competência para auditoria, impedindo edições acidentais.</div>
    </div>

    <div class="faq-item">
      <div class="faq-q"><span class="q-badge">P7</span> “E quando o consumo de uma loja dá zero (loja em obras) ou dispara por vazamento?”</div>
      <div class="faq-a"><strong>Resposta:</strong> O sistema detecta a anomalia na hora (variação acima de 40%, consumo zero ou leitura menor que a anterior) e exige uma <strong>Justificativa de Auditoria</strong>, que o técnico ou gestor preenche com 1 toque (ex.: <em>Vazamento Interno, Loja Fechada, Medidor Trocado</em>).</div>
    </div>

    <div class="faq-item">
      <div class="faq-q"><span class="q-badge">P8</span> “Quanto tempo a equipe leva para aprender a usar? Precisa de treinamento longo?”</div>
      <div class="faq-a"><strong>Resposta:</strong> Menos de 15 minutos. A tela do técnico parece um aplicativo de celular comum com etiquetas prontas de 1 toque, e a Administração tem um Checklist visual passo a passo. Já preparamos um <strong>Manual de Bolso de 1 página</strong> para o campo e um <strong>POP de 1 página</strong> para o escritório.</div>
    </div>

    <div class="faq-item">
      <div class="faq-q"><span class="q-badge">P9</span> “Precisaremos comprar outro sistema para Energia Elétrica e Gás?”</div>
      <div class="faq-a"><strong>Resposta:</strong> <strong>Não. Custo adicional zero de licença.</strong> Os módulos de Energia Elétrica (MWh/kWh) e Gás (m³) já estão prontos dentro do mesmo sistema, usando a mesma lógica de auditoria e fotos.</div>
    </div>
  </div>

  <div class="footer">
    <span>ShopRateio • FAQ Executivo para Reunião da Diretoria</span>
    <span>Página 2 de 2</span>
  </div>
</div>

</body>
</html>`;
}

// ============================================================================
// 2. MANUAL DE BOLSO DO TÉCNICO DE CAMPO (1 PÁGINA A4)
// ============================================================================
function buildManualTecnicoHtml() {
  const imgMobile = getBase64Image('08_tecnico_campo_mobile.png');
  const imgJustif = getBase64Image('05_justificativa_rapida_1toque.png');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Manual de Bolso do Técnico de Campo — ShopRateio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; color: #0f172a; background: #fff; font-size: 9pt; line-height: 1.38; }
  @page { size: A4 portrait; margin: 0; }
  .page { width: 210mm; height: 297mm; padding: 10mm 12mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .banner { background: linear-gradient(135deg, #0f172a 0%, #0369a1 100%); color: #fff; padding: 13px 18px; border-radius: 10px; border-bottom: 3px solid #38bdf8; display: flex; justify-content: space-between; align-items: center; }
  .banner-kicker { font-size: 7.2pt; text-transform: uppercase; letter-spacing: 1.2px; color: #7dd3fc; font-weight: 800; margin-bottom: 2px; }
  .banner h1 { font-size: 14.5pt; font-weight: 800; margin-bottom: 2px; }
  .banner p { font-size: 8.2pt; color: #e0f2fe; }
  .badge-pocket { background: #38bdf8; color: #0f172a; font-weight: 800; font-size: 8pt; padding: 6px 10px; border-radius: 8px; text-align: center; white-space: nowrap; }
  .main-grid { display: grid; grid-template-columns: 1.25fr 0.95fr; gap: 12px; align-items: start; }
  .steps-col { display: flex; flex-direction: column; gap: 7px; }
  .step-box { border: 1px solid #cbd5e1; border-left: 4px solid #0284c7; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
  .step-hdr { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
  .step-num { background: #0284c7; color: #fff; font-weight: 800; font-size: 8pt; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
  .step-title { font-size: 9.2pt; font-weight: 800; color: #0f172a; }
  .step-desc { font-size: 8.1pt; color: #334155; }
  .step-desc strong { color: #0f172a; }
  .visual-col { display: flex; flex-direction: column; gap: 8px; }
  .img-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px; background: #fff; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.04); }
  .img-card img { max-width: 100%; max-height: 280px; object-fit: contain; border-radius: 5px; border: 1px solid #e2e8f0; }
  .img-card.small img { max-height: 145px; }
  .img-cap { font-size: 7.3pt; color: #475569; font-weight: 700; margin-top: 4px; }
  .rules-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .rule-card { border-radius: 8px; padding: 8px 10px; font-size: 8pt; }
  .rule-card.ok { background: #f0fdf4; border: 1px solid #86efac; color: #14532d; }
  .rule-card.warn { background: #fffbeb; border: 1px solid #fde047; color: #713f12; }
  .rule-card.info { background: #eff6ff; border: 1px solid #93c5fd; color: #1e3a8a; }
  .rule-card h4 { font-size: 8.4pt; font-weight: 800; margin-bottom: 2px; }
  .footer { border-top: 1px solid #cbd5e1; padding-top: 5px; display: flex; justify-content: space-between; font-size: 7.2pt; color: #64748b; font-weight: 600; }
</style>
</head>
<body>
<div class="page">
  <div class="banner">
    <div>
      <div class="banner-kicker">Guia Rápido de Operação em Campo • Equipe Técnica & Manutenção</div>
      <h1>Manual de Bolso: Coleta de Leituras no Celular (5 Passos)</h1>
      <p>Instruções práticas para leitura mensal de Água, Energia e Gás com foto obrigatória e modo offline.</p>
    </div>
    <div class="badge-pocket">GUIA DE 1 PÁGINA<br/>PRONTO P/ IMPRIMIR</div>
  </div>

  <div class="main-grid">
    <div class="steps-col">
      <div class="step-box">
        <div class="step-hdr"><span class="step-num">1</span><span class="step-title">Abrir o Modo Campo e Ativar a Rota Guiada</span></div>
        <div class="step-desc">Acesse o <strong>ShopRateio</strong> no celular, selecione a utilidade (ex.: <strong>Água</strong>) e o mês atual. Toque em <strong>“Pendentes”</strong> ou <strong>“Rota Guiada”</strong> para o sistema mostrar as lojas na sequência física dos corredores/galerias. <em>Dica: Em galerias escuras, ative o <strong>Modo Escuro (ícone de Lua)</strong> no topo.</em></div>
      </div>

      <div class="step-box">
        <div class="step-hdr"><span class="step-num">2</span><span class="step-title">Conferir o Medidor e Digitar a Leitura Atual</span></div>
        <div class="step-desc">Confirme o <strong>Nome da Loja e LUC</strong> no cartão. Veja a <strong>Leitura Anterior</strong> exibida na tela e digite os números pretos (m³ inteiros) no campo <strong>“Leitura Atual”</strong>. O sistema calcula e mostra o <strong>Consumo do Mês na mesma hora</strong>.</div>
      </div>

      <div class="step-box">
        <div class="step-hdr"><span class="step-num">3</span><span class="step-title">Tirar a Foto Obrigatória (ou Usar Leitura por IA)</span></div>
        <div class="step-desc">Toque no botão da <strong>Câmera (Foto)</strong> para fotografar o visor do hidrômetro com nitidez (os números e o código do relógio devem estar visíveis). Se preferir, toque no botão <strong>IA (Brilho)</strong> para que o sistema leia os números da foto automaticamente.</div>
      </div>

      <div class="step-box">
        <div class="step-hdr"><span class="step-num">4</span><span class="step-title">Justificar Alertas com 1 Toque (Se o Sistema Pedir)</span></div>
        <div class="step-desc">Se o consumo variar mais de <strong>40%</strong>, der <strong>Zero (0 m³)</strong> ou ficar <strong>menor que o mês passado</strong>, o cartão exibirá um aviso amarelo/vermelho. Basta tocar em uma <strong>Etiqueta Rápida</strong> (ex.: <em>Loja Fechada/Obras, Vazamento Interno, Medidor Trocado</em>) para justificar sem precisar digitar textos longos.</div>
      </div>

      <div class="step-box">
        <div class="step-hdr"><span class="step-num">5</span><span class="step-title">Avançar até Completar 100% (Sincronização Automática)</span></div>
        <div class="step-desc">Ao preencher leitura + foto, a loja recebe o selo verde <strong>“Concluído”</strong>. Continue até o contador no topo marcar <strong>100% (ex.: 64/64 lojas lidas)</strong>. Sem internet no subsolo? Continue normalmente: o <strong>Modo Offline</strong> guarda tudo e envia sozinho quando o sinal voltar.</div>
      </div>
    </div>

    <div class="visual-col">
      <div class="img-card">
        <img src="${imgMobile}" alt="Tela Mobile do Técnico"/>
        <div class="img-cap">Tela Real no Celular: Rota Guiada + Leitura + Foto + IA</div>
      </div>
      <div class="img-card small">
        <img src="${imgJustif}" alt="Etiquetas Rápidas de 1 Toque"/>
        <div class="img-cap">Etiquetas Rápidas de 1 Toque para Justificar Anomalias</div>
      </div>
    </div>
  </div>

  <div class="rules-bar">
    <div class="rule-card ok">
      <h4>✅ Regra de Ouro #1: Foto Nítida</h4>
      Limpe o visor do hidrômetro se estiver embaçado ou com poeira antes de bater a foto. A foto vai para o comprovante do lojista.
    </div>
    <div class="rule-card warn">
      <h4>⚠️ Regra de Ouro #2: Consumo Estranho</h4>
      Se o consumo calculado na tela parecer muito alto, confira na hora se não digitou um dígito vermelho (litros) por engano.
    </div>
    <div class="rule-card info">
      <h4>📶 Regra de Ouro #3: Subsolo Offline</h4>
      Nunca feche a aba limpando os dados do navegador enquanto estiver sem sinal. Basta voltar ao Wi-Fi/4G para sincronizar.
    </div>
  </div>

  <div class="footer">
    <span>ShopRateio • Manual de Bolso do Técnico de Campo (Operação Mobile)</span>
    <span>Documento Operacional — Página Única</span>
  </div>
</div>
</body>
</html>`;
}

// ============================================================================
// 3. POP DE FECHAMENTO MENSAL DA ADMINISTRAÇÃO (1 PÁGINA A4)
// ============================================================================
function buildPopAdminHtml() {
  const imgCalc = getBase64Image('02_rateio_calculadora_desktop.png');
  const imgCheck = getBase64Image('03_checklist_fechamento_contabil.png');
  const imgEspelho = getBase64Image('06_espelho_individual_lojista.png');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>POP de Fechamento Mensal da Administração — ShopRateio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; color: #0f172a; background: #fff; font-size: 8.8pt; line-height: 1.36; }
  @page { size: A4 portrait; margin: 0; }
  .page { width: 210mm; height: 297mm; padding: 10mm 12mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .banner { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; padding: 12px 18px; border-radius: 10px; border-bottom: 3px solid #10b981; display: flex; justify-content: space-between; align-items: center; }
  .banner-kicker { font-size: 7.2pt; text-transform: uppercase; letter-spacing: 1.2px; color: #34d399; font-weight: 800; margin-bottom: 2px; }
  .banner h1 { font-size: 14pt; font-weight: 800; margin-bottom: 2px; }
  .banner p { font-size: 8pt; color: #cbd5e1; }
  .pop-code { background: #10b981; color: #0f172a; font-weight: 800; font-size: 7.8pt; padding: 6px 10px; border-radius: 8px; text-align: center; white-space: nowrap; }
  .steps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .step-card { border: 1px solid #cbd5e1; border-top: 3px solid #0f172a; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
  .step-card.green { border-top-color: #10b981; background: #f0fdf4; }
  .step-hdr { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .step-num { background: #0f172a; color: #fff; font-weight: 800; font-size: 7.5pt; padding: 2px 7px; border-radius: 4px; }
  .step-card.green .step-num { background: #059669; }
  .step-title { font-size: 8.9pt; font-weight: 800; color: #0f172a; }
  .step-desc { font-size: 7.9pt; color: #334155; }
  .step-desc strong { color: #0f172a; }
  .screens-row { display: grid; grid-template-columns: 1.1fr 1.1fr 0.8fr; gap: 8px; align-items: stretch; }
  .scr-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px; background: #fff; display: flex; flex-direction: column; justify-content: space-between; text-align: center; }
  .scr-box img { width: 100%; height: 145px; object-fit: contain; border-radius: 4px; border: 1px solid #e2e8f0; }
  .scr-cap { font-size: 7.1pt; font-weight: 700; color: #475569; margin-top: 4px; }
  .audit-table { width: 100%; border-collapse: collapse; font-size: 7.8pt; }
  .audit-table th { background: #0f172a; color: #fff; text-align: left; padding: 5px 8px; font-weight: 700; }
  .audit-table td { border: 1px solid #cbd5e1; padding: 5px 8px; color: #1e293b; }
  .audit-table tr:nth-child(even) { background: #f8fafc; }
  .ok-pill { background: #dcfce7; color: #166534; font-weight: 800; padding: 1px 6px; border-radius: 4px; font-size: 7.2pt; }
  .footer { border-top: 1px solid #cbd5e1; padding-top: 5px; display: flex; justify-content: space-between; font-size: 7.2pt; color: #64748b; font-weight: 600; }
</style>
</head>
<body>
<div class="page">
  <div class="banner">
    <div>
      <div class="banner-kicker">Procedimento Operacional Padrão (POP) • Administração & Contabilidade</div>
      <h1>POP: Fechamento Mensal e Auditoria de Rateio (6 Etapas)</h1>
      <p>Fluxo padrão do escritório para conferência da fatura, conciliação contábil (R$ 0,00), exportação SAP e envio aos lojistas.</p>
    </div>
    <div class="pop-code">POP-ADM-01<br/>FECHAMENTO MENSAL</div>
  </div>

  <div class="steps-grid">
    <div class="step-card">
      <div class="step-hdr"><span class="step-num">ETAPA 1</span><span class="step-title">Importar / Conferir Base Mensal de Lojas (SAP)</span></div>
      <div class="step-desc">No menu <strong>Gestão de Lojas</strong>, selecione o mês de competência e importe a planilha padrão SAP (ou revise as lojas ativas). O sistema atualiza contratos e LUCs automaticamente e já puxa a <strong>Leitura Anterior</strong> do mês passado sem digitação manual.</div>
    </div>

    <div class="step-card">
      <div class="step-hdr"><span class="step-num">ETAPA 2</span><span class="step-title">Lançar Dados da Fatura da Concessionária</span></div>
      <div class="step-desc">Na aba <strong>Rateio e Leitura</strong>, preencha no topo: <strong>Valor da Conta</strong> (ex.: R$ 88.836,31), encargos/tratamento como <strong>Enviro Tools</strong> (ex.: R$ 1.843,46) e o <strong>Consumo Total Faturado</strong> (ex.: 6.081 m³). O sistema calcula o <strong>Subtotal (R$ 90.679,77)</strong> e a <strong>Tarifa Unitária (R$ 14,9120/m³)</strong>.</div>
    </div>

    <div class="step-card">
      <div class="step-hdr"><span class="step-num">ETAPA 3</span><span class="step-title">Acompanhar Coleta (100%) e Painel Anti-Esquecimento</span></div>
      <div class="step-desc">Verifique a barra de progresso até atingir <strong>100% das lojas lidas (64/64)</strong>. Confira a faixa azul <strong>“Continuidade do Mês Anterior”</strong>: o indicador <strong>“Faltam Ler” deve estar em 0</strong>, garantindo que todas as lojas medidas no mês passado foram medidas neste mês.</div>
    </div>

    <div class="step-card">
      <div class="step-hdr"><span class="step-num">ETAPA 4</span><span class="step-title">Auditar Alertas e Justificativas de Variação</span></div>
      <div class="step-desc">Filtre os cartões de alerta no topo (<em>Alertas de Auditoria / Sem Foto</em>). Verifique se todas as lojas com variação acima de 40% ou consumo zero possuem foto nítida e justificativa registrada pelo técnico de campo.</div>
    </div>

    <div class="step-card green">
      <div class="step-hdr"><span class="step-num">ETAPA 5</span><span class="step-title">Validar os 5 Pilares (Diferença R$ 0,00) e Congelar Mês</span></div>
      <div class="step-desc">Abra o <strong>Checklist de Fechamento Contábil</strong>. Confirme que a <strong>Diferença de Balanço é R$ 0,00</strong> (Fatura Concessionária = Total Rateado) e que todos os 5 indicadores estão verdes. Clique em <strong>“Congelar Mês”</strong> para bloquear edições e em <strong>“Exportar Relatório” (Excel SAP + ZIP de Fotos)</strong>.</div>
    </div>

    <div class="step-card green">
      <div class="step-hdr"><span class="step-num">ETAPA 6</span><span class="step-title">Enviar Espelhos Individuais e Atender Lojistas</span></div>
      <div class="step-desc">Para enviar o comprovante a um lojista, clique no ícone de <strong>Espelho Individual</strong> na linha da loja e envie por <strong>WhatsApp (1 clique) ou PDF</strong>. Se o lojista solicitar histórico detalhado, acesse <strong>Relatório por Loja</strong> e exporte a ficha evolutiva com gráficos.</div>
    </div>
  </div>

  <div class="screens-row">
    <div class="scr-box">
      <img src="${imgCalc}" alt="Calculadora de Rateio"/>
      <div class="scr-cap">Etapas 2 e 3: Calculadora de Tarifa + Continuidade</div>
    </div>
    <div class="scr-box">
      <img src="${imgCheck}" alt="Checklist de Fechamento"/>
      <div class="scr-cap">Etapa 5: Checklist 5 Pilares (Diferença R$ 0,00)</div>
    </div>
    <div class="scr-box">
      <img src="${imgEspelho}" alt="Espelho Individual"/>
      <div class="scr-cap">Etapa 6: Espelho Individual Lojista</div>
    </div>
  </div>

  <div>
    <table class="audit-table">
      <thead>
        <tr>
          <th>Pilar de Conferência Obrigatória antes de Faturar</th>
          <th>Critério de Aprovação no Sistema</th>
          <th>Referência Real (Outubro/2026)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>1. Cobertura de Leitura & Continuidade</strong></td>
          <td>100% das lojas ativas lidas e 0 pendentes do mês anterior</td>
          <td>64/64 lojas ativas lidas (63/63 do mês anterior)</td>
          <td><span class="ok-pill">APROVADO</span></td>
        </tr>
        <tr>
          <td><strong>2. Evidência Fotográfica & Justificativas</strong></td>
          <td>100% das leituras com foto e 100% das anomalias justificadas</td>
          <td>64 fotos anexadas • Alertas 100% justificados</td>
          <td><span class="ok-pill">APROVADO</span></td>
        </tr>
        <tr>
          <td><strong>3. Conciliação Contábil Exata (Balanço)</strong></td>
          <td>Fatura da Concessionária igual ao Total Rateado (Dif. R$ 0,00)</td>
          <td>R$ 90.679,77 Fatura = R$ 90.679,77 Rateado</td>
          <td><span class="ok-pill">DIFERENÇA R$ 0,00</span></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    <span>ShopRateio • POP de Fechamento Mensal da Administração (Auditoria e Faturamento)</span>
    <span>Documento Operacional Padrão — Página Única</span>
  </div>
</div>
</body>
</html>`;
}

// ============================================================================
// CONSTRUÇÃO DOS 3 DOCUMENTOS WORD (.DOCX)
// ============================================================================
async function buildAllWordDocs() {
  // 1. Roteiro + FAQ Word
  const roteiroBody = [
    wBanner(
      'GUIA DE REUNIÃO EXECUTIVA • MATERIAL DO APRESENTADOR',
      'Roteiro de Apresentação (5 Minutos) & FAQ da Diretoria',
      'Guia prático do que falar em cada slide e respostas prontas para perguntas estratégicas da Diretoria (Base: Água Outubro/2026).'
    ),
    wHeading('1. Abertura de Impacto (Primeiros 30 Segundos)'),
    wCallout(
      'Fala de Abertura Recomendada:',
      '“Pessoal, trouxemos hoje o fechamento real de Água de Outubro/2026 (R$ 90.679,77 e 6.081 m³ em 64 lojas) já rodando no novo sistema ShopRateio. Nosso objetivo com essa ferramenta não é apenas modernizar telas: é garantir Diferença Zero (R$ 0,00) entre a fatura da concessionária e o rateio cobrado, eliminar o risco de esquecer lojas na virada do mês e acabar com as contestações por falta de foto do medidor.”',
      'F0FDF4', '16A34A', '166534'
    ),
    wHeading('2. Roteiro Minuto a Minuto (O Que Falar em Cada Slide)'),
    wPara('• Minuto 1 (Slides 1 a 3 — Cenário e Visão Executiva):', 'Mostre que antes a leitura em papel/planilha gerava retrabalho e risco de erro humano. Aponte para o Dashboard Executivo destacando os R$ 90.679,77 faturados, 6.081 m³ consumidos e 100% das 64 lojas lidas.'),
    wPara('• Minuto 2 (Slide 4 — Coleta Mobile em Campo + IA + Offline):', 'Destaque a tela do celular do técnico: ele segue uma rota guiada, digita a leitura vendo o consumo na hora e tira a foto obrigatória (ou usa a IA para ler os dígitos). Tudo funciona sem internet nos subsolos.'),
    wPara('• Minuto 3 (Slides 5 e 6 — Cálculo Automático e Painel Anti-Esquecimento):', 'Mostre a calculadora: inserimos a conta (R$ 88.836,31) + Enviro Tools (R$ 1.843,46) = R$ 90.679,77 (Tarifa de R$ 14,9120/m³). Destaque o Painel de Continuidade que garante que nenhuma das 63 lojas medidas no mês anterior seja esquecida.'),
    wPara('• Minuto 4 (Slide 7 — Trava de Fechamento Contábil R$ 0,00):', 'Aponte o Checklist de 5 Pilares provando que Fatura da Concessionária (R$ 90.679,77) bate até o último centavo com o Total Rateado (R$ 90.679,77), permitindo congelar o mês com 1 clique.'),
    wPara('• Minuto 5 (Slides 8 a 10 — Espelho do Lojista, Gráficos e Expansão):', 'Mostre o Espelho da PANVEL (R$ 59,65, pronto para WhatsApp/PDF com foto) e o Relatório Individual do BAH (980 m³ acumulados em 4 meses). Feche lembrando que Energia e Gás já estão inclusos sem custo extra.'),
    wHeading('3. FAQ Executivo: Respostas para 9 Perguntas Difíceis da Diretoria'),
    wPara('P1. “E se o técnico estiver no subsolo onde não pega Wi-Fi nem 4G?”', 'R: O sistema possui Modo Offline nativo. O técnico registra leituras e fotos sem sinal e tudo sincroniza automaticamente quando ele volta para uma área com cobertura.'),
    wPara('P2. “Como garantimos que o técnico não vai inventar um número sem ir até o medidor?”', 'R: O sistema exige foto obrigatória no ato da leitura, conta com leitura automática por Inteligência Artificial (OCR) e trava o fechamento contábil se faltar qualquer foto.'),
    wPara('P3. “Como esse sistema conversa com o nosso ERP / SAP?”', 'R: Importamos a planilha mensal do SAP para atualizar contratos/LUCs em segundos e, no fechamento, exportamos a planilha auditada + pacote ZIP com todas as fotos nomeadas por loja.'),
    wPara('P4. “O que acontece quando uma loja troca de contrato ou razão social?”', 'R: O sistema possui inteligência de vínculo histórico (LUC + Contrato + Nome Fantasia), mantendo a leitura anterior do medidor e todo o histórico de consumo daquela unidade.'),
    wPara('P5. “E se um lojista questionar que a conta dele veio alta neste mês?”', 'R: Emitimos na hora o Espelho Individual com foto do hidrômetro e o Relatório Histórico com gráficos de evolução mensal. A conversa passa a ser baseada em evidência visual.'),
    wPara('P6. “Como evitamos alterações acidentais depois que a cobrança foi fechada?”', 'R: Ao concluir o Checklist de 5 Pilares, a Administração ativa o botão “Congelar Mês”, bloqueando leituras, tarifas e fotos para auditoria.'),
    wPara('P7. “E quando o consumo dá zero (loja em obras) ou dispara por vazamento?”', 'R: O sistema detecta variações acima de 40%, consumo zero ou leitura regressiva na hora e exige uma justificativa padronizada de 1 toque antes de liberar o fechamento.'),
    wPara('P8. “Quanto tempo a equipe leva para aprender a usar?”', 'R: Menos de 15 minutos. Já entregamos junto um Manual de Bolso de 1 página para o Técnico de Campo e um POP de 1 página para a Administração.'),
    wPara('P9. “Precisaremos comprar outro sistema para Energia Elétrica e Gás?”', 'R: Não. Os módulos de Energia Elétrica e Gás já fazem parte da mesma plataforma com custo adicional zero.')
  ].join('\n');

  await createDocxFile(
    path.join(ROOT, 'Roteiro_e_FAQ_Reuniao_Diretoria.docx'),
    'Roteiro de Reunião e FAQ da Diretoria — ShopRateio',
    roteiroBody,
    []
  );

  // 2. Manual de Bolso do Técnico de Campo Word
  const manualImages = [
    { file: '08_tecnico_campo_mobile.png' },
    { file: '05_justificativa_rapida_1toque.png' }
  ];
  const manualBody = [
    wBanner(
      'GUIA RÁPIDO DE OPERAÇÃO EM CAMPO • EQUIPE TÉCNICA & MANUTENÇÃO',
      'Manual de Bolso: Coleta de Leituras no Celular (5 Passos)',
      'Instruções práticas para leitura mensal de Água, Energia e Gás com foto obrigatória, IA e modo offline.',
      '0F172A', '38BDF8'
    ),
    wHeading('Passo a Passo da Coleta Mensal no Celular'),
    wPara('PASSO 1 — Abrir o Modo Campo e Ativar a Rota Guiada:', 'Acesse o ShopRateio no celular, selecione a utilidade (ex.: Água) e o mês atual. Toque em “Pendentes” ou “Rota Guiada” para seguir a sequência física das lojas. Em galerias escuras, ative o Modo Escuro (ícone de Lua).'),
    wPara('PASSO 2 — Conferir o Medidor e Digitar a Leitura Atual:', 'Confirme o Nome da Loja e LUC no cartão. Veja a Leitura Anterior na tela e digite os números pretos (m³ inteiros) no campo “Leitura Atual”. O sistema mostra o Consumo calculado na mesma hora.'),
    wPara('PASSO 3 — Tirar a Foto Obrigatória (ou Usar Leitura por IA):', 'Toque no ícone de Câmera (Foto) para fotografar o visor do hidrômetro com nitidez. Se preferir, toque no botão IA (Brilho) para que o sistema leia os dígitos automaticamente.'),
    wPara('PASSO 4 — Justificar Alertas com 1 Toque (Se Solicitado):', 'Se o consumo variar mais de 40%, der Zero (0 m³) ou ficar menor que o mês passado, toque em uma Etiqueta Rápida (ex.: Loja Fechada/Obras, Vazamento Interno, Medidor Trocado) para justificar sem digitar textos longos.'),
    wPara('PASSO 5 — Completar 100% da Rota (Sincronização Automática):', 'Continue até o contador marcar 100% (ex.: 64/64 lojas lidas). Sem internet no subsolo? O Modo Offline guarda todas as leituras e fotos no aparelho e sincroniza sozinho assim que o sinal voltar.'),
    wImage('rIdImg1', 1, '08_tecnico_campo_mobile.png', 'Figura 1: Tela real do Técnico no Celular (Rota Guiada, Leitura Atual, Foto e IA)', 3.6, 2.7),
    wImage('rIdImg2', 2, '05_justificativa_rapida_1toque.png', 'Figura 2: Etiquetas Rápidas de 1 Toque para justificar variações sem digitação', 5.8, 1.9),
    wCallout(
      '3 Regras de Ouro para o Técnico de Campo:',
      '1) Foto Nítida: Limpe o visor do hidrômetro antes da foto (ela vai para o comprovante do lojista). 2) Consumo Estranho: Se o consumo calculado na hora parecer muito alto, confira se não digitou os dígitos vermelhos (litros). 3) Subsolo Offline: Não limpe os dados do navegador enquanto estiver sem sinal; aguarde voltar ao Wi-Fi/4G.',
      'EFF6FF', '0284C7', '0369A1'
    )
  ].join('\n');

  await createDocxFile(
    path.join(ROOT, 'Manual_Bolso_Tecnico_Campo_ShopRateio.docx'),
    'Manual de Bolso do Técnico de Campo — ShopRateio',
    manualBody,
    manualImages
  );

  // 3. POP de Fechamento Mensal da Administração Word
  const popImages = [
    { file: '02_rateio_calculadora_desktop.png' },
    { file: '03_checklist_fechamento_contabil.png' },
    { file: '06_espelho_individual_lojista.png' }
  ];
  const popBody = [
    wBanner(
      'PROCEDIMENTO OPERACIONAL PADRÃO (POP-ADM-01) • ADMINISTRAÇÃO & CONTABILIDADE',
      'POP: Fechamento Mensal e Auditoria de Rateio (6 Etapas)',
      'Fluxo padrão do escritório para conferência da fatura, conciliação contábil (R$ 0,00), exportação SAP e envio aos lojistas.',
      '0F172A', '34D399'
    ),
    wHeading('Fluxo Operacional de Fechamento Mensal (6 Etapas)'),
    wPara('ETAPA 1 — Importar / Conferir Base Mensal de Lojas (SAP):', 'No menu Gestão de Lojas, selecione o mês de competência e importe a planilha padrão SAP (ou revise as lojas ativas). O sistema atualiza contratos e LUCs e já puxa a Leitura Anterior do mês passado automaticamente.'),
    wPara('ETAPA 2 — Lançar Dados da Fatura da Concessionária:', 'Na aba Rateio e Leitura, preencha Valor da Conta (ex.: R$ 88.836,31), encargos como Enviro Tools (ex.: R$ 1.843,46) e Consumo Total Faturado (ex.: 6.081 m³). O sistema calcula o Subtotal (R$ 90.679,77) e a Tarifa Unitária Efetiva (R$ 14,9120/m³).'),
    wPara('ETAPA 3 — Conferir Coleta (100%) e Painel de Continuidade:', 'Verifique se o progresso atingiu 100% das lojas lidas (64/64) e confirme na faixa “Continuidade do Mês Anterior” que o indicador “Faltam Ler” está em 0 (nenhuma loja medida no mês anterior ficou para trás).'),
    wPara('ETAPA 4 — Auditar Alertas e Justificativas de Variação:', 'Filtre os cartões de alerta no topo e confirme que todas as lojas com variação acima de 40% ou consumo zero possuem foto nítida e justificativa técnica registrada.'),
    wPara('ETAPA 5 — Validar os 5 Pilares (Diferença R$ 0,00) e Congelar Mês:', 'Abra o Checklist de Fechamento Contábil, confirme que Fatura da Concessionária = Total Rateado (Diferença R$ 0,00) e que os 5 indicadores estão verdes. Clique em “Congelar Mês” e depois em “Exportar Relatório” (Excel SAP + ZIP de Fotos).'),
    wPara('ETAPA 6 — Enviar Espelhos Individuais e Atender Lojistas:', 'Clique no ícone de Espelho Individual na linha da loja para enviar o demonstrativo por WhatsApp ou PDF. Para análises históricas detalhadas, acesse Relatório por Loja e exporte o PDF com gráficos.'),
    wImage('rIdImg1', 1, '02_rateio_calculadora_desktop.png', 'Figura 1: Calculadora Automática de Tarifa (R$ 90.679,77 / 6.081 m³) e Painel de Continuidade', 6.0, 2.2),
    wImage('rIdImg2', 2, '03_checklist_fechamento_contabil.png', 'Figura 2: Checklist de Fechamento Contábil validando os 5 Pilares e Diferença R$ 0,00', 6.0, 2.2),
    wImage('rIdImg3', 3, '06_espelho_individual_lojista.png', 'Figura 3: Espelho Individual de Cobrança do Lojista pronto para envio via WhatsApp/PDF', 5.2, 2.1)
  ].join('\n');

  await createDocxFile(
    path.join(ROOT, 'POP_Fechamento_Mensal_Administracao_ShopRateio.docx'),
    'POP de Fechamento Mensal da Administração — ShopRateio',
    popBody,
    popImages
  );
}

// ============================================================================
// EXECUÇÃO PRINCIPAL (PDFs via Playwright + Word via JSZip)
// ============================================================================
async function main() {
  console.log('--- Gerando Kits Executivos (Item 1) e Operacionais (Item 3) em PDF e Word ---');

  await buildAllWordDocs();
  console.log('✓ Arquivos Word (.docx) gerados com sucesso!');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const docs = [
    {
      name: 'Roteiro_e_FAQ_Reuniao_Diretoria.pdf',
      html: buildRoteiroFaqHtml()
    },
    {
      name: 'Manual_Bolso_Tecnico_Campo_ShopRateio.pdf',
      html: buildManualTecnicoHtml()
    },
    {
      name: 'POP_Fechamento_Mensal_Administracao_ShopRateio.pdf',
      html: buildPopAdminHtml()
    }
  ];

  for (const doc of docs) {
    await page.setContent(doc.html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const outPath = path.join(ROOT, doc.name);
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });
    console.log('✓ PDF gerado com sucesso:', outPath);
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
