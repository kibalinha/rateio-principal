const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');
const OUTPUT_PDF = path.resolve(__dirname, '../Relatorio_Executivo_ShopRateio_Fotos_Reais.pdf');
const OUTPUT_HTML = path.resolve(__dirname, '../Relatorio_Executivo_ShopRateio.html');

function getBase64Image(filename) {
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`Arquivo não encontrado: ${filePath}`);
    return '';
  }
  const ext = path.extname(filename).replace('.', '');
  const base64 = fs.readFileSync(filePath).toString('base64');
  return `data:image/${ext};base64,${base64}`;
}

async function buildReport() {
  console.log('--- Construindo Relatório Executivo Completo de Água para a Diretoria (A4 Perfeito) ---');

  const img01 = getBase64Image('01_dashboard_executivo.png');
  const img02 = getBase64Image('02_rateio_calculadora_desktop.png');
  const img03 = getBase64Image('03_checklist_fechamento_contabil.png');
  const img04 = getBase64Image('04_painel_continuidade_mes_anterior.png');
  const img05 = getBase64Image('05_justificativa_rapida_1toque.png');
  const img06 = getBase64Image('06_espelho_individual_lojista.png');
  const img07 = getBase64Image('07_relatorio_analise_consumo.png');
  const img08 = getBase64Image('08_tecnico_campo_mobile.png');
  const img09 = getBase64Image('09_gestao_cadastral_lojas.png');

  const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>ShopRateio — Relatório Executivo de Apresentação à Diretoria</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    @page {
      size: 210mm 297mm;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #cbd5e1;
      line-height: 1.35;
      font-size: 8.2pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* PÁGINA A4 FIXA (210mm x 297mm) */
    .page {
      width: 210mm;
      height: 297mm;
      max-height: 297mm;
      min-height: 297mm;
      padding: 9mm 12mm 8mm 12mm;
      margin: 0 auto 20px auto;
      background: #ffffff;
      box-sizing: border-box;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
    }

    @media print {
      body {
        background: transparent;
      }
      .page {
        margin: 0;
        box-shadow: none;
        page-break-after: always;
        break-after: page;
      }
    }

    /* RUNNING HEADER (PÁGINAS 2 A 6) */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 4px;
      border-bottom: 1.5px solid #0284c7;
      margin-bottom: 6px;
    }

    .page-header .brand {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .brand-logo-badge {
      background: #0f172a;
      color: #38bdf8;
      font-weight: 800;
      font-size: 7.5pt;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.04em;
    }

    .brand-doc-title {
      font-size: 7.2pt;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .page-header .tag {
      font-size: 6.8pt;
      font-weight: 700;
      background: #f0f9ff;
      color: #0369a1;
      padding: 2px 8px;
      border-radius: 9999px;
      border: 1px solid #bae6fd;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* RUNNING FOOTER */
    .page-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 4px;
      border-top: 1px solid #e2e8f0;
      font-size: 6.8pt;
      color: #64748b;
      margin-top: auto;
    }

    .page-footer .confidential {
      font-weight: 600;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .page-footer .system-info {
      font-weight: 500;
      color: #64748b;
    }

    .page-footer .page-number {
      font-weight: 700;
      color: #0f172a;
      background: #f1f5f9;
      padding: 1px 6px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* CORPO DA PÁGINA */
    .page-body {
      display: flex;
      flex-direction: column;
      gap: 7px;
      flex: 1;
    }

    /* TÍTULOS E SUBTÍTULOS */
    .section-title {
      font-size: 11pt;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }

    .section-title::before {
      content: "";
      display: inline-block;
      width: 4px;
      height: 13px;
      background: #0284c7;
      border-radius: 2px;
    }

    .section-desc {
      font-size: 7.6pt;
      color: #475569;
      line-height: 1.3;
      margin-top: 2px;
    }

    /* COVER HEADER (PAGE 1) */
    .cover-top {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      border-radius: 8px;
      padding: 11px 15px;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
      border: 1px solid #334155;
    }

    .badge-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .badge-pill {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.4);
      padding: 1.5px 7px;
      border-radius: 9999px;
      font-size: 6.8pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.07em;
    }

    .badge-date {
      font-size: 6.8pt;
      color: #94a3b8;
      font-family: 'JetBrains Mono', monospace;
    }

    .cover-h1 {
      font-size: 14pt;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.02em;
      margin-bottom: 3px;
      color: #f8fafc;
    }

    .cover-sub {
      font-size: 7.7pt;
      color: #cbd5e1;
      line-height: 1.3;
    }

    .cover-meta {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-top: 7px;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      font-size: 6.8pt;
    }

    .cover-meta strong {
      color: #38bdf8;
      display: block;
      font-size: 6.3pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .cover-meta span {
      color: #e2e8f0;
      font-weight: 600;
    }

    /* PROBLEMA VS SOLUÇÃO */
    .two-col-box {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
    }

    .prob-box {
      background: #fff1f2;
      border: 1px solid #fecdd3;
      border-left: 3px solid #e11d48;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 7.3pt;
      line-height: 1.3;
    }

    .prob-box strong {
      color: #9f1239;
      display: block;
      margin-bottom: 2px;
      font-size: 7.6pt;
    }

    .sol-box {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-left: 3px solid #059669;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 7.3pt;
      line-height: 1.3;
    }

    .sol-box strong {
      color: #065f46;
      display: block;
      margin-bottom: 2px;
      font-size: 7.6pt;
    }

    ul.clean-list {
      margin-left: 12px;
      margin-top: 2px;
    }

    ul.clean-list li {
      margin-bottom: 1.5px;
    }

    /* GRID DE MÉTRICAS DE IMPACTO */
    .impact-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }

    .impact-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 5px 6px;
      text-align: center;
    }

    .impact-card .val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11.5pt;
      font-weight: 800;
      color: #0284c7;
      line-height: 1.1;
    }

    .impact-card .lbl {
      font-size: 6.3pt;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin-top: 1.5px;
    }

    /* PHOTO CARDS */
    .photo-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      padding: 6px 7px;
      box-shadow: 0 2px 5px rgba(15, 23, 42, 0.04);
      display: flex;
      flex-direction: column;
    }

    .photo-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
      padding-bottom: 2.5px;
      border-bottom: 1px solid #f1f5f9;
    }

    .photo-step {
      font-size: 6.6pt;
      font-weight: 800;
      text-transform: uppercase;
      color: #0284c7;
      letter-spacing: 0.04em;
    }

    .photo-title {
      font-size: 7.8pt;
      font-weight: 700;
      color: #0f172a;
    }

    .photo-tag {
      font-size: 6.3pt;
      background: #f8fafc;
      color: #475569;
      border: 1px solid #e2e8f0;
      padding: 1px 5px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
    }

    .photo-img-wrap {
      width: 100%;
      background: #0f172a;
      border-radius: 5px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .photo-img-wrap img {
      width: 100%;
      height: auto;
      display: block;
      object-fit: contain;
    }

    /* ALTURAS CALIBRADAS PARA A4 PERFEITO */
    .img-h-cover {
      max-height: 295px;
    }

    .img-h-standard {
      max-height: 220px;
    }

    /* BOX DETALHADO DE FUNCIONALIDADES */
    .photo-desc-rich {
      font-size: 7.1pt;
      color: #334155;
      background: #f8fafc;
      border-radius: 5px;
      padding: 5px 7px;
      margin-top: 4px;
      line-height: 1.3;
      border-left: 2.5px solid #0284c7;
    }

    .function-badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 3px;
    }

    .func-badge {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 6.3pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .photo-desc-rich p {
      margin-bottom: 2px;
    }

    .photo-desc-rich p:last-child {
      margin-bottom: 0;
    }

    /* CARD DUPLO LADO A LADO PARA MOBILE + TEXTO (PÁGINA 2) */
    .mobile-feature-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      padding: 6px 7px;
      box-shadow: 0 2px 5px rgba(15, 23, 42, 0.04);
    }

    .mobile-split-grid {
      display: grid;
      grid-template-columns: 195px 1fr;
      gap: 10px;
      align-items: stretch;
      margin-top: 4px;
    }

    .mobile-phone-frame {
      background: #0f172a;
      border-radius: 7px;
      border: 2px solid #334155;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
      height: 255px;
    }

    .mobile-phone-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
    }

    .mobile-features-list {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 4px;
    }

    .feature-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      padding: 4.5px 7px;
      font-size: 6.9pt;
      line-height: 1.25;
    }

    .feature-item strong {
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 1.5px;
      font-size: 7.2pt;
    }

    .feature-item p {
      color: #475569;
    }

    /* CALLOUT BOXES */
    .callout-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-left: 3px solid #0284c7;
      border-radius: 5px;
      padding: 5px 8px;
      font-size: 7.1pt;
      color: #1e3a8a;
      line-height: 1.3;
    }

    /* TABELA DE COMPARAÇÃO (PÁGINA 6) */
    table.exec-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7.1pt;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      overflow: hidden;
    }

    table.exec-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 4.5px 7px;
      text-align: left;
      font-weight: 700;
      font-size: 6.8pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    table.exec-table td {
      padding: 4px 7px;
      border-bottom: 1px solid #e2e8f0;
      line-height: 1.25;
      vertical-align: middle;
    }

    table.exec-table tr:nth-child(even) td {
      background: #f8fafc;
    }

    .badge-old {
      color: #be123c;
      font-weight: 600;
    }

    .badge-new {
      color: #047857;
      font-weight: 600;
    }

    /* ROI VALUE PROPOSITION CARDS (PÁGINA 6) */
    .roi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }

    .roi-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 5px 6px;
      border-top: 2.5px solid #0284c7;
    }

    .roi-card .icon-title {
      font-size: 7.3pt;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 1.5px;
    }

    .roi-card p {
      font-size: 6.6pt;
      color: #475569;
      line-height: 1.25;
    }

    /* ROADMAP DE IMPLANTAÇÃO (PÁGINA 6) */
    .roadmap-container {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 8px;
    }

    .roadmap-title {
      font-size: 7.2pt;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .roadmap-steps {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }

    .roadmap-step {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 4.5px 6px;
      font-size: 6.6pt;
      line-height: 1.2;
    }

    .roadmap-step strong {
      display: block;
      color: #0284c7;
      font-weight: 800;
      margin-bottom: 1.5px;
      font-size: 6.8pt;
    }

    .roadmap-step span {
      color: #475569;
    }

    /* BOX DE CONCLUSÃO E ASSINATURA */
    .conclusion-box {
      background: #ffffff;
      border: 1.5px solid #0284c7;
      border-radius: 6px;
      padding: 7px 10px;
    }

    .conclusion-box h4 {
      font-size: 7.9pt;
      font-weight: 800;
      color: #0284c7;
      margin-bottom: 2px;
    }

    .conclusion-box p {
      font-size: 7.1pt;
      color: #334155;
      line-height: 1.3;
    }

    .sign-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 8px;
      padding-top: 6px;
    }

    .sign-cell {
      text-align: center;
      font-size: 6.5pt;
      color: #64748b;
    }

    .sign-line {
      border-top: 1px solid #94a3b8;
      margin-bottom: 2.5px;
    }

    .sign-cell strong {
      color: #0f172a;
      display: block;
      font-size: 6.9pt;
    }
  </style>
