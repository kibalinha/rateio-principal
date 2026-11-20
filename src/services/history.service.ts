import { Injectable, inject, signal, computed } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';
import { SupabaseService } from './supabase.service';

import { StoreReading, BillData, Store } from '../models';
import { StoreService, normalizeLuc, normalizeContract, normalizeStoreName } from './store.service';
import { parsePtBrNumber, isLikelyOdometerAsConsumption } from './apportionment-engine.service';

export type { StoreReading, BillData };

export function isPopulatedStoreReading(r: StoreReading | number | undefined | null): boolean {
  if (r === undefined || r === null) return false;
  if (typeof r === 'number') return r > 0;
  return Boolean(
    (r.reading && r.reading > 0) ||
    (r.virtual !== undefined && r.virtual !== null) ||
    (r.calculatedConsumption && r.calculatedConsumption > 0) ||
    r.isJustified ||
    r.hasPhoto ||
    (r.note && r.note.trim().length > 0)
  );
}

function getReadingUpdatedAtMs(r: StoreReading | number | undefined | null): number {
  if (r && typeof r === 'object' && typeof r.updatedAtMs === 'number' && !Number.isNaN(r.updatedAtMs)) {
    return r.updatedAtMs;
  }
  return 0;
}

export function mergeStoreReadings(
  localReadings: Record<string, StoreReading | number> = {},
  remoteReadings: Record<string, StoreReading | number> = {},
  isLocalNewer: boolean
): { mergedReadings: Record<string, StoreReading | number>; tookLocalContribution: boolean } {
  const allStoreIds = new Set([
    ...Object.keys(remoteReadings || {}),
    ...Object.keys(localReadings || {})
  ]);
  const mergedReadings: Record<string, StoreReading | number> = {};
  let tookLocalContribution = false;

  for (const storeId of allStoreIds) {
    const localR = localReadings?.[storeId];
    const remoteR = remoteReadings?.[storeId];

    if (localR !== undefined && remoteR === undefined) {
      mergedReadings[storeId] = localR;
      if (isPopulatedStoreReading(localR)) {
        tookLocalContribution = true;
      }
      continue;
    }

    if (remoteR !== undefined && localR === undefined) {
      mergedReadings[storeId] = remoteR;
      continue;
    }

    if (localR !== undefined && remoteR !== undefined) {
      const localPop = isPopulatedStoreReading(localR);
      const remotePop = isPopulatedStoreReading(remoteR);

      if (localPop && !remotePop) {
        mergedReadings[storeId] = localR;
        tookLocalContribution = true;
      } else if (remotePop && !localPop) {
        mergedReadings[storeId] = remoteR;
      } else {
        const localTs = getReadingUpdatedAtMs(localR);
        const remoteTs = getReadingUpdatedAtMs(remoteR);
        if (localTs > remoteTs) {
          mergedReadings[storeId] = localR;
          tookLocalContribution = true;
        } else if (remoteTs > localTs) {
          mergedReadings[storeId] = remoteR;
        } else {
          mergedReadings[storeId] = isLocalNewer ? localR : remoteR;
          if (isLocalNewer) {
            tookLocalContribution = true;
          }
        }
      }
    }
  }

  return { mergedReadings, tookLocalContribution };
}

