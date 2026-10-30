const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 2000 } });
  const html = fs.readFileSync(path.resolve(__dirname, '../Relatorio_Executivo_ShopRateio.html'), 'utf8');
  await page.setContent(html, { waitUntil: 'networkidle' });

  const pages = await page.$$('.page');
  console.log('Found .page elements:', pages.length);

  const previewDir = path.resolve(__dirname, '../screenshots/preview_pages');
  if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

  for (let i = 0; i < pages.length; i++) {
    const filename = path.join(previewDir, `page_${i + 1}.png`);
    await pages[i].screenshot({ path: filename });
    console.log(`Captured page ${i + 1} to ${filename}`);
  }

  await browser.close();
  console.log('All page screenshots captured successfully!');
})();
