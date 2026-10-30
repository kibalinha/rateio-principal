const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST_DIR = path.resolve(__dirname, '../dist');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');

function startServer(port = 4380) {
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
      console.log(`Test server running on port ${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

async function dismissToasts(page) {
  try {
    await page.evaluate(() => {
      const closeBtns = document.querySelectorAll('button[title="Fechar"]');
      closeBtns.forEach(b => b.click());
    });
  } catch (e) {}
}

async function run() {
  const server = await startServer(4380);
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();

    console.log('1. Navegando para a Calculadora com Água...');
    await page.goto('http://127.0.0.1:4380/');
    await page.waitForTimeout(1500);

    // Garante perfil ADM
    await page.evaluate(() => {
      localStorage.setItem('shop_rateio_user_role', 'ADM');
    });

    // Clica na aba Água na calculadora se necessário
    const aguaBtn = page.locator('button:has-text("Água"), button:has-text("💧")').first();
    if (await aguaBtn.isVisible()) {
      await aguaBtn.click();
      await page.waitForTimeout(1000);
    }
    await dismissToasts(page);

    // FOTO 02: Calculadora Desktop com 64 lojas de Água
    console.log('Capturando 02_rateio_calculadora_desktop.png...');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02_rateio_calculadora_desktop.png'),
      fullPage: false
    });
    console.log('✓ Foto 2 capturada!');

    // FOTO 03: Modal de Auditoria e Fechamento dos 5 Pilares (Água)
    console.log('Capturando 03_checklist_fechamento_contabil.png...');
    const auditBtn = page.locator('button:has-text("Auditoria & Fechamento")').first();
    if (await auditBtn.isVisible()) {
      await auditBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '03_checklist_fechamento_contabil.png'),
        fullPage: false
      });
      console.log('✓ Foto 3 capturada!');

      const closeAuditBtn = page.locator('app-closing-checklist-modal button:has-text("✕")').first();
      if (await closeAuditBtn.isVisible()) {
        await closeAuditBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(800);
    }

    // FOTO 04: Painel de Continuidade vs Mês Anterior (Água)
    console.log('Capturando 04_painel_continuidade_mes_anterior.png...');
    const verListaBtn = page.locator('button:has-text("Ver Lista")').first();
    if (await verListaBtn.isVisible()) {
      await verListaBtn.click();
      await page.waitForTimeout(1000);

      const jaLidasTab = page.locator('app-prev-month-audit-modal button:has-text("Já Lidas")').first();
      if (await jaLidasTab.isVisible()) {
        await jaLidasTab.click();
        await page.waitForTimeout(800);
      }

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '04_painel_continuidade_mes_anterior.png'),
        fullPage: false
      });
      console.log('✓ Foto 4 capturada!');

      const closePrevBtn = page.locator('app-prev-month-audit-modal button:has-text("✕")').first();
      if (await closePrevBtn.isVisible()) {
        await closePrevBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(800);
    }

    // FOTO 06: Espelho Individual do Lojista (Água - Comprovante com m³)
    console.log('Capturando 06_espelho_individual_lojista.png...');
    const espelhoBtn = page.locator('button:has-text("Espelho")').first();
    if (await espelhoBtn.isVisible()) {
      await espelhoBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '06_espelho_individual_lojista.png'),
        fullPage: false
      });
      console.log('✓ Foto 6 capturada!');

      const closeVoucherBtn = page.locator('app-store-voucher-modal button:has-text("✕")').first();
      if (await closeVoucherBtn.isVisible()) {
        await closeVoucherBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(800);
    }

    // FOTO 05: Modal de Justificativa Rápida (1 Toque / Observação de Campo)
    console.log('Capturando 05_justificativa_rapida_1toque.png...');
    const notaBtn = page.locator('button:has-text("+ nota")').first();
    if (await notaBtn.isVisible()) {
      await notaBtn.click();
      await page.waitForTimeout(800);

      // Clica na etiqueta rápida "💧 Vazamento" para preencher a justificativa de água
      const leakTag = page.locator('button:has-text("💧 Vazamento")').first();
      if (await leakTag.isVisible()) {
        await leakTag.click();
        await page.waitForTimeout(400);
      }

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '05_justificativa_rapida_1toque.png'),
        fullPage: false
      });
      console.log('✓ Foto 5 capturada: 05_justificativa_rapida_1toque.png');

      const closeNoteBtn = page.locator('div:has(> h3:has-text("Observação de Campo")) button:has-text("✕")').first();
      if (await closeNoteBtn.isVisible()) {
        await closeNoteBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(800);
    }

    // FOTO 01: Dashboard Executivo Geral (Água)
    console.log('Navegando para Dashboard Executivo...');
    const dashNav = page.locator('aside nav button:has-text("Dashboard")').first();
    if (await dashNav.isVisible()) {
      await dashNav.click();
      await page.waitForTimeout(1400);

      const dashAguaTab = page.locator('button:has-text("Água"), button:has-text("💧")').first();
      if (await dashAguaTab.isVisible()) {
        await dashAguaTab.click();
        await page.waitForTimeout(800);
      }
      await dismissToasts(page);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '01_dashboard_executivo.png'),
        fullPage: false
      });
      console.log('✓ Foto 1 capturada: 01_dashboard_executivo.png (Dashboard Água)');
    }

    // FOTO 07: Relatório por Loja (Água com Gráficos e Histórico)
    console.log('Navegando para Relatório por Loja...');
    const reportNav = page.locator('aside nav button:has-text("Relatório por Loja")').first();
    if (await reportNav.isVisible()) {
      await reportNav.click();
      await page.waitForTimeout(1400);

      const reportAguaTab = page.locator('button:has-text("Água"), button:has-text("💧")').first();
      if (await reportAguaTab.isVisible()) {
        await reportAguaTab.click();
        await page.waitForTimeout(800);
      }

      // Abre dropdown de lojas e seleciona CINEMARK ou BAH que tem consumo de água
      const dropdownToggle = page.locator('button[title="Abrir/Fechar lista suspensa"]').first();
      if (await dropdownToggle.isVisible()) {
        await dropdownToggle.click();
        await page.waitForTimeout(500);

        const storeItem = page.locator('div:has-text("CINEMARK"), div:has-text("BAH"), div:has-text("PANVEL")').first();
        if (await storeItem.isVisible()) {
          await storeItem.click();
          await page.waitForTimeout(1000);
        }
      }

      await dismissToasts(page);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '07_relatorio_analise_consumo.png'),
        fullPage: false
      });
      console.log('✓ Foto 7 capturada: 07_relatorio_analise_consumo.png (Relatório Água com gráficos)');
    }

    // FOTO 09: Gestão Cadastral de Lojas (Água)
    console.log('Navegando para Gestão de Lojas...');
    const storesNav = page.locator('aside nav button:has-text("Lojas")').first();
    if (await storesNav.isVisible()) {
      await storesNav.click();
      await page.waitForTimeout(1400);

      const storesAguaTab = page.locator('button:has-text("Lojas de Água")').first();
      if (await storesAguaTab.isVisible()) {
        await storesAguaTab.click();
        await page.waitForTimeout(800);
      }
      await dismissToasts(page);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '09_gestao_cadastral_lojas.png'),
        fullPage: false
      });
      console.log('✓ Foto 9 capturada: 09_gestao_cadastral_lojas.png (Gestão de Lojas Água)');
    }

    // FOTO 08: Técnico de Campo Mobile (PWA & Água)
    console.log('Capturando Foto 8 Mobile...');
    const mobileContext = await browser.newContext({
      viewport: { width: 412, height: 892 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('http://127.0.0.1:4380/');
    await mobilePage.waitForTimeout(1500);

    const mobileAguaTab = mobilePage.locator('button:has-text("Água"), button:has-text("💧")').first();
    if (await mobileAguaTab.isVisible()) {
      await mobileAguaTab.click();
      await mobilePage.waitForTimeout(800);
    }
    await dismissToasts(mobilePage);

    // Rola um pouco a página para ver os cartões das lojas com hidrômetro
    await mobilePage.evaluate(() => {
      window.scrollBy(0, 320);
    });
    await mobilePage.waitForTimeout(600);

    await mobilePage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '08_tecnico_campo_mobile.png'),
      fullPage: false
    });
    console.log('✓ Foto 8 capturada: 08_tecnico_campo_mobile.png (Mobile Água com cartões)');

    console.log('====================================================');
    console.log('TODAS AS 9 FOTOS REAIS DE ÁGUA FORAM REFINADAS E SALVAS!');
    console.log('====================================================');
  } catch (err) {
    console.error('Erro na captura:', err);
  } finally {
    await browser.close();
    server.close();
  }
}

run();