export function mergeBillData(
  local: BillData,
  remote: BillData
): { merged: BillData; shouldSyncRemote: boolean } {
  const localVersion = local.version || 0;
  const remoteVersion = remote.version || 0;
  const localTime = local.lastModifiedMs || (local.lastUpdated ? new Date(local.lastUpdated).getTime() : 0);
  const remoteTime = remote.lastModifiedMs || (remote.lastUpdated ? new Date(remote.lastUpdated).getTime() : 0);

  // Resolução de Conflitos OCC (Optimistic Concurrency Control):
  // 1. Se a versão local é maior, a alteração foi realizada neste dispositivo e ainda não sincronizou completamente com a nuvem.
  // 2. Se as versões empatarem, vence o timestamp mais recente.
  const isLocalNewer = localVersion > remoteVersion || (localVersion === remoteVersion && localTime > remoteTime);

  const { mergedReadings, tookLocalContribution } = mergeStoreReadings(
    local.readings || {},
    remote.readings || {},
    isLocalNewer
  );

  const baseBill = isLocalNewer ? local : remote;
  const merged: BillData = {
    ...baseBill,
    readings: mergedReadings
  };

  return {
    merged,
    shouldSyncRemote: isLocalNewer || tookLocalContribution
  };
}

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  private readonly STORAGE_KEY = 'shop_rateio_history';
  private readonly CLEAN_SLATE_KEY = 'shop_rateio_clean_slate_20261120_v1';
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
  readonly storeService: StoreService = (() => {
    try {
      return inject(StoreService);
    } catch {
      return {} as any;
    }
  })();

  private getAllStoresFallback(): Store[] {
    try {
      if (this.storeService && typeof this.storeService.stores === 'function') {
        const s = this.storeService.stores();
        if (s && s.length > 0) return s;
      }
    } catch {}
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('shop_rateio_stores_data');
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  }

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
        const merged: Record<string, BillData> = {};
        for (const [k, v] of Object.entries(remoteBills)) {
          if (!k.startsWith('__')) {
            merged[k] = v;
          }
        }
        for (const [k, v] of Object.entries(local)) {
          if (k.startsWith('__')) continue;
          const remoteItem = merged[k];
          if (remoteItem) {
            const { merged: mergedBill, shouldSyncRemote } = mergeBillData(v, remoteItem);
            merged[k] = mergedBill;
            if (shouldSyncRemote) {
              const [uType, uMonth] = k.split('_');
              if (uType && uMonth) {
                this.supabase.syncBill(uType, uMonth, mergedBill).catch(() => {});
              }
            }
          } else if ((v as any)?._pendingSync === true) {
            // Existe apenas localmente e ainda não foi sincronizado (criado offline)
            merged[k] = v;
            const [uType, uMonth] = k.split('_');
            if (uType && uMonth) {
              this.supabase.syncBill(uType, uMonth, v).catch(() => {});
            }
          } else {
            // Não existe mais no Supabase e não está pendente offline -> foi apagado na nuvem
            const [uType, uMonth] = k.split('_');
            if (uType && uMonth && typeof this.indexedDb?.deleteBill === 'function') {
              this.indexedDb.deleteBill(uType, uMonth).catch(() => {});
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
      if (!data) return {};
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object') return {};
      const cleaned: Record<string, BillData> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (!k.startsWith('__')) {
          cleaned[k] = v as BillData;
        }
      }
      return cleaned;
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
    const nowMs = Date.now();

    const stampedReadings: Record<string, StoreReading | number> = {};
    for (const [storeId, r] of Object.entries(data.readings || {})) {
      if (r && typeof r === 'object') {
        const prev = existing?.readings?.[storeId];
        if (isPopulatedStoreReading(r)) {
          const changed =
            !prev ||
            typeof prev !== 'object' ||
            prev.reading !== r.reading ||
            prev.virtual !== r.virtual ||
            prev.calculatedConsumption !== r.calculatedConsumption ||
            prev.isJustified !== r.isJustified ||
            prev.hasPhoto !== r.hasPhoto ||
            prev.note !== r.note;
          stampedReadings[storeId] = {
            ...r,
            updatedAtMs: changed ? nowMs : (r.updatedAtMs ?? prev.updatedAtMs ?? nowMs)
          };
        } else {
          stampedReadings[storeId] = r;
        }
      } else {
        stampedReadings[storeId] = r;
      }
    }

    const updated: BillData = {
      ...data,
      readings: stampedReadings,
      version: nextVersion,
      clientSessionId: this.indexedDb.clientSessionId,
      lastModifiedMs: nowMs,
      lastUpdated: new Date(nowMs).toISOString()
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
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.billsSignal()));
            } catch {}
          }
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

  async clearBillForMonth(type: string, month: string): Promise<void> {
    const key = this.generateKey(type, month);
    this.billsSignal.update(curr => {
      if (!(key in curr)) return curr;
      const { [key]: _, ...rest } = curr;
      return rest;
    });

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.billsSignal()));
      } catch {}
    }

    if (typeof this.indexedDb?.deleteBill === 'function') {
      await this.indexedDb.deleteBill(type, month);
    }

    if (typeof this.supabase?.deleteBill === 'function') {
      await this.supabase.deleteBill(type, month);
    }
  }

  removeStoreFromAllBills(storeId: string): void {
    const all = this.billsSignal();
    for (const [key, bill] of Object.entries(all)) {
      if (!bill?.readings || !(storeId in bill.readings)) continue;
      const [uType, uMonth] = key.split('_');
      if (!uType || !uMonth) continue;
      const { [storeId]: _, ...remainingReadings } = bill.readings;
      this.saveBill(uType, uMonth, {
        ...bill,
        readings: remainingReadings
      });
    }
  }

  /**
   * Retorna a última leitura válida (> 0) de cada loja em meses estritamente anteriores a currentMonth.
   * Se uma loja esteve desativada ou sem medição por um ou mais meses, faz a busca retroativa no histórico
   * para encontrar a última medição real gravada no relógio, evitando que ela seja cobrada com valor absoluto.
   */
  getLastValidReadings(type: string, currentMonth: string): Map<string, { reading: number; consumption: number; cost?: number; month: string }> {
    const allData = this.billsSignal();
    const result = new Map<string, { reading: number; consumption: number; cost?: number; month: string }>();

    // Mapeamentos multidimensionais de lojas para permitir busca e fallback por ID, LUC, Contrato e Nome
    const allStores = this.getAllStoresFallback();
    const idToLuc = new Map<string, string>();
    const idToContrato = new Map<string, string>();
    const idToName = new Map<string, string>();
    const lucToIds = new Map<string, string[]>();
    const contratoToIds = new Map<string, string[]>();
    const nameToIds = new Map<string, string[]>();
    const lucContratoToIds = new Map<string, string[]>();

    for (const s of allStores) {
      if (!s.id) continue;
      const normLuc = s.luc ? normalizeLuc(s.luc) : '';
      const normContrato = s.contrato ? normalizeContract(s.contrato) : '';
      const normName = s.name ? normalizeStoreName(s.name) : '';

      if (normLuc) {
        idToLuc.set(s.id, normLuc);
        const existing = lucToIds.get(normLuc) || [];
        existing.push(s.id);
        lucToIds.set(normLuc, existing);
      }
      if (normContrato) {
        idToContrato.set(s.id, normContrato);
        const existing = contratoToIds.get(normContrato) || [];
        existing.push(s.id);
        contratoToIds.set(normContrato, existing);
      }
      if (normName) {
        idToName.set(s.id, normName);
        const existing = nameToIds.get(normName) || [];
        existing.push(s.id);
        nameToIds.set(normName, existing);
      }
      if (normLuc && normContrato) {
        const key = `${normLuc}_${normContrato}`;
        const existing = lucContratoToIds.get(key) || [];
        existing.push(s.id);
        lucContratoToIds.set(key, existing);
      }
    }

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

    // Ordena os meses do mais recente para o mais antigo (ex.: 2026-10, 2026-09, 2026-08...)
    pastMonths.sort().reverse();

    const monthlyLists = typeof (this.storeService as any)?.monthlyStoreLists === 'function'
      ? (this.storeService as any).monthlyStoreLists()
      : {};

    // 2. Itera pelos meses passados mais recentes primeiro
    for (const m of pastMonths) {
      const listKey = `${prefix}${m}`;
      if (listKey in monthlyLists && (!monthlyLists[listKey] || monthlyLists[listKey].length === 0)) {
        continue;
      }
      const bill = allData[listKey];
      if (!bill || !bill.readings) continue;

      // Tarifa unitária do mês histórico para cálculo do custo caso não esteja gravado diretamente
      const totalBill = (bill.costItems || []).reduce((acc: number, item: any) => acc + parsePtBrNumber(item?.value), 0);
      let totalConsumption = 0;
      if (type === 'luz') {
        const c = bill.consumptionInput || {};
        totalConsumption = parsePtBrNumber(c.bss1) + parsePtBrNumber(c.bss2) + parsePtBrNumber(c.bss3) + parsePtBrNumber(c.bss4);
      } else {
        totalConsumption = parsePtBrNumber(bill.consumptionInput);
      }
      const unitPrice = totalConsumption > 0 ? (totalBill / totalConsumption) : 0;

      for (const [storeId, r] of Object.entries(bill.readings)) {
        // Se já encontramos uma leitura válida (> 0) em um mês mais recente para esta loja, mantém ela
        const existing = result.get(storeId);
        if (existing && (existing.reading > 0 || existing.consumption > 0)) {
          continue;
        }

        let reading = 0;
        let consumption = 0;
        let cost = 0;
        if (typeof r === 'object' && r !== null) {
          reading = Number((r as any).reading) || 0;
          consumption = Number((r as any).calculatedConsumption ?? (r as any).consumption) || 0;
          const rawCons = Number((r as any).rawConsumption) || 0;
          const consToCheck = rawCons > 0 ? rawCons : consumption;
          const c = Number((r as any).constant) || 1;
          const adj = Number((r as any).adjustment) || (type === 'gas' ? 1.347 : 1);
          const fcm = type === 'gas' ? (Number((r as any).fcm) || 1.0727) : 1;
          const hasVirtual = (r as any).virtual !== undefined && (r as any).virtual !== null && (r as any).virtual !== '';

          if (isLikelyOdometerAsConsumption(reading, consToCheck, c, adj, fcm, hasVirtual)) {
            // Registro histórico de mês-base onde o ponteiro inteiro foi gravado como consumo:
            // preserva o ponteiro (reading) como referência do próximo mês, mas zera consumo/custo anterior.
            consumption = 0;
            cost = 0;
          } else if ((r as any).cost !== undefined && (r as any).cost !== null && !isNaN(Number((r as any).cost))) {
            cost = Number((r as any).cost);
          } else {
            const fluxo = Number((r as any).fluxoCost) || 0;
            const adjAdd = Number((r as any).adjustmentAdd) || 0;
            cost = (consumption * unitPrice) + fluxo + adjAdd;
          }
        } else if (typeof r === 'number') {
          reading = Number(r) || 0;
          consumption = Number(r) || 0;
          cost = consumption * unitPrice;
        }

        // Recupera metadados salvos na própria leitura ou mapeados pelo ID
        const storeLuc = (r && typeof r === 'object') ? ((r as any).luc || (r as any).storeLuc) : undefined;
        const normLuc = storeLuc ? normalizeLuc(storeLuc) : (idToLuc.get(storeId) || '');
        const storeContrato = (r && typeof r === 'object') ? (r as any).contrato : undefined;
        const normContrato = storeContrato ? normalizeContract(storeContrato) : (idToContrato.get(storeId) || '');
        const storeName = (r && typeof r === 'object') ? ((r as any).storeName || (r as any).name) : undefined;
        const normName = storeName ? normalizeStoreName(storeName) : (idToName.get(storeId) || '');

        const hasValidData = reading > 0 || consumption > 0 || cost > 0;
        if (hasValidData) {
          const entry = { reading, consumption, cost, month: m };
          result.set(storeId, entry);

          if (normLuc) {
            if (!result.has(`luc:${normLuc}`)) {
              result.set(`luc:${normLuc}`, entry);
            }
            const peerIds = lucToIds.get(normLuc) || [];
            for (const peerId of peerIds) {
              const peerExisting = result.get(peerId);
              if (!peerExisting || (peerExisting.reading === 0 && reading > 0)) {
                result.set(peerId, entry);
              }
            }
          }
          if (normContrato) {
            if (!result.has(`contrato:${normContrato}`)) {
              result.set(`contrato:${normContrato}`, entry);
            }
            const peerIds = contratoToIds.get(normContrato) || [];
            for (const peerId of peerIds) {
              const peerExisting = result.get(peerId);
              if (!peerExisting || (peerExisting.reading === 0 && reading > 0)) {
                result.set(peerId, entry);
              }
            }
          }
          if (normName) {
            if (!result.has(`name:${normName}`)) {
              result.set(`name:${normName}`, entry);
            }
          }
          if (normLuc && normContrato) {
            const key = `luc_contrato:${normLuc}_${normContrato}`;
            if (!result.has(key)) {
              result.set(key, entry);
            }
            const peerIds = lucContratoToIds.get(`${normLuc}_${normContrato}`) || [];
            for (const peerId of peerIds) {
              const peerExisting = result.get(peerId);
              if (!peerExisting || (peerExisting.reading === 0 && reading > 0)) {
                result.set(peerId, entry);
              }
            }
          }
          if (normLuc && normName) {
            const key = `luc_name:${normLuc}_${normName}`;
            if (!result.has(key)) {
              result.set(key, entry);
            }
          }
        } else if (!existing) {
          // Registra provisoriamente 0 com o mês mais recente caso nenhum mês anterior tenha leitura
          result.set(storeId, { reading: 0, consumption: 0, cost: 0, month: m });
        }
      }
    }

    // 3. Passagem de reconciliação final para lojas que ainda não tenham leitura associada
    for (const s of allStores) {
      if (!s.id) continue;
      const cur = result.get(s.id);
      if (!cur || cur.reading === 0) {
        const normLuc = s.luc ? normalizeLuc(s.luc) : '';
        const normContrato = s.contrato ? normalizeContract(s.contrato) : '';
        const normName = s.name ? normalizeStoreName(s.name) : '';

        const matchedEntry = 
          (normLuc && normContrato ? result.get(`luc_contrato:${normLuc}_${normContrato}`) : undefined) ||
          (normLuc && normName ? result.get(`luc_name:${normLuc}_${normName}`) : undefined) ||
          (normLuc ? result.get(`luc:${normLuc}`) : undefined) ||
          (normContrato ? result.get(`contrato:${normContrato}`) : undefined) ||
          (normName ? result.get(`name:${normName}`) : undefined);

        if (matchedEntry && (matchedEntry.reading > 0 || matchedEntry.consumption > 0 || (matchedEntry.cost || 0) > 0)) {
          result.set(s.id, matchedEntry);
        }
      }
    }

    return result;
  }
}