const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST_DIR = path.resolve(__dirname, '../dist');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');

function startServer(port = 4355) {
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
  const server = await startServer(4355);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4355/');
    await page.waitForTimeout(2000);

    // Switch to Agua
    const aguaBtn = page.locator('button:has-text("Água"), button:has-text("💧")').first();
    await aguaBtn.click();
    console.log('Switched to Água tab, waiting for stores...');

    await page.locator('text="PANVEL"').first().waitFor({ state: 'visible', timeout: 15000 });
    console.log('Stores loaded successfully!');

    // Dismiss toasts
    await page.evaluate(() => {
      document.querySelectorAll('button[title="Fechar"]').forEach(b => b.click());
    });
    await page.waitForTimeout(800);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02_rateio_calculadora_desktop.png'),
      fullPage: false
    });
    console.log('02_rateio_calculadora_desktop.png captured with REAL water data!');

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
    server.close();
  }
}

run();
