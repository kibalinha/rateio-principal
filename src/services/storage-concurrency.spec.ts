import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BillData, StorageQuotaInfo } from '../models';
import { HistoryService, mergeBillData } from './history.service';

describe('Storage Quota & Optimistic Concurrency Control (Passo D)', () => {
  describe('Storage Quota Monitoring & Formatting', () => {
    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const calculateQuota = (usage: number, quota: number): StorageQuotaInfo => {
      const percentUsed = quota > 0 ? Math.round((usage / quota) * 1000) / 10 : 0;
      return {
        usageBytes: usage,
        quotaBytes: quota,
        usageFormatted: formatBytes(usage),
        quotaFormatted: formatBytes(quota),
        percentUsed,
        isWarning: percentUsed >= 80,
        isCritical: percentUsed >= 95,
        persisted: true
      };
    };

    it('deve formatar bytes corretamente em KB, MB e GB', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576 * 15.5)).toBe('15.5 MB');
      expect(formatBytes(1073741824 * 2.5)).toBe('2.5 GB');
    });

    it('deve classificar estado normal quando cota utilizada for inferior a 80%', () => {
      const quota = calculateQuota(100 * 1024 * 1024, 1024 * 1024 * 1024); // 100MB de 1GB (~9.8%)
      expect(quota.percentUsed).toBeLessThan(80);
      expect(quota.isWarning).toBe(false);
      expect(quota.isCritical).toBe(false);
    });

    it('deve disparar alerta de warning quando cota estiver entre 80% e 94.9%', () => {
      const quota = calculateQuota(850 * 1024 * 1024, 1000 * 1024 * 1024); // 85%
      expect(quota.percentUsed).toBe(85);
      expect(quota.isWarning).toBe(true);
      expect(quota.isCritical).toBe(false);
    });

    it('deve disparar alerta crítico quando cota exceder 95%', () => {
      const quota = calculateQuota(970 * 1024 * 1024, 1000 * 1024 * 1024); // 97%
      expect(quota.percentUsed).toBe(97);
      expect(quota.isWarning).toBe(true);
      expect(quota.isCritical).toBe(true);
    });
  });

  describe('Optimistic Concurrency Control (OCC)', () => {
    it('deve inicializar e incrementar versao sequencialmente', () => {
      let currentVersion = 0;
      const saveVersion = (curr: number) => curr + 1;

      currentVersion = saveVersion(currentVersion);
      expect(currentVersion).toBe(1);

      currentVersion = saveVersion(currentVersion);
      expect(currentVersion).toBe(2);
    });

    it('deve detectar conflito quando versao gravada for menor que a versao do banco vinda de outro cliente', () => {
      const localSessionId = 'session-operator-A';
      const remoteSessionId = 'session-operator-B';

      const existingRecord: BillData = {
        costItems: [],
        consumptionInput: 1000,
        acInput: 0,
        readings: {},
        lastUpdated: new Date().toISOString(),
        version: 5,
        clientSessionId: remoteSessionId,
        lastModifiedMs: 1000
      };

      const incomingBill: BillData = {
        costItems: [],
        consumptionInput: 1050,
        acInput: 0,
        readings: {},
        lastUpdated: new Date().toISOString(),
        version: 4, // Stale version!
        clientSessionId: localSessionId,
        lastModifiedMs: 950
      };

      // Conflict detection logic
      const isConflict = (
        incomingBill.version !== undefined &&
        incomingBill.version < (existingRecord.version || 0) &&
        existingRecord.clientSessionId !== incomingBill.clientSessionId
      );

      expect(isConflict).toBe(true);

      // Resolution: advance version above highest known
      const resolvedVersion = Math.max(existingRecord.version || 0, incomingBill.version || 0) + 1;
      expect(resolvedVersion).toBe(6);
    });

    it('deve permitir atualizacoes sucessivas da mesma sessao sem falso positivo de conflito', () => {
      const sameSessionId = 'session-operator-A';

      const existingRecord: BillData = {
        costItems: [],
        consumptionInput: 1000,
        acInput: 0,
        readings: {},
        lastUpdated: new Date().toISOString(),
        version: 2,
        clientSessionId: sameSessionId,
        lastModifiedMs: 1000
      };

      const incomingBill: BillData = {
        costItems: [],
        consumptionInput: 1050,
        acInput: 0,
        readings: {},
        lastUpdated: new Date().toISOString(),
        version: 2,
        clientSessionId: sameSessionId,
        lastModifiedMs: 1200
      };

      const isConflict = (
        incomingBill.version !== undefined &&
        incomingBill.version < (existingRecord.version || 0) &&
        existingRecord.clientSessionId !== incomingBill.clientSessionId
      );

      expect(isConflict).toBe(false);
      const nextVersion = Math.max(existingRecord.version || 0, incomingBill.version || 0) + 1;
      expect(nextVersion).toBe(3);
    });
  });

  describe('Merge por Loja (readings[storeId]) em refreshBillsFromSupabase', () => {
    it('deve preservar leituras preenchidas de lojas diferentes editadas simultaneamente por dois dispositivos', () => {
      const localBill: BillData = {
        costItems: [],
        consumptionInput: 500,
        acInput: 0,
        lastUpdated: '2026-11-18T10:00:00.000Z',
        version: 2,
        lastModifiedMs: 1000,
        readings: {
          'loja-1': { reading: 120, constant: 1, adjustment: 1, calculatedConsumption: 20, updatedAtMs: 1000 },
          'loja-2': { reading: 0, constant: 1, adjustment: 1, calculatedConsumption: 0 }
        }
      };

      const remoteBill: BillData = {
        costItems: [],
        consumptionInput: 500,
        acInput: 0,
        lastUpdated: '2026-11-18T10:05:00.000Z',
        version: 3, // Remoto tem versão maior
        lastModifiedMs: 2000,
        readings: {
          'loja-1': { reading: 0, constant: 1, adjustment: 1, calculatedConsumption: 0 },
          'loja-2': { reading: 340, constant: 1, adjustment: 1, calculatedConsumption: 40, updatedAtMs: 2000 }
        }
      };

      const { merged, shouldSyncRemote } = mergeBillData(localBill, remoteBill);

      expect((merged.readings['loja-1'] as any).reading).toBe(120);
      expect((merged.readings['loja-2'] as any).reading).toBe(340);
      expect(shouldSyncRemote).toBe(true);
    });

    it('deve resolver conflito na mesma loja usando updatedAtMs mais recente', () => {
      const localBill: BillData = {
        costItems: [],
        consumptionInput: 500,
        acInput: 0,
        lastUpdated: '2026-11-18T10:00:00.000Z',
        version: 2,
        lastModifiedMs: 1000,
        readings: {
          'loja-1': { reading: 185, constant: 1, adjustment: 1, calculatedConsumption: 35, updatedAtMs: 2500 }
        }
      };

      const remoteBill: BillData = {
        costItems: [],
        consumptionInput: 500,
        acInput: 0,
        lastUpdated: '2026-11-18T10:05:00.000Z',
        version: 3,
        lastModifiedMs: 2000,
        readings: {
          'loja-1': { reading: 150, constant: 1, adjustment: 1, calculatedConsumption: 10, updatedAtMs: 1800 }
        }
      };

      const { merged, shouldSyncRemote } = mergeBillData(localBill, remoteBill);

      expect((merged.readings['loja-1'] as any).reading).toBe(185);
      expect((merged.readings['loja-1'] as any).updatedAtMs).toBe(2500);
      expect(shouldSyncRemote).toBe(true);
    });

    it('deve usar fallback de versão da fatura quando updatedAtMs estiver ausente em ambas as leituras', () => {
      const localBill: BillData = {
        costItems: [],
        consumptionInput: 500,
        acInput: 0,
        lastUpdated: '2026-11-18T10:00:00.000Z',
        version: 2,
        lastModifiedMs: 1000,
        readings: {
          'loja-1': { reading: 110, constant: 1, adjustment: 1, calculatedConsumption: 10 }
        }
      };

      const remoteBill: BillData = {
        costItems: [],
        consumptionInput: 500,
        acInput: 0,
        lastUpdated: '2026-11-18T10:05:00.000Z',
        version: 4,
        lastModifiedMs: 2000,
        readings: {
          'loja-1': { reading: 130, constant: 1, adjustment: 1, calculatedConsumption: 30 }
        }
      };

      const { merged, shouldSyncRemote } = mergeBillData(localBill, remoteBill);

      expect((merged.readings['loja-1'] as any).reading).toBe(130);
      expect(shouldSyncRemote).toBe(false);
    });

    it('deve fazer merge por loja em HistoryService.refreshBillsFromSupabase e re-sincronizar leitura local preservada', async () => {
      const storageMap = new Map<string, string>();
      (globalThis as any).localStorage = {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => storageMap.set(k, String(v)),
        removeItem: (k: string) => storageMap.delete(k),
        clear: () => storageMap.clear(),
        get length() { return storageMap.size; },
        key: (i: number) => Array.from(storageMap.keys())[i] ?? null
      };

      const syncBillMock = vi.fn().mockResolvedValue(true);
      const remoteBill: BillData = {
        costItems: [],
        consumptionInput: 500,
        acInput: 0,
        lastUpdated: '2026-11-18T10:05:00.000Z',
        version: 5,
        lastModifiedMs: 3000,
        readings: {
          'loja-a': { reading: 0, constant: 1, adjustment: 1, calculatedConsumption: 0 },
          'loja-b': { reading: 420, constant: 1, adjustment: 1, calculatedConsumption: 20, updatedAtMs: 3000 }
        }
      };

      const service = new HistoryService();
      (service as any).indexedDb = { clientSessionId: 'dev-a', saveBill: vi.fn().mockResolvedValue(undefined) };
      (service as any).supabase = {
        subscribeToBills: vi.fn(),
        fetchAllBills: vi.fn().mockResolvedValue({ 'agua_2026-11': remoteBill }),
        syncBill: syncBillMock
      };

      service.saveBill('agua', '2026-11', {
        costItems: [],
        consumptionInput: 500,
        acInput: 0,
        lastUpdated: '2026-11-18T10:00:00.000Z',
        version: 1,
        readings: {
          'loja-a': { reading: 215, constant: 1, adjustment: 1, calculatedConsumption: 15 },
          'loja-b': { reading: 0, constant: 1, adjustment: 1, calculatedConsumption: 0 }
        }
      });

      syncBillMock.mockClear();
      await service.refreshBillsFromSupabase();

      const merged = service.getBill('agua', '2026-11');
      expect(merged).not.toBeNull();
      expect((merged!.readings['loja-a'] as any).reading).toBe(215);
      expect((merged!.readings['loja-b'] as any).reading).toBe(420);
      expect(syncBillMock).toHaveBeenCalledTimes(1);
    });

    it('não deve ressuscitar mês apagado do Supabase quando refreshBillsFromSupabase rodar em cache já sincronizado', async () => {
      const storageMap = new Map<string, string>();
      (globalThis as any).localStorage = {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => storageMap.set(k, String(v)),
        removeItem: (k: string) => storageMap.delete(k),
        clear: () => storageMap.clear(),
        get length() { return storageMap.size; },
        key: (i: number) => Array.from(storageMap.keys())[i] ?? null
      };

      const syncBillMock = vi.fn().mockResolvedValue(true);
      const deleteIdbBillMock = vi.fn().mockResolvedValue(undefined);
      const deleteSupaBillMock = vi.fn().mockResolvedValue(true);

      const service = new HistoryService();
      (service as any).indexedDb = {
        clientSessionId: 'dev-a',
        saveBill: vi.fn().mockResolvedValue(undefined),
        deleteBill: deleteIdbBillMock
      };
      (service as any).supabase = {
        subscribeToBills: vi.fn(),
        fetchAllBills: vi.fn().mockResolvedValue({}), // Mês foi apagado no Supabase!
        syncBill: syncBillMock,
        deleteBill: deleteSupaBillMock
      };

      // Simula mês já sincronizado anteriormente (_pendingSync = false)
      (service as any).billsSignal.set({
        'gas_2026-11': {
          costItems: [],
          consumptionInput: 100,
          acInput: 0,
          lastUpdated: '2026-11-18T10:00:00.000Z',
          version: 3,
          readings: { 's1': { reading: 500, constant: 1, adjustment: 1, calculatedConsumption: 10 } }
        }
      });

      await service.refreshBillsFromSupabase();

      expect(service.getBill('gas', '2026-11')).toBeNull();
      expect(syncBillMock).not.toHaveBeenCalled();
      expect(deleteIdbBillMock).toHaveBeenCalledWith('gas', '2026-11');
    });

    it('clearBillForMonth deve remover definitivamente do estado local, IndexedDB e Supabase', async () => {
      const storageMap = new Map<string, string>();
      (globalThis as any).localStorage = {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => storageMap.set(k, String(v)),
        removeItem: (k: string) => storageMap.delete(k),
        clear: () => storageMap.clear(),
        get length() { return storageMap.size; },
        key: (i: number) => Array.from(storageMap.keys())[i] ?? null
      };

      const deleteIdbBillMock = vi.fn().mockResolvedValue(undefined);
      const deleteSupaBillMock = vi.fn().mockResolvedValue(true);

      const service = new HistoryService();
      (service as any).indexedDb = {
        clientSessionId: 'dev-a',
        saveBill: vi.fn().mockResolvedValue(undefined),
        deleteBill: deleteIdbBillMock
      };
      (service as any).supabase = {
        subscribeToBills: vi.fn(),
        fetchAllBills: vi.fn().mockResolvedValue(null),
        syncBill: vi.fn().mockResolvedValue(true),
        deleteBill: deleteSupaBillMock
      };

      service.saveBill('agua', '2026-11', {
        costItems: [],
        consumptionInput: 100,
        acInput: 0,
        lastUpdated: '2026-11-18T10:00:00.000Z',
        readings: { 's1': { reading: 100, constant: 1, adjustment: 1, calculatedConsumption: 10 } }
      });

      await service.clearBillForMonth('agua', '2026-11');

      expect(service.getBill('agua', '2026-11')).toBeNull();
      expect(deleteIdbBillMock).toHaveBeenCalledWith('agua', '2026-11');
      expect(deleteSupaBillMock).toHaveBeenCalledWith('agua', '2026-11');
    });
  });
});
