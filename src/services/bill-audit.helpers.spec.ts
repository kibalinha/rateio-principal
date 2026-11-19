import { describe, it, expect } from 'vitest';
import {
  computeHistoricalStats,
  computeZeroConsumptionLearning,
  evaluateReadingAnomaly,
  ReadingAnomalyInput
} from './bill-audit.helpers';
import { BillData, Store } from '../models';

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 'store-1',
    luc: '101',
    name: 'Loja Teste',
    active: true,
    ...overrides
  };
}

function makeBill(readings: Record<string, any>): BillData {
  return {
    costItems: [],
    consumptionInput: 0,
    acInput: 0,
    readings,
    lastUpdated: '2026-11-01T00:00:00.000Z'
  };
}

function makeAnomalyInput(overrides: Partial<ReadingAnomalyInput> = {}): ReadingAnomalyInput {
  return {
    isRead: true,
    storeActive: true,
    currentReading: 120,
    prevReading: 100,
    consumption: 20,
    prevConsumption: 20,
    histAvgConsumption: 20,
    prevMonthZero: false,
    isRollover: false,
    isConfirmed: false,
    hasVirtualOverride: false,
    unit: 'm³',
    ...overrides
  };
}

describe('bill-audit.helpers', () => {
  describe('evaluateReadingAnomaly', () => {
    it('retorna sem alerta para leitura normal', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput());
      expect(res.hasSuspiciousAlert).toBe(false);
      expect(res.hasUnconfirmedAlert).toBe(false);
      expect(res.alertSeverity).toBe('none');
      expect(res.validationAlert.type).toBe('none');
      expect(res.validationAlert.hasAlert).toBe(false);
      expect(res.validationAlert.diffPct).toBe(0);
    });

    it('marca badge de auditado em campo quando confirmado sem anomalia', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput({ isConfirmed: true }));
      expect(res.alertSeverity).toBe('none');
      expect(res.validationAlert.badgeLabel).toBe('✅ Auditado em Campo');
    });

    it('detecta leitura menor que a anterior como crítica quando não há virada de medidor', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput({
        prevReading: 500,
        currentReading: 450,
        consumption: 0,
        unit: 'kWh'
      }));
      expect(res.isNegative).toBe(true);
      expect(res.alertSeverity).toBe('critical');
      expect(res.hasUnconfirmedAlert).toBe(true);
      expect(res.validationAlert.type).toBe('negative');
      expect(res.validationAlert.badgeLabel).toBe('🚨 Leitura Menor');
      expect(res.validationAlert.title).toBe('🚨 Leitura Menor que a Anterior');
      expect(res.validationAlert.message).toContain('-50.0 kWh');
    });

    it('não dispara leitura menor quando isRollover está marcado', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput({
        prevReading: 9990,
        currentReading: 10,
        consumption: 20,
        isRollover: true
      }));
      expect(res.isNegative).toBe(false);
      expect(res.validationAlert.type).toBe('none');
    });

    it('detecta salto extremo >= 5x com consumo >= 25 como crítico', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput({
        prevReading: 100,
        currentReading: 200,
        consumption: 100,
        histAvgConsumption: 20,
        prevConsumption: 20
      }));
      expect(res.isExtremeJump).toBe(true);
      expect(res.is3xJump).toBe(true);
      expect(res.alertSeverity).toBe('critical');
      expect(res.validationAlert.type).toBe('typo_extreme');
      expect(res.validationAlert.badgeLabel).toBe('🚨 Zero a Mais?');
      expect(res.validationAlert.message).toContain('salto de 5.0x');
    });

    it('detecta salto >= 3x e < 5x com consumo >= 12 como warning', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput({
        prevReading: 100,
        currentReading: 135,
        consumption: 35,
        histAvgConsumption: 10,
        prevConsumption: 10
      }));
      expect(res.is3xJump).toBe(true);
      expect(res.isExtremeJump).toBe(false);
      expect(res.alertSeverity).toBe('warning');
      expect(res.validationAlert.type).toBe('leak_suspect');
      expect(res.validationAlert.badgeLabel).toBe('⚠️ Salto >3x (Vazamento?)');
      expect(res.validationAlert.diffPct).toBe(250);
    });

    it('detecta dígitos a mais sem histórico quando não cai em salto extremo', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput({
        prevReading: 1510,
        currentReading: 15100,
        consumption: 15,
        prevConsumption: 0,
        histAvgConsumption: 0
      }));
      expect(res.isDigitsMismatch).toBe(true);
      expect(res.alertSeverity).toBe('warning');
      expect(res.validationAlert.type).toBe('digits_mismatch');
      expect(res.validationAlert.badgeLabel).toBe('🔢 Dígito a Mais?');
      expect(res.validationAlert.message).toContain('5 dígitos');
      expect(res.validationAlert.message).toContain('tinha 4.');
    });

    it('suprime dígitos a mais quando há override virtual', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput({
        prevReading: 1510,
        currentReading: 15100,
        consumption: 15,
        prevConsumption: 0,
        histAvgConsumption: 0,
        hasVirtualOverride: true
      }));
      expect(res.isDigitsMismatch).toBe(false);
    });

    it('detecta relógio parado por 2 meses consecutivos', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput({
        prevReading: 300,
        currentReading: 300,
        consumption: 0,
        prevMonthZero: true
      }));
      expect(res.is2MonthsZero).toBe(true);
      expect(res.isZeroThisMonth).toBe(false);
      expect(res.isZeroActive).toBe(true);
      expect(res.alertSeverity).toBe('warning');
      expect(res.validationAlert.type).toBe('zero_2months');
      expect(res.validationAlert.badgeLabel).toBe('⏱️ Relógio Parado (2m Zerado)');
    });

    it('detecta consumo zero apenas no mês atual em loja ativa', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput({
        prevReading: 300,
        currentReading: 300,
        consumption: 0,
        prevMonthZero: false
      }));
      expect(res.isZeroThisMonth).toBe(true);
      expect(res.is2MonthsZero).toBe(false);
      expect(res.isZeroActive).toBe(true);
      expect(res.alertSeverity).toBe('warning');
      expect(res.validationAlert.type).toBe('zero_month');
      expect(res.validationAlert.badgeLabel).toBe('⚠️ Consumo Zero');
    });

    it('limpa severidade e hasUnconfirmedAlert quando anomalia é confirmada', () => {
      const res = evaluateReadingAnomaly(makeAnomalyInput({
        prevReading: 500,
        currentReading: 450,
        consumption: 0,
        isConfirmed: true
      }));
      expect(res.hasSuspiciousAlert).toBe(true);
      expect(res.hasUnconfirmedAlert).toBe(false);
      expect(res.alertSeverity).toBe('none');
      expect(res.validationAlert.hasAlert).toBe(true);
      expect(res.validationAlert.badgeLabel).toBe('✓ Leitura Menor Auditada');
    });
  });

  describe('computeHistoricalStats', () => {
    it('calcula média histórica positiva excluindo mês atual e detecta mês anterior zerado com fallback por LUC', () => {
      const activeStore = makeStore({ id: 's-new', luc: '101', contrato: 'C-1' });
      const oldStore = makeStore({ id: 's-old', luc: '101', contrato: 'C-1' });

      const allData: Record<string, BillData> = {
        'agua_2026-09': makeBill({ 's-new': { calculatedConsumption: 30 } }),
        'agua_2026-10': makeBill({ 's-old': { calculatedConsumption: 0 } }),
        'agua_2026-11': makeBill({ 's-new': { calculatedConsumption: 999 } }),
        'luz_2026-10': makeBill({ 's-new': { calculatedConsumption: 500 } })
      };

      const stats = computeHistoricalStats({
        allData,
        type: 'agua',
        currentMonth: '2026-11',
        prevMonth: '2026-10',
        activeStores: [activeStore],
        allStores: [activeStore, oldStore]
      });

      const s = stats.get('s-new');
      expect(s).toEqual({
        avgConsumption: 30,
        count: 1,
        prevMonthZero: true
      });
    });
  });

  describe('computeZeroConsumptionLearning', () => {
    it('identifica consumo zero recorrente (>= 2 meses consecutivos) e extrai motivo da observação', () => {
      const store = makeStore({ id: 's1', luc: '201', name: 'Loja Vaga' });
      const allData: Record<string, BillData> = {
        'luz_2026-08': makeBill({ s1: { calculatedConsumption: 40 } }),
        'luz_2026-09': makeBill({ s1: { calculatedConsumption: 0, note: 'Loja em reforma interna' } }),
        'luz_2026-10': makeBill({ s1: { calculatedConsumption: 0, note: '' } })
      };

      const learning = computeZeroConsumptionLearning({
        allData,
        type: 'luz',
        currentMonth: '2026-11',
        prevMonth: '2026-10',
        activeStores: [store],
        allStores: [store]
      });

      const entry = learning.get('s1');
      expect(entry).toEqual({
        isFrequentZero: true,
        consecutiveZeroMonths: 2,
        totalZeroMonths: 2,
        lastNote: 'Loja em reforma interna',
        learnedReason: 'Em Reforma / Obra',
        pastZeroMonthsList: ['2026-10', '2026-09']
      });
    });

    it('considera isFrequentZero quando há >= 2 meses zerados no histórico e o mais recente é zero', () => {
      const store = makeStore({ id: 's1', luc: '202', name: 'Quiosque' });
      const allData: Record<string, BillData> = {
        'gas_2026-08': makeBill({ s1: { calculatedConsumption: 0 } }),
        'gas_2026-09': makeBill({ s1: { calculatedConsumption: 15 } }),
        'gas_2026-10': makeBill({ s1: { calculatedConsumption: 0, note: 'Medidor inacessível' } })
      };

      const learning = computeZeroConsumptionLearning({
        allData,
        type: 'gas',
        currentMonth: '2026-11',
        prevMonth: '2026-10',
        activeStores: [store],
        allStores: [store]
      });

      const entry = learning.get('s1');
      expect(entry?.isFrequentZero).toBe(true);
      expect(entry?.consecutiveZeroMonths).toBe(1);
      expect(entry?.totalZeroMonths).toBe(2);
      expect(entry?.learnedReason).toBe('Medidor Inacessível');
    });

    it('não marca isFrequentZero quando a sequência recente foi quebrada por consumo positivo', () => {
      const store = makeStore({ id: 's1', luc: '203', name: 'Café' });
      const allData: Record<string, BillData> = {
        'agua_2026-08': makeBill({ s1: { calculatedConsumption: 0 } }),
        'agua_2026-09': makeBill({ s1: { calculatedConsumption: 0 } }),
        'agua_2026-10': makeBill({ s1: { calculatedConsumption: 25 } })
      };

      const learning = computeZeroConsumptionLearning({
        allData,
        type: 'agua',
        currentMonth: '2026-11',
        prevMonth: '2026-10',
        activeStores: [store],
        allStores: [store]
      });

      const entry = learning.get('s1');
      expect(entry?.isFrequentZero).toBe(false);
      expect(entry?.consecutiveZeroMonths).toBe(0);
      expect(entry?.totalZeroMonths).toBe(2);
    });
  });
});
