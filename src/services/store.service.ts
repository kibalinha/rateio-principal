import { Injectable, signal, computed, inject } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';
import { SupabaseService } from './supabase.service';

import {
  Store,
  MonthlyImportResult,
  MonthlyImportPreview,
  MonthlyImportRowAction
} from '../models';
import { normalizeContractAndNameOrder } from './store-import.helpers';

export type { Store, MonthlyImportResult, MonthlyImportPreview, MonthlyImportRowAction };

/**
 * Normaliza o LUC para comparações seguras (remove acentos, ex: 'L-101', 'LUC 101', 'DEPÓSITO 12A' -> '101', 'deposito12a')
 */
export function normalizeLuc(luc?: string | null): string {
  return (luc || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^luc\s*[-_./]?\s*/i, '')
    .replace(/^l\s*[-_./]\s*/i, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Normaliza o número do contrato para comparações seguras (remove pontuação e zeros à esquerda)
 */
export function normalizeContract(c?: string | null): string {
  return (c || '').replace(/[^a-zA-Z0-9]/g, '').replace(/^0+/, '').toLowerCase();
}

/**
 * Normaliza o nome da loja para comparação fonética/textual (sem acentos, sem sufixos societários comuns)
 */
export function normalizeStoreName(name?: string | null): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|eireli|s\/a|sa|me|epp|cia|comercio|loja)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determina se uma loja estava ativa em um determinado mês de referência (YYYY-MM).
 * - Se isExplicitlyInMonthList for true: a loja pertence à lista explícita importada para o mês, logo está ativa nele.
 * - Se store.active !== false: loja atualmente ativa.
 * - Se inativa, mas deactivatedAt > month: a inativação ocorreu apenas em mês futuro; no mês consultado ela estava 100% ativa!
 */
export function isStoreActiveInMonth(store: Store, month: string, isExplicitlyInMonthList: boolean = false): boolean {
  if (isExplicitlyInMonthList) {
    return true;
  }
  if (store.active !== false) {
    return true;
  }
  if (store.deactivatedAt && store.deactivatedAt > month) {
    return true;
  }
  return false;
}

/**
 * Gera um UUID seguro com fallback para ambientes sem suporte a crypto.randomUUID (ex: HTTP local ou webviews legadas)
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}


@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private readonly STORAGE_KEY = 'shop_rateio_stores_data';
  private readonly MONTHLY_LISTS_STORAGE_KEY = 'shop_rateio_monthly_store_lists';
  private indexedDb: IndexedDbService = ({} as any);
  private supabase: SupabaseService = ({} as any);

  private defaultStores: Store[] = [
    { id: '1', luc: 'L-101', contrato: '10423', name: 'Zara Moda', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 1, meterNumber: 'REL-101' },
    { id: '2', luc: 'L-104', contrato: '10428', name: 'Burger King', active: true, usesLuz: true, usesAgua: true, usesGas: true, routeOrder: 2, meterNumber: 'REL-104' },
    { id: '3', luc: 'L-205', contrato: '20511', name: 'Livraria Leitura', active: true, usesLuz: true, usesAgua: false, usesGas: false, routeOrder: 3, meterNumber: 'REL-205' },
    { id: '4', luc: 'Q-012', contrato: '30114', name: 'Samsung Store', active: true, usesLuz: true, usesAgua: false, usesGas: false, routeOrder: 4, meterNumber: 'REL-012' },
    { id: '5', luc: 'Q-015', contrato: '30118', name: 'Kopenhagen', active: true, usesLuz: true, usesAgua: true, usesGas: false, routeOrder: 5, meterNumber: 'REL-015' },
  ];

  private storesSignal = signal<Store[]>(this.loadInitialStores());
  readonly stores = computed(() => this.storesSignal());

  private monthlyStoreListsSignal = signal<Record<string, string[]>>(this.loadInitialMonthlyLists());
  readonly monthlyStoreLists = computed(() => this.monthlyStoreListsSignal());

  private isLocalWriteInFlight = false;
  private suppressRealtimeUntilMs = 0;
  private realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    try {
      this.indexedDb = inject(IndexedDbService);
      this.supabase = inject(SupabaseService);
    } catch {
      // Executando fora do contexto Angular (ex.: testes unitários isolados)
    }

    if (this.indexedDb?.getMonthlyStoreLists) {
      this.indexedDb.getMonthlyStoreLists().then(idbLists => {
        if (idbLists && Object.keys(idbLists).length > 0) {
          this.monthlyStoreListsSignal.update(curr => {
            const merged: Record<string, string[]> = { ...curr };
            for (const [key, list] of Object.entries(idbLists)) {
              if (!merged[key] || (Array.isArray(list) && list.length > merged[key].length)) {
                merged[key] = list;
              }
            }
            return merged;
          });
        }
      }).catch(() => {});
    }

    if (typeof this.supabase?.subscribeToStores === 'function') {
      this.syncWithSupabaseOnStart();
      this.setupRealtimeSync();
    }
  }

  private setupRealtimeSync() {
    this.supabase.subscribeToStores(() => {
      if (this.isLocalWriteInFlight || Date.now() < this.suppressRealtimeUntilMs) {
        return;
      }
      if (this.realtimeDebounceTimer) {
        clearTimeout(this.realtimeDebounceTimer);
      }
      this.realtimeDebounceTimer = setTimeout(() => {
        this.realtimeDebounceTimer = null;
        if (this.isLocalWriteInFlight || Date.now() < this.suppressRealtimeUntilMs) {
          return;
        }
        this.refreshStoresFromSupabase().catch(() => {});
      }, 800);
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.syncStoresToSupabase().catch(() => {});
      });
    }
  }

  private readonly CLEAN_SLATE_KEY = 'shop_rateio_clean_slate_20261007_v1';

  async syncStoresToSupabase(): Promise<boolean> {
    const list = this.storesSignal();
    if (list && list.length > 0) {
      this.suppressRealtimeUntilMs = Math.max(this.suppressRealtimeUntilMs, Date.now() + 2000);
      const ok = await this.supabase.syncStores(list);
      if (ok) {
        const cleaned = list.map(s => {
          const { _offlineCreated, ...rest } = s as any;
          return rest as Store;
        });
        this.storesSignal.set(cleaned);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cleaned));
        }
        await this.indexedDb?.saveStores?.(cleaned);
      }
      return ok;
    }
    return true;
  }

  async flushSyncToSupabase(): Promise<{ storesOk: boolean; listsOk: boolean; hiddenOk: boolean }> {
    this.isLocalWriteInFlight = true;
    this.suppressRealtimeUntilMs = Date.now() + 4000;
    if (this.realtimeDebounceTimer) {
      clearTimeout(this.realtimeDebounceTimer);
      this.realtimeDebounceTimer = null;
    }

    let storesOk = true;
    let listsOk = true;
    let hiddenOk = true;

    try {
      if (typeof this.supabase?.syncStores === 'function') {
        storesOk = await this.syncStoresToSupabase();
      }
      if (typeof this.supabase?.syncMonthlyStoreLists === 'function') {
        listsOk = await this.supabase.syncMonthlyStoreLists(this.monthlyStoreListsSignal());
      }
      const hiddenStores = this.storesSignal().filter(s => s.hiddenFromTech === true);
      if (hiddenStores.length > 0 && typeof this.supabase?.syncHiddenFromTech === 'function') {
        const hiddenIds = hiddenStores.map(s => s.id);
        const hiddenLucs = Array.from(new Set(hiddenStores.map(s => normalizeLuc(s.luc)).filter(Boolean)));
        hiddenOk = await this.supabase.syncHiddenFromTech(hiddenIds, hiddenLucs);
      }
      return { storesOk, listsOk, hiddenOk };
    } finally {
      this.isLocalWriteInFlight = false;
      this.suppressRealtimeUntilMs = Date.now() + 1500;
    }
  }

  async refreshStoresFromSupabase() {
    if (this.isLocalWriteInFlight) return;
    try {
      const remoteStores = await this.supabase.fetchStores();
      if (this.isLocalWriteInFlight) return;
      if (remoteStores !== null) {
        const local = this.storesSignal();
        const remoteIds = new Set(remoteStores.map(s => String(s.id)));
        // Preserva apenas lojas criadas no modo offline explicitamente não enviadas ainda
        const pendingLocal = local.filter(s => !remoteIds.has(String(s.id)) && (s as any)._offlineCreated);

        let finalStores = remoteStores;
        if (pendingLocal.length > 0) {
          finalStores = [...remoteStores, ...pendingLocal];
          this.supabase.syncStores(finalStores).catch(() => {});
        }

        // Mescla configuração de lojas ocultas do técnico (armazenada em bills/__hidden_from_tech_v1__)
        const localHiddenIds = new Set(local.filter(s => s.hiddenFromTech).map(s => String(s.id)));
        const localHiddenLucs = new Set(local.filter(s => s.hiddenFromTech).map(s => normalizeLuc(s.luc)).filter(Boolean));
        let remoteHidden: { hiddenIds: string[]; hiddenLucs: string[] } | null = null;
        if (typeof this.supabase?.fetchHiddenFromTech === 'function') {
          remoteHidden = await this.supabase.fetchHiddenFromTech();
        }
        if (this.isLocalWriteInFlight) return;
        const hiddenIdSet = remoteHidden !== null ? new Set(remoteHidden.hiddenIds.map(String)) : localHiddenIds;
        const hiddenLucSet = remoteHidden !== null ? new Set(remoteHidden.hiddenLucs.map(normalizeLuc).filter(Boolean)) : localHiddenLucs;

        finalStores = finalStores.map(s => {
          const isHidden = hiddenIdSet.has(String(s.id)) || (!!s.luc && hiddenLucSet.has(normalizeLuc(s.luc)));
          return isHidden ? { ...s, hiddenFromTech: true } : { ...s, hiddenFromTech: false };
        });

        this.storesSignal.set(finalStores);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(finalStores));
        }
        await this.indexedDb?.saveStores?.(finalStores);

        // Também atualiza listas mensais caso tenham sido modificadas remotamente (aceitando arrays vazios [] limpos remotamente)
        if (typeof this.supabase?.fetchMonthlyStoreLists === 'function') {
          const remoteLists = await this.supabase.fetchMonthlyStoreLists();
          if (this.isLocalWriteInFlight) return;
          if (remoteLists && typeof remoteLists === 'object') {
            this.monthlyStoreListsSignal.update(curr => {
              const merged: Record<string, string[]> = { ...curr };
              for (const [key, remoteList] of Object.entries(remoteLists)) {
                if (Array.isArray(remoteList)) {
                  merged[key] = remoteList;
                }
              }
              if (typeof localStorage !== 'undefined') {
                try {
                  localStorage.setItem(this.MONTHLY_LISTS_STORAGE_KEY, JSON.stringify(merged));
                } catch {}
              }
              this.indexedDb?.saveMonthlyStoreLists?.(merged);
              return merged;
            });
          }
        }
      }
    } catch (err) {
      console.warn('Sincronização de lojas com Supabase:', err);
    }
  }

  private async syncWithSupabaseOnStart() {
    await this.refreshStoresFromSupabase();
  }

  private loadInitialStores(): Store[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      if (localStorage.getItem(this.CLEAN_SLATE_KEY) !== 'done') {
        localStorage.removeItem(this.STORAGE_KEY);
        return [];
      }
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Se o usuário zerou o banco, parsed é [] e retorna []!
          return parsed.map((s: any) => ({
            ...s,
            active: s.active !== undefined ? s.active : true
          }));
        }
      }
    } catch (e) {
      console.error('Error loading stores from localStorage', e);
    }
    return [];
  }

  private loadInitialMonthlyLists(): Record<string, string[]> {
    if (typeof localStorage === 'undefined') return {};
    try {
      if (localStorage.getItem(this.CLEAN_SLATE_KEY) !== 'done') {
        localStorage.removeItem(this.MONTHLY_LISTS_STORAGE_KEY);
        return {};
      }
      const stored = localStorage.getItem(this.MONTHLY_LISTS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }

      // Migração/Inicialização: se não há listas salvas ainda,
      // verifica faturas já salvas no histórico com leituras existentes
      const historyBills = this.getHistoryBillsFallback();
      const initial: Record<string, string[]> = {};
      for (const [key, bill] of Object.entries(historyBills)) {
        if (bill && bill.readings && Object.keys(bill.readings).length > 0) {
          initial[key] = Object.keys(bill.readings);
        }
      }

      // Se ainda não há listas mensais e existem lojas cadastradas,
      // vincula as lojas existentes ao mês corrente para não quebrar a visualização imediata do usuário
      if (Object.keys(initial).length === 0) {
        const currentMonth = new Date().toISOString().substring(0, 7);
        const currentStores = this.loadInitialStores();
        if (currentStores.length > 0) {
          initial[`luz_${currentMonth}`] = currentStores.filter(s => s.usesLuz && s.active !== false).map(s => s.id);
          initial[`agua_${currentMonth}`] = currentStores.filter(s => s.usesAgua && s.active !== false).map(s => s.id);
          initial[`gas_${currentMonth}`] = currentStores.filter(s => s.usesGas && s.active !== false).map(s => s.id);
          initial[currentMonth] = currentStores.filter(s => s.active !== false).map(s => s.id);
        }
      }

      return initial;
    } catch (e) {
      console.warn('Erro ao carregar listas mensais de lojas:', e);
      return {};
    }
  }

  private persistMonthlyStoreLists(lists: Record<string, string[]>, syncToCloud: boolean = true) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.MONTHLY_LISTS_STORAGE_KEY, JSON.stringify(lists));
      } catch (e) {
        console.error('Erro ao salvar listas mensais de lojas:', e);
      }
    }
    this.indexedDb?.saveMonthlyStoreLists?.(lists);
    if (syncToCloud) {
      this.supabase?.syncMonthlyStoreLists?.(lists)?.catch?.(() => {});
    }
  }

  private getHistoryBillsFallback(): Record<string, any> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const data = localStorage.getItem('shop_rateio_history');
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  private persistStores(list: Store[], syncToCloud: boolean = true) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
      } catch (e) {
        console.error('Error saving stores to localStorage', e);
      }
    }
    this.indexedDb?.saveStores?.(list)?.catch?.(() => {});
    if (syncToCloud && list.length > 0) {
      this.suppressRealtimeUntilMs = Math.max(this.suppressRealtimeUntilMs, Date.now() + 2000);
      this.supabase?.syncStores?.(list)?.catch?.(() => {});
    }
  }

  private syncHiddenFromTechConfig(list: Store[]) {
    const hiddenStores = list.filter(s => s.hiddenFromTech === true);
    const hiddenIds = hiddenStores.map(s => s.id);
    const hiddenLucs = Array.from(new Set(hiddenStores.map(s => normalizeLuc(s.luc)).filter(Boolean)));
    this.supabase?.syncHiddenFromTech?.(hiddenIds, hiddenLucs)?.catch?.(() => {});
  }

  /**
   * Alterna se uma loja fica oculta para o Técnico em Campo (TEC).
   * A loja continua 100% ativa no rateio, cálculos e exportação SAP para ADM.
   */
  toggleHiddenFromTech(id: string) {
    this.storesSignal.update(stores => {
      const updated = stores.map(s =>
        s.id === id ? { ...s, hiddenFromTech: !s.hiddenFromTech } : s
      );
      this.persistStores(updated);
      this.syncHiddenFromTechConfig(updated);
      return updated;
    });
  }

  /**
   * Define em lote a visibilidade de múltiplas lojas para o Técnico em Campo (TEC).
   */
  setHiddenFromTechBatch(ids: string[], hidden: boolean) {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    this.storesSignal.update(stores => {
      const updated = stores.map(s =>
        idSet.has(s.id) ? { ...s, hiddenFromTech: hidden } : s
      );
      this.persistStores(updated);
      this.syncHiddenFromTechConfig(updated);
      return updated;
    });
  }

  /**
   * Zera todas as lojas no app, IndexedDB e no Supabase
   */
  async clearAllStores() {
    this.isLocalWriteInFlight = true;
    this.suppressRealtimeUntilMs = Date.now() + 4000;
    try {
      this.storesSignal.set([]);
      this.monthlyStoreListsSignal.set({});
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
        localStorage.removeItem(this.MONTHLY_LISTS_STORAGE_KEY);
      }
      await this.indexedDb?.saveStores?.([]);
      await this.indexedDb?.saveMonthlyStoreLists?.({});
      await this.supabase?.clearAllStores?.();
      await this.supabase?.syncMonthlyStoreLists?.({});
    } finally {
      this.isLocalWriteInFlight = false;
      this.suppressRealtimeUntilMs = Date.now() + 1500;
    }
  }

  /**
   * Carrega lojas de demonstração / exemplo (caso o usuário queira testar)
   */
  async loadDemoStores() {
    const list = [...this.defaultStores];
    this.storesSignal.set(list);
    this.persistStores(list);
  }

  /**
   * Verifica se um mês possui lista mensal de lojas importada ou faturas salvas
   */
  hasMonthlyList(type: 'luz' | 'agua' | 'gas', month: string): boolean {
    const key = `${type}_${month}`;
    const lists = this.monthlyStoreListsSignal();
    if (key in lists) {
      return (lists[key]?.length || 0) > 0;
    }

    // Fallback legado apenas se nenhuma lista por utilidade existir para o mês
    if (lists[month] && lists[month].length > 0 && !lists[`luz_${month}`] && !lists[`agua_${month}`] && !lists[`gas_${month}`]) {
      return true;
    }

    const historyBills = this.getHistoryBillsFallback();
    const bill = historyBills[key];
    return !!(bill && bill.readings && Object.keys(bill.readings).length > 0);
  }

  /**
   * Retorna as lojas pertencentes a um mês específico de referência.
   * Se o mês não possuir lista mensal importada e nem histórico, retorna vazio ([]).
   */
  getStoresForMonth(type: 'luz' | 'agua' | 'gas', month: string, includeInactive: boolean = true): Store[] {
    const key = `${type}_${month}`;
    const lists = this.monthlyStoreListsSignal();

    // Se esta utilidade e mês possuem lista explícita definida (mesmo que vazia [])
    if (key in lists) {
      const storeIds = lists[key];
      if (!storeIds || storeIds.length === 0) {
        return [];
      }
      const idSet = new Set(storeIds);
      return this.storesSignal().filter(s => {
        if (!idSet.has(s.id)) return false;
        const matchesType = type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
        if (!matchesType) return false;

        if (!includeInactive) {
          const isActiveInMonth = isStoreActiveInMonth(s, month, false);
          if (!isActiveInMonth) return false;
        }

        return true;
      });
    }

    let storeIds: string[] | undefined;
    // Fallback para lista legada caso não exista lista específica desta utilidade
    if (lists[month] && !lists[`luz_${month}`] && !lists[`agua_${month}`] && !lists[`gas_${month}`]) {
      storeIds = lists[month];
    }

    if (!storeIds || storeIds.length === 0) {
      const historyBills = this.getHistoryBillsFallback();
      const bill = historyBills[key];
      if (bill && bill.readings && Object.keys(bill.readings).length > 0) {
        storeIds = Object.keys(bill.readings);
      }
    }

    // Se o mês não tem lista mensal e nem fatura salva, fica em branco ([])
    if (!storeIds || storeIds.length === 0) {
      return [];
    }

    const idSet = new Set(storeIds);
    return this.storesSignal().filter(s => {
      if (!idSet.has(s.id)) return false;
      const matchesType = type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
      if (!matchesType) return false;

      if (!includeInactive) {
        const isActiveInMonth = isStoreActiveInMonth(s, month, false);
        if (!isActiveInMonth) return false;
      }

      return true;
    });
  }

  /**
   * Retorna os meses (YYYY-MM) que possuem lista mensal importada ou histórico
   */
  getAvailableMonths(type?: 'luz' | 'agua' | 'gas'): string[] {
    const monthsSet = new Set<string>();
    const lists = this.monthlyStoreListsSignal();

    for (const [key, val] of Object.entries(lists)) {
      if (!val || val.length === 0) continue;
      if (type) {
        if (key.startsWith(`${type}_`)) {
          const m = key.substring(type.length + 1);
          if (m && /^\d{4}-\d{2}$/.test(m)) monthsSet.add(m);
        }
      } else {
        const parts = key.split('_');
        const m = parts.length > 1 ? parts[1] : parts[0];
        if (m && /^\d{4}-\d{2}$/.test(m)) monthsSet.add(m);
      }
    }

    const historyBills = this.getHistoryBillsFallback();
    for (const [k, bill] of Object.entries(historyBills)) {
      if (!bill || !bill.readings || Object.keys(bill.readings).length === 0) continue;
      if (type) {
        if (k in lists && (!lists[k] || lists[k].length === 0)) continue;
        if (k.startsWith(`${type}_`)) {
          const m = k.substring(type.length + 1);
          if (m && /^\d{4}-\d{2}$/.test(m)) monthsSet.add(m);
        }
      } else {
        if (k in lists && (!lists[k] || lists[k].length === 0)) continue;
        const parts = k.split('_');
        const m = parts.length > 1 ? parts[1] : parts[0];
        if (m && /^\d{4}-\d{2}$/.test(m)) monthsSet.add(m);
      }
    }

    return Array.from(monthsSet).sort().reverse();
  }

  /**
   * Define e persiste a lista de lojas de um mês específico
   */
  setMonthlyStoreList(type: 'luz' | 'agua' | 'gas', month: string, storeIds: string[]) {
    this.monthlyStoreListsSignal.update(current => {
      const updated = {
        ...current,
        [`${type}_${month}`]: storeIds
      };
      this.persistMonthlyStoreLists(updated);
      return updated;
    });
  }

  addStoreToMonth(type: 'luz' | 'agua' | 'gas', month: string, storeId: string) {
    this.monthlyStoreListsSignal.update(current => {
      const key = `${type}_${month}`;
      const existing = current[key] || [];
      if (existing.includes(storeId)) return current;
      const updated = {
        ...current,
        [key]: [...existing, storeId]
      };
      this.persistMonthlyStoreLists(updated);
      return updated;
    });
  }

  /**
   * Remove todas as lojas da lista mensal de uma utilidade e mês específicos.
   * Não afeta nenhum outro mês, nenhuma outra utilidade e não remove as lojas do catálogo global.
   */
  clearMonthlyStoreList(type: 'luz' | 'agua' | 'gas', month: string) {
    const key = `${type}_${month}`;
    this.monthlyStoreListsSignal.update(current => {
      const updated = {
        ...current,
        [key]: []
      };
      this.persistMonthlyStoreLists(updated);
      return updated;
    });

    try {
      if (typeof localStorage !== 'undefined') {
        const hist = localStorage.getItem('shop_rateio_history');
        if (hist) {
          const parsed = JSON.parse(hist);
          if (parsed && parsed[key]) {
            parsed[key].readings = {};
            localStorage.setItem('shop_rateio_history', JSON.stringify(parsed));
          }
        }
      }
    } catch {}
  }

  // Helper para filtrar lojas por tipo (com opção de incluir inativas)
  storesByType(type: 'luz' | 'agua' | 'gas', includeInactive: boolean = true) {
    return computed(() => {
      return this.storesSignal().filter(s => {
        const matchesType = type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
        if (!matchesType) return false;
        if (!includeInactive) return s.active !== false;
        return true;
      });
    });
  }

  addStore(store: Omit<Store, 'id'>, referenceMonth?: string) {
    const newStore: Store = { 
      ...store, 
      id: generateUUID(),
      active: store.active !== undefined ? store.active : true,
      _offlineCreated: true as any
    };
    this.storesSignal.update(list => {
      const updated = [...list, newStore];
      this.persistStores(updated);
      return updated;
    });

    if (referenceMonth) {
      if (store.usesLuz) this.addStoreToMonth('luz', referenceMonth, newStore.id);
      if (store.usesAgua) this.addStoreToMonth('agua', referenceMonth, newStore.id);
      if (store.usesGas) this.addStoreToMonth('gas', referenceMonth, newStore.id);
    }
  }

  // Alterna o status ativo/inativo de uma loja (com isolamento por utilidade quando utilityType é informado)
  toggleStoreActive(id: string, referenceMonth?: string, reason?: string, utilityType?: 'luz' | 'agua' | 'gas') {
    const targetStore = this.storesSignal().find(s => s.id === id);
    if (!targetStore) return;

    const lists = this.monthlyStoreListsSignal();
    const isCurrentlyActive = (referenceMonth && utilityType)
      ? ((lists[`${utilityType}_${referenceMonth}`]?.includes(id) ?? false) && isStoreActiveInMonth(targetStore, referenceMonth, false))
      : targetStore.active !== false;
    const newStatus = !isCurrentlyActive;

    // Se um utilityType específico e referenceMonth foram informados, preserva a independência entre Luz/Água/Gás
    if (referenceMonth && utilityType) {
      if (newStatus) {
        this.addStoreToMonth(utilityType, referenceMonth, id);
        if (targetStore.active === false) {
          this.storesSignal.update(list => {
            const updated = list.map(s => s.id === id ? { ...s, active: true, deactivatedAt: undefined, deactivationReason: undefined } : s);
            this.persistStores(updated);
            return updated;
          });
        }
      } else {
        this.monthlyStoreListsSignal.update(current => {
          const updated = { ...current };
          const key = `${utilityType}_${referenceMonth}`;
          if (updated[key]) {
            updated[key] = updated[key].filter(sId => sId !== id);
          }
          this.persistMonthlyStoreLists(updated);
          return updated;
        });

        // Só marca globalmente como inativa se não participar mais de nenhuma outra utilidade ativa
        const usesOtherActive =
          (utilityType !== 'luz' && targetStore.usesLuz) ||
          (utilityType !== 'agua' && targetStore.usesAgua) ||
          (utilityType !== 'gas' && targetStore.usesGas);
        if (!usesOtherActive) {
          this.storesSignal.update(list => {
            const updated = list.map(s => s.id === id ? {
              ...s,
              active: false,
              deactivatedAt: referenceMonth,
              deactivationReason: reason || `Inativada em ${utilityType.toUpperCase()} (${referenceMonth})`
            } : s);
            this.persistStores(updated);
            return updated;
          });
        }
      }
      return;
    }

    this.storesSignal.update(list => {
      const updated = list.map(store => {
        if (store.id !== id) return store;
        return {
          ...store,
          active: newStatus,
          deactivatedAt: newStatus ? undefined : (referenceMonth || new Date().toISOString().substring(0, 7)),
          deactivationReason: newStatus ? undefined : (reason || 'Inativada manualmente')
        };
      });
      this.persistStores(updated);
      return updated;
    });

    if (referenceMonth) {
      const store = this.storesSignal().find(s => s.id === id);
      if (store) {
        if (newStatus) {
          // Reativando: inclui na lista mensal do mês de referência
          if (store.usesLuz) this.addStoreToMonth('luz', referenceMonth, store.id);
          if (store.usesAgua) this.addStoreToMonth('agua', referenceMonth, store.id);
          if (store.usesGas) this.addStoreToMonth('gas', referenceMonth, store.id);
        } else {
          // Inativando: remove da lista mensal do mês de referência
          this.monthlyStoreListsSignal.update(current => {
            const updated = { ...current };
            for (const type of ['luz', 'agua', 'gas'] as const) {
              const key = `${type}_${referenceMonth}`;
              if (updated[key]) {
                updated[key] = updated[key].filter(sId => sId !== id);
              }
            }
            this.persistMonthlyStoreLists(updated);
            return updated;
          });
        }
      }
    }
  }

  private isSameStoreIdentity(existing: Store, normContrato: string, normName: string): boolean {
    const existingNormContrato = normalizeContract((existing.contrato || '').trim());
    const existingNormName = normalizeStoreName(existing.name || '');

    const sameContract = !!(normContrato && existingNormContrato && normContrato === existingNormContrato);
    const namesMatch = !!(normName && existingNormName && (
      normName === existingNormName ||
      (normName.length >= 3 && existingNormName.length >= 3 && (
        normName.includes(existingNormName) ||
        existingNormName.includes(normName)
      ))
    ));
    const contractEmptyAndNamesMatch = (!normContrato || !existingNormContrato) &&
      (namesMatch || !normName || !existingNormName);

    return sameContract || contractEmptyAndNamesMatch || namesMatch;
  }

  private computeMonthlyImportPlan(
    currentList: Store[],
    monthlyLists: Record<string, string[]>,
    items: { luc: string; contrato: string; name: string }[],
    type: 'luz' | 'agua' | 'gas',
    referenceMonth: string,
    inactivateMissing: boolean
  ): {
    nextList: Store[];
    monthStoreIds: string[];
    result: MonthlyImportResult;
    preview: MonthlyImportPreview;
  } {
    const usesThisUtil = (s: Store): boolean =>
      type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
    const usesOtherUtil = (s: Store): boolean =>
      (type !== 'luz' && s.usesLuz) ||
      (type !== 'agua' && s.usesAgua) ||
      (type !== 'gas' && s.usesGas);

    // Encontra a lista mensal mais recente desta utilidade (<= referenceMonth) para isolar substituições e ausências por utilidade
    let latestPriorListIds: Set<string> | null = null;
    const priorMonthsForType = Object.entries(monthlyLists)
      .filter(([k, ids]) => k.startsWith(`${type}_`) && Array.isArray(ids) && ids.length > 0)
      .map(([k, ids]) => ({ month: k.substring(type.length + 1), ids }))
      .filter(entry => /^\d{4}-\d{2}$/.test(entry.month) && entry.month <= referenceMonth)
      .sort((a, b) => b.month.localeCompare(a.month));
    if (priorMonthsForType.length > 0) {
      latestPriorListIds = new Set(priorMonthsForType[0].ids);
    }

    const isPresentInFutureMonthOfType = (storeId: string): boolean => {
      for (const [key, ids] of Object.entries(monthlyLists)) {
        if (!key.startsWith(`${type}_`) || !Array.isArray(ids)) continue;
        const m = key.substring(type.length + 1);
        if (m > referenceMonth && ids.includes(storeId)) {
          return true;
        }
      }
      return false;
    };

    let list = currentList.map(s => ({ ...s }));
    const processedStoreIds = new Set<string>();
    const monthStoreIds: string[] = [];

    const result: MonthlyImportResult = {
      maintainedCount: 0,
      newCount: 0,
      reactivatedCount: 0,
      duplicateRowsIgnored: 0,
      replacements: [],
      inactivatedMissing: []
    };

    const preview: MonthlyImportPreview = {
      maintained: [],
      reactivated: [],
      replacements: [],
      brandNew: [],
      duplicateRows: [],
      missingStores: [],
      rowActions: []
    };

    interface PreparedItem {
      idx: number;
      cleanLuc: string;
      cleanContrato: string;
      cleanName: string;
      normLuc: string;
      normContrato: string;
      normName: string;
      isDuplicate: boolean;
    }

    const preparedItems: PreparedItem[] = [];
    const seenBatchKeys = new Set<string>();

    items.forEach((item, idx) => {
      const cleanLuc = (item.luc || '').trim();
      const normalizedPair = normalizeContractAndNameOrder(item.contrato, item.name);
      const cleanContrato = normalizedPair.contrato;
      const cleanName = normalizedPair.name;

      if (!cleanLuc) {
        preview.rowActions[idx] = 'duplicate';
        return;
      }

      const normLuc = normalizeLuc(cleanLuc);
      const normContrato = normalizeContract(cleanContrato);
      const normName = normalizeStoreName(cleanName);
      const dedupKey = normContrato ? `${normLuc}|ctr:${normContrato}` : `${normLuc}|name:${normName}`;

      if (seenBatchKeys.has(dedupKey)) {
        result.duplicateRowsIgnored = (result.duplicateRowsIgnored || 0) + 1;
        preview.duplicateRows.push({ luc: cleanLuc, contrato: cleanContrato, name: cleanName });
        preview.rowActions[idx] = 'duplicate';
        preparedItems.push({
          idx, cleanLuc, cleanContrato, cleanName, normLuc, normContrato, normName, isDuplicate: true
        });
        return;
      }

      seenBatchKeys.add(dedupKey);
      preparedItems.push({
        idx, cleanLuc, cleanContrato, cleanName, normLuc, normContrato, normName, isDuplicate: false
      });
    });

    // Pré-calcula quais lojas ativas já existentes pertencem ao lote (evita que eventos simultâneos no mesmo LUC se substituam)
    const matchedActiveIdsInBatch = new Set<string>();
    for (const p of preparedItems) {
      if (p.isDuplicate) continue;
      const activeMatch = list.find(s =>
        s.active !== false &&
        !matchedActiveIdsInBatch.has(s.id) &&
        normalizeLuc(s.luc) === p.normLuc &&
        this.isSameStoreIdentity(s, p.normContrato, p.normName)
      );
      if (activeMatch) {
        matchedActiveIdsInBatch.add(activeMatch.id);
      }
    }

    const findDisplacedActiveIndexForUtility = (normLuc: string): number => {
      // 1. Prioriza loja ativa desta utilidade que estava na última lista mensal de `type`
      if (latestPriorListIds !== null) {
        const idxInPrior = list.findIndex(s =>
          s.active !== false &&
          usesThisUtil(s) &&
          latestPriorListIds!.has(s.id) &&
          !matchedActiveIdsInBatch.has(s.id) &&
          !processedStoreIds.has(s.id) &&
          normalizeLuc(s.luc) === normLuc
        );
        if (idxInPrior > -1) return idxInPrior;
      }

      // 2. Fallback: loja ativa desta utilidade (nunca mexe em lojas exclusivas de outra utilidade!)
      return list.findIndex(s =>
        s.active !== false &&
        usesThisUtil(s) &&
        (latestPriorListIds === null || !usesOtherUtil(s)) &&
        !matchedActiveIdsInBatch.has(s.id) &&
        !processedStoreIds.has(s.id) &&
        normalizeLuc(s.luc) === normLuc
      );
    };

    for (const p of preparedItems) {
      if (p.isDuplicate) continue;
      const rowPayload = { luc: p.cleanLuc, contrato: p.cleanContrato, name: p.cleanName };

      // 1. Procura loja ativa existente compatível (mesmo LUC + mesmo contrato ou mesmo lojista)
      const existingActiveIndex = list.findIndex(s =>
        s.active !== false &&
        !processedStoreIds.has(s.id) &&
        normalizeLuc(s.luc) === p.normLuc &&
        this.isSameStoreIdentity(s, p.normContrato, p.normName)
      );

      if (existingActiveIndex > -1) {
        const existingStore = list[existingActiveIndex];
        const updatedStore: Store = { ...existingStore };
        if (p.cleanName) updatedStore.name = p.cleanName;
        if (p.cleanContrato) updatedStore.contrato = p.cleanContrato;
        if (type === 'luz') updatedStore.usesLuz = true;
        if (type === 'agua') updatedStore.usesAgua = true;
        if (type === 'gas') updatedStore.usesGas = true;

        list[existingActiveIndex] = updatedStore;
        processedStoreIds.add(updatedStore.id);
        monthStoreIds.push(updatedStore.id);
        result.maintainedCount++;
        preview.maintained.push(rowPayload);
        preview.rowActions[p.idx] = 'maintained';

        // Unifica apenas clones duplicados idênticos exclusivos desta utilidade no mesmo LUC
        for (let k = 0; k < list.length; k++) {
          if (
            k !== existingActiveIndex &&
            list[k].active !== false &&
            usesThisUtil(list[k]) &&
            !usesOtherUtil(list[k]) &&
            !matchedActiveIdsInBatch.has(list[k].id) &&
            !processedStoreIds.has(list[k].id) &&
            normalizeLuc(list[k].luc) === p.normLuc &&
            this.isSameStoreIdentity(list[k], p.normContrato, p.normName)
          ) {
            list[k] = {
              ...list[k],
              active: false,
              deactivatedAt: referenceMonth,
              deactivationReason: `Registro duplicado unificado com loja principal (${updatedStore.id})`
            };
          }
        }
        continue;
      }

      // 2. Procura loja inativa existente com mesmo LUC + mesma identidade (evita criar clones no efeito gangorra)
      const existingInactiveIndex = list.findIndex(s =>
        s.active === false &&
        !processedStoreIds.has(s.id) &&
        normalizeLuc(s.luc) === p.normLuc &&
        this.isSameStoreIdentity(s, p.normContrato, p.normName)
      );

      // Verifica se existe alguma loja ativa NESTA MESMA UTILIDADE no mesmo LUC que não está no lote
      const displacedActiveIndex = findDisplacedActiveIndexForUtility(p.normLuc);

      if (existingInactiveIndex > -1) {
        const prevInactive = list[existingInactiveIndex];
        const displacedStore = displacedActiveIndex > -1 ? list[displacedActiveIndex] : null;

        const reactivatedStore: Store = {
          ...prevInactive,
          luc: p.cleanLuc,
          active: true,
          name: p.cleanName || prevInactive.name,
          contrato: p.cleanContrato || prevInactive.contrato,
          deactivatedAt: undefined,
          deactivationReason: undefined,
          routeOrder: prevInactive.routeOrder ?? displacedStore?.routeOrder,
          hiddenFromTech: prevInactive.hiddenFromTech ?? displacedStore?.hiddenFromTech
        };
        // Habilita APENAS a utilidade que está sendo importada (independência entre Água, Gás e Luz)
        if (type === 'luz') reactivatedStore.usesLuz = true;
        if (type === 'agua') reactivatedStore.usesAgua = true;
        if (type === 'gas') reactivatedStore.usesGas = true;

        list[existingInactiveIndex] = reactivatedStore;
        processedStoreIds.add(reactivatedStore.id);
        monthStoreIds.push(reactivatedStore.id);

        if (displacedStore && displacedActiveIndex > -1) {
          // Só inativa globalmente se a loja antiga NÃO participar de outras utilidades e não estiver em mês futuro
          if (!usesOtherUtil(displacedStore) && !isPresentInFutureMonthOfType(displacedStore.id)) {
            list[displacedActiveIndex] = {
              ...displacedStore,
              active: false,
              deactivatedAt: referenceMonth,
              deactivationReason: `Substituída em ${type.toUpperCase()} por ${p.cleanName} (Contrato ${p.cleanContrato || 'S/N'})`
            };
          }
          result.replacements.push({
            luc: p.cleanLuc,
            oldName: displacedStore.name,
            oldContrato: displacedStore.contrato,
            newName: p.cleanName,
            newContrato: p.cleanContrato
          });
          preview.replacements.push({
            luc: p.cleanLuc,
            oldStore: displacedStore,
            newName: p.cleanName,
            newContrato: p.cleanContrato,
            reactivatedStore
          });
          preview.rowActions[p.idx] = 'replacement';
        } else {
          result.maintainedCount++;
          result.reactivatedCount = (result.reactivatedCount || 0) + 1;
          preview.reactivated.push({ row: rowPayload, existingStore: reactivatedStore });
          preview.rowActions[p.idx] = 'reactivated';
        }
        continue;
      }

      // 3. Não há loja ativa nem inativa compatível -> Substituição nesta utilidade OU Nova loja
      if (displacedActiveIndex > -1) {
        const existingStore = list[displacedActiveIndex];
        // Independência estrita: se a loja antiga ainda participa de outras utilidades (Luz/Água/Gás),
        // ela NÃO é inativada globalmente — apenas sai da lista mensal desta utilidade!
        if (!usesOtherUtil(existingStore) && !isPresentInFutureMonthOfType(existingStore.id)) {
          list[displacedActiveIndex] = {
            ...existingStore,
            active: false,
            deactivatedAt: referenceMonth,
            deactivationReason: `Substituída em ${type.toUpperCase()} por ${p.cleanName} (Contrato ${p.cleanContrato || 'S/N'})`
          };
        }

        // Nova loja nasce habilitada APENAS na utilidade atual (não contamina Luz/Água/Gás)
        const newStore: Store = {
          id: generateUUID(),
          luc: p.cleanLuc,
          contrato: p.cleanContrato,
          name: p.cleanName,
          routeOrder: existingStore.routeOrder,
          hiddenFromTech: existingStore.hiddenFromTech,
          active: true,
          usesLuz: type === 'luz',
          usesAgua: type === 'agua',
          usesGas: type === 'gas',
          _offlineCreated: true as any
        };
        list.push(newStore);
        processedStoreIds.add(newStore.id);
        monthStoreIds.push(newStore.id);

        result.replacements.push({
          luc: p.cleanLuc,
          oldName: existingStore.name,
          oldContrato: existingStore.contrato,
          newName: p.cleanName,
          newContrato: p.cleanContrato
        });
        preview.replacements.push({
          luc: p.cleanLuc,
          oldStore: existingStore,
          newName: p.cleanName,
          newContrato: p.cleanContrato
        });
        preview.rowActions[p.idx] = 'replacement';
      } else {
        const wasLucHidden = list.some(s => normalizeLuc(s.luc) === p.normLuc && s.hiddenFromTech === true);
        const newStore: Store = {
          id: generateUUID(),
          luc: p.cleanLuc,
          contrato: p.cleanContrato,
          name: p.cleanName,
          active: true,
          usesLuz: type === 'luz',
          usesAgua: type === 'agua',
          usesGas: type === 'gas',
          hiddenFromTech: wasLucHidden ? true : undefined,
          _offlineCreated: true as any
        };
        list.push(newStore);
        processedStoreIds.add(newStore.id);
        monthStoreIds.push(newStore.id);
        result.newCount++;
        preview.brandNew.push(rowPayload);
        preview.rowActions[p.idx] = 'new';
      }
    }

    // 4. Lojas ausentes na planilha deste mês (isoladas estritamente na utilidade `type` e protegendo meses futuros)
    if (inactivateMissing) {
      list = list.map(store => {
        if (store.active !== false && usesThisUtil(store) && !processedStoreIds.has(store.id)) {
          const otherActive = usesOtherUtil(store);

          // Se a loja pertence a outras utilidades e já NÃO estava na última lista desta utilidade, ignora
          if (otherActive && latestPriorListIds !== null && !latestPriorListIds.has(store.id)) {
            return store;
          }

          result.inactivatedMissing.push({
            luc: store.luc,
            name: store.name,
            contrato: store.contrato
          });

          const isPresentInFutureMonth = isPresentInFutureMonthOfType(store.id);
          const willInactivateGlobally = !otherActive && !isPresentInFutureMonth;
          preview.missingStores.push({
            store,
            willInactivateGlobally,
            protectedByFutureMonth: isPresentInFutureMonth
          });

          if (!willInactivateGlobally) {
            return store;
          }

          return {
            ...store,
            active: false,
            deactivatedAt: referenceMonth,
            deactivationReason: `Não constava na planilha mensal de ${type.toUpperCase()} (${referenceMonth})`
          };
        }
        return store;
      });
    }

    return {
      nextList: list,
      monthStoreIds,
      result,
      preview
    };
  }

  /**
   * Simula exatamente o que processMonthlyStoreImport fará, sem alterar sinais ou persistir dados.
   */
  previewMonthlyStoreImport(
    items: { luc: string; contrato: string; name: string }[],
    type: 'luz' | 'agua' | 'gas',
    referenceMonth: string,
    inactivateMissing: boolean = false
  ): MonthlyImportPreview {
    return this.computeMonthlyImportPlan(
      this.storesSignal(),
      this.monthlyStoreListsSignal(),
      items,
      type,
      referenceMonth,
      inactivateMissing
    ).preview;
  }

  // Processa a importação mensal com independência estrita entre Luz, Água e Gás
  processMonthlyStoreImport(
    items: { luc: string; contrato: string; name: string }[],
    type: 'luz' | 'agua' | 'gas',
    referenceMonth: string,
    inactivateMissing: boolean = false,
    deferCloudSync: boolean = false
  ): MonthlyImportResult {
    const plan = this.computeMonthlyImportPlan(
      this.storesSignal(),
      this.monthlyStoreListsSignal(),
      items,
      type,
      referenceMonth,
      inactivateMissing
    );

    this.storesSignal.set(plan.nextList);
    this.persistStores(plan.nextList, !deferCloudSync);

    // Atualiza EXCLUSIVAMENTE a lista mensal da utilidade `type` no mês `referenceMonth`
    this.monthlyStoreListsSignal.update(current => {
      const updated: Record<string, string[]> = {
        ...current,
        [`${type}_${referenceMonth}`]: plan.monthStoreIds
      };
      this.persistMonthlyStoreLists(updated, !deferCloudSync);
      return updated;
    });

    return plan.result;
  }

  /**
   * Remove/desvincula uma loja APENAS da utilidade selecionada (e opcionalmente apenas de um mês),
   * sem afetar nenhuma das outras utilidades (Luz, Água ou Gás).
   */
  unlinkStoreFromUtility(
    id: string,
    utilityType: 'luz' | 'agua' | 'gas',
    referenceMonth?: string
  ) {
    let stillInAnyMonthOfUtility = false;

    this.monthlyStoreListsSignal.update(current => {
      const updated: Record<string, string[]> = { ...current };
      const prefix = `${utilityType}_`;
      for (const [key, ids] of Object.entries(updated)) {
        if (!key.startsWith(prefix) || !Array.isArray(ids)) continue;
        if (!referenceMonth || key === `${utilityType}_${referenceMonth}`) {
          updated[key] = ids.filter(storeId => storeId !== id);
        }
        if (updated[key].includes(id)) {
          stillInAnyMonthOfUtility = true;
        }
      }
      this.persistMonthlyStoreLists(updated);
      return updated;
    });

    if (!stillInAnyMonthOfUtility) {
      this.storesSignal.update(list => {
        const updated = list.map(s => {
          if (s.id !== id) return s;
          return {
            ...s,
            usesLuz: utilityType === 'luz' ? false : s.usesLuz,
            usesAgua: utilityType === 'agua' ? false : s.usesAgua,
            usesGas: utilityType === 'gas' ? false : s.usesGas
          };
        });
        this.persistStores(updated);
        return updated;
      });
    }
  }

  // Importação Simples (Upsert)
  upsertStoreFromImport(luc: string, contrato: string, name: string, type: 'luz' | 'agua' | 'gas') {
    this.processMonthlyStoreImport(
      [{ luc, contrato, name }],
      type,
      new Date().toISOString().substring(0, 7),
      false
    );
  }

  async removeStore(id: string) {
    this.storesSignal.update(list => {
      const updated = list.filter(s => s.id !== id);
      this.persistStores(updated);
      return updated;
    });

    this.monthlyStoreListsSignal.update(current => {
      const updated: Record<string, string[]> = {};
      for (const [k, ids] of Object.entries(current)) {
        updated[k] = ids.filter(storeId => storeId !== id);
      }
      this.persistMonthlyStoreLists(updated);
      return updated;
    });

    // 1. Exclui individualmente no IndexedDB
    await this.indexedDb.deleteStore(id);

    // 2. Exclui permanentemente no Supabase PostgreSQL
    await this.supabase.deleteStore(id);
  }

  updateStore(updatedStore: Store) {
    this.storesSignal.update(list => {
      const updated = list.map(s => {
        if (s.id !== updatedStore.id) return s;
        return {
          ...s,
          ...updatedStore,
          hiddenFromTech: updatedStore.hiddenFromTech !== undefined ? updatedStore.hiddenFromTech : s.hiddenFromTech,
          meterNumber: updatedStore.meterNumber !== undefined ? updatedStore.meterNumber : s.meterNumber
        };
      });
      this.persistStores(updated);
      return updated;
    });
  }
}