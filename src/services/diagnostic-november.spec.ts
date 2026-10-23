import { describe, it, expect, beforeEach } from 'vitest';
import { StoreService, normalizeLuc } from './store.service';
import { HistoryService } from './history.service';

describe('Diagnostic: November vs October in Água', () => {
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
    (historyService as any).storeService = storeService;
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

  it('Diagnostic Test 1: Água October to November with identical LUC, contract, and name', () => {
    // 1. October: user imports stores for Água
    const octStores = [
      { luc: 'L-101', contrato: '10423', name: 'Zara Moda' },
      { luc: 'L-104', contrato: '10428', name: 'Burger King' },
      { luc: 'Q-015', contrato: '30118', name: 'Kopenhagen' }
    ];
    storeService.processMonthlyStoreImport(octStores, 'agua', '2026-10', false);

    const activeOct = storeService.getStoresForMonth('agua', '2026-10', false);
    expect(activeOct.length).toBe(3);

    const zaraOct = activeOct.find(s => s.luc === 'L-101')!;
    const bkOct = activeOct.find(s => s.luc === 'L-104')!;
    const kopOct = activeOct.find(s => s.luc === 'Q-015')!;

    // Save October bill for Água
    historyService.saveBill('agua', '2026-10', {
      costItems: [{ description: 'Conta de Água', value: 3000 }],
      consumptionInput: 150,
      acInput: 0,
      readings: {
        [zaraOct.id]: { reading: 120, calculatedConsumption: 25, cost: 500 },
        [bkOct.id]: { reading: 350, calculatedConsumption: 60, cost: 1200 },
        [kopOct.id]: { reading: 85, calculatedConsumption: 15, cost: 300 }
      },
      lastUpdated: '2026-10-31T20:00:00.000Z'
    });

    // 2. November: user places stores for month 11 in Água (identical luc, contrato, name)
    const novStores = [
      { luc: 'L-101', contrato: '10423', name: 'Zara Moda' },
      { luc: 'L-104', contrato: '10428', name: 'Burger King' },
      { luc: 'Q-015', contrato: '30118', name: 'Kopenhagen' }
    ];
    const importRes = storeService.processMonthlyStoreImport(novStores, 'agua', '2026-11', false);
    expect(importRes.maintainedCount).toBe(3);

    const activeNov = storeService.getStoresForMonth('agua', '2026-11', false);
    expect(activeNov.length).toBe(3);

    const prevReadings = historyService.getLastValidReadings('agua', '2026-11');

    activeNov.forEach(store => {
      const prev = prevReadings.get(store.id);
      expect(prev).toBeDefined();
      expect(prev?.reading).toBeGreaterThan(0);
      expect(prev?.consumption).toBeGreaterThan(0);
      expect(prev?.month).toBe('2026-10');
    });
  });

  it('Diagnostic Test 2: If store ID changed, does tableData normLuc match historyService luc: key?', () => {
    // History saved with old store ID:
    const oldId = 'old-store-uuid-oct';
    historyService.saveBill('agua', '2026-10', {
      costItems: [],
      consumptionInput: 0,
      acInput: 0,
      readings: {
        [oldId]: { reading: 250, calculatedConsumption: 30, cost: 600 }
      },
      lastUpdated: '2026-10-31T20:00:00.000Z'
    });

    // In November, active store in table has a new ID and luc is "L-101"
    const newStore = { id: 'new-store-uuid-nov', luc: 'L-101', contrato: '10423', name: 'Zara Moda', active: true, usesAgua: true };
    // And in storeService.stores:
    (storeService as any).storesSignal.set([
      { id: oldId, luc: 'L-101', contrato: '10423', name: 'Zara Moda', active: false, usesAgua: true },
      newStore
    ]);

    const prevReadings = historyService.getLastValidReadings('agua', '2026-11');
    console.log('Test 2 prevReadings keys:', Array.from(prevReadings.keys()));

    // Old lookup in bill-calculator line 4104:
    const oldNormLuc = newStore.luc ? newStore.luc.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
    console.log('Old bill-calculator normLuc:', oldNormLuc); // 'l101'
    const matchWithOld = prevReadings.get(`luc:${oldNormLuc}`);
    console.log('Match with old normLuc (luc:l101):', matchWithOld); // undefined!

    // New lookup with normalizeLuc:
    const correctNormLuc = normalizeLuc(newStore.luc);
    console.log('Correct normalizeLuc:', correctNormLuc); // '101'
    const matchWithCorrect = prevReadings.get(`luc:${correctNormLuc}`);
    console.log('Match with correct normLuc (luc:101):', matchWithCorrect);

    expect(matchWithOld).toBeUndefined(); // FAILS WITH OLD CODE!
    expect(matchWithCorrect).toBeDefined(); // SUCCEEDS WITH normalizeLuc!
  });

  it('Diagnostic Test 3: What if October bill was saved, but the store was NOT in storesSignal at all when reading?', () => {
    // Suppose in October, bill was saved with store ID 'store-oct-1', but this store was subsequently removed or replaced:
    const oldOctId = 'store-oct-1';
    historyService.saveBill('agua', '2026-10', {
      costItems: [],
      consumptionInput: 0,
      acInput: 0,
      readings: {
        [oldOctId]: { reading: 180, calculatedConsumption: 20, cost: 400 }
      },
      lastUpdated: '2026-10-31T20:00:00.000Z'
    });

    // In November, storesSignal ONLY has the new store!
    const novStore = { id: 'store-nov-1', luc: 'L-101', contrato: '10423', name: 'Zara Moda', active: true, usesAgua: true };
    (storeService as any).storesSignal.set([novStore]);

    const prevReadings = historyService.getLastValidReadings('agua', '2026-11');
    console.log('Test 3 prevReadings keys:', Array.from(prevReadings.keys()));
    const prevForNov = prevReadings.get('store-nov-1');
    console.log('Test 3 prev for novStore:', prevForNov);
  });

  it('Diagnostic Test 4: Previous Month Continuity Audit correctly identifies forgotten stores', () => {
    // Simulated tableData items in November
    const mockTableData = [
      // Store A: had reading in October, read in November (complete)
      {
        storeId: 'store-a',
        luc: 'L-101',
        storeName: 'Zara',
        prevReading: 120,
        prevConsumption: 15,
        prevCost: 300,
        currentReading: 135,
        isRead: true,
        excludedFromBill: false
      },
      // Store B: had reading in October, read in November (complete)
      {
        storeId: 'store-b',
        luc: 'L-102',
        storeName: 'Renner',
        prevReading: 200,
        prevConsumption: 25,
        prevCost: 500,
        currentReading: 230,
        isRead: true,
        excludedFromBill: false
      },
      // Store C: had reading in October, FORGOTTEN in November (pending!)
      {
        storeId: 'store-c',
        luc: 'L-103',
        storeName: 'McDonalds',
        prevReading: 500,
        prevConsumption: 80,
        prevCost: 1600,
        currentReading: 0,
        isRead: false,
        excludedFromBill: false
      },
      // Store D: never had reading (e.g. dry kiosk without water meter)
      {
        storeId: 'store-d',
        luc: 'Q-01',
        storeName: 'Quiosque Capinhas',
        prevReading: 0,
        prevConsumption: 0,
        prevCost: 0,
        currentReading: 0,
        isRead: false,
        excludedFromBill: false
      }
    ];

    // Audit function logic (identical to prevMonthAudit computed signal)
    const audit = (list: typeof mockTableData) => {
      const measuredLastMonth = list.filter(item => 
        (item.prevReading > 0 || item.prevConsumption > 0 || (item.prevCost && item.prevCost > 0)) &&
        !item.excludedFromBill
      );
      const pendingStores = measuredLastMonth.filter(item => !item.isRead);
      const completedStores = measuredLastMonth.filter(item => item.isRead);
      const totalCount = measuredLastMonth.length;
      const pendingCount = pendingStores.length;
      const completedCount = completedStores.length;
      const isAllDone = totalCount > 0 && pendingCount === 0;

      return { totalCount, pendingCount, completedCount, pendingStores, completedStores, isAllDone, hasPreviousData: totalCount > 0 };
    };

    const initialAudit = audit(mockTableData);
    expect(initialAudit.totalCount).toBe(3); // Store A, B, C (Store D is excluded because it had no previous measurement)
    expect(initialAudit.completedCount).toBe(2); // Store A, B
    expect(initialAudit.pendingCount).toBe(1); // Store C
    expect(initialAudit.pendingStores[0].storeName).toBe('McDonalds');
    expect(initialAudit.isAllDone).toBe(false);

    // Now technician fills in McDonalds
    mockTableData[2].currentReading = 585;
    mockTableData[2].isRead = true;

    const finalAudit = audit(mockTableData);
    expect(finalAudit.totalCount).toBe(3);
    expect(finalAudit.completedCount).toBe(3);
    expect(finalAudit.pendingCount).toBe(0);
    expect(finalAudit.isAllDone).toBe(true);
  });
});
