import { test, expect } from '@playwright/test';

test.describe('ShopRateio - Fluxos Reais (TEC, ADM, pt-BR kWh, Lojas e Utilidades)', () => {
  test('deve iniciar no modo Técnico (TEC) por padrão e ocultar aba Lojas', async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await expect(page.getByText(/ShopRateio/i).filter({ visible: true }).first()).toBeVisible();

    const roleSelect = page.locator('select').filter({ has: page.locator('option[value="TEC"]') }).filter({ visible: true }).first();
    await expect(roleSelect).toHaveValue('TEC');

    const navScope = isMobile ? page.locator('nav.md\\:hidden') : page.locator('aside');
    await expect(navScope.getByRole('button', { name: /lojas/i })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('deve desbloquear ADM, aceitar separador de milhar pt-BR em BSS1-4 e abrir aba Lojas sem travar', async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');

    // Em mobile o seletor de perfil fica no menu "Mais" ou no topo; no desktop fica na sidebar
    if (isMobile) {
      const moreBtn = page.locator('nav.md\\:hidden').getByRole('button', { name: /mais/i });
      if (await moreBtn.isVisible()) {
        await moreBtn.click();
      }
    }

    const roleSelect = page.locator('select').filter({ has: page.locator('option[value="ADM"]') }).filter({ visible: true }).first();
    await roleSelect.selectOption('ADM');

    const pwdInput = page.locator('input[type="password"]').filter({ visible: true }).first();
    await expect(pwdInput).toBeVisible();
    await pwdInput.fill('admin123');
    await page.getByRole('button', { name: /confirmar|entrar|desbloquear/i }).filter({ visible: true }).first().click();

    await expect(roleSelect).toHaveValue('ADM');

    // Abrir configuração no mobile se estiver recolhida
    const toggleConfigBtn = page.getByRole('button', { name: /configura|fatura|entrada/i }).filter({ visible: true }).first();
    const bss1Label = page.locator('label', { hasText: /^bss1$/i }).first();
    if (!(await bss1Label.isVisible()) && (await toggleConfigBtn.isVisible())) {
      await toggleConfigBtn.click();
    }

    // Preencher BSS1..BSS4 com pontos de milhar pt-BR
    const bssValues: Record<string, string> = {
      bss1: '994.683',
      bss2: '56.890',
      bss3: '44.316',
      bss4: '18.880',
    };

    for (const [key, val] of Object.entries(bssValues)) {
      const row = page.locator('div', { has: page.locator(`label`, { hasText: new RegExp(`^${key}$`, 'i') }) }).filter({ has: page.locator('input[type="text"]') }).last();
      const input = row.locator('input[type="text"]').first();
      await input.fill(val);
      await input.blur();
    }

    await expect(page.getByText(/1\.114\.769\s*kWh/i).first()).toBeVisible();

    // Navegar para aba Lojas e garantir que não fica presa em loading infinito
    const navScope = isMobile ? page.locator('nav.md\\:hidden') : page.locator('aside');
    await navScope.getByRole('button', { name: /lojas/i }).first().click();
    await expect(page.getByRole('heading', { name: /Gestão de Lojas/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Carregando Gestão de Lojas/i)).toHaveCount(0);

    // Alternar entre Dashboard, Relatório e Calculadora
    await navScope.getByRole('button', { name: /dashboard|visão geral/i }).first().click();
    await expect(page.getByRole('heading', { name: /Visão Geral/i })).toBeVisible({ timeout: 10000 });

    await navScope.getByRole('button', { name: /relatório/i }).first().click();
    await expect(page.getByRole('heading', { name: /Relatório por Loja/i })).toBeVisible({ timeout: 10000 });

    expect(errors).toEqual([]);
  });
});
