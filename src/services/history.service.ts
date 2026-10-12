import { Injectable, inject, signal, computed } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';
import { SupabaseService } from './supabase.service';

import { StoreReading, BillData } from '../models';

export type { StoreReading, BillData };

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  private readonly STORAGE_KEY = 'shop_rateio_history';
  private readonly CLEAN_SLATE_KEY = 'shop_rateio_clean_slate_20261007_v1';
  readonly indexedDb: IndexedDbService = (() => {
    try {
      return inject(IndexedDbService);
    } catch {
      return {} as any;
    }
  })();
  readonly supabase: SupabaseService = (() => {
    try {
      return inject(SupabaseService);
    } catch {
      return {} as any;
    }
  })();

  private billsSignal = signal<Record<string, BillData>>(this.getStorage());
  readonly bills = computed(() => this.billsSignal());

  constructor() {
    if (typeof (this.supabase as any)?.subscribeToBills === 'function') {
      this.syncWithSupabaseOnStart();
      this.setupRealtimeSync();
    }
  }

  private setupRealtimeSync() {
    this.supabase.subscribeToBills(async () => {
      await this.refreshBillsFromSupabase();
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.refreshBillsFromSupabase().catch(() => {});
      });
    }
  }

  async refreshBillsFromSupabase() {
    try {
      const remoteBills = await this.supabase.fetchAllBills();
      if (remoteBills !== null) {
        const local = this.billsSignal();
        const merged: Record<string, BillData> = { ...remoteBills };
        for (const [k, v] of Object.entries(local)) {
          const remoteItem = merged[k];
          if (remoteItem) {
            const localVersion = v.version || 0;
            const remoteVersion = remoteItem.version || 0;
            const localTime = v.lastModifiedMs || (v.lastUpdated ? new Date(v.lastUpdated).getTime() : 0);
            const remoteTime = remoteItem.lastModifiedMs || (remoteItem.lastUpdated ? new Date(remoteItem.lastUpdated).getTime() : 0);

            // Resolução de Conflitos OCC (Optimistic Concurrency Control):
            // 1. Se a versão local é maior, a alteração foi realizada neste dispositivo e ainda não sincronizou completamente com a nuvem.
            // 2. Se as versões empatarem, vence o timestamp mais recente.
            const isLocalNewer = localVersion > remoteVersion || (localVersion === remoteVersion && localTime > remoteTime);
            if (isLocalNewer) {
              merged[k] = v;
              // Garante que o Supabase receba a versão local mais nova
              const [uType, uMonth] = k.split('_');
              if (uType && uMonth) {
                this.supabase.syncBill(uType, uMonth, v).catch(() => {});
              }
            } else {
              // A fatura remota é mais nova ou igual (ex: alterada pelo celular)
              merged[k] = remoteItem;
            }
          } else {
            // Existe apenas localmente (ex: novo mês criado offline)
            merged[k] = v;
            const [uType, uMonth] = k.split('_');
            if (uType && uMonth) {
              this.supabase.syncBill(uType, uMonth, v).catch(() => {});
            }
          }
        }

        this.billsSignal.set(merged);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
        }
      }
    } catch (err) {
      console.warn('Erro ao atualizar faturas do Supabase:', err);
    }
  }

  private async syncWithSupabaseOnStart() {
    await this.refreshBillsFromSupabase();
  }

  private getStorage(): Record<string, BillData> {
    if (typeof localStorage === 'undefined') return {};
    try {
      if (localStorage.getItem(this.CLEAN_SLATE_KEY) !== 'done') {
        localStorage.removeItem(this.STORAGE_KEY);
        return {};
      }
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  generateKey(type: string, month: string): string {
    return `${type}_${month}`;
  }

  saveBill(type: string, month: string, data: BillData) {
    const key = this.generateKey(type, month);
    const existing = this.billsSignal()[key];
    const nextVersion = Math.max(existing?.version || 0, data.version || 0) + 1;

    const updated: BillData = {
      ...data,
      version: nextVersion,
      clientSessionId: this.indexedDb.clientSessionId,
      lastModifiedMs: Date.now(),
      lastUpdated: new Date().toISOString()
    };
    (updated as any)._pendingSync = true;
    
    this.billsSignal.update(curr => ({
      ...curr,
      [key]: updated
    }));
    
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.billsSignal()));
      } catch (e) {
        console.warn('LocalStorage limit reached or full, relying on IndexedDB', e);
      }
    }

    // Persist to IndexedDB and queue for sync if offline
    this.indexedDb.saveBill(type, month, updated).catch(err => {
      console.error('Error saving bill to IndexedDB:', err);
    });

    // Sincroniza em nuvem no Supabase
    this.supabase.syncBill(type, month, updated).then(success => {
      if (success) {
        (updated as any)._pendingSync = false;
        const current = this.billsSignal()[key];
        if (current && current.version === updated.version) {
          (current as any)._pendingSync = false;
        }
      }
    }).catch(err => {
      console.warn('Sincronização do rateio com Supabase falhou ou tabela pendente:', err);
    });
  }

  getBill(type: string, month: string): BillData | null {
    const key = this.generateKey(type, month);
    return this.billsSignal()[key] || null;
  }

  hasBill(type: string, month: string): boolean {
    const key = this.generateKey(type, month);
    return !!this.billsSignal()[key];
  }

  // Método para o Dashboard
  getAllData(): Record<string, BillData> {
    return this.billsSignal();
  }

  clearBillForMonth(type: string, month: string) {
    const key = this.generateKey(type, month);
    const existing = this.billsSignal()[key];
    if (existing) {
      const updated: BillData = {
        ...existing,
        readings: {},
        lastUpdated: new Date().toISOString(),
        version: (existing.version || 0) + 1
      };
      this.saveBill(type, month, updated);
    }
  }

  /**
   * Retorna a última leitura válida (> 0) de cada loja em meses estritamente anteriores a currentMonth.
   * Se uma loja esteve desativada ou sem medição por um ou mais meses, faz a busca retroativa no histórico
   * para encontrar a última medição real gravada no relógio, evitando que ela seja cobrada com valor absoluto.
   */
  getLastValidReadings(type: string, currentMonth: string): Map<string, { reading: number; consumption: number; month: string }> {
    const allData = this.billsSignal();
    const result = new Map<string, { reading: number; consumption: number; month: string }>();

    // 1. Identifica todos os meses passados que possuem faturas salvas desta utilidade e que sejam anteriores a currentMonth
    const pastMonths: string[] = [];
    const prefix = `${type}_`;
    for (const key of Object.keys(allData)) {
      if (key.startsWith(prefix)) {
        const m = key.substring(prefix.length);
        if (m && /^\d{4}-\d{2}$/.test(m) && m < currentMonth) {
          pastMonths.push(m);
        }
      }
    }

    // Calcula o mês imediatamente anterior cronológico caso ele ainda não esteja na lista
    const [year, monthNum] = currentMonth.split('-').map(Number);
    if (!isNaN(year) && !isNaN(monthNum)) {
      const prevDate = new Date(year, monthNum - 2, 1);
      const immediatePrev = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      if (!pastMonths.includes(immediatePrev)) {
        pastMonths.push(immediatePrev);
      }
    }

    // Ordena os meses do mais recente para o mais antigo (ex.: 2026-03, 2026-02, 2026-01...)
    pastMonths.sort().reverse();

    // 2. Itera pelos meses passados mais recentes primeiro
    for (const m of pastMonths) {
      const bill = allData[`${prefix}${m}`];
      if (!bill || !bill.readings) continue;

      for (const [storeId, r] of Object.entries(bill.readings)) {
        // Se já encontramos uma leitura válida (> 0) em um mês mais recente para esta loja, mantém ela
        const existing = result.get(storeId);
        if (existing && existing.reading > 0) {
          continue;
        }

        let reading = 0;
        let consumption = 0;
        if (typeof r === 'object' && r !== null) {
          reading = Number((r as any).reading) || 0;
          consumption = Number((r as any).calculatedConsumption ?? (r as any).consumption) || 0;
        } else if (typeof r === 'number') {
          reading = Number(r) || 0;
          consumption = Number(r) || 0;
        }

        if (reading > 0) {
          result.set(storeId, { reading, consumption, month: m });
        } else if (!existing) {
          // Registra provisoriamente 0 com o mês mais recente caso nenhum mês anterior tenha leitura
          result.set(storeId, { reading: 0, consumption: 0, month: m });
        }
      }
    }

    return result;
  }
}