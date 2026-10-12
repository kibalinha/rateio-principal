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
});
