const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST_DIR = path.resolve(__dirname, '../dist');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');

function startServer(port = 4369) {
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
  const server = await startServer(4369);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4369/');
    await page.waitForTimeout(2000);

    const reportBtn = page.locator('aside nav button:has-text("Relatório por Loja")');
    await reportBtn.click();
    await page.waitForTimeout(1400);

    const aguaBtn = page.locator('button:has-text("💧 Água"), button:has-text("Água")').first();
    await aguaBtn.click();
    await page.waitForTimeout(1000);

    // Select store BAH
    const searchInput = page.locator('input[placeholder*="Escreva a loja"]');
    await searchInput.fill('BAH');
    await page.waitForTimeout(600);
    await page.locator('div[class*="cursor-pointer"]:has-text("BAH")').first().click();
    await page.waitForTimeout(1000);

    // Select Jul / 2026 (2026-07) as start period so all months have delta consumption
    const startSelect = page.locator('div:has(> label:has-text("Período Inicial")) select');
    const startOpts = await startSelect.evaluate(s => Array.from(s.options).map(o => ({ v: o.value, t: o.text })));
    if (startOpts.some(o => o.v === '2026-07')) {
      await startSelect.selectOption('2026-07');
      await page.waitForTimeout(800);
    }

    // Inspect options in the end period select
    const endSelect = page.locator('div:has(> label:has-text("Período Final")) select');
    const opts = await endSelect.evaluate(s => Array.from(s.options).map(o => ({ v: o.value, t: o.text })));
    console.log('End select options:', opts);

    if (opts && opts.length > 0) {
      // Select Out / 2026 (2026-10) if available, otherwise last
      const octOpt = opts.find(o => o.v === '2026-10') || opts[opts.length - 1];
      console.log('Selecting end period:', octOpt.v);
      await endSelect.selectOption(octOpt.v);
      await page.waitForTimeout(1500);
    }

    // Dismiss toasts
    await page.evaluate(() => {
      document.querySelectorAll('button[title="Fechar"]').forEach(b => b.click());
    });

    // Scroll main down so Store Card, Alert Banner, 4 KPI cards, and 2 D3 charts are all visible!
    await page.evaluate(() => {
      const mainEl = document.querySelector('main');
      if (mainEl) mainEl.scrollTop = 360;
    });
    await page.waitForTimeout(1000);

    // Take screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_relatorio_analise_consumo.png') });
    console.log('07 successfully updated with full period!');

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
    server.close();
  }
}

run();
