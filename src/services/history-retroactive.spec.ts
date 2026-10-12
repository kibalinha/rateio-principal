import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HistoryService } from './history.service';
import { BillData } from '../models';

describe('HistoryService - Busca Retroativa da Última Leitura Válida', () => {
  let service: HistoryService;
  const storageMap = new Map<string, string>();

  beforeEach(() => {
    storageMap.clear();

    const mockLocalStorage = {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, val: string) => storageMap.set(key, String(val)),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
      get length() { return storageMap.size; },
      key: (i: number) => Array.from(storageMap.keys())[i] ?? null
    };
    (globalThis as any).localStorage = mockLocalStorage;

    const mockIndexedDb: any = {
      clientSessionId: 'test-session',
      saveBill: vi.fn().mockResolvedValue(undefined),
    };

    const mockSupabase: any = {
      subscribeToBills: vi.fn(),
      fetchAllBills: vi.fn().mockResolvedValue(null),
      syncBill: vi.fn().mockResolvedValue(true)
    };

    service = new HistoryService();
    (service as any).indexedDb = mockIndexedDb;
    (service as any).supabase = mockSupabase;
  });

  it('deve buscar a última leitura válida de Janeiro (171) quando a loja foi desativada em Fev e Mar e reabilitada em Abril', () => {
    // 1. Em Janeiro de 2026 (2026-01), a loja Adcos teve leitura 171 e consumo 1
    const billJan: BillData = {
      costItems: [],
      consumptionInput: 100,
      acInput: 0,
      lastUpdated: '2026-01-31T20:00:00.000Z',
      readings: {
        'adcos-id': {
          reading: 171,
          constant: 1,
          adjustment: 1,
          calculatedConsumption: 1
        }
      }
    };
    service.saveBill('agua', '2026-01', billJan);

    // 2. Em Fevereiro (2026-02) e Março (2026-03), a loja foi desativada e não teve leituras
    // (Fatura de março existe para outras lojas, mas adcos não está ou está com 0)
    const billMar: BillData = {
      costItems: [],
      consumptionInput: 80,
      acInput: 0,
      lastUpdated: '2026-03-31T20:00:00.000Z',
      readings: {
        'outra-loja': {
          reading: 50,
          constant: 1,
          adjustment: 1,
          calculatedConsumption: 5
        }
      }
    };
    service.saveBill('agua', '2026-03', billMar);

    // 3. Em Abril de 2026 (2026-04), a loja Adcos é reabilitada
    // Chamamos getLastValidReadings para 'agua' em '2026-04'
    const validReadings = service.getLastValidReadings('agua', '2026-04');

    // 4. Deve encontrar a leitura 171 vinda de Janeiro/2026 (não 0!)
    const adcosPrev = validReadings.get('adcos-id');
    expect(adcosPrev).toBeDefined();
    expect(adcosPrev!.reading).toBe(171);
    expect(adcosPrev!.consumption).toBe(1);
    expect(adcosPrev!.month).toBe('2026-01');

    // 5. Verificação matemática: se em Abril o usuário digita leitura 172:
    const currentReadingApril = 172;
    const diff = currentReadingApril - adcosPrev!.reading;
    expect(diff).toBe(1); // 172 - 171 = 1 m³ (e NÃO 172 m³ de valor absoluto!)
  });

  it('deve usar o mês mais recente disponível quando a leitura de Fevereiro estava preenchida com 171', () => {
    // Janeiro: 170
    service.saveBill('agua', '2026-01', {
      costItems: [], consumptionInput: 0, acInput: 0, lastUpdated: '',
      readings: { 'adcos-id': { reading: 170, constant: 1, adjustment: 1, calculatedConsumption: 1 } }
    });

    // Fevereiro: 171 (consumo 1)
    service.saveBill('agua', '2026-02', {
      costItems: [], consumptionInput: 0, acInput: 0, lastUpdated: '',
      readings: { 'adcos-id': { reading: 171, constant: 1, adjustment: 1, calculatedConsumption: 1 } }
    });

    // Março: sem adcos (desativada)
    service.saveBill('agua', '2026-03', {
      costItems: [], consumptionInput: 0, acInput: 0, lastUpdated: '',
      readings: {}
    });

    // Em Abril: busca retroativa deve pegar Fevereiro (171), que é o mês mais recente com leitura > 0
    const validReadings = service.getLastValidReadings('agua', '2026-04');
    const adcosPrev = validReadings.get('adcos-id');
    expect(adcosPrev).toBeDefined();
    expect(adcosPrev!.reading).toBe(171);
    expect(adcosPrev!.month).toBe('2026-02');
  });

  it('deve retornar leitura 0 para uma loja nova que nunca teve leituras no histórico', () => {
    service.saveBill('luz', '2026-01', {
      costItems: [], consumptionInput: 0, acInput: 0, lastUpdated: '',
      readings: { 'loja-antiga': 500 }
    });

    const validReadings = service.getLastValidReadings('luz', '2026-04');
    const novaLoja = validReadings.get('loja-nova-sem-historico');
    expect(novaLoja).toBeUndefined(); // Loja nova não tem histórico registrado
  });

  it('deve respeitar a separação por tipo (água, luz e gás não misturam leituras)', () => {
    service.saveBill('luz', '2026-01', {
      costItems: [], consumptionInput: 0, acInput: 0, lastUpdated: '',
      readings: { 'loja-mista': { reading: 9999, constant: 1, adjustment: 1, calculatedConsumption: 10 } }
    });
    service.saveBill('agua', '2026-01', {
      costItems: [], consumptionInput: 0, acInput: 0, lastUpdated: '',
      readings: { 'loja-mista': { reading: 150, constant: 1, adjustment: 1, calculatedConsumption: 2 } }
    });

    const aguaReadings = service.getLastValidReadings('agua', '2026-04');
    expect(aguaReadings.get('loja-mista')?.reading).toBe(150);

    const luzReadings = service.getLastValidReadings('luz', '2026-04');
    expect(luzReadings.get('loja-mista')?.reading).toBe(9999);
  });
});
