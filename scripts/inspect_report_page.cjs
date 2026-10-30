const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST_DIR = path.resolve(__dirname, '../dist');

function startServer(port = 4390) {
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
  const server = await startServer(4390);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4390/');
    await page.waitForTimeout(1500);

    // Navigate to report
    const reportNav = page.locator('aside nav button:has-text("Relatório por Loja")').first();
    await reportNav.click();
    await page.waitForTimeout(1500);

    // Switch to water
    const aguaBtn = page.locator('button:has-text("Água"), button:has-text("💧")').first();
    await aguaBtn.click();
    await page.waitForTimeout(1000);

    const info = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select')).map(s => ({
        label: s.previousElementSibling?.textContent?.trim() || '',
        value: s.value,
        options: Array.from(s.options).map(o => ({ value: o.value, text: o.text }))
      }));
      return selects;
    });

    console.log('Select elements on report page:', JSON.stringify(info, null, 2));

    // Let's search for BAH or CINEMARK in the input
    const input = page.locator('input[placeholder*="Escreva a loja"]');
    await input.fill('BAH');
    await page.waitForTimeout(600);

    const storeNames = await page.evaluate(() => {
      const els = document.querySelectorAll('.overflow-y-auto div[class*="cursor-pointer"]');
      return Array.from(els).map(e => e.textContent.replace(/\s+/g, ' ').trim());
    });
    console.log('Stores found for BAH:', storeNames);

    // Let's click the first store
    const firstStore = page.locator('.overflow-y-auto div[class*="cursor-pointer"]').first();
    if (await firstStore.isVisible()) {
      await firstStore.click();
      await page.waitForTimeout(1000);
    }

    // Now check the chart container
    const chartSvg = await page.evaluate(() => {
      const svgs = document.querySelectorAll('svg');
      return Array.from(svgs).map(s => ({
        w: s.clientWidth,
        h: s.clientHeight,
        pathCount: s.querySelectorAll('path, rect, circle').length
      }));
    });
    console.log('SVGs found:', chartSvg);

    // Let's take a test screenshot of this report
    await page.screenshot({ path: path.join(__dirname, '../screenshots/07_relatorio_analise_consumo.png') });
    console.log('Screenshot 07 refreshed with BAH!');

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
    server.close();
  }
}

run();
