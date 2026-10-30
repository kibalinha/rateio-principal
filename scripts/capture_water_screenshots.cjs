const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST_DIR = path.resolve(__dirname, '../dist');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function startServer(port = 4330) {
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

// 10 Lojas com Hidrômetros Reais para ÁGUA
const waterStores = [
  { id: '1', luc: 'L-101', contrato: '10423', name: 'Zara Moda & Vestuário', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 1, meterNumber: 'HID-101' },
  { id: '2', luc: 'L-104', contrato: '10428', name: 'Burger King Praça', active: true, usesLuz: true, usesAgua: true, usesGas: true, routeOrder: 2, meterNumber: 'HID-104' },
  { id: '3', luc: 'L-108', contrato: '10435', name: 'Divino Fogão Restaurante', active: true, usesLuz: true, usesAgua: true, usesGas: true, routeOrder: 3, meterNumber: 'HID-108' },
  { id: '4', luc: 'L-205', contrato: '20150', name: 'Lojas Americanas Express', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 4, meterNumber: 'HID-205' },
  { id: '5', luc: 'L-210', contrato: '20210', name: 'Restaurante Madero Steak', active: true, usesLuz: true, usesAgua: true, usesGas: true, routeOrder: 5, meterNumber: 'HID-210' },
  { id: '6', luc: 'L-301', contrato: '30101', name: 'Cinemark Multiplex', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 6, meterNumber: 'HID-301' },
  { id: '7', luc: 'L-305', contrato: '30105', name: 'Espaço Laser Depilação', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 7, meterNumber: 'HID-305' },
  { id: '8', luc: 'Q-015', contrato: '30118', name: 'Kopenhagen Café', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 8, meterNumber: 'HID-015' },
  { id: '9', luc: 'L-401', contrato: '40101', name: 'Academia Smart Fit (Duchas)', active: true, usesLuz: true, usesAgua: true, usesGas: true, routeOrder: 9, meterNumber: 'HID-401' },
  { id: '10', luc: 'L-415', contrato: '40115', name: 'Mega Store Riachuelo', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 10, meterNumber: 'HID-415' }
];

const historySeptWater = {
  costItems: [],
  consumptionInput: 2650,
  acInput: 0,
  manualBill: 35748.50,
  manualConsumption: 2650,
  lastUpdated: '2026-09-30T22:00:00.000Z',
  readings: {
    '1': { reading: 110.0, constant: 1, adjustment: 1, calculatedConsumption: 26.0, cost: 350.74, luc: 'L-101', contrato: '10423', storeName: 'Zara Moda & Vestuário', hasPhoto: true },
    '2': { reading: 1420.0, constant: 1, adjustment: 1, calculatedConsumption: 245.0, cost: 3305.05, luc: 'L-104', contrato: '10428', storeName: 'Burger King Praça', hasPhoto: true },
    '3': { reading: 1120.0, constant: 1, adjustment: 1, calculatedConsumption: 210.0, cost: 2832.90, luc: 'L-108', contrato: '10435', storeName: 'Divino Fogão Restaurante', hasPhoto: true },
    '4': { reading: 215.0, constant: 1, adjustment: 1, calculatedConsumption: 42.0, cost: 566.58, luc: 'L-205', contrato: '20150', storeName: 'Lojas Americanas Express', hasPhoto: true },
    '5': { reading: 2890.0, constant: 1, adjustment: 1, calculatedConsumption: 425.0, cost: 5733.25, luc: 'L-210', contrato: '20210', storeName: 'Restaurante Madero Steak', hasPhoto: true },
    '6': { reading: 850.0, constant: 1, adjustment: 1, calculatedConsumption: 125.0, cost: 1686.25, luc: 'L-301', contrato: '30101', storeName: 'Cinemark Multiplex', hasPhoto: true },
    '7': { reading: 140.0, constant: 1, adjustment: 1, calculatedConsumption: 32.0, cost: 431.68, luc: 'L-305', contrato: '30105', storeName: 'Espaço Laser Depilação' },
    '8': { reading: 95.0, constant: 1, adjustment: 1, calculatedConsumption: 28.0, cost: 377.72, luc: 'Q-015', contrato: '30118', storeName: 'Kopenhagen Café' },
    '9': { reading: 3100.0, constant: 1, adjustment: 1, calculatedConsumption: 490.0, cost: 6610.10, luc: 'L-401', contrato: '40101', storeName: 'Academia Smart Fit (Duchas)', hasPhoto: true },
    '10': { reading: 380.0, constant: 1, adjustment: 1, calculatedConsumption: 55.0, cost: 741.95, luc: 'L-415', contrato: '40115', storeName: 'Mega Store Riachuelo', hasPhoto: true }
  }
};

const currentOctWater = {
  costItems: [],
  consumptionInput: 2850,
  acInput: 0,
  manualBill: 38450.00,
  manualConsumption: 2850,
  lastUpdated: '2026-10-22T21:00:00.000Z',
  readings: {
    '1': { reading: 138.0, constant: 1, adjustment: 1, calculatedConsumption: 28.0, cost: 377.72, luc: 'L-101', contrato: '10423', storeName: 'Zara Moda & Vestuário', hasPhoto: true, note: 'Hidrômetro conferido com foto' },
    '2': { reading: 1685.0, constant: 1, adjustment: 1, calculatedConsumption: 265.0, cost: 3574.85, luc: 'L-104', contrato: '10428', storeName: 'Burger King Praça', hasPhoto: true, note: 'Foto do hidrômetro validada' },
    '3': { reading: 1340.0, constant: 1, adjustment: 1, calculatedConsumption: 220.0, cost: 2967.80, luc: 'L-108', contrato: '10435', storeName: 'Divino Fogão Restaurante', hasPhoto: true },
    '4': { reading: 260.0, constant: 1, adjustment: 1, calculatedConsumption: 45.0, cost: 607.05, luc: 'L-205', contrato: '20150', storeName: 'Lojas Americanas Express', anomalyConfirmed: true, note: 'Gotejamento em sanitário auditado' },
    '5': { reading: 3340.0, constant: 1, adjustment: 1, calculatedConsumption: 450.0, cost: 6070.50, luc: 'L-210', contrato: '20210', storeName: 'Restaurante Madero Steak', hasPhoto: true },
    '6': { reading: 980.0, constant: 1, adjustment: 1, calculatedConsumption: 130.0, cost: 1753.70, luc: 'L-301', contrato: '30101', storeName: 'Cinemark Multiplex', hasPhoto: true },
    '7': { reading: 175.0, constant: 1, adjustment: 1, calculatedConsumption: 35.0, cost: 472.15, luc: 'L-305', contrato: '30105', storeName: 'Espaço Laser Depilação' }
    // 8, 9, 10 propositalmente pendentes no mês atual
  }
};

async function seedWaterData(page, view = 'calculator') {
  await page.evaluate(({ stores, sept, oct, viewName }) => {
    localStorage.clear();
    localStorage.setItem('shop_rateio_user_role', 'ADM');
    localStorage.setItem('shop_rateio_clean_slate_20261007_v1', 'done');
    localStorage.setItem('shop_rateio_stores_data', JSON.stringify(stores));

    const monthlyLists = {
      'agua_2026-09': stores.map(s => s.id),
      'agua_2026-10': stores.map(s => s.id)
    };
    localStorage.setItem('shop_rateio_monthly_store_lists', JSON.stringify(monthlyLists));

    const history = {
      'agua_2026-09': sept,
      'agua_2026-10': oct
    };
    localStorage.setItem('shop_rateio_history', JSON.stringify(history));
    localStorage.setItem('shop_rateio_active_month', '2026-10');
    localStorage.setItem('shop_rateio_active_utility', 'agua');
    localStorage.setItem('shop_rateio_nav_state', JSON.stringify({ view: viewName, lockedAt: null }));
  }, { stores: waterStores, sept: historySeptWater, oct: currentOctWater, viewName: view });
}

async function run() {
  const server = await startServer(4330);
  const browser = await chromium.launch({ headless: true });

  try {
    console.log('--- Iniciando sessão de captura de fotos reais com foco total em ÁGUA ---');

    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const page = await desktopContext.newPage();

    // =================================================================
    // FOTO 1: DASHBOARD EXECUTIVO GERAL (ÁGUA)
    // =================================================================
    await page.goto('http://127.0.0.1:4330/');
    await seedWaterData(page, 'dashboard');
    await page.reload();
    await page.waitForTimeout(1400);

    const aguaTabDash = page.locator('button:has-text("Água"), button:has-text("💧")').first();
    if (await aguaTabDash.isVisible()) {
      await aguaTabDash.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01_dashboard_executivo.png'),
      fullPage: false
    });
    console.log('✓ Foto 1 capturada: 01_dashboard_executivo.png (Água)');

    // =================================================================
    // FOTO 2: CALCULADORA DE RATEIO DE ÁGUA (DESKTOP)
    // =================================================================
    await page.goto('http://127.0.0.1:4330/');
    await seedWaterData(page, 'calculator');
    await page.reload();
    await page.waitForTimeout(1400);

    const calcAguaTab = page.locator('button:has-text("Água"), button:has-text("💧")').first();
    if (await calcAguaTab.isVisible()) {
      await calcAguaTab.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02_rateio_calculadora_desktop.png'),
      fullPage: false
    });
    console.log('✓ Foto 2 capturada: 02_rateio_calculadora_desktop.png (Água)');

    // =================================================================
    // FOTO 3: MODAL DE CHECKLIST DOS 5 PILARES (ÁGUA)
    // =================================================================
    await page.evaluate(() => {
      const comp = window.ng?.getComponent(document.querySelector('app-bill-calculator'));
      if (comp && comp.showClosingChecklistModal) {
        comp.showClosingChecklistModal.set(true);
      }
    });
    await page.waitForTimeout(800);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03_checklist_fechamento_contabil.png'),
      fullPage: false
    });
    console.log('✓ Foto 3 capturada: 03_checklist_fechamento_contabil.png (Água)');

    // =================================================================
    // FOTO 4: PAINEL DE CONTINUIDADE VS MÊS ANTERIOR (ÁGUA)
    // =================================================================
    await page.evaluate(() => {
      const comp = window.ng?.getComponent(document.querySelector('app-bill-calculator'));
      if (comp) {
        if (comp.showClosingChecklistModal) comp.showClosingChecklistModal.set(false);
        if (comp.showPrevMonthAuditModal) comp.showPrevMonthAuditModal.set(true);
      }
    });
    await page.waitForTimeout(800);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04_painel_continuidade_mes_anterior.png'),
      fullPage: false
    });
    console.log('✓ Foto 4 capturada: 04_painel_continuidade_mes_anterior.png (Água)');

    // =================================================================
    // FOTO 5: MODAL DE JUSTIFICATIVA RÁPIDA DE MEDIÇÃO EM 1 TOQUE (ÁGUA)
    // =================================================================
    await page.evaluate(() => {
      const comp = window.ng?.getComponent(document.querySelector('app-bill-calculator'));
      if (comp) {
        if (comp.showPrevMonthAuditModal) comp.showPrevMonthAuditModal.set(false);
        const stores = comp.activeStores ? comp.activeStores() : [];
        if (stores.length > 0 && comp.openQuickJustifyModal) {
          comp.openQuickJustifyModal(stores[0]);
        }
      }
    });
    await page.waitForTimeout(800);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05_justificativa_rapida_1toque.png'),
      fullPage: false
    });
    console.log('✓ Foto 5 capturada: 05_justificativa_rapida_1toque.png (Água)');

    // =================================================================
    // FOTO 6: ESPELHO INDIVIDUAL DO LOJISTA COM FOTO DO HIDRÔMETRO (ÁGUA)
    // =================================================================
    await page.goto('http://127.0.0.1:4330/');
    await seedWaterData(page, 'calculator');
    await page.reload();
    await page.waitForTimeout(1200);

    await page.evaluate(() => {
      const comp = window.ng?.getComponent(document.querySelector('app-bill-calculator'));
      if (comp) {
        const stores = comp.activeStores ? comp.activeStores() : [];
        if (stores.length > 1 && comp.openStoreVoucherModal) {
          comp.openStoreVoucherModal(stores[1]); // Burger King Praça
        }
      }
    });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '06_espelho_individual_lojista.png'),
      fullPage: false
    });
    console.log('✓ Foto 6 capturada: 06_espelho_individual_lojista.png (Água)');

    // =================================================================
    // FOTO 7: RELATÓRIO ANALÍTICO POR LOJA (ÁGUA)
    // =================================================================
    await page.goto('http://127.0.0.1:4330/');
    await seedWaterData(page, 'report');
    await page.reload();
    await page.waitForTimeout(1400);

    const reportAguaTab = page.locator('button:has-text("Água"), button:has-text("💧")').first();
    if (await reportAguaTab.isVisible()) {
      await reportAguaTab.click();
      await page.waitForTimeout(600);
    }

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '07_relatorio_analise_consumo.png'),
      fullPage: false
    });
    console.log('✓ Foto 7 capturada: 07_relatorio_analise_consumo.png (Água)');

    // =================================================================
    // FOTO 9: GESTÃO CADASTRAL DE LOJAS DE ÁGUA
    // =================================================================
    await page.goto('http://127.0.0.1:4330/');
    await seedWaterData(page, 'stores');
    await page.reload();
    await page.waitForTimeout(1400);

    const storesAguaTab = page.locator('button:has-text("Lojas de Água"), button:has-text("Água")').first();
    if (await storesAguaTab.isVisible()) {
      await storesAguaTab.click();
      await page.waitForTimeout(600);
    }

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '09_gestao_cadastral_lojas.png'),
      fullPage: false
    });
    console.log('✓ Foto 9 capturada: 09_gestao_cadastral_lojas.png (Lojas de Água)');

    // =================================================================
    // FOTO 8: INTERFACE MOBILE DO TÉCNICO DE CAMPO (ÁGUA & PWA)
    // =================================================================
    const mobileContext = await browser.newContext({
      viewport: { width: 412, height: 892 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto('http://127.0.0.1:4330/');
    await seedWaterData(mobilePage, 'calculator');
    await mobilePage.reload();
    await mobilePage.waitForTimeout(1400);

    const mobileAguaTab = mobilePage.locator('button:has-text("Água"), button:has-text("💧")').first();
    if (await mobileAguaTab.isVisible()) {
      await mobileAguaTab.click();
      await mobilePage.waitForTimeout(500);
    }

    await mobilePage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '08_tecnico_campo_mobile.png'),
      fullPage: false
    });
    console.log('✓ Foto 8 capturada: 08_tecnico_campo_mobile.png (Mobile Água)');

    await browser.close();
    console.log('========================================================');
    console.log('SUCESSO ABSOLUTO: Todas as 9 fotos reais com foco em ÁGUA salvas!');
    console.log('========================================================');
  } catch (err) {
    console.error('Erro na captura:', err);
    await browser.close();
  } finally {
    server.close();
  }
}

run();
