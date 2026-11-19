import { describe, it, expect } from 'vitest';
import { ApportionmentEngineService } from './apportionment-engine.service';
import {
  applySpreadsheetPasteToReadings,
  buildBillTableRows,
  computeClosingChecklist,
  computeGasDistributionStats,
  computePrevMonthAudit,
  filterAndSortBillRows
} from './bill-table.helpers';
import { Store, StoreReading } from '../models';

describe('bill-table.helpers', () => {
  const engine = new ApportionmentEngineService();

  const stores: Store[] = [
    { id: 's1', luc: 'L-101', contrato: '101', name: 'Zara', active: true, usesLuz: true, usesAgua: true, usesGas: true, routeOrder: 1 },
    { id: 's2', luc: 'L-102', contrato: '102', name: 'Burger King', active: true, usesLuz: true, usesAgua: true, usesGas: true, routeOrder: 2 }
  ];

  it('calcula consumo com rollover em energia e zera custo de loja fora do SAP preservando originalCost', () => {
    const readings = new Map<string, StoreReading>([
      ['s1', { reading: 50, constant: 2, adjustment: 1, calculatedConsumption: 0, isRollover: true, anomalyConfirmed: true }],
      ['s2', { reading: 120, constant: 1, adjustment: 1, calculatedConsumption: 0, excludedFromBill: true }]
    ]);

    const prevReadings = new Map([
      ['s1', { reading: 9980, consumption: 100, cost: 100, month: '2026-10' }],
      ['s2', { reading: 100, consumption: 20, cost: 20, month: '2026-10' }]
    ]);

    const rows = buildBillTableRows({
      stores,
      utilityType: 'luz',
      unitPrice: 1.5,
      readingsMap: readings,
      prevReadings,
      historicalStats: new Map(),
      zeroLearningMap: new Map(),
      meterPhotos: {},
      gasTotalReading: 0,
      gasAutoDistribute: false,
      apportionmentEngine: engine
    });

    // Rollover de 9980 -> 50 = (10000 - 9980) + 50 = 70; * constant 2 = 140 kWh
    expect(rows[0].consumption).toBe(140);
    expect(rows[0].cost).toBeCloseTo(210, 6);

    // Fora do SAP: cost = 0, originalCost = 20 * 1.5 = 30
    expect(rows[1].consumption).toBe(20);
    expect(rows[1].cost).toBe(0);
    expect(rows[1].originalCost).toBeCloseTo(30, 6);
  });

  it('distribui 100% do volume de gás proporcionalmente entre lojas fechando exatamente com a fatura da concessionária', () => {
    const readings = new Map<string, StoreReading>([
      ['s1', { reading: 110, constant: 1, adjustment: 1.347, fcm: 1.0727, calculatedConsumption: 0 }],
      ['s2', { reading: 230, constant: 1, adjustment: 1.347, fcm: 1.0727, calculatedConsumption: 0 }]
    ]);

    const prevReadings = new Map([
      ['s1', { reading: 100, consumption: 10, month: '2026-10' }],
      ['s2', { reading: 200, consumption: 30, month: '2026-10' }]
    ]);

    const concessionariaM3 = 100;
    const totalBill = 1200;
    const unitPrice = engine.calculateUnitPrice(totalBill, concessionariaM3);

    const rows = buildBillTableRows({
      stores,
      utilityType: 'gas',
      unitPrice,
      readingsMap: readings,
      prevReadings,
      historicalStats: new Map(),
      zeroLearningMap: new Map(),
      meterPhotos: {},
      gasTotalReading: concessionariaM3,
      gasAutoDistribute: true,
      apportionmentEngine: engine
    });

    const totalDistributedCons = rows.reduce((acc, r) => acc + r.consumption, 0);
    const totalDistributedCost = rows.reduce((acc, r) => acc + r.cost, 0);

    expect(totalDistributedCons).toBeCloseTo(concessionariaM3, 6);
    expect(totalDistributedCost).toBeCloseTo(totalBill, 6);

    const stats = computeGasDistributionStats({
      utilityType: 'gas',
      gasTotalReading: concessionariaM3,
      gasAutoDistribute: true,
      tableData: rows,
      totalBillAmount: totalBill,
      totalDistributedCost
    });
    expect(stats?.isBalanced).toBe(true);
  });

  it('applySpreadsheetPasteToReadings processa colagem multilinha pt-BR e ignora texto de linha única', () => {
    const base = new Map<string, StoreReading>();
    expect(
      applySpreadsheetPasteToReadings({
        clipboardText: '123,45',
        startStoreId: 's1',
        field: 'reading',
        tableData: [{ storeId: 's1' }, { storeId: 's2' }],
        currentReadings: base
      })
    ).toBeNull();

    const pasted = applySpreadsheetPasteToReadings({
      clipboardText: '1.250,50\tignored\r\n2.400,00\r\n',
      startStoreId: 's1',
      field: 'reading',
      tableData: [{ storeId: 's1' }, { storeId: 's2' }],
      currentReadings: base
    });

    expect(pasted?.get('s1')?.reading).toBe(1250.5);
    expect(pasted?.get('s2')?.reading).toBe(2400);
  });

  it('filterAndSortBillRows e computeClosingChecklist refletem filtros e reconciliação financeira', () => {
    const readings = new Map<string, StoreReading>([
      ['s1', { reading: 150, constant: 1, adjustment: 1, calculatedConsumption: 0 }],
      ['s2', { reading: 0, constant: 1, adjustment: 1, calculatedConsumption: 0 }]
    ]);

    const prevReadings = new Map([
      ['s1', { reading: 100, consumption: 50, cost: 50, month: '2026-10' }],
      ['s2', { reading: 200, consumption: 20, cost: 20, month: '2026-10' }]
    ]);

    const rows = buildBillTableRows({
      stores,
      utilityType: 'agua',
      unitPrice: 10,
      readingsMap: readings,
      prevReadings,
      historicalStats: new Map(),
      zeroLearningMap: new Map(),
      meterPhotos: {},
      gasTotalReading: 0,
      gasAutoDistribute: false,
      apportionmentEngine: engine
    });

    const pending = filterAndSortBillRows({
      rows,
      statusFilter: 'pending',
      searchQuery: '',
      sortBy: 'route',
      sortDirection: 'asc'
    });
    expect(pending.map(r => r.storeId)).toEqual(['s2']);

    const prevAudit = computePrevMonthAudit(rows);
    expect(prevAudit.pendingCount).toBe(1);

    const checklist = computeClosingChecklist({
      tableData: rows,
      prevAudit,
      totalBillAmount: 1000,
      totalDistributedCost: 500,
      airConditioningCost: 100,
      commonAreaCost: 400,
      gasTotalReading: 0,
      gasAutoDistribute: false,
      isLocked: false,
      lockedAt: null,
      lockedBy: null
    });

    expect(checklist.reconciliation.passed).toBe(true);
    expect(checklist.readings.pendingStores).toBe(1);
    expect(checklist.canFreeze).toBe(false);
  });
});
