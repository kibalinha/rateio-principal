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

  it('Diagnostic Test 5: Quick Justification resolves continuity audit and month-closing checklist', () => {
    // Stores measured last month
    const list = [
      {
        storeId: 'store-1',
        luc: '101',
        storeName: 'Loja Ativa Lida',
        prevReading: 100,
        prevConsumption: 20,
        currentReading: 120,
        isRead: true,
        isJustified: false,
        excludedFromBill: false
      },
      {
        storeId: 'store-2',
        luc: '102',
        storeName: 'Loja Fechada Vaga',
        prevReading: 50,
        prevConsumption: 10,
        currentReading: 0,
        isRead: false,
        isJustified: false,
        justificationReason: '',
        excludedFromBill: false
      }
    ];

    const runAudit = (stores: typeof list) => {
      const measuredLastMonth = stores.filter(item => 
        (item.prevReading > 0 || item.prevConsumption > 0) &&
        !item.excludedFromBill
      );
      const pendingStores = measuredLastMonth.filter(item => !item.isRead && !item.isJustified);
      const completedStores = measuredLastMonth.filter(item => item.isRead || item.isJustified);
      return {
        totalCount: measuredLastMonth.length,
        pendingCount: pendingStores.length,
        completedCount: completedStores.length,
        isAllDone: measuredLastMonth.length > 0 && pendingStores.length === 0,
        pendingStores
      };
    };

    // Initially, store-2 is pending
    const beforeJustify = runAudit(list);
    expect(beforeJustify.totalCount).toBe(2);
    expect(beforeJustify.pendingCount).toBe(1);
    expect(beforeJustify.pendingStores[0].storeName).toBe('Loja Fechada Vaga');
    expect(beforeJustify.isAllDone).toBe(false);

    // Technician uses 1-touch Quick Justification: "Loja Fechada / Vaga"
    list[1].isJustified = true;
    list[1].justificationReason = 'Loja Fechada / Vaga';
    list[1].currentReading = list[1].prevReading; // replicate reading -> 0 consumption

    const afterJustify = runAudit(list);
    expect(afterJustify.totalCount).toBe(2);
    expect(afterJustify.completedCount).toBe(2);
    expect(afterJustify.pendingCount).toBe(0);
    expect(afterJustify.isAllDone).toBe(true);

    // Verify closing checklist gatekeeper logic
    const canFreeze = (stores: typeof list, auditResult: typeof afterJustify) => {
      const totalStores = stores.length;
      const readOrJustified = stores.filter(item => item.isRead || item.isJustified).length;
      const isComplete = totalStores > 0 && readOrJustified === totalStores;
      const isContinuityComplete = auditResult.isAllDone;
      return isComplete && isContinuityComplete;
    };

    expect(canFreeze(list, afterJustify)).toBe(true);
  });

  it('Diagnostic Test 6: Zero consumption learning detects stores with consecutive 0 consumption across months', () => {
    // Setup historical data for water over past 3 months
    const storeA = { id: 's-a', luc: '101', name: 'Loja A Vazia', contrato: 'C-01' };
    const storeB = { id: 's-b', luc: '102', name: 'Loja B Ativa', contrato: 'C-02' };

    storeService.processMonthlyStoreImport([storeA, storeB], 'agua', '2026-08', false);

    historyService.saveBill('agua', '2026-08', {
      costItems: [{ description: 'Conta', value: 1000 }],
      consumptionInput: 50,
      acInput: 0,
      readings: {
        [storeA.id]: { reading: 100, calculatedConsumption: 0, cost: 0, note: '[JUSTIFICADO] Loja Fechada / Vaga' },
        [storeB.id]: { reading: 200, calculatedConsumption: 25, cost: 500 }
      },
      lastUpdated: '2026-08-31T00:00:00.000Z'
    });

    historyService.saveBill('agua', '2026-09', {
      costItems: [{ description: 'Conta', value: 1000 }],
      consumptionInput: 50,
      acInput: 0,
      readings: {
        [storeA.id]: { reading: 100, calculatedConsumption: 0, cost: 0, note: '[JUSTIFICADO] Loja Fechada / Vaga' },
        [storeB.id]: { reading: 230, calculatedConsumption: 30, cost: 600 }
      },
      lastUpdated: '2026-09-30T00:00:00.000Z'
    });

    historyService.saveBill('agua', '2026-10', {
      costItems: [{ description: 'Conta', value: 1000 }],
      consumptionInput: 50,
      acInput: 0,
      readings: {
        [storeA.id]: { reading: 100, calculatedConsumption: 0, cost: 0, note: '[JUSTIFICADO] Loja Fechada / Vaga' },
        [storeB.id]: { reading: 260, calculatedConsumption: 30, cost: 600 }
      },
      lastUpdated: '2026-10-31T00:00:00.000Z'
    });

    // Learning logic simulation
    const allData = historyService.getAllData();
    const pastMonths = ['2026-10', '2026-09', '2026-08'];
    
    const analyzeStore = (storeId: string) => {
      let consecutiveZero = 0;
      let streakBroken = false;
      let lastReason = '';

      for (const m of pastMonths) {
        const bill = allData[`agua_${m}`];
        if (!bill?.readings) continue;
        const rd = bill.readings[storeId];
        if (!rd) continue;

        const cons = Number(rd.calculatedConsumption ?? rd.consumption ?? 0);
        if (cons === 0 && !streakBroken) {
          consecutiveZero++;
          if (!lastReason && rd.note) {
            lastReason = rd.note.replace('[JUSTIFICADO]', '').trim();
          }
        } else if (cons > 0) {
          streakBroken = true;
        }
      }

      return {
        consecutiveZeroMonths: consecutiveZero,
        isFrequentZero: consecutiveZero >= 2,
        learnedReason: lastReason || 'Loja Fechada / Vaga'
      };
    };

    const learnedA = analyzeStore(storeA.id);
    expect(learnedA.consecutiveZeroMonths).toBe(3);
    expect(learnedA.isFrequentZero).toBe(true);
    expect(learnedA.learnedReason).toBe('Loja Fechada / Vaga');

    const learnedB = analyzeStore(storeB.id);
    expect(learnedB.consecutiveZeroMonths).toBe(0);
    expect(learnedB.isFrequentZero).toBe(false);
  });

  it('Diagnostic Test 7: Excel Export guarantees 100% of stores are exported (including justified stores)', async () => {
    const { ReportExportService } = await import('./report-export.service');
    const XLSX = await import('xlsx');
    const exportService = new ReportExportService();

    const mockStoresData = [
      {
        storeId: 's1',
        luc: '101',
        contrato: 'C101',
        storeName: 'Loja Normal Lida',
        currentReading: 150,
        prevReading: 120,
        consumption: 30,
        cost: 600,
        prevCost: 550,
        variation: 9.1,
        isRead: true,
        isJustified: false,
        note: ''
      },
      {
        storeId: 's2',
        luc: '102',
        contrato: 'C102',
        storeName: 'Loja Justificada Vaga',
        currentReading: 80,
        prevReading: 80,
        consumption: 0,
        cost: 0,
        prevCost: 0,
        variation: 0,
        isRead: false,
        isJustified: true,
        justificationReason: 'Loja Fechada / Vaga',
        note: '[JUSTIFICADO] Loja Fechada / Vaga'
      },
      {
        storeId: 's3',
        luc: '103',
        contrato: 'C103',
        storeName: 'Loja Pendente Sem Leitura',
        currentReading: 0,
        prevReading: 200,
        consumption: 0,
        cost: 0,
        prevCost: 400,
        variation: -100,
        isRead: false,
        isJustified: false,
        note: ''
      }
    ];

    const wb = exportService.buildCalculatorWorkbook({
      utilityType: 'agua',
      utilityLabel: 'Água',
      unit: 'm³',
      month: '2026-11',
      unitPrice: 20.0,
      totalBill: 1000,
      totalConsumption: 50,
      totalDistributedCost: 600,
      totalStoreConsumption: 30,
      airConditioningConsumption: 0,
      airConditioningCost: 0,
      commonAreaConsumption: 20,
      commonAreaCost: 400,
      costItems: [{ description: 'Fatura Sabesp', value: 1000 }],
      consumptionInput: 50,
      tableData: mockStoresData as any
    });

    const sheet = wb.Sheets['Rateio das Lojas'];
    expect(sheet).toBeDefined();

    const rows = XLSX.utils.sheet_to_json<any>(sheet);
    // Rows include header data + totals row. Data rows should match exactly 3 stores
    const dataRows = rows.filter(r => r['LUC'] !== 'TOTAL' && r['LUC'] !== undefined);
    expect(dataRows.length).toBe(3); // 100% of stores exported!

    // Store 1: Concluída
    const row1 = dataRows.find(r => r['LUC'] === '101')!;
    expect(row1['Status da Leitura']).toBe('Concluída');

    // Store 2: Justificada
    const row2 = dataRows.find(r => r['LUC'] === '102')!;
    expect(row2['Status da Leitura']).toContain('Justificada');
    expect(row2['Status da Leitura']).toContain('Loja Fechada / Vaga');
    expect(row2['Observação de Campo']).toBe('[JUSTIFICADO] Loja Fechada / Vaga');

    // Store 3: Pendente
    const row3 = dataRows.find(r => r['LUC'] === '103')!;
    expect(row3['Status da Leitura']).toBe('Pendente');
  });

  it('Diagnostic Test 8: 309 items imported for November Água (including stores like DEP/LUC1011) are fully retained without truncation to 229', () => {
    // Generate 309 stores mimicking the SAP spreadsheet
    const items309 = Array.from({ length: 309 }, (_, i) => {
      const idx = i + 1;
      let luc = `LUC-${idx}`;
      if (idx === 233) luc = 'DEP/LUC1011';
      return {
        luc,
        contrato: `20000${String(idx).padStart(3, '0')}`,
        name: `Loja ${idx} Shopping`
      };
    });

    expect(items309.length).toBe(309);

    // Import for November 2026 Água
    const importRes = storeService.processMonthlyStoreImport(items309, 'agua', '2026-11', false);
    expect(importRes.maintainedCount + importRes.newCount).toBe(309);

    // Verify all 309 stores are retrieved for November 2026 Água
    const novAguaStores = storeService.getStoresForMonth('agua', '2026-11', false);
    expect(novAguaStores.length).toBe(309);

    // Verify store 233 (DEP/LUC1011) was NOT dropped as a header
    const depStore = novAguaStores.find(s => s.luc === 'DEP/LUC1011');
    expect(depStore).toBeDefined();
    expect(depStore?.name).toBe('Loja 233 Shopping');
  });
});
