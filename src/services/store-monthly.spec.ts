import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoreService, generateUUID, normalizeLuc } from './store.service';
import { SupabaseService } from './supabase.service';

describe('StoreService - Monthly Store Isolation & Consultation', () => {
  let service: StoreService;
  let mockIndexedDb: any;
  let mockSupabase: any;
  const storeMap = new Map<string, string>();

  beforeEach(() => {
    storeMap.clear();

    const mockLocalStorage = {
      getItem: (key: string) => storeMap.get(key) ?? null,
      setItem: (key: string, val: string) => storeMap.set(key, String(val)),
      removeItem: (key: string) => storeMap.delete(key),
      clear: () => storeMap.clear(),
      get length() { return storeMap.size; },
      key: (i: number) => Array.from(storeMap.keys())[i] ?? null
    };
    (globalThis as any).localStorage = mockLocalStorage;

    mockIndexedDb = {
      saveStores: vi.fn().mockResolvedValue(undefined),
      saveMonthlyStoreLists: vi.fn().mockResolvedValue(undefined),
      deleteStore: vi.fn().mockResolvedValue(undefined),
    };

    mockSupabase = {
      subscribeToStores: vi.fn(),
      fetchStores: vi.fn().mockResolvedValue([]),
      syncStores: vi.fn().mockResolvedValue(true),
      syncMonthlyStoreLists: vi.fn().mockResolvedValue(true),
      deleteStore: vi.fn().mockResolvedValue(true),
      clearAllStores: vi.fn().mockResolvedValue(true),
    };

    service = new StoreService();
    (service as any).indexedDb = mockIndexedDb;
    (service as any).supabase = mockSupabase;
  });

  it('deve retornar vazio (em branco) para um mês que não teve lista mensal importada', () => {
    const stores = service.getStoresForMonth('luz', '2026-11');
    expect(stores).toEqual([]);
    expect(service.hasMonthlyList('luz', '2026-11')).toBe(false);
  });

  it('deve retornar apenas as lojas do mês quando uma lista mensal foi importada para ele', () => {
    const importItems = [
      { luc: 'L-101', contrato: '111', name: 'Loja A' },
      { luc: 'L-102', contrato: '222', name: 'Loja B' }
    ];

    service.processMonthlyStoreImport(importItems, 'luz', '2026-10', false);

    const storesOct = service.getStoresForMonth('luz', '2026-10');
    expect(storesOct.length).toBe(2);
    expect(storesOct.map(s => s.luc).sort()).toEqual(['L-101', 'L-102']);
    expect(service.hasMonthlyList('luz', '2026-10')).toBe(true);

    // Outro mês qualquer sem lista deve continuar vazio (em branco)
    const storesNov = service.getStoresForMonth('luz', '2026-11');
    expect(storesNov).toEqual([]);
    expect(service.hasMonthlyList('luz', '2026-11')).toBe(false);
  });

  it('deve listar os meses disponíveis em getAvailableMonths ordenados decrescentemente', () => {
    service.setMonthlyStoreList('luz', '2026-08', ['id-1']);
    service.setMonthlyStoreList('luz', '2026-10', ['id-2']);
    service.setMonthlyStoreList('luz', '2026-09', ['id-3']);

    const months = service.getAvailableMonths('luz');
    expect(months).toContain('2026-10');
    expect(months).toContain('2026-09');
    expect(months).toContain('2026-08');
    expect(months[0]).toBe('2026-10');
  });

  it('deve adicionar uma loja manual ao mês de consulta especificado', () => {
    service.addStore({
      luc: 'L-200',
      name: 'Loja Manual',
      contrato: '999',
      active: true,
      usesLuz: true,
      usesAgua: false,
      usesGas: false
    }, '2026-10');

    const storesOct = service.getStoresForMonth('luz', '2026-10');
    expect(storesOct.some(s => s.luc === 'L-200')).toBe(true);

    // Em 2026-11 ela não deve aparecer
    const storesNov = service.getStoresForMonth('luz', '2026-11');
    expect(storesNov.some(s => s.luc === 'L-200')).toBe(false);
  });

  it('deve remover a loja de todas as listas mensais ao excluir', async () => {
    service.addStore({
      luc: 'L-300',
      name: 'Loja Excluir',
      active: true,
      usesLuz: true,
      usesAgua: false,
      usesGas: false
    }, '2026-10');

    const store = service.getStoresForMonth('luz', '2026-10').find(s => s.luc === 'L-300');
    expect(store).toBeDefined();

    await service.removeStore(store!.id);

    const storesAfter = service.getStoresForMonth('luz', '2026-10');
    expect(storesAfter.some(s => s.id === store!.id)).toBe(false);
  });

  it('não deve apagar ou ocultar lojas do mês anterior (junho) ao subir o mês seguinte (julho) com lojas inativadas', () => {
    // 1. Em junho (2026-06), importamos 3 lojas para água
    const juneStores = [
      { luc: 'L-01', contrato: '101', name: 'Loja 1' },
      { luc: 'L-02', contrato: '102', name: 'Loja 2' },
      { luc: 'L-03', contrato: '103', name: 'Loja 3' }
    ];
    service.processMonthlyStoreImport(juneStores, 'agua', '2026-06', false);

    // Verifica que junho tem 3 lojas ativas
    const juneBeforeJuly = service.getStoresForMonth('agua', '2026-06', false);
    expect(juneBeforeJuly.length).toBe(3);

    // 2. Em julho (2026-07), importamos apenas 2 lojas e inativamos as ausentes (L-03 sai)
    const julyStores = [
      { luc: 'L-01', contrato: '101', name: 'Loja 1' },
      { luc: 'L-02', contrato: '102', name: 'Loja 2' }
    ];
    service.processMonthlyStoreImport(julyStores, 'agua', '2026-07', true);

    // 3. Em julho, devem aparecer apenas 2 lojas ativas
    const julyActive = service.getStoresForMonth('agua', '2026-07', false);
    expect(julyActive.length).toBe(2);
    expect(julyActive.some(s => s.luc === 'L-03')).toBe(false);

    // 4. CRUCIAL: Ao voltar para junho (2026-06), TODAS as 3 lojas de junho continuam ativas e visíveis!
    // A inativação em julho NUNCA pode apagar nem esconder lojas do mês anterior!
    const juneAfterJuly = service.getStoresForMonth('agua', '2026-06', false);
    expect(juneAfterJuly.length).toBe(3);
    const store3InJune = juneAfterJuly.find(s => s.luc === 'L-03');
    expect(store3InJune).toBeDefined();

    // 5. Um terceiro mês sem lista (2026-08) deve continuar em branco
    expect(service.getStoresForMonth('agua', '2026-08', false)).toEqual([]);
    expect(service.hasMonthlyList('agua', '2026-08')).toBe(false);
  });

  it('deve isolar as utilidades para que lista importada para água não polua luz ou gás', () => {
    service.processMonthlyStoreImport([
      { luc: 'A-01', contrato: '11', name: 'Água Loja' }
    ], 'agua', '2026-08', false);

    expect(service.hasMonthlyList('agua', '2026-08')).toBe(true);
    expect(service.getStoresForMonth('agua', '2026-08').length).toBe(1);

    // Luz e Gás não tiveram listas importadas para 2026-08 e devem estar vazios
    expect(service.hasMonthlyList('luz', '2026-08')).toBe(false);
    expect(service.getStoresForMonth('luz', '2026-08')).toEqual([]);
    expect(service.hasMonthlyList('gas', '2026-08')).toBe(false);
    expect(service.getStoresForMonth('gas', '2026-08')).toEqual([]);
  });

  it('inativar ausentes em uma utilidade (ex: gás) JAMAIS deve inativar ou quebrar lojas nas outras utilidades (luz ou água)', () => {
    // 1. Criamos uma loja que usa Luz e Gás
    service.addStore({
      luc: 'REST-01',
      name: 'Restaurante Fogo',
      contrato: 'CTR-77',
      active: true,
      usesLuz: true,
      usesAgua: false,
      usesGas: true
    }, '2026-09');

    // Verifica que ela está na lista de Luz e de Gás em 2026-09
    service.setMonthlyStoreList('luz', '2026-09', service.stores().filter(s => s.usesLuz).map(s => s.id));
    service.setMonthlyStoreList('gas', '2026-09', service.stores().filter(s => s.usesGas).map(s => s.id));

    expect(service.getStoresForMonth('luz', '2026-09', false).some(s => s.luc === 'REST-01')).toBe(true);
    expect(service.getStoresForMonth('gas', '2026-09', false).some(s => s.luc === 'REST-01')).toBe(true);

    // 2. Agora, importamos a lista de Gás para 2026-10 SEM o Restaurante Fogo e marcando inactivateMissing = true
    service.processMonthlyStoreImport([
      { luc: 'REST-02', contrato: 'CTR-88', name: 'Outro Restaurante' }
    ], 'gas', '2026-10', true);

    // 3. Em Gás (2026-10), REST-01 não está presente
    expect(service.getStoresForMonth('gas', '2026-10', false).some(s => s.luc === 'REST-01')).toBe(false);

    // 4. CRUCIAL: Em Luz (2026-09), REST-01 CONTINUA 100% ATIVO!
    // A inativação em Gás JAMAIS desativa a loja globalmente quando ela ainda utiliza Luz!
    const luzStores = service.getStoresForMonth('luz', '2026-09', false);
    const storeInLuz = luzStores.find(s => s.luc === 'REST-01');
    expect(storeInLuz).toBeDefined();
    expect(storeInLuz!.active).toBe(true);
    expect(storeInLuz!.usesLuz).toBe(true);
  });

  it('deve excluir todas as lojas APENAS daquele tipo e mês específico ao chamar clearMonthlyStoreList', () => {
    // 1. Cadastra lojas para Luz em Outubro/2026, Luz em Setembro/2026 e Água em Outubro/2026
    service.processMonthlyStoreImport([
      { luc: 'L-101', contrato: '111', name: 'Loja Energia 1' },
      { luc: 'L-102', contrato: '222', name: 'Loja Energia 2' }
    ], 'luz', '2026-10', false);

    service.processMonthlyStoreImport([
      { luc: 'L-101', contrato: '111', name: 'Loja Energia 1' }
    ], 'luz', '2026-09', false);

    service.processMonthlyStoreImport([
      { luc: 'A-201', contrato: '333', name: 'Loja Água 1' }
    ], 'agua', '2026-10', false);

    // Validações prévias
    expect(service.getStoresForMonth('luz', '2026-10').length).toBe(2);
    expect(service.hasMonthlyList('luz', '2026-10')).toBe(true);
    expect(service.getStoresForMonth('luz', '2026-09').length).toBe(1);
    expect(service.getStoresForMonth('agua', '2026-10').length).toBe(1);

    // 2. Apaga lojas APENAS de Outubro/2026 de Energia (Luz)
    service.clearMonthlyStoreList('luz', '2026-10');

    // 3. Outubro/2026 Energia deve estar completamente limpo (0 lojas, hasMonthlyList = false)
    expect(service.getStoresForMonth('luz', '2026-10')).toEqual([]);
    expect(service.hasMonthlyList('luz', '2026-10')).toBe(false);

    // 4. Outro mês de Energia (Setembro/2026) continua INTACTO!
    expect(service.getStoresForMonth('luz', '2026-09').length).toBe(1);
    expect(service.hasMonthlyList('luz', '2026-09')).toBe(true);

    // 5. Outra utilidade no mesmo mês (Água em Outubro/2026) continua INTACTA!
    expect(service.getStoresForMonth('agua', '2026-10').length).toBe(1);
    expect(service.hasMonthlyList('agua', '2026-10')).toBe(true);

    // 6. O Catálogo Geral de lojas continua INTACTO (as lojas não são deletadas do sistema global)
    expect(service.stores().length).toBeGreaterThanOrEqual(3);
  });

  it('deve manter a mesma loja mesmo se as colunas vierem invertidas (LUC, Nome, Contrato) ou com zeros à esquerda', () => {
    // 1. Cadastra Zara com contrato 010423
    service.processMonthlyStoreImport([
      { luc: 'L-101', contrato: '010423', name: 'Zara Moda' }
    ], 'luz', '2026-10', false);

    const octStores = service.getStoresForMonth('luz', '2026-10');
    const octId = octStores[0].id;

    // 2. No mês seguinte, o lojista importa com colunas trocadas (Nome no Contrato, Contrato no Nome) e sem zeros
    const result = service.processMonthlyStoreImport([
      { luc: '101', contrato: 'Zara Moda', name: '10423' }
    ], 'luz', '2026-11', false);

    expect(result.maintainedCount).toBe(1);
    expect(result.replacements.length).toBe(0);

    const novStores = service.getStoresForMonth('luz', '2026-11');
    expect(novStores.length).toBe(1);
    // Preservou o ID original!
    expect(novStores[0].id).toBe(octId);
    expect(novStores[0].name).toBe('Zara Moda');
  });

  it('deve desativar e reativar loja pontualmente no mês com toggleStoreActive preservando o histórico anterior', () => {
    // 1. Cadastra 2 lojas em Outubro/2026
    service.processMonthlyStoreImport([
      { luc: 'L-101', contrato: '101', name: 'Loja A' },
      { luc: 'L-102', contrato: '102', name: 'Loja B' }
    ], 'agua', '2026-10', false);

    // 2. Importa as 2 lojas em Novembro/2026
    service.processMonthlyStoreImport([
      { luc: 'L-101', contrato: '101', name: 'Loja A' },
      { luc: 'L-102', contrato: '102', name: 'Loja B' }
    ], 'agua', '2026-11', false);

    const novStoresBefore = service.getStoresForMonth('agua', '2026-11', false);
    expect(novStoresBefore.length).toBe(2);

    const storeB = novStoresBefore.find(s => s.luc === 'L-102')!;
    expect(storeB).toBeDefined();

    // 3. Usuário inativa Loja B no mês de Novembro/2026
    service.toggleStoreActive(storeB.id, '2026-11', 'Fechamento temporário');

    // 4. Em Novembro/2026, Loja B não deve aparecer nas lojas ativas
    const novActive = service.getStoresForMonth('agua', '2026-11', false);
    expect(novActive.length).toBe(1);
    expect(novActive.some(s => s.id === storeB.id)).toBe(false);

    // 5. CRUCIAL: Em Outubro/2026, Loja B continua 100% ativa (histórico intacto!)
    const octActive = service.getStoresForMonth('agua', '2026-10', false);
    expect(octActive.length).toBe(2);
    expect(octActive.some(s => s.id === storeB.id)).toBe(true);

    // 6. Usuário reativa Loja B no mês de Novembro/2026
    service.toggleStoreActive(storeB.id, '2026-11');

    // 7. Loja B volta a aparecer como ativa em Novembro/2026
    const novActiveReactivated = service.getStoresForMonth('agua', '2026-11', false);
    expect(novActiveReactivated.length).toBe(2);
    expect(novActiveReactivated.some(s => s.id === storeB.id)).toBe(true);
  });

  it('deve ocultar lojas para o Técnico (hiddenFromTech) sem excluir/inativar e preservar na reimportação SAP do mês seguinte', () => {
    service.processMonthlyStoreImport([
      { luc: '1001', contrato: 'C1', name: 'Loja Normal' },
      { luc: 'DEP01', contrato: 'C2', name: 'DEPÓSITO KFC' },
      { luc: 'DEP02', contrato: 'C3', name: 'DEPÓSITO PANVEL' }
    ], 'luz', '2026-10', false);

    const octStores = service.getStoresForMonth('luz', '2026-10', false);
    const dep1 = octStores.find(s => s.luc === 'DEP01')!;
    const dep2 = octStores.find(s => s.luc === 'DEP02')!;

    // Oculta DEP01 individualmente e DEP02 em lote
    service.toggleHiddenFromTech(dep1.id);
    service.setHiddenFromTechBatch([dep2.id], true);

    const afterHide = service.getStoresForMonth('luz', '2026-10', false);
    expect(afterHide.length).toBe(3); // Todas continuam ativas no rateio/SAP!
    expect(afterHide.find(s => s.luc === '1001')?.hiddenFromTech).toBeFalsy();
    expect(afterHide.find(s => s.luc === 'DEP01')?.hiddenFromTech).toBe(true);
    expect(afterHide.find(s => s.luc === 'DEP02')?.hiddenFromTech).toBe(true);

    // Reimporta planilha SAP no mês seguinte (Novembro/2026)
    service.processMonthlyStoreImport([
      { luc: '1001', contrato: 'C1', name: 'Loja Normal' },
      { luc: 'DEP01', contrato: 'C2', name: 'DEPÓSITO KFC' },
      { luc: 'DEP02', contrato: 'C3', name: 'DEPÓSITO PANVEL' }
    ], 'luz', '2026-11', false);

    const novStores = service.getStoresForMonth('luz', '2026-11', false);
    expect(novStores.length).toBe(3);
    expect(novStores.find(s => s.luc === 'DEP01')?.hiddenFromTech).toBe(true);
    expect(novStores.find(s => s.luc === 'DEP02')?.hiddenFromTech).toBe(true);
    expect(novStores.find(s => s.luc === '1001')?.hiddenFromTech).toBeFalsy();
  });

  it('generateUUID deve gerar identificador único válido com ou sem suporte nativo', () => {
    const id1 = generateUUID();
    const id2 = generateUUID();
    expect(typeof id1).toBe('string');
    expect(id1.length).toBeGreaterThan(5);
    expect(id1).not.toBe(id2);
  });

  it('normalizeLuc deve remover acentos para evitar duplicidade entre DEPÓSITO/DEPOSITO e PRAÇA/PRACA', () => {
    expect(normalizeLuc('DEPÓSITO 12A')).toBe('deposito12a');
    expect(normalizeLuc('DEPOSITO 12A')).toBe('deposito12a');
    expect(normalizeLuc('PRAÇA/CENTRAL')).toBe('pracacentral');
    expect(normalizeLuc('PRACA/CENTRAL')).toBe('pracacentral');

    service.processMonthlyStoreImport([
      { luc: 'DEPÓSITO 12A', contrato: '50001591', name: 'DEPÓSITO RI HAPPY' }
    ], 'luz', '2026-10', false);
    const id1 = service.getStoresForMonth('luz', '2026-10')[0].id;

    const res = service.processMonthlyStoreImport([
      { luc: 'DEPOSITO 12A', contrato: '50001591', name: 'DEPOSITO RI HAPPY' }
    ], 'luz', '2026-11', false);

    expect(res.maintainedCount).toBe(1);
    expect(res.newCount).toBe(0);
    expect(service.getStoresForMonth('luz', '2026-11')[0].id).toBe(id1);
  });

  it('deve preservar C&A (2120 | C&A | 0000020000561) mesmo se contrato/nome vierem invertidos e manter luz_2026-12 intacta', () => {
    service.processMonthlyStoreImport([
      { luc: '2120', contrato: '0000020000561', name: 'C&A' }
    ], 'luz', '2026-12', false);

    const luzId = service.getStoresForMonth('luz', '2026-12')[0].id;

    // Simula importação em Água 2026-12 com nome/contrato invertidos
    const res = service.processMonthlyStoreImport([
      { luc: '2120', contrato: 'C&A', name: '0000020000561' }
    ], 'agua', '2026-12', false);

    expect(res.maintainedCount).toBe(1);
    expect(res.replacements).toHaveLength(0);
    const caAgua = service.getStoresForMonth('agua', '2026-12', false)[0];
    expect(caAgua.id).toBe(luzId);
    expect(caAgua.name).toBe('C&A');
    expect(caAgua.contrato).toBe('0000020000561');
    expect(caAgua.active).toBe(true);
    expect(service.getStoresForMonth('luz', '2026-12', false)).toHaveLength(1);
  });

  it('deve suportar múltiplos eventos/contratos simultâneos no mesmo LUC (MULTIPLAN HALL) sem descarte nem clones', () => {
    // Mês 1: dois eventos diferentes no mesmo LUC na mesma planilha
    const res1 = service.processMonthlyStoreImport([
      { luc: 'MULTIPLAN HALL', contrato: '50001539', name: 'JIU-JITSU CHAMPIONSHIP' },
      { luc: 'MULTIPLAN HALL', contrato: '50001540', name: 'CAFESTIVAL - 4ª EDIÇÃO' }
    ], 'luz', '2026-10', false);

    expect(res1.newCount).toBe(2);
    expect(res1.replacements).toHaveLength(0);
    expect(service.getStoresForMonth('luz', '2026-10', false)).toHaveLength(2);

    // Mês 2: reimportação dos mesmos 2 eventos em ordem invertida -> mantém ambos sem substituir nem clonar
    const res2 = service.processMonthlyStoreImport([
      { luc: 'MULTIPLAN HALL', contrato: '50001540', name: 'CAFESTIVAL - 4ª EDIÇÃO' },
      { luc: 'MULTIPLAN HALL', contrato: '50001539', name: 'JIU-JITSU CHAMPIONSHIP' }
    ], 'luz', '2026-11', true);

    expect(res2.maintainedCount).toBe(2);
    expect(res2.replacements).toHaveLength(0);
    expect(service.stores()).toHaveLength(2);
    expect(service.getStoresForMonth('luz', '2026-11', false)).toHaveLength(2);
  });

  it('deve reativar contrato antigo no mesmo LUC reutilizando o ID existente sem criar clones', () => {
    service.processMonthlyStoreImport([
      { luc: 'MULTIPLAN HALL', contrato: '50001539', name: 'JIU-JITSU CHAMPIONSHIP' }
    ], 'luz', '2026-10', false);
    const jiuId = service.stores()[0].id;

    // Em novembro entra CAFESTIVAL (substitui JIU-JITSU)
    service.processMonthlyStoreImport([
      { luc: 'MULTIPLAN HALL', contrato: '50001540', name: 'CAFESTIVAL - 4ª EDIÇÃO' }
    ], 'luz', '2026-11', true);

    // Em dezembro volta JIU-JITSU -> deve reutilizar jiuId sem criar um 3º registro
    const resDec = service.processMonthlyStoreImport([
      { luc: 'MULTIPLAN HALL', contrato: '50001539', name: 'JIU-JITSU CHAMPIONSHIP' }
    ], 'luz', '2026-12', true);

    expect(resDec.replacements).toHaveLength(1);
    expect(service.stores()).toHaveLength(2);
    const decActive = service.getStoresForMonth('luz', '2026-12', false);
    expect(decActive).toHaveLength(1);
    expect(decActive[0].id).toBe(jiuId);
  });

  it('previewMonthlyStoreImport em mês em branco deve refletir exatamente processMonthlyStoreImport', () => {
    service.processMonthlyStoreImport([
      { luc: '101', contrato: '111', name: 'Loja Antiga' },
      { luc: '102', contrato: '222', name: 'Loja Mantida' }
    ], 'agua', '2026-10', false);

    // Mês 2026-11 está em branco, mas catálogo já possui 101 e 102
    const novItems = [
      { luc: '101', contrato: '999', name: 'Loja Nova Substituta' },
      { luc: '102', contrato: '000222', name: 'Loja Mantida' },
      { luc: '103', contrato: '333', name: 'Loja Inédita' }
    ];

    const preview = service.previewMonthlyStoreImport(novItems, 'agua', '2026-11', true);
    expect(preview.replacements).toHaveLength(1);
    expect(preview.maintained).toHaveLength(1);
    expect(preview.brandNew).toHaveLength(1);
    expect(preview.rowActions).toEqual(['replacement', 'maintained', 'new']);

    const result = service.processMonthlyStoreImport(novItems, 'agua', '2026-11', true);
    expect(result.replacements).toHaveLength(1);
    expect(result.maintainedCount).toBe(1);
    expect(result.newCount).toBe(1);
  });

  it('substituição em água no mês 2026-12 deve manter Luz e Gás 100% independentes (sem inativar nem alterar luz_2026-12)', () => {
    service.addStore({
      luc: '1050',
      contrato: '100',
      name: 'Inquilino Antigo',
      active: true,
      usesLuz: true,
      usesAgua: true,
      usesGas: false
    }, '2026-11');

    const oldId = service.stores()[0].id;
    service.setMonthlyStoreList('luz', '2026-12', [oldId]);

    // Substituição no LUC 1050 via Água em 2026-12
    const res = service.processMonthlyStoreImport([
      { luc: '1050', contrato: '200', name: 'Inquilino Novo' }
    ], 'agua', '2026-12', false);

    expect(res.replacements).toHaveLength(1);

    // Água 2026-11 preserva Inquilino Antigo; Água 2026-12 recebe Inquilino Novo (somente usesAgua!)
    expect(service.getStoresForMonth('agua', '2026-11', false)[0].id).toBe(oldId);
    const decAgua = service.getStoresForMonth('agua', '2026-12', false);
    expect(decAgua).toHaveLength(1);
    expect(decAgua[0].name).toBe('Inquilino Novo');
    expect(decAgua[0].usesAgua).toBe(true);
    expect(decAgua[0].usesLuz).toBe(false);
    expect(decAgua[0].usesGas).toBe(false);

    // CRUCIAL: Luz 2026-11 e Luz 2026-12 permanecem 100% INTACTAS com Inquilino Antigo ativo!
    const novLuz = service.getStoresForMonth('luz', '2026-11', false);
    const decLuz = service.getStoresForMonth('luz', '2026-12', false);
    expect(novLuz).toHaveLength(1);
    expect(novLuz[0].id).toBe(oldId);
    expect(decLuz).toHaveLength(1);
    expect(decLuz[0].id).toBe(oldId);
    expect(decLuz[0].active).toBe(true);
  });

  it('subir lista de Água com contrato diferente no mesmo LUC jamais deve substituir ou inativar loja exclusiva de Luz', () => {
    service.processMonthlyStoreImport([
      { luc: '2038', contrato: '20000543', name: 'HOPE' }
    ], 'luz', '2026-12', false);

    const hopeId = service.getStoresForMonth('luz', '2026-12', false)[0].id;

    // Água sobe outro lojista no LUC 2038 (HOPE só usa Luz!)
    const resAgua = service.processMonthlyStoreImport([
      { luc: '2038', contrato: '20000717', name: 'AZUL VIAGENS' }
    ], 'agua', '2026-12', true);

    expect(resAgua.replacements).toHaveLength(0);
    expect(resAgua.newCount).toBe(1);

    // HOPE continua 100% ativa em Luz!
    const luzDec = service.getStoresForMonth('luz', '2026-12', false);
    expect(luzDec).toHaveLength(1);
    expect(luzDec[0].id).toBe(hopeId);
    expect(luzDec[0].active).toBe(true);

    // AZUL VIAGENS existe somente em Água!
    const aguaDec = service.getStoresForMonth('agua', '2026-12', false);
    expect(aguaDec).toHaveLength(1);
    expect(aguaDec[0].name).toBe('AZUL VIAGENS');
    expect(aguaDec[0].usesLuz).toBe(false);
    expect(aguaDec[0].usesAgua).toBe(true);
    expect(aguaDec[0].usesGas).toBe(false);
  });

  it('unlinkStoreFromUtility deve remover a loja apenas da utilidade selecionada sem afetar Luz/Água', () => {
    service.addStore({
      luc: '1093',
      contrato: '20000712',
      name: 'BURGER KING',
      active: true,
      usesLuz: true,
      usesAgua: true,
      usesGas: true
    }, '2026-11');

    const bkId = service.stores()[0].id;
    service.unlinkStoreFromUtility(bkId, 'gas', '2026-11');

    expect(service.getStoresForMonth('gas', '2026-11', false)).toHaveLength(0);
    expect(service.getStoresForMonth('luz', '2026-11', false)).toHaveLength(1);
    expect(service.getStoresForMonth('agua', '2026-11', false)).toHaveLength(1);
    expect(service.stores()[0].usesGas).toBe(false);
    expect(service.stores()[0].usesLuz).toBe(true);
    expect(service.stores()[0].usesAgua).toBe(true);
  });

  it('importação retroativa com inactivateMissing=true não deve inativar lojas presentes em meses futuros', () => {
    service.processMonthlyStoreImport([
      { luc: '101', contrato: '111', name: 'Loja Existente' },
      { luc: '102', contrato: '222', name: 'Loja Futura' }
    ], 'luz', '2026-12', false);

    // Reimporta outubro apenas com a Loja 101 e inactivateMissing=true
    service.processMonthlyStoreImport([
      { luc: '101', contrato: '111', name: 'Loja Existente' }
    ], 'luz', '2026-10', true);

    // Loja 102 continua ativa em dezembro!
    const decStores = service.getStoresForMonth('luz', '2026-12', false);
    expect(decStores.map(s => s.luc).sort()).toEqual(['101', '102']);
    expect(service.stores().find(s => s.luc === '102')?.active).toBe(true);
  });

  it('clearAllStores deve limpar também as listas mensais no Supabase', async () => {
    service.processMonthlyStoreImport([
      { luc: '101', contrato: '111', name: 'Loja A' }
    ], 'luz', '2026-10', false);

    await service.clearAllStores();
    expect(service.stores()).toEqual([]);
    expect(service.monthlyStoreLists()).toEqual({});
    expect(mockSupabase.clearAllStores).toHaveBeenCalledTimes(1);
    expect(mockSupabase.syncMonthlyStoreLists).toHaveBeenCalledWith({});
  });

  it('SupabaseService.fetchAllBills deve ignorar registros config (__monthly_store_lists_v1__, __system_ai_keys__, etc.)', async () => {
    const supa = Object.create(SupabaseService.prototype) as SupabaseService;
    (supa as any).isTableReady = { set: vi.fn() };
    (supa as any).getClient = () => ({
      from: () => ({
        select: () => ({
          range: vi.fn().mockResolvedValue({
            data: [
              { id: 'agua_2026-11', type: 'agua', month: '2026-11', data: { costItems: [], consumptionInput: 100, acInput: 0, readings: {}, lastUpdated: '' } },
              { id: '__monthly_store_lists_v1__', type: 'config', month: 'global', data: { lists: {} } },
              { id: '__system_ai_keys__', type: 'config', month: 'global', data: { geminiKey: 'x' } },
              { id: '__ocr_feedbacks_v1__', type: 'config', month: 'global', data: { entries: [] } }
            ],
            error: null
          })
        })
      })
    });

    const bills = await supa.fetchAllBills();
    expect(bills).not.toBeNull();
    expect(Object.keys(bills!)).toEqual(['agua_2026-11']);
  });
});

