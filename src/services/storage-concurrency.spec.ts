import { describe, it, expect } from 'vitest';
import { BillData, StorageQuotaInfo } from '../models';

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
});
