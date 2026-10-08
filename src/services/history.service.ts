import { Injectable, inject, signal, computed } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';
import { SupabaseService } from './supabase.service';

export type StoreReading = {
  reading: number;       // Leitura Atual
  constant: number;      // Constante do medidor (Luz)
  virtual: number;       // Consumo Virtual (override)
  adjustment: number;    // Fator de ajuste Multiplicador (Luz/Água/Gás - Ajuste X)
  
  // Novos campos opcionais para Gás
  adjustmentAdd?: number; // Ajuste (+) Somatório
  fcm?: number;           // Fator de Correção do Medidor (FCM)
  fluxoCost?: number;     // Recuperação de Fluxo (R$)

  rawConsumption?: number;// Consumo medido bruto antes do rateio proporcional (Gás)
  gasFactor?: number;     // Fator de rateio proporcional aplicado (Gás)
  calculatedConsumption: number; // Consumo Final calculado/salvo
  note?: string;          // Observação de campo (ex: 'Relógio embaçado', 'Loja em reforma')
  hasPhoto?: boolean;     // Comprovante / Foto de Evidência gravada no IndexedDB
  photoTimestamp?: string;// Data/hora da captura da foto

  // Auditoria Inteligente e Anti-Erro em Campo
  anomalyConfirmed?: boolean; // Confirmado intencionalmente pelo técnico
  isRollover?: boolean;       // Marcado como virada física de medidor (9999 -> 0000)
};

export interface BillData {
  costItems: any[];
  consumptionInput: any;
  acInput: number;
  // Readings agora pode armazenar o objeto complexo ou número legado
  readings: Record<string, StoreReading | number>; 
  manualBill?: number;
  manualConsumption?: number;
  lastUpdated: string;
  isLocked?: boolean;
  lockedAt?: string;
  lockedBy?: string;
  gasAutoDistribute?: boolean; // Rateio 100% proporcional automático no Gás
}

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
          // Apenas preserva faturas locais se criadas offline e pendentes
          if ((v as any)._offlineCreated && !merged[k]) {
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
    const updated = {
      ...data,
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