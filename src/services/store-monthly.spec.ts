import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoreService } from './store.service';

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
      deleteStore: vi.fn().mockResolvedValue(undefined),
    };

    mockSupabase = {
      subscribeToStores: vi.fn(),
      fetchStores: vi.fn().mockResolvedValue([]),
      syncStores: vi.fn().mockResolvedValue(true),
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
});
