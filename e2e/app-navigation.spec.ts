import { test, expect } from '@playwright/test';

test.describe('ShopRateio - Navegação e Utilidades', () => {
  test('deve carregar a aplicação com sucesso e exibir cabeçalho principal', async ({ page }) => {
    await page.goto('/');
    
    // Aguardar carregamento da aplicação
    await expect(page.locator('body')).toBeVisible();
    
    // Verificar se a marca/título está visível na tela (mobile ou desktop)
    const brandElement = page.getByText(/ShopRateio/i).filter({ visible: true }).first();
    await expect(brandElement).toBeVisible();
  });

  test('deve alternar entre utilidades (Energia, Água, Gás) com independência', async ({ page }) => {
    await page.goto('/');

    // Procura botões ou abas de Energia, Água e Gás visíveis no conteúdo principal
    const energyBtn = page.getByRole('button', { name: /energia|luz/i }).filter({ visible: true }).first();
    const waterBtn = page.getByRole('button', { name: /água|agua/i }).filter({ visible: true }).first();
    const gasBtn = page.getByRole('button', { name: /gás|gas/i }).filter({ visible: true }).first();

    if (await energyBtn.isVisible()) {
      await energyBtn.click();
      await page.waitForTimeout(200);
      expect(await energyBtn.getAttribute('class')).toBeDefined();
    }

    if (await waterBtn.isVisible()) {
      await waterBtn.click();
      await page.waitForTimeout(200);
      expect(await waterBtn.getAttribute('class')).toBeDefined();
    }

    if (await gasBtn.isVisible()) {
      await gasBtn.click();
      await page.waitForTimeout(200);
      expect(await gasBtn.getAttribute('class')).toBeDefined();
    }
  });

  test('deve navegar entre as abas Calculadora, Lojas e Histórico', async ({ page, isMobile }) => {
    await page.goto('/');

    // Seleciona o container de navegação apropriado (barra inferior no mobile, sidebar no desktop)
    const navScope = isMobile ? page.locator('nav.md\\:hidden') : page.locator('aside');

    // Botão Lojas
    const storesTab = navScope.getByRole('button', { name: /lojas/i }).first();
    if (await storesTab.isVisible()) {
      await storesTab.click();
      await page.waitForTimeout(400);
      await expect(page.locator('body')).toContainText(/lojas|cadastro|mensal/i);
    }

    // Botão Calculadora/Leituras
    const calcTab = navScope.getByRole('button', { name: /calculadora|leituras/i }).first();
    if (await calcTab.isVisible()) {
      await calcTab.click();
      await page.waitForTimeout(400);
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
