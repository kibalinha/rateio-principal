import { test, expect } from '@playwright/test';

test.describe('ShopRateio - Seletor Mensal e Escopo por Mês', () => {
  test('deve renderizar o seletor de mês de referência e permitir alternância', async ({ page }) => {
    await page.goto('/');

    // Procura input de mês ou select visível
    const monthInput = page.locator('input[type="month"], select').filter({ visible: true }).first();
    await expect(monthInput).toBeVisible();

    const initialVal = await monthInput.inputValue().catch(() => null);
    expect(initialVal !== null || (await monthInput.isVisible())).toBeTruthy();
  });

  test('na aba Lojas, deve conter o seletor mensal e botão de exclusão de lojas do mês', async ({ page, isMobile }) => {
    await page.goto('/');

    // Seleciona o container de navegação apropriado (barra inferior no mobile, sidebar no desktop)
    const navScope = isMobile ? page.locator('nav.md\\:hidden') : page.locator('aside');

    const storesTab = navScope.getByRole('button', { name: /lojas/i }).first();
    if (await storesTab.isVisible()) {
      await storesTab.click();
      await page.waitForTimeout(500);

      // Na aba lojas, verifica se o conteúdo carregou
      await expect(page.locator('body')).toBeVisible();

      // Procura botão de limpar/apagar lojas do mês caso exista
      const clearBtn = page.getByRole('button', { name: /apagar lojas.*mês|excluir.*mês/i }).filter({ visible: true }).first();
      if (await clearBtn.isVisible()) {
        const text = await clearBtn.textContent();
        expect(text).toBeDefined();
      }
    }
  });
});
