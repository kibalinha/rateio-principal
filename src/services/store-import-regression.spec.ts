import { describe, it, expect, beforeEach } from 'vitest';
import { StoreService, isStoreActiveInMonth } from './src/services/store.service';
import { HistoryService } from './src/services/history.service';
import { Store } from './src/models';

describe('Regression: November previous month values and store import matching', () => {
  let storeService: StoreService;
  let historyService: HistoryService;
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

    mockLocalStorage.setItem('shop_rateio_clean_slate_20261007_v1', 'done');

    storeService = new StoreService();
    (storeService as any).indexedDb = {
      saveStores: async () => {},
      deleteStore: async () => {},
      saveMonthlyStoreLists: () => {}
    };
    (storeService as any).supabase = {
      subscribeToStores: () => {},
      fetchStores: async () => [],
      syncStores: async () => true,
    };

    historyService = new HistoryService();
    (historyService as any).indexedDb = {
      clientSessionId: 'test-session',
      saveBill: async () => {}
    };
    (historyService as any).supabase = {
      subscribeToBills: () => {},
      fetchAllBills: async () => null,
      syncBill: async () => true
    };
  });

  it('Scenario 1: isStoreActiveInMonth returns true when store is explicitly in monthly list even if deactivatedAt is present', () => {
    const store: Store = {
      id: 'store-1',
      luc: '101',
      contrato: '10423',
      name: 'Zara',
      active: false,
      deactivatedAt: '2026-11',
      usesLuz: true,
      usesAgua: true,
      usesGas: false
    };

    const activeInNov = isStoreActiveInMonth(store, '2026-11', true);
    expect(activeInNov).toBe(true);
  });

  it('Scenario 2: In October stores had contrato, but in Nov sheet has no contrato or different columns', () => {
    // 1. October stores (e.g. from existing system or previous import)
    const octStores = [
      { luc: '101', contrato: '10423', name: 'Zara Moda' },
      { luc: '104', contrato: '10428', name: 'Burger King' }
    ];
    storeService.processMonthlyStoreImport(octStores, 'luz', '2026-10', false);

    const activeOct = storeService.getStoresForMonth('luz', '2026-10', false);
    const zaraOctId = activeOct.find(s => s.luc === '101')!.id;
    const bkOctId = activeOct.find(s => s.luc === '104')!.id;

    historyService.saveBill('luz', '2026-10', {
      costItems: [{ description: 'Conta de Luz', value: 1000 }],
      consumptionInput: { bss1: 500, bss2: 0, bss3: 0, bss4: 0 },
      acInput: 0,
      readings: {
        [zaraOctId]: { reading: 1500, calculatedConsumption: 100, cost: 200 },
        [bkOctId]: { reading: 3200, calculatedConsumption: 250, cost: 500 }
      },
      lastUpdated: '2026-10-31T20:00:00.000Z'
    });

    // 2. In November, user imports sheet with 2 columns (LUC and Nome) or empty contrato
    const novStores = [
      { luc: '101', contrato: '', name: 'Zara Moda' },
      { luc: '104', contrato: '', name: 'Burger King' }
    ];
    const importRes = storeService.processMonthlyStoreImport(novStores, 'luz', '2026-11', false);
    console.log('Nov import without contract result:', importRes);

    const activeNov = storeService.getStoresForMonth('luz', '2026-11', false);
    const prevReadings = historyService.getLastValidReadings('luz', '2026-11');

    activeNov.forEach(store => {
      const prev = prevReadings.get(store.id);
      expect(prev).toBeDefined();
      expect(prev?.reading).toBeGreaterThan(0);
      expect(prev?.month).toBe('2026-10');
    });
  });

  it('Scenario 3: What if contrato was empty in October, but has contrato in November?', () => {
    const octStores = [
      { luc: '101', contrato: '', name: 'Zara Moda' },
      { luc: '104', contrato: '', name: 'Burger King' }
    ];
    storeService.processMonthlyStoreImport(octStores, 'luz', '2026-10', false);

    const activeOct = storeService.getStoresForMonth('luz', '2026-10', false);
    const zaraOctId = activeOct.find(s => s.luc === '101')!.id;

    historyService.saveBill('luz', '2026-10', {
      costItems: [],
      consumptionInput: 0,
      acInput: 0,
      readings: { [zaraOctId]: { reading: 1500, calculatedConsumption: 100, cost: 200 } },
      lastUpdated: '2026-10-31T20:00:00.000Z'
    });

    const novStores = [
      { luc: '101', contrato: '10423', name: 'Zara Moda' }
    ];
    const importRes = storeService.processMonthlyStoreImport(novStores, 'luz', '2026-11', false);
    expect(importRes.maintainedCount).toBe(1);

    const activeNov = storeService.getStoresForMonth('luz', '2026-11', false);
    const prevReadings = historyService.getLastValidReadings('luz', '2026-11');

    const novZara = activeNov.find(s => s.luc === '101')!;
    const prev = prevReadings.get(novZara.id);
    expect(prev).toBeDefined();
    expect(prev?.reading).toBe(1500);
    expect(prev?.consumption).toBe(100);
    expect(prev?.month).toBe('2026-10');
  });

  it('Scenario 4: What if name has a slight variation (e.g. "Zara" vs "Zara Moda" or trailing space) when contrato is empty?', () => {
    const octStores = [
      { luc: '101', contrato: '', name: 'Zara Moda' }
    ];
    storeService.processMonthlyStoreImport(octStores, 'luz', '2026-10', false);
    const activeOct = storeService.getStoresForMonth('luz', '2026-10', false);
    const zaraOctId = activeOct.find(s => s.luc === '101')!.id;

    historyService.saveBill('luz', '2026-10', {
      costItems: [],
      consumptionInput: 0,
      acInput: 0,
      readings: { [zaraOctId]: { reading: 1500, calculatedConsumption: 100, cost: 200 } },
      lastUpdated: '2026-10-31T20:00:00.000Z'
    });

    const novStores = [
      { luc: '101', contrato: '', name: 'Zara Moda LTDA' }
    ];
    const importRes = storeService.processMonthlyStoreImport(novStores, 'luz', '2026-11', false);
    expect(importRes.maintainedCount).toBe(1);

    const activeNov = storeService.getStoresForMonth('luz', '2026-11', false);
    const prevReadings = historyService.getLastValidReadings('luz', '2026-11');
    const novZara = activeNov.find(s => s.luc === '101')!;
    const prev = prevReadings.get(novZara.id);
    expect(prev).toBeDefined();
    expect(prev?.reading).toBe(1500);
    expect(prev?.consumption).toBe(100);
    expect(prev?.month).toBe('2026-10');
  });

  it('Scenario 5: Even if a store had its ID changed in the past, previous reading is recovered by LUC fallback', () => {
    // Oct store with ID-1
    const octStore = { id: 'old-zara-id', luc: '101', contrato: '10423', name: 'Zara Moda', active: false, deactivatedAt: '2026-11', usesLuz: true };
    // Nov store with ID-2
    const novStore = { id: 'new-zara-id', luc: '101', contrato: '10423', name: 'Zara Moda', active: true, usesLuz: true };

    storeMap.set('shop_rateio_stores_data', JSON.stringify([octStore, novStore]));

    historyService.saveBill('luz', '2026-10', {
      costItems: [],
      consumptionInput: 0,
      acInput: 0,
      readings: {
        ['old-zara-id']: { reading: 1850, calculatedConsumption: 120, cost: 240 }
      },
      lastUpdated: '2026-10-31T20:00:00.000Z'
    });

    const prevReadings = historyService.getLastValidReadings('luz', '2026-11');

    // Look up with new ID
    const prevForNewId = prevReadings.get('new-zara-id');
    expect(prevForNewId).toBeDefined();
    expect(prevForNewId?.reading).toBe(1850);
    expect(prevForNewId?.consumption).toBe(120);
    expect(prevForNewId?.cost).toBe(240);
    expect(prevForNewId?.month).toBe('2026-10');

    // Also available via luc: key
    const prevByLuc = prevReadings.get('luc:101');
    expect(prevByLuc).toBeDefined();
    expect(prevByLuc?.reading).toBe(1850);
  });
});
