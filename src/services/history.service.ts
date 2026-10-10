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
  readonly indexedDb = inject(IndexedDbService);
  readonly supabase = inject(SupabaseService);

  private billsSignal = signal<Record<string, BillData>>(this.getStorage());
  readonly bills = computed(() => this.billsSignal());

  constructor() {
    this.syncWithSupabaseOnStart();
    this.setupRealtimeSync();
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

            // A fatura remota do Supabase prevalece sempre para manter sincronia instantânea entre múltiplos dispositivos (Web <-> Mobile).
            // Apenas preservamos a versão local se for uma criação/modificação offline pendente que ainda não subiu para a nuvem.
            const hasPendingOffline = (v as any)._offlineCreated || (v as any)._pendingSync;
            if (hasPendingOffline && (localVersion > remoteVersion || localTime > remoteTime)) {
              merged[k] = v;
            } else {
              merged[k] = remoteItem;
            }
          } else if ((v as any)._offlineCreated) {
            merged[k] = v;
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
    this.supabase.syncBill(type, month, updated).catch(err => {
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
}