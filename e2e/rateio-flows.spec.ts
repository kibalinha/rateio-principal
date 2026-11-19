import { test, expect, Page } from '@playwright/test';

async function protectSupabaseWrites(page: Page) {
  await page.route('**/*.supabase.co/**', async route => {
    const method = route.request().method().toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test.describe('ShopRateio - Fluxos Reais (TEC, ADM, pt-BR kWh, Lojas e Subcomponentes)', () => {
  test.beforeEach(async ({ page }) => {
    await protectSupabaseWrites(page);
  });

  test('deve iniciar no modo Técnico (TEC) por padrão e ocultar aba Lojas', async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await expect(page.getByText(/ShopRateio/i).filter({ visible: true }).first()).toBeVisible();

    if (isMobile) {
      await expect(page.locator('header').getByText('TEC', { exact: true })).toBeVisible();
    } else {
      const roleSelect = page.locator('select').filter({ has: page.locator('option[value="TEC"]') }).filter({ visible: true }).first();
      await expect(roleSelect).toHaveValue('TEC');
    }

    const navScope = isMobile ? page.locator('nav.md\\:hidden') : page.locator('aside');
    await expect(navScope.getByRole('button', { name: /lojas/i })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('deve desbloquear ADM, aceitar separador de milhar pt-BR em BSS1-4 e abrir aba Lojas sem travar', async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');

    // Em mobile o seletor de perfil fica na gaveta lateral aberta pelo botão "Mais"
    if (isMobile) {
      const moreBtn = page.locator('nav.md\\:hidden').getByRole('button', { name: /mais/i });
      if (await moreBtn.isVisible()) {
        await moreBtn.click();
      }
    }

    const roleSelect = page.locator('aside select').filter({ has: page.locator('option[value="ADM"]') }).first();
    await expect(roleSelect).toBeVisible();
    await roleSelect.selectOption('ADM');

    const pwdInput = page.locator('input[type="password"]').filter({ visible: true }).first();
    await expect(pwdInput).toBeVisible();
    await pwdInput.fill('admin123');
    await page.getByRole('button', { name: /confirmar|entrar|desbloquear/i }).filter({ visible: true }).first().click();

    await expect(roleSelect).toHaveValue('ADM');

    // Fecha a gaveta lateral no mobile após desbloquear ADM para interagir com a calculadora
    if (isMobile) {
      const menuToggleBtn = page.locator('header button[title="Abrir menu"]');
      if (await menuToggleBtn.isVisible()) {
        await menuToggleBtn.click();
      }
    }

    // Abrir configuração no mobile se estiver recolhida
    const bss1Label = page.locator('label', { hasText: /^bss1$/i }).first();
    if (!(await bss1Label.isVisible())) {
      const toggleConfigBtn = page.getByRole('button', { name: /configuração/i }).filter({ visible: true }).first();
      if (await toggleConfigBtn.isVisible()) {
        await toggleConfigBtn.click();
      }
    }
    await expect(bss1Label).toBeVisible();

    // Preencher BSS1..BSS4 com pontos de milhar pt-BR
    const bssValues: Record<string, string> = {
      bss1: '994.683',
      bss2: '56.890',
      bss3: '44.316',
      bss4: '18.880',
    };

    for (const [key, val] of Object.entries(bssValues)) {
      const row = page.locator('div', { has: page.locator('label', { hasText: new RegExp(`^${key}$`, 'i') }) }).filter({ has: page.locator('input[type="text"]') }).last();
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

    // Alternar entre Dashboard e Relatório
    await navScope.getByRole('button', { name: /dashboard|visão geral/i }).first().click();
    await expect(page.getByRole('heading', { name: /Visão Geral/i })).toBeVisible({ timeout: 10000 });

    await navScope.getByRole('button', { name: /relatório/i }).first().click();
    await expect(page.getByRole('heading', { name: /Relatório por Loja/i })).toBeVisible({ timeout: 10000 });

    expect(errors).toEqual([]);
  });

  test('deve renderizar subcomponentes desacoplados (tabela desktop ou cards mobile + rota guiada + resumo)', async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await expect(page.locator('app-bill-footer-summary')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('app-bill-footer-summary').getByText(/Áreas Comuns/i).filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator('app-bill-footer-summary').getByText(/Valor SAP/i).filter({ visible: true }).first()).toBeVisible();

    if (!isMobile) {
      const desktopTable = page.locator('app-bill-desktop-table table');
      await expect(desktopTable).toBeVisible();
      await expect(desktopTable.getByRole('columnheader', { name: /Loja/i })).toBeVisible();
      await expect(desktopTable.getByRole('columnheader', { name: /Custo Total/i })).toBeVisible();

      // Testa evento @Output() toggleSort na tabela desacoplada
      await desktopTable.getByRole('columnheader', { name: /Loja/i }).click();
      await expect(desktopTable).toBeVisible();
      expect(errors).toEqual([]);
      return;
    }

    // --- MOBILE: Cards + Modo Rota Guiada ---
    const mobileCards = page.locator('app-bill-mobile-cards');
    await expect(mobileCards).toBeVisible();
    await expect(page.locator('app-bill-guided-route')).toHaveCount(0);

    // Aguarda cards carregarem (ou estado vazio caso o mês atual não tenha lojas)
    const firstCard = mobileCards.locator('[id^="store-card-"]').first();
    const hasCards = await firstCard.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);

    if (hasCards) {
      // Testa evento @Output() openNoteEditor num card mobile
      const noteBtn = firstCard.getByRole('button', { name: /observação|editar nota/i });
      await noteBtn.click();
      await expect(page.getByText(/Observação de Campo/i).filter({ visible: true }).first()).toBeVisible();
      // Fecha modal de nota
      await page.getByRole('button', { name: /cancelar|✕/i }).filter({ visible: true }).first().click();
    }

    // Alterna para Modo Rota Guiada (1 por vez)
    const guidedBtn = page.getByRole('button', { name: /Modo Rota Guiada/i }).filter({ visible: true }).first();
    await expect(guidedBtn).toBeVisible();
    await guidedBtn.click();

    await expect(page.locator('app-bill-mobile-cards')).toHaveCount(0);
    const guidedRoute = page.locator('app-bill-guided-route');
    await expect(guidedRoute).toBeVisible();

    if (hasCards) {
      await expect(guidedRoute.getByText(/Progresso da Rota:/i)).toBeVisible();
      const routeSelect = guidedRoute.locator('select').first();
      await expect(routeSelect).toBeVisible();

      // Verifica controles ergonômicos da rota guiada
      const plusOneBtn = guidedRoute.getByRole('button', { name: '+1', exact: true });
      await expect(plusOneBtn).toBeVisible();
      await expect(guidedRoute.getByRole('button', { name: /Mesma Leitura/i })).toBeVisible();
      await expect(guidedRoute.getByRole('button', { name: /Salvar e Próxima Loja/i })).toBeVisible();

      // Testa evento @Output() quickAdjustReading (+1)
      const readingInput = guidedRoute.locator('input[type="number"]').first();
      const beforeVal = Number(await readingInput.inputValue()) || 0;
      await plusOneBtn.click();
      await expect(readingInput).toHaveValue(String(beforeVal + 1));

      // Testa evento @Output() nextStep (Pular) se houver 2+ lojas na rota
      const optionCount = await routeSelect.locator('option').count();
      if (optionCount > 1) {
        const skipBtn = guidedRoute.getByRole('button', { name: /Pular/i });
        await skipBtn.click();
        await expect(guidedRoute.getByText(new RegExp(`Loja 2 de ${optionCount}`))).toBeVisible();

        const prevBtn = guidedRoute.getByRole('button', { name: /Anterior/i });
        await prevBtn.click();
        await expect(guidedRoute.getByText(new RegExp(`Loja 1 de ${optionCount}`))).toBeVisible();
      }
    }

    // Volta para Lista de Lojas (Cards) e confirma restauração limpa
    const listBtn = page.getByRole('button', { name: /Lista de Lojas/i }).filter({ visible: true }).first();
    await listBtn.click();
    await expect(page.locator('app-bill-guided-route')).toHaveCount(0);
    await expect(page.locator('app-bill-mobile-cards')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
