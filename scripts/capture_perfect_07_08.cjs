const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST_DIR = path.resolve(__dirname, '../dist');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');

function startServer(port = 4376) {
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
        '.png': 'image/png'
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
    server.listen(port, () => resolve(server));
    server.on('error', reject);
  });
}

async function run() {
  const server = await startServer(4376);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4376/');
    await page.waitForTimeout(2000);

    // Navigate to Relatorio por Loja
    console.log('Navigating to Relatório por Loja...');
    const reportBtn = page.locator('aside nav button:has-text("Relatório por Loja")');
    await reportBtn.click();
    await page.waitForTimeout(1500);

    // Switch to Agua
    console.log('Switching to Água...');
    const aguaBtn = page.locator('button:has-text("💧 Água"), button:has-text("Água")').first();
    await aguaBtn.click();
    await page.waitForTimeout(1000);

    // Check store names and select BAH
    console.log('Searching for BAH in store report...');
    const searchInput = page.locator('input[placeholder*="Escreva a loja"]');
    await searchInput.fill('BAH');
    await page.waitForTimeout(600);

    // Click on the store card in the dropdown
    const storeOption = page.locator('div[class*="cursor-pointer"]:has-text("BAH")').first();
    if (await storeOption.isVisible()) {
      await storeOption.click();
      await page.waitForTimeout(1200);
    }

    // Dismiss any toasts or overlays
    await page.evaluate(() => {
      document.querySelectorAll('button[title="Fechar"]').forEach(b => b.click());
    });
    await page.waitForTimeout(600);

    // Capture 07
    console.log('Capturing 07_relatorio_analise_consumo.png...');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '07_relatorio_analise_consumo.png'),
      fullPage: false
    });
    console.log('✓ 07 captured!');

    // Capture 08 mobile with scroll = 660
    console.log('Capturing 08_tecnico_campo_mobile.png...');
    const mobileContext = await browser.newContext({
      viewport: { width: 412, height: 892 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('http://127.0.0.1:4376/');
    await mobilePage.waitForTimeout(1800);

    const mobileAguaTab = mobilePage.locator('button:has-text("Água"), button:has-text("💧")').first();
    if (await mobileAguaTab.isVisible()) {
      await mobileAguaTab.click();
      await mobilePage.waitForTimeout(800);
    }

    // Dismiss toasts
    await mobilePage.evaluate(() => {
      document.querySelectorAll('button[title="Fechar"]').forEach(b => b.click());
    });

    // Scroll main element
    await mobilePage.evaluate(() => {
      const mainEl = document.querySelector('main');
      if (mainEl) {
        mainEl.scrollTop = 660;
      }
    });
    await mobilePage.waitForTimeout(800);

    await mobilePage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '08_tecnico_campo_mobile.png'),
      fullPage: false
    });
    console.log('✓ 08 captured!');

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
    server.close();
  }
}

run();
