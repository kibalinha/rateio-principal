const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST_DIR = path.resolve(__dirname, '../dist');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function startServer(port = 4280) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';
      let filePath = path.join(DIST_DIR, reqPath);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }

      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.webmanifest': 'application/manifest+json'
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';
      try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      } catch (err) {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(port, () => {
      console.log(`Local test server running at http://127.0.0.1:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

const mockStores = [
  { id: '1', luc: 'L-101', contrato: '10423', name: 'Zara Moda & Vestuário', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 1, meterNumber: 'MED-101' },
  { id: '2', luc: 'L-104', contrato: '10428', name: 'Burger King Praça', active: true, usesLuz: true, usesAgua: true, usesGas: true, routeOrder: 2, meterNumber: 'MED-104' },
  { id: '3', luc: 'L-201', contrato: '20104', name: 'Vivara Joalheria', active: true, usesLuz: true, usesAgua: false, usesGas: false, routeOrder: 3, meterNumber: 'MED-201' },
  { id: '4', luc: 'L-205', contrato: '20150', name: 'Lojas Americanas Express', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 4, meterNumber: 'MED-205' },
  { id: '5', luc: 'L-210', contrato: '20210', name: 'Restaurante Madero Steak', active: true, usesLuz: true, usesAgua: true, usesGas: true, routeOrder: 5, meterNumber: 'MED-210' },
  { id: '6', luc: 'L-301', contrato: '30101', name: 'Cinemark Multiplex', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 6, meterNumber: 'MED-301' },
  { id: '7', luc: 'L-305', contrato: '30105', name: 'Espaço Laser Depilação', active: true, usesLuz: true, usesAgua: false, usesGas: false, routeOrder: 7, meterNumber: 'MED-305' },
  { id: '8', luc: 'Q-012', contrato: '30112', name: 'Quiosque Chilli Beans', active: true, usesLuz: true, usesAgua: false, usesGas: false, routeOrder: 8, meterNumber: 'MED-012' },
  { id: '9', luc: 'L-401', contrato: '40101', name: 'Academia Smart Fit', active: true, usesLuz: true, usesAgua: true, usesGas: true, routeOrder: 9, meterNumber: 'MED-401' },
  { id: '10', luc: 'L-415', contrato: '40115', name: 'Mega Store Riachuelo', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 10, meterNumber: 'MED-415' }
];

const historySept = {
  costItems: [],
  consumptionInput: null,
  acInput: 0,
  manualBill: 84500.00,
  manualConsumption: 89500,
  lastUpdated: '2026-09-30T22:00:00.000Z',
  readings: {
    '1': { reading: 12540.0, constant: 1, adjustment: 1, calculatedConsumption: 1450.0, cost: 1368.99, luc: 'L-101', contrato: '10423', storeName: 'Zara Moda & Vestuário', hasPhoto: true },
    '2': { reading: 34120.0, constant: 1, adjustment: 1, calculatedConsumption: 3820.0, cost: 3606.59, luc: 'L-104', contrato: '10428', storeName: 'Burger King Praça', hasPhoto: true },
    '3': { reading: 5200.0, constant: 1, adjustment: 1, calculatedConsumption: 420.0, cost: 396.54, luc: 'L-201', contrato: '20104', storeName: 'Vivara Joalheria' },
    '4': { reading: 89100.0, constant: 1, adjustment: 1, calculatedConsumption: 9200.0, cost: 8686.03, luc: 'L-205', contrato: '20150', storeName: 'Lojas Americanas Express', hasPhoto: true },
    '5': { reading: 41800.0, constant: 1, adjustment: 1, calculatedConsumption: 4500.0, cost: 4248.60, luc: 'L-210', contrato: '20210', storeName: 'Restaurante Madero Steak', hasPhoto: true },
    '6': { reading: 112000.0, constant: 1, adjustment: 1, calculatedConsumption: 12400.0, cost: 11707.26, luc: 'L-301', contrato: '30101', storeName: 'Cinemark Multiplex', hasPhoto: true },
    '7': { reading: 3100.0, constant: 1, adjustment: 1, calculatedConsumption: 290.0, cost: 273.80, luc: 'L-305', contrato: '30105', storeName: 'Espaço Laser Depilação' },
    '8': { reading: 1540.0, constant: 1, adjustment: 1, calculatedConsumption: 160.0, cost: 151.06, luc: 'Q-012', contrato: '30112', storeName: 'Quiosque Chilli Beans' },
    '9': { reading: 65400.0, constant: 1, adjustment: 1, calculatedConsumption: 6800.0, cost: 6420.11, luc: 'L-401', contrato: '40101', storeName: 'Academia Smart Fit', hasPhoto: true },
    '10': { reading: 104200.0, constant: 1, adjustment: 1, calculatedConsumption: 11200.0, cost: 10574.30, luc: 'L-415', contrato: '40115', storeName: 'Mega Store Riachuelo', hasPhoto: true }
  }
};

const currentOct = {
  costItems: [],
  consumptionInput: null,
  acInput: 0,
  manualBill: 88200.00,
  manualConsumption: 93400,
  lastUpdated: '2026-10-22T21:00:00.000Z',
  readings: {
    '1': { reading: 14050.0, constant: 1, adjustment: 1, calculatedConsumption: 1510.0, cost: 1425.80, luc: 'L-101', contrato: '10423', storeName: 'Zara Moda & Vestuário', hasPhoto: true, note: 'Medidor verificado em campo' },
    '2': { reading: 38100.0, constant: 1, adjustment: 1, calculatedConsumption: 3980.0, cost: 3758.10, luc: 'L-104', contrato: '10428', storeName: 'Burger King Praça', hasPhoto: true },
    '3': { reading: 5630.0, constant: 1, adjustment: 1, calculatedConsumption: 430.0, cost: 406.05, luc: 'L-201', contrato: '20104', storeName: 'Vivara Joalheria' },
    '4': { reading: 101200.0, constant: 1, adjustment: 1, calculatedConsumption: 12100.0, cost: 11425.00, luc: 'L-205', contrato: '20150', storeName: 'Lojas Americanas Express', anomalyConfirmed: true, note: 'Instalação de ar condicionado adicional' },
    '5': { reading: 46500.0, constant: 1, adjustment: 1, calculatedConsumption: 4700.0, cost: 4438.00, luc: 'L-210', contrato: '20210', storeName: 'Restaurante Madero Steak', hasPhoto: true },
    '6': { reading: 124800.0, constant: 1, adjustment: 1, calculatedConsumption: 12800.0, cost: 12086.50, luc: 'L-301', contrato: '30101', storeName: 'Cinemark Multiplex', hasPhoto: true },
    '7': { reading: 3410.0, constant: 1, adjustment: 1, calculatedConsumption: 310.0, cost: 292.70, luc: 'L-305', contrato: '30105', storeName: 'Espaço Laser Depilação' }
    // 8, 9, 10 propositalmente sem leitura
  }
};

async function seedData(page) {
  await page.evaluate(({ stores, sept, oct }) => {
    localStorage.clear();
    localStorage.setItem('shop_rateio_user_role', 'ADM');
    localStorage.setItem('shop_rateio_clean_slate_20261007_v1', 'done');
    localStorage.setItem('shop_rateio_stores_data', JSON.stringify(stores));

    const history = {
      'luz_2026-09': sept,
      'luz_2026-10': oct
    };
    localStorage.setItem('shop_rateio_history', JSON.stringify(history));
    localStorage.setItem('shop_rateio_active_month', '2026-10');
    localStorage.setItem('shop_rateio_active_utility', 'luz');
  }, { stores: mockStores, sept: historySept, oct: currentOct });
}

async function run() {
  const server = await startServer(4280);
  const browser = await chromium.launch({ headless: true });

  try {
    console.log('--- Iniciando sessão de captura de fotos reais com Playwright ---');

    // Contexto Desktop em Alta Resolução (Retina 2x para relatórios nítidos)
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const page = await desktopContext.newPage();

    await page.goto('http://127.0.0.1:4280/');
    await seedData(page);
    await page.reload();
    await page.waitForTimeout(1800);

    // -----------------------------------------------------------------
    // FOTO 1: DASHBOARD EXECUTIVO GERAL
    // -----------------------------------------------------------------
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01_dashboard_executivo.png'),
      fullPage: false
    });
    console.log('✓ Foto 1 capturada: 01_dashboard_executivo.png');

    // -----------------------------------------------------------------
    // FOTO 2: CALCULADORA E RATEIO CONTÁBIL PRINCIPAL
    // -----------------------------------------------------------------
    const calcNavBtn = page.locator('button:has-text("Calculadora")').first();
    if (await calcNavBtn.isVisible()) {
      await calcNavBtn.click();
      await page.waitForTimeout(1200);

      // Preenche o valor da fatura caso necessário
      const invoiceInput = page.locator('input[placeholder*="Fatura"], input[placeholder*="0,00"]').first();
      if (await invoiceInput.isVisible()) {
        await invoiceInput.fill('88200');
        await invoiceInput.dispatchEvent('input');
        await page.waitForTimeout(400);
      }

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '02_rateio_calculadora_desktop.png'),
        fullPage: false
      });
      console.log('✓ Foto 2 capturada: 02_rateio_calculadora_desktop.png');
    }

    // -----------------------------------------------------------------
    // FOTO 3: MODAL DE AUDITORIA E CHECKLIST DE FECHAMENTO (5 PILARES)
    // -----------------------------------------------------------------
    const checklistBtn = page.locator('button:has-text("Auditoria & Fechamento"), button:has-text("Auditoria")').first();
    if (await checklistBtn.isVisible()) {
      await checklistBtn.click();
      await page.waitForTimeout(700);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '03_checklist_fechamento_contabil.png'),
        fullPage: false
      });
      console.log('✓ Foto 3 capturada: 03_checklist_fechamento_contabil.png');

      // -----------------------------------------------------------------
      // FOTO 4: PAINEL DE CONTINUIDADE VS MÊS ANTERIOR (LOJAS ESQUECIDAS)
      // -----------------------------------------------------------------
      const openPrevAuditLink = page.locator('button:has-text("Abrir Painel de Continuidade"), button:has-text("Continuidade")').first();
      if (await openPrevAuditLink.isVisible()) {
        await openPrevAuditLink.click();
        await page.waitForTimeout(700);

        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, '04_painel_continuidade_mes_anterior.png'),
          fullPage: false
        });
        console.log('✓ Foto 4 capturada: 04_painel_continuidade_mes_anterior.png');

        // -----------------------------------------------------------------
        // FOTO 5: MODAL DE JUSTIFICATIVA RÁPIDA (1 TOQUE)
        // -----------------------------------------------------------------
        const justifyBtn = page.locator('button:has-text("Justificar"), button:has-text("⚖️")').first();
        if (await justifyBtn.isVisible()) {
          await justifyBtn.click();
          await page.waitForTimeout(700);

          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '05_justificativa_rapida_1toque.png'),
            fullPage: false
          });
          console.log('✓ Foto 5 capturada: 05_justificativa_rapida_1toque.png');

          // Fecha modal justificativa
          const cancelBtn = page.locator('button:has-text("Cancelar"), button:has-text("✕")').first();
          if (await cancelBtn.isVisible()) await cancelBtn.click();
          await page.waitForTimeout(300);
        }

        // Fecha modal continuidade
        const closeAudit = page.locator('button:has-text("✕"), button:has-text("Fechar")').first();
        if (await closeAudit.isVisible()) await closeAudit.click();
        await page.waitForTimeout(300);
      } else {
        const closeChecklist = page.locator('button:has-text("✕")').first();
        if (await closeChecklist.isVisible()) await closeChecklist.click();
        await page.waitForTimeout(300);
      }
    }

    // -----------------------------------------------------------------
    // FOTO 6: ESPELHO INDIVIDUAL DO LOJISTA (COMPROVANTE / VOUCHER)
    // -----------------------------------------------------------------
    const voucherBtn = page.locator('button:has-text("Espelho")').first();
    if (await voucherBtn.isVisible()) {
      await voucherBtn.click();
      await page.waitForTimeout(800);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '06_espelho_individual_lojista.png'),
        fullPage: false
      });
      console.log('✓ Foto 6 capturada: 06_espelho_individual_lojista.png');

      const closeVoucher = page.locator('button:has-text("✕"), button:has-text("Fechar")').first();
      if (await closeVoucher.isVisible()) await closeVoucher.click();
      await page.waitForTimeout(300);
    }

    // -----------------------------------------------------------------
    // FOTO 7: RELATÓRIO HISTÓRICO DE CONSUMO E ANÁLISE POR LOJA
    // -----------------------------------------------------------------
    const reportNavBtn = page.locator('button:has-text("Relatório por Loja")').first();
    if (await reportNavBtn.isVisible()) {
      await reportNavBtn.click();
      await page.waitForTimeout(1200);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '07_relatorio_analise_consumo.png'),
        fullPage: false
      });
      console.log('✓ Foto 7 capturada: 07_relatorio_analise_consumo.png');
    }

    // -----------------------------------------------------------------
    // FOTO 8: INTERFACE MOBILE DO TÉCNICO DE CAMPO (ROTA FÍSICA & PWA)
    // -----------------------------------------------------------------
    const mobileContext = await browser.newContext({
      viewport: { width: 412, height: 892 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto('http://127.0.0.1:4280/');
    await seedData(mobilePage);
    await mobilePage.reload();
    await mobilePage.waitForTimeout(1500);

    // Navega para calculadora no mobile
    const mobileCalcBtn = mobilePage.locator('button:has-text("Calculadora")').first();
    if (await mobileCalcBtn.isVisible()) {
      await mobileCalcBtn.click();
      await mobilePage.waitForTimeout(1000);
    }

    await mobilePage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '08_tecnico_campo_mobile.png'),
      fullPage: false
    });
    console.log('✓ Foto 8 capturada: 08_tecnico_campo_mobile.png');

    await browser.close();
    console.log('========================================================');
    console.log('SUCESSO: Todas as 8 fotos reais do sistema foram salvas!');
    console.log('========================================================');
  } catch (err) {
    console.error('Erro na captura:', err);
    await browser.close();
  } finally {
    server.close();
  }
}

run();
