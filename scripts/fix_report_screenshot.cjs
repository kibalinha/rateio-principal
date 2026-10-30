const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST_DIR = path.resolve(__dirname, '../dist');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');

function startServer(port = 4388) {
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
  const server = await startServer(4388);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4388/');
    await page.waitForTimeout(1500);

    // Switch to Relatorio por Loja
    const reportNav = page.locator('aside nav button:has-text("Relatório por Loja")').first();
    await reportNav.click();
    await page.waitForTimeout(1200);

    // Switch to Agua
    const aguaBtn = page.locator('button:has-text("Água"), button:has-text("💧")').first();
    await aguaBtn.click();
    await page.waitForTimeout(1000);

    // Check available periods in selects
    const selectsData = await page.evaluate(() => {
      const allSelects = Array.from(document.querySelectorAll('select'));
      return allSelects.map(s => ({
        options: Array.from(s.options).map(o => ({ value: o.value, text: o.text }))
      }));
    });
    console.log('Selects data:', JSON.stringify(selectsData, null, 2));

    // Choose End Period to be the latest period (e.g. 2026-10)
    // The second select is typically start, third is end (or let's check by label)
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      // Find the end period select (usually the last or 3rd select)
      for (const sel of selects) {
        const label = sel.closest('div')?.querySelector('label')?.textContent || '';
        if (label.includes('Final') || label.includes('Até')) {
          const lastOption = sel.options[sel.options.length - 1];
          if (lastOption) {
            sel.value = lastOption.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
    });
    await page.waitForTimeout(800);

    // Now let's select store BAH or CINEMARK or PANVEL
    // Open dropdown or click Next Store button
    const searchInput = page.locator('input[placeholder*="Escreva a loja"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('BAH');
      await page.waitForTimeout(500);
      
      const bahItem = page.locator('div:has-text("BAH RESTAURANTE"), div:has-text("BAH")').last();
      if (await bahItem.isVisible()) {
        await bahItem.click();
        await page.waitForTimeout(1000);
      }
    }

    // Dismiss toasts
    await page.evaluate(() => {
      const closeBtns = document.querySelectorAll('button[title="Fechar"]');
      closeBtns.forEach(b => b.click());
    });
    await page.waitForTimeout(600);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '07_relatorio_analise_consumo.png'),
      fullPage: false
    });
    console.log('07_relatorio_analise_consumo.png captured successfully!');

    // Also let's re-capture Foto 8 Mobile with a better scroll so store cards are visible!
    const mobileContext = await browser.newContext({
      viewport: { width: 412, height: 892 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('http://127.0.0.1:4388/');
    await mobilePage.waitForTimeout(1500);

    const mobileAguaTab = mobilePage.locator('button:has-text("Água"), button:has-text("💧")').first();
    if (await mobileAguaTab.isVisible()) {
      await mobileAguaTab.click();
      await mobilePage.waitForTimeout(800);
    }
    // Dismiss toasts
    await mobilePage.evaluate(() => {
      const closeBtns = document.querySelectorAll('button[title="Fechar"]');
      closeBtns.forEach(b => b.click());
    });

    // Scroll to store card
    await mobilePage.evaluate(() => {
      window.scrollBy(0, 520);
    });
    await mobilePage.waitForTimeout(800);

    await mobilePage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '08_tecnico_campo_mobile.png'),
      fullPage: false
    });
    console.log('08_tecnico_campo_mobile.png captured successfully!');

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
    server.close();
  }
}

run();