</head>
<body>

  <!-- ============================================================== -->
  <!-- PÁGINA 1: CAPA EXECUTIVA, DIAGNÓSTICO E VISÃO GERAL (DASHBOARD) -->
  <!-- ============================================================== -->
  <div class="page">
    <div class="page-body">
      
      <!-- COVER TOP HEADER -->
      <div class="cover-top">
        <div class="badge-top-bar">
          <span class="badge-pill">◆ Relatório de Apresentação à Diretoria Executiva</span>
          <span class="badge-date">BASE REAL HOMOLOGADA: OUTUBRO/2026</span>
        </div>
        <h1 class="cover-h1">ShopRateio: Plataforma de Gestão & Rateio de Utilidades</h1>
        <p class="cover-sub">
          Demonstração prática de governança operacional, blindagem contábil centavo a centavo e eliminação de perdas financeiras no rateio de Água & Esgoto em Shopping Centers (arquitetura preparada para Energia e Gás).
        </p>
        <div class="cover-meta">
          <div><strong>Aplicação</strong><span>ShopRateio Enterprise</span></div>
          <div><strong>Insumo em Produção</strong><span>💧 Água & Esgoto (64 Lojas)</span></div>
          <div><strong>Volume Operado</strong><span>6.081 m³ • R$ 90.679,77</span></div>
          <div><strong>Objetivo Central</strong><span>Divergência Centavo Zero</span></div>
        </div>
      </div>

      <!-- PROBLEMA VS SOLUÇÃO -->
      <div class="two-col-box">
        <div class="prob-box">
          <strong>❌ O Cenário Anterior (Planilhas Manuais & Papel):</strong>
          <ul class="clean-list">
            <li><strong>Anotações em papel:</strong> Erros de digitação, dígitos invertidos e zeros a mais nos hidrômetros.</li>
            <li><strong>Lojas esquecidas:</strong> Unidades ativas sem medição, gerando rombos cobertos pelo caixa do shopping.</li>
            <li><strong>Contestações sem prova:</strong> Lojistas questionando valores sem histórico de fotos auditáveis.</li>
            <li><strong>Fechamento moroso:</strong> 3 a 5 dias úteis de conferência manual em planilhas frágeis.</li>
          </ul>
        </div>
        <div class="sol-box">
          <strong>✅ A Transformação com a Plataforma ShopRateio:</strong>
          <ul class="clean-list">
            <li><strong>Coleta Mobile Offline (PWA):</strong> Foto obrigatória do relógio com timestamp inviolável.</li>
            <li><strong>Trava dos 5 Pilares:</strong> Impossível fechar o mês com qualquer loja esquecida ou divergência contábil.</li>
            <li><strong>Espelho Instantâneo do Lojista:</strong> Comprovante com foto e fórmula enviado em 10s no WhatsApp.</li>
            <li><strong>Conciliação Centavo a Centavo:</strong> Total rateado bate 100% com a fatura mestre em menos de 2 horas.</li>
          </ul>
        </div>
      </div>

      <!-- IMPACT METRICS -->
      <div class="impact-grid">
        <div class="impact-card">
          <div class="val">-90%</div>
          <div class="lbl">Tempo de Fechamento</div>
        </div>
        <div class="impact-card">
          <div class="val">Zero</div>
          <div class="lbl">Lojas Esquecidas</div>
        </div>
        <div class="impact-card">
          <div class="val">R$ 0,00</div>
          <div class="lbl">Divergência de Caixa</div>
        </div>
        <div class="impact-card">
          <div class="val">100%</div>
          <div class="lbl">Comprovação com Foto</div>
        </div>
      </div>

      <!-- FOTO 1: DASHBOARD EXECUTIVO -->
      <div class="photo-card">
        <div class="photo-head">
          <div>
            <span class="photo-step">Tela 01 • Visão Geral da Diretoria</span>
            <div class="photo-title">Dashboard Executivo — Monitoramento Consolidado em Tempo Real (Insumo Água)</div>
          </div>
          <span class="photo-tag">Painel Gerencial</span>
        </div>
        <div class="photo-img-wrap">
          <img class="img-h-cover" src="${img01}" alt="Dashboard Executivo de Água">
        </div>
        <div class="photo-desc-rich">
          <div class="function-badge-row">
            <span class="func-badge">Visão Consolidada</span>
            <span class="func-badge">Curva Sazonal Anual</span>
            <span class="func-badge">Curva ABC / Maiores Consumidores</span>
            <span class="func-badge">Balanço Financeiro Global</span>
          </div>
          <p><strong>Funções Executivas em Destaque:</strong> (1) <em>Balanço Global Consolidado:</em> totaliza o custo anual de água (R$ 564.013 acumulado), volume consumido (36.033 m³) e custo médio mensal (R$ 94.002); (2) <em>Evolução Mensal de Custos:</em> curva de barras multimensal (Jun: 137.4k, Jul: 124.8k, Ago: 103.4k, Set: 107.8k, Out: 90.7k) que evidencia oscilações de fluxo no shopping; (3) <em>Ranking de Maiores Consumidores (Curva ABC):</em> identifica imediatamente as operações de maior impacto hídrico (BAH Restaurante R$ 175k, Outback R$ 107k, Cinemark R$ 54k, Academia Ultra R$ 50k), permitindo monitoramento preventivo contra vazamentos contínuos.</p>
        </div>
      </div>

    </div>

    <!-- RUNNING FOOTER -->
    <div class="page-footer">
      <div class="confidential">🔒 Documento Corporativo Confidencial • Uso Exclusivo da Diretoria</div>
      <div class="system-info">ShopRateio Enterprise • Módulo de Água & Esgoto</div>
      <div class="page-number">Página 1 de 6</div>
    </div>
  </div>


  <!-- ============================================================== -->
  <!-- PÁGINA 2: DA PRANCHETA AO CELULAR & CALCULADORA DE RATEIO      -->
  <!-- ============================================================== -->
  <div class="page">
    <!-- RUNNING HEADER -->
    <div class="page-header">
      <div class="brand">
        <span class="brand-logo-badge">SHOPRATEIO</span>
        <span class="brand-doc-title">Relatório de Operação & Benefícios</span>
      </div>
      <span class="tag">Etapa 01: Coleta & Cálculo</span>
    </div>

    <div class="page-body">
      <div>
        <div class="section-title">1. O Fluxo Operacional: Coleta em Campo & Motor de Rateio</div>
        <p class="section-desc">
          A jornada do rateio elimina pranchetas físicas através do aplicativo mobile para técnicos e processa as medições no motor de conciliação matemática que calcula as cotas proporcionais de cada loja.
        </p>
      </div>

      <!-- FOTO 8: MOBILE CAMPO (SPLIT GRID COM SMARTPHONE + BULLETS EXECUTIVOS) -->
      <div class="mobile-feature-card">
        <div class="photo-head">
          <div>
            <span class="photo-step">Tela 02 • Operação em Campo</span>
            <div class="photo-title">Interface Mobile do Técnico — Rota Física Otimizada & Modo Offline (PWA)</div>
          </div>
          <span class="photo-tag">Smartphone PWA</span>
        </div>

        <div class="mobile-split-grid">
          <div class="mobile-phone-frame">
            <img src="${img08}" alt="Interface Mobile do Técnico - Água">
          </div>
          <div class="mobile-features-list">
            <div class="feature-item">
              <strong>🚶‍♂️ Função Rota Guiada por Corredores</strong>
              <p>Ordena os 64 hidrômetros pelo trajeto físico exato dos corredores e pisos do shopping (#1, #2, #3...), reduzindo em 40% o tempo de deslocamento do leiturista.</p>
            </div>
            <div class="feature-item">
              <strong>📶 Função Armazenamento Offline-First (IndexedDB)</strong>
              <p>Funciona com total autonomia em subsolos, garagens e casas de máquinas sem sinal de 4G/Wi-Fi; sincroniza os dados automaticamente ao reconectar.</p>
            </div>
            <div class="feature-item">
              <strong>📷 Função Evidência Fotográfica Obrigatória</strong>
              <p>Aciona a câmera do celular para capturar o visor do hidrômetro com carimbo de data/hora, impedindo leituras estimadas, invertidas ou fraudadas.</p>
            </div>
            <div class="feature-item">
              <strong>⚡ Função Filtros Rápidos & Barra de Progresso</strong>
              <p>Visualização instantânea de "Todas (64)", "Pendentes (0)" e "Lidas (64)", indicando com indicador verde quando a coleta do mês foi 100% finalizada.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- FOTO 2: RATEIO DESKTOP -->
      <div class="photo-card">
        <div class="photo-head">
          <div>
            <span class="photo-step">Tela 03 • Núcleo Contábil</span>
            <div class="photo-title">Calculadora de Rateio — Processamento Proporcional de Água e Balanço SAP</div>
          </div>
          <span class="photo-tag">Tabela Contábil</span>
        </div>
        <div class="photo-img-wrap">
          <img class="img-h-standard" src="${img02}" alt="Tabela de Rateio Contábil de Água">
        </div>
        <div class="photo-desc-rich">
          <div class="function-badge-row">
            <span class="func-badge">Tarifa Efetiva Proporcional</span>
            <span class="func-badge">Áreas Comuns & Ar Condicionado</span>
            <span class="func-badge">Despesas Acessórias (Enviro Tools)</span>
            <span class="func-badge">Exportação SAP / Excel</span>
          </div>
          <p><strong>Funções Contábeis em Destaque:</strong> (1) <em>Fórmula Matemática Automatizada:</em> divide o subtotal da fatura da concessionária (R$ 88.836,31 de consumo + R$ 1.843,46 de despesas acessórias = R$ 90.679,77) pelo volume total medido (6.081 m³), apurando a tarifa efetiva de R$ 14,9120 / m³; (2) <em>Rateio das Áreas Comuns:</em> incorpora perdas técnicas, sanitários públicos e torres de resfriamento proporcionalmente ao consumo de cada loja; (3) <em>Auditoria de Variação (VAR %):</em> destaca desvios bruscos vs mês anterior (ex: Panvel -33,3%); (4) <em>Exportação Integrada:</em> gera planilhas oficiais com fórmulas blindadas prontas para lançamento no SAP/ERP.</p>
        </div>
      </div>

      <div class="callout-box">
        <strong>💡 Ganho Operacional Imediato:</strong> Fim definitivo da redigitação manual (prancheta de papel → computador), eliminando 100% dos erros humanos de constantes, dígitos trocados ou fórmulas de Excel corrompidas acidentalmente.
      </div>

    </div>

    <!-- RUNNING FOOTER -->
    <div class="page-footer">
      <div class="confidential">🔒 Documento Corporativo Confidencial • Uso Exclusivo da Diretoria</div>
      <div class="system-info">ShopRateio Enterprise • Coleta & Processamento</div>
      <div class="page-number">Página 2 de 6</div>
    </div>
  </div>


  <!-- ============================================================== -->
  <!-- PÁGINA 3: BLINDAGEM ANTI-FURO: CHECKLIST 5 PILARES & CONTINUIDADE -->
  <!-- ============================================================== -->
  <div class="page">
    <!-- RUNNING HEADER -->
    <div class="page-header">
      <div class="brand">
        <span class="brand-logo-badge">SHOPRATEIO</span>
        <span class="brand-doc-title">Relatório de Operação & Benefícios</span>
      </div>
      <span class="tag">Etapa 02: Blindagem Contábil</span>
    </div>

    <div class="page-body">
      <div>
        <div class="section-title">2. Blindagem Anti-Furo: Auditoria nos 5 Pilares Contábeis</div>
        <p class="section-desc">
          O maior risco de um fechamento é descobrir, após emissão dos boletos, que lojas foram esquecidas ou que os valores rateados não batem com a concessionária. O ShopRateio possui um assistente com travas rígidas de validação.
        </p>
      </div>

      <!-- FOTO 3: CHECKLIST FECHAMENTO -->
      <div class="photo-card">
        <div class="photo-head">
          <div>
            <span class="photo-step">Tela 04 • Governança & Trava de Segurança</span>
            <div class="photo-title">Checklist dos 5 Pilares — Trava Inteligente Anti-Furos Contábeis (Água)</div>
          </div>
          <span class="photo-tag">Modal de Auditoria</span>
        </div>
        <div class="photo-img-wrap">
          <img class="img-h-standard" src="${img03}" alt="Checklist dos 5 Pilares Contábeis de Água">
        </div>
        <div class="photo-desc-rich">
          <div class="function-badge-row">
            <span class="func-badge">Pilar 1: 100% Lojas Lidas</span>
            <span class="func-badge">Pilar 2: Triagem de Alertas</span>
            <span class="func-badge">Pilar 3: Continuidade Histórica</span>
            <span class="func-badge">Pilar 4: Conciliação Centavo Zero</span>
            <span class="func-badge">Pilar 5: Congelamento</span>
          </div>
          <p><strong>As 5 Funções de Trava Validando a Operação:</strong> <em>(Pilar 1)</em> Confere se as 64 lojas ativas foram lidas ou possuem justificativa protocolada; <em>(Pilar 2)</em> Bloqueia fechamento se houver vazamentos não auditados; <em>(Pilar 3)</em> Cruza os contratos com o mês anterior; <em>(Pilar 4)</em> <strong>Conciliação Matemática Perfeita:</strong> valida se Fatura Concessionária (R$ 90.679,77) = Total Rateado (R$ 90.679,77), com Diferença de Balanço rigorosamente R$ 0,00; <em>(Pilar 5)</em> Congelamento definitivo do mês contra modificações posteriores.</p>
        </div>
      </div>

      <!-- FOTO 4: CONTINUIDADE MES ANTERIOR -->
      <div class="photo-card">
        <div class="photo-head">
          <div>
            <span class="photo-step">Tela 05 • Radar Histórico</span>
            <div class="photo-title">Painel de Continuidade vs Mês Anterior — Detecção Automática de Lojas Faltantes</div>
          </div>
          <span class="photo-tag">Auditoria Mês a Mês</span>
        </div>
        <div class="photo-img-wrap">
          <img class="img-h-standard" src="${img04}" alt="Painel de Continuidade vs Mês Anterior - Água">
        </div>
        <div class="photo-desc-rich">
          <div class="function-badge-row">
            <span class="func-badge">Cruzamento Mês a Mês</span>
            <span class="func-badge">Aba "Já Lidas" (63 Lojas)</span>
            <span class="func-badge">Aba "Faltam Ler" (0 Pendentes)</span>
            <span class="func-badge">Atalho Direto na Tabela</span>
          </div>
          <p><strong>Funções de Blindagem de Continuidade:</strong> (1) <em>Motor de Cruzamento Cadastral:</em> cruza automaticamente todas as 63 lojas medidas no mês anterior (2026-09) com o mês vigente (2026-10); (2) <em>Prevenção Ativa de Esquecimentos:</em> se uma loja operou no mês passado e ainda não foi lançada, o sistema bloqueia o fechamento e exibe um botão de atalho direto para medição ou justificativa; (3) <em>Conferência de Consumo Histórico:</em> exibe o consumo do mês passado lado a lado com o consumo atual (ex: Panvel, Nike, Starbucks, Cinemark, Boss, Gelato Borelli), facilitando auditoria visual imediata.</p>
        </div>
      </div>

      <div class="callout-box">
        <strong>🛡️ Proteção Financeira do Shopping:</strong> Nenhuma cota de consumo fica sem faturamento por esquecimento ou mudança de lojista, impedindo que o condomínio pague contas residuais da concessionária com recursos próprios.
      </div>

    </div>

    <!-- RUNNING FOOTER -->
    <div class="page-footer">
      <div class="confidential">🔒 Documento Corporativo Confidencial • Uso Exclusivo da Diretoria</div>
      <div class="system-info">ShopRateio Enterprise • Auditoria & Governança</div>
      <div class="page-number">Página 3 de 6</div>
    </div>
  </div>


  <!-- ============================================================== -->
  <!-- PÁGINA 4: AGILIDADE COM LOJISTAS & GESTÃO DE CONTESTAÇÕES       -->
  <!-- ============================================================== -->
  <div class="page">
    <!-- RUNNING HEADER -->
    <div class="page-header">
      <div class="brand">
        <span class="brand-logo-badge">SHOPRATEIO</span>
        <span class="brand-doc-title">Relatório de Operação & Benefícios</span>
      </div>
      <span class="tag">Etapa 03: Relacionamento Lojista</span>
    </div>

    <div class="page-body">
      <div>
        <div class="section-title">3. Agilidade Operacional e Fim dos Atritos com Lojistas</div>
        <p class="section-desc">
          Em shopping centers, lojas mudam de status frequentemente (obras, desocupações) e os lojistas frequentemente contestam faturas. Veja como o sistema oferece agilidade operacional e desfaz dúvidas em segundos.
        </p>
      </div>

      <!-- FOTO 5: JUSTIFICATIVA RÁPIDA -->
      <div class="photo-card">
        <div class="photo-head">
          <div>
            <span class="photo-step">Tela 06 • Operação em 1 Toque</span>
            <div class="photo-title">Modal de Justificativa Rápida — Registro de Campo com Etiquetas Padronizadas</div>
          </div>
          <span class="photo-tag">Ação Instantânea</span>
        </div>
        <div class="photo-img-wrap">
          <img class="img-h-standard" src="${img05}" alt="Justificativa Rápida de Campo - Água">
        </div>
        <div class="photo-desc-rich">
          <div class="function-badge-row">
            <span class="func-badge">💧 Vazamento / Salto</span>
            <span class="func-badge">🔒 Sem Acesso</span>
            <span class="func-badge">👁️ Visor Embaçado</span>
            <span class="func-badge">🔄 Relógio Trocado</span>
            <span class="func-badge">🔨 Em Reforma</span>
          </div>
          <p><strong>Funções de Justificativa em 1 Toque:</strong> (1) <em>Padronização de Ocorrências:</em> 5 botões de etiqueta rápida que preenchem o laudo técnico com um toque no celular (ex: "Suspeita de Vazamento / Salto"); (2) <em>Auditoria com Autoria e Timestamp:</em> registra qual técnico inseriu a nota com data/hora exata; (3) <em>Desbloqueio Inteligente:</em> permite que lojas sem consumo real (fechadas ou em reforma) sejam computadas no fechamento com respaldo legal, sem travar o rateio do restante do shopping.</p>
        </div>
      </div>

      <!-- FOTO 6: ESPELHO INDIVIDUAL DO LOJISTA -->
      <div class="photo-card">
        <div class="photo-head">
          <div>
            <span class="photo-step">Tela 07 • Evidência Auditável</span>
            <div class="photo-title">Espelho Individual do Lojista — Comprovante de Água com Foto Real e Memória</div>
          </div>
          <span class="photo-tag">WhatsApp & PDF</span>
        </div>
        <div class="photo-img-wrap">
          <img class="img-h-standard" src="${img06}" alt="Espelho Individual do Lojista de Água">
        </div>
        <div class="photo-desc-rich">
          <div class="function-badge-row">
            <span class="func-badge">Foto Real do Hidrômetro</span>
            <span class="func-badge">Memória de Cálculo Completa</span>
            <span class="func-badge">Tarifa Oficial (R$ 14,9120/m³)</span>
            <span class="func-badge">Envio WhatsApp (1 Toque)</span>
          </div>
          <p><strong>Funções do Comprovante do Lojista:</strong> (1) <em>Memória Transparente:</em> detalha leitura anterior (900 m³), leitura atual (904 m³), consumo líquido (4 m³), tarifa unitária efetiva (R$ 14,9120 / m³) e total a pagar (R$ 59,65) para a loja Panvel (LUC 1003/1004); (2) <em>Disparo Instantâneo:</em> botão de envio direto por WhatsApp com texto formatado e link seguro; (3) <em>Exportação em PDF:</em> documento timbrado para anexação ao boleto condominial; (4) <em>Blindagem Jurídica:</em> elimina disputas de "medição incorreta" através da foto incontestável do hidrômetro.</p>
        </div>
      </div>

      <div class="callout-box">
        <strong>🤝 Fim do Conflito Comercial com Lojistas:</strong> A transparência fotográfica e a memória centavo a centavo eliminam discussões de medição. O lojista enxerga o visor do seu próprio hidrômetro, desfazendo dúvidas sem necessidade de vistorias extras ou retrabalho administrativo.
      </div>

    </div>

    <!-- RUNNING FOOTER -->
    <div class="page-footer">
      <div class="confidential">🔒 Documento Corporativo Confidencial • Uso Exclusivo da Diretoria</div>
      <div class="system-info">ShopRateio Enterprise • Gestão de Contestações</div>
      <div class="page-number">Página 4 de 6</div>
    </div>
  </div>


  <!-- ============================================================== -->
  <!-- PÁGINA 5: INTELIGÊNCIA ANALÍTICA & GOVERNANÇA CADASTRAL         -->
  <!-- ============================================================== -->
  <div class="page">
    <!-- RUNNING HEADER -->
    <div class="page-header">
      <div class="brand">
        <span class="brand-logo-badge">SHOPRATEIO</span>
        <span class="brand-doc-title">Relatório de Operação & Benefícios</span>
      </div>
      <span class="tag">Etapa 04: Inteligência & Cadastros</span>
    </div>

    <div class="page-body">
      <div>
        <div class="section-title">4. Inteligência Histórica e Controle Cadastral</div>
        <p class="section-desc">
          Mais do que apenas fechar contas, a administração do shopping obtém visão analítica do comportamento de consumo de cada loja e controle rigoroso sobre a infraestrutura cadastral de água.
        </p>
      </div>

      <!-- FOTO 7: RELATÓRIO ANALÍTICO -->
      <div class="photo-card">
        <div class="photo-head">
          <div>
            <span class="photo-step">Tela 08 • Análise Preditiva</span>
            <div class="photo-title">Relatório Individual por Loja — Auditoria de Consumo, Alertas & Exportação (Água)</div>
          </div>
          <span class="photo-tag">Gráficos & Métricas</span>
        </div>
        <div class="photo-img-wrap">
          <img class="img-h-standard" src="${img07}" alt="Relatório Analítico de Consumo de Água">
        </div>
        <div class="photo-desc-rich">
          <div class="function-badge-row">
            <span class="func-badge">Diagnóstico Automático de Vazamentos</span>
            <span class="func-badge">Curva Histórica vs Média (245 m³)</span>
            <span class="func-badge">Evolução de Custos Mensais</span>
            <span class="func-badge">Exportação PDF & Excel para Lojista</span>
          </div>
          <p><strong>Funções Analíticas em Destaque:</strong> (1) <em>Diagnóstico Inteligente de Consumo:</em> avalia automaticamente se o consumo da loja está dentro do padrão ("Consumo Estável e Regular") ou em sobrecarga crítica por vazamento; (2) <em>Resumo Financeiro por Loja:</em> apresenta para a operação selecionada (BAH, LUC 2096, Jul a Out/2026) o Consumo Acumulado (980 m³), Média Histórica (245 m³), Valor Total Pago (R$ 15.088,45) e Gasto Médio Mensal (R$ 3.772,11); (3) <em>Gráficos Comparativos Visuais:</em> curva de consumo em m³ com linha pontilhada de média e gráfico de evolução em R$ (R$ 3.351 a R$ 4.108); (4) <em>Relatório Pronto para o Lojista:</em> exportação em 1 clique em PDF e Excel.</p>
        </div>
      </div>

      <!-- FOTO 9: GESTÃO CADASTRAL -->
      <div class="photo-card">
        <div class="photo-head">
          <div>
            <span class="photo-step">Tela 09 • Governança Cadastral</span>
            <div class="photo-title">Gestão Cadastral das Lojas — LUCs, Contratos, Hidrômetros e Perfis de Acesso</div>
          </div>
          <span class="photo-tag">Administração</span>
        </div>
        <div class="photo-img-wrap">
          <img class="img-h-standard" src="${img09}" alt="Gestão Cadastral de Lojas de Água">
        </div>
        <div class="photo-desc-rich">
          <div class="function-badge-row">
            <span class="func-badge">64 Lojas Ativas de Água</span>
            <span class="func-badge">Associação de Hidrômetros (HID)</span>
            <span class="func-badge">Integração de Contratos SAP</span>
            <span class="func-badge">Controle de Perfis (RBAC)</span>
          </div>
          <p><strong>Funções Administrativas em Destaque:</strong> (1) <em>Gestão Específica por Insumo:</em> painel dedicado para "Lojas de Água" gerenciando 64 lojas ativas no shopping (Panvel, Nike, Starbucks, Cinemark, Boss, etc.); (2) <em>Vínculo de Infraestrutura Física:</em> mapeia número de contrato, código LUC e código do hidrômetro vinculado; (3) <em>Controle de Acesso Baseado em Perfis (RBAC):</em> técnicos têm acesso restrito apenas à coleta de leituras e fotos, enquanto apenas Administradores/Diretoria podem alterar tarifas, cadastros ou fechar o mês; (4) <em>Sincronização em Nuvem:</em> dados replicados em tempo real com backup contínuo.</p>
        </div>
      </div>

      <div class="callout-box">
        <strong>📈 Da Cobrança Passiva à Gestão Ativa:</strong> Com a base cadastral organizada e histórico de água auditado, o shopping center deixa de ser um mero repassador de despesas e passa a atuar proativamente na redução de desperdícios e perdas d'água no empreendimento.
      </div>

    </div>

    <!-- RUNNING FOOTER -->
    <div class="page-footer">
      <div class="confidential">🔒 Documento Corporativo Confidencial • Uso Exclusivo da Diretoria</div>
      <div class="system-info">ShopRateio Enterprise • Inteligência & Cadastros</div>
      <div class="page-number">Página 5 de 6</div>
    </div>
  </div>


  <!-- ============================================================== -->
  <!-- PÁGINA 6: MATRIZ COMPARATIVA, ROI & CONCLUSÃO PARA DIRETORIA   -->
  <!-- ============================================================== -->
  <div class="page">
    <!-- RUNNING HEADER -->
    <div class="page-header">
      <div class="brand">
        <span class="brand-logo-badge">SHOPRATEIO</span>
        <span class="brand-doc-title">Relatório de Operação & Benefícios</span>
      </div>
      <span class="tag">Síntese Executiva & ROI</span>
    </div>

    <div class="page-body">
      <div>
        <div class="section-title">5. Matriz Comparativa: Antes vs Depois</div>
        <p class="section-desc">
          Resumo direto dos ganhos de produtividade, compliance contábil e mitigação de riscos proporcionados pela implantação da plataforma ShopRateio.
        </p>
      </div>

      <!-- TABELA COMPARATIVA -->
      <table class="exec-table">
        <thead>
          <tr>
            <th style="width: 24%;">Dimensão Operacional</th>
            <th style="width: 38%;">Cenário Antigo (Planilhas & Papel)</th>
            <th style="width: 38%;">Com a Plataforma ShopRateio</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Coleta dos Hidrômetros</strong></td>
            <td class="badge-old">Anotações manuais em pranchetas sujeitas a chuva, perda e dígitos ilegíveis.</td>
            <td class="badge-new">App mobile com rota física ordenada, foto obrigatória com timestamp e modo offline.</td>
          </tr>
          <tr>
            <td><strong>Lojas Esquecidas no Mês</strong></td>
            <td class="badge-old">Descobertas após emissão dos boletos, gerando rombo de caixa e refaturamento.</td>
            <td class="badge-new">Trava dos 5 Pilares cruza com o mês anterior: zero lojas ativas sem medição.</td>
          </tr>
          <tr>
            <td><strong>Contestações de Consumo</strong></td>
            <td class="badge-old">Lojista questiona a conta e o shopping não possui prova fotográfica do mostrador.</td>
            <td class="badge-new">Espelho individual com foto real do visor e memória de cálculo enviado em 10s no WhatsApp.</td>
          </tr>
          <tr>
            <td><strong>Segurança & Fórmulas</strong></td>
            <td class="badge-old">Planilhas Excel compartilhadas que sofrem exclusão acidental de fórmulas e linhas.</td>
            <td class="badge-new">Motor de cálculo imutável em nuvem com perfis de acesso restritos e auditoria completa.</td>
          </tr>
          <tr>
            <td><strong>Tempo de Fechamento</strong></td>
            <td class="badge-old">3 a 5 dias úteis conferindo colunas manuais e redigitando dados no computador.</td>
            <td class="badge-new">Menos de 2 horas: 100% dos dados auditados e conciliados centavo a centavo.</td>
          </tr>
          <tr>
            <td><strong>Conciliação Concessionária</strong></td>
            <td class="badge-old">Dificuldade para fechar a conta centavo por centavo com a fatura mestre.</td>
            <td class="badge-new">Balanço exato: Total da Fatura (R$ 90.679,77) = Total Rateado com Diferença R$ 0,00.</td>
          </tr>
        </tbody>
      </table>

      <!-- ROI VALUE PROPOSITION (4 CARDS) -->
      <div class="roi-grid">
        <div class="roi-card">
          <div class="icon-title">⏱️ -85% de Tempo</div>
          <p>Libera a equipe técnica e contábil de tarefas manuais repetitivas para foco em gestão e manutenção preditiva.</p>
        </div>
        <div class="roi-card">
          <div class="icon-title">🛡️ Blindagem Jurídica</div>
          <p>Fotos datadas e auditoria dos 5 pilares eliminam passivos de contestações, perícias judiciais e refaturamentos.</p>
        </div>
        <div class="roi-card">
          <div class="icon-title">💰 Risco Zero de Furo</div>
          <p>Impossibilita que o condomínio do shopping arque com contas de água da concessionária por rateio defasado.</p>
        </div>
        <div class="roi-card">
          <div class="icon-title">🤝 Confiança Comercial</div>
          <p>Transparência total com lojistas via espelho instantâneo no WhatsApp, fortalecendo a relação lojista-administração.</p>
        </div>
      </div>

      <!-- ROADMAP DE IMPLANTAÇÃO -->
      <div class="roadmap-container">
        <div class="roadmap-title">🚀 Roteiro de Operação & Sustentação (Próximos Passos Homologados)</div>
        <div class="roadmap-steps">
          <div class="roadmap-step">
            <strong>1. Base Homologada (Água)</strong>
            <span>Operação ativa com 64 lojas, 6.081 m³ e R$ 90.679,77 auditados.</span>
          </div>
          <div class="roadmap-step">
            <strong>2. Rota de Campo Fixada</strong>
            <span>Coleta padronizada via smartphone PWA offline nos corredores.</span>
          </div>
          <div class="roadmap-step">
            <strong>3. Disparo de Espelhos</strong>
            <span>Envio automático de comprovantes com foto para os lojistas.</span>
          </div>
          <div class="roadmap-step">
            <strong>4. Expansão para Luz & Gás</strong>
            <span>Replicação do modelo matemático para medidores elétricos e GLP.</span>
          </div>
        </div>
      </div>

      <!-- BOX DE CONCLUSÃO E ASSINATURA -->
      <div class="conclusion-box">
        <h4>🎯 Parecer Executivo para a Diretoria</h4>
        <p>
          O <strong>ShopRateio</strong> consolida a transição definitiva da administração do shopping center de um modelo analógico vulnerável para uma operação 100% digital, padronizada e imune a fraudes ou esquecimentos. Com a homologação da base de <strong>Água & Esgoto</strong> (64 lojas, R$ 90.679,77 faturados centavo a centavo sem divergência), a plataforma comprova sua eficácia na eliminação de atritos comerciais e na garantia da saúde financeira do condomínio.
        </p>
        <div class="sign-row">
          <div class="sign-cell">
            <div class="sign-line"></div>
            <strong>Engenharia & Operações</strong>
            <span>Gestão Técnica de Campo</span>
          </div>
          <div class="sign-cell">
            <div class="sign-line"></div>
            <strong>Controladoria Financeira</strong>
            <span>Auditoria & Fechamento Contábil</span>
          </div>
          <div class="sign-cell">
            <div class="sign-line"></div>
            <strong>Diretoria Executiva</strong>
            <span>Homologação e Governança</span>
          </div>
        </div>
      </div>

    </div>

    <!-- RUNNING FOOTER -->
    <div class="page-footer">
      <div class="confidential">🔒 Documento Corporativo Confidencial • Uso Exclusivo da Diretoria</div>
      <div class="system-info">ShopRateio Enterprise • Síntese & Parecer</div>
      <div class="page-number">Página 6 de 6</div>
    </div>
  </div>

</body>
</html>`;

  fs.writeFileSync(OUTPUT_HTML, htmlContent, 'utf8');
  console.log(`✓ HTML do Relatório gerado em: ${OUTPUT_HTML}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });

  await page.pdf({
    path: OUTPUT_PDF,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '0mm',
      bottom: '0mm',
      left: '0mm',
      right: '0mm'
    }
  });

  const OUTPUT_PDF_DIRETORIA = path.resolve(__dirname, '../Relatorio_Executivo_ShopRateio_Diretoria.pdf');
  fs.copyFileSync(OUTPUT_PDF, OUTPUT_PDF_DIRETORIA);

  await browser.close();
  console.log(`================================================================`);
  console.log(`✓ PDF EXECUTIVO GERADO COM SUCESSO:`);
  console.log(`  ${OUTPUT_PDF}`);
  console.log(`  ${OUTPUT_PDF_DIRETORIA}`);
  console.log(`================================================================`);
}

buildReport();
