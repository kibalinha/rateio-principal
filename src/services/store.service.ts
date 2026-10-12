import { Injectable, signal, computed, inject } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';
import { SupabaseService } from './supabase.service';

import { Store, MonthlyImportResult } from '../models';

export type { Store, MonthlyImportResult };

/**
 * Determina se uma loja estava ativa em um determinado mês de referência (YYYY-MM).
 * - Se store.active !== false: loja atualmente ativa.
 * - Se inativa, mas deactivatedAt > month: a inativação ocorreu apenas em mês futuro; no mês consultado ela estava 100% ativa!
 * - Se inativa e deactivatedAt for nulo/indefinido (dados legados), mas a loja pertencia à lista explícita importada para o mês: estava ativa naquele mês.
 */
export function isStoreActiveInMonth(store: Store, month: string, isExplicitlyInMonthList: boolean = false): boolean {
  if (store.active !== false) {
    return true;
  }
  if (store.deactivatedAt && store.deactivatedAt > month) {
    return true;
  }
  if (!store.deactivatedAt && isExplicitlyInMonthList) {
    return true;
  }
  return false;
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
          this.monthlyStoreListsSignal.update(curr => ({
            ...curr,
            ...idbLists
          }));
        }
      }).catch(() => {});
    }

    if (typeof this.supabase?.subscribeToStores === 'function') {
      this.syncWithSupabaseOnStart();
      this.setupRealtimeSync();
    }
  }

  private setupRealtimeSync() {
    this.supabase.subscribeToStores(async () => {
      await this.refreshStoresFromSupabase();
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
        await this.indexedDb.saveStores(cleaned);
      }
      return ok;
    }
    return true;
  }

  async refreshStoresFromSupabase() {
    try {
      const remoteStores = await this.supabase.fetchStores();
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

        this.storesSignal.set(finalStores);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(finalStores));
        }
        await this.indexedDb.saveStores(finalStores);
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

  private persistMonthlyStoreLists(lists: Record<string, string[]>) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.MONTHLY_LISTS_STORAGE_KEY, JSON.stringify(lists));
      } catch (e) {
        console.error('Erro ao salvar listas mensais de lojas:', e);
      }
    }
    this.indexedDb?.saveMonthlyStoreLists?.(lists);
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

  private persistStores(list: Store[]) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
      } catch (e) {
        console.error('Error saving stores to localStorage', e);
      }
    }
    this.indexedDb.saveStores(list).catch(() => {});
    if (list.length > 0) {
      this.supabase.syncStores(list).catch(() => {});
    }
  }

  /**
   * Zera todas as lojas no app, IndexedDB e no Supabase
   */
  async clearAllStores() {
    this.storesSignal.set([]);
    this.monthlyStoreListsSignal.set({});
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
      localStorage.removeItem(this.MONTHLY_LISTS_STORAGE_KEY);
    }
    await this.indexedDb.saveStores([]);
    await this.supabase.clearAllStores();
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
    if (lists[key] && lists[key].length > 0) return true;

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
    let storeIds = lists[key];

    // Fallback para lista legada caso não exista lista específica desta utilidade
    if (!storeIds || storeIds.length === 0) {
      if (lists[month] && !lists[`luz_${month}`] && !lists[`agua_${month}`] && !lists[`gas_${month}`]) {
        storeIds = lists[month];
      }
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
        const isActiveInMonth = isStoreActiveInMonth(s, month, true);
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

    for (const key of Object.keys(lists)) {
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
    for (const k of Object.keys(historyBills)) {
      if (type) {
        if (k.startsWith(`${type}_`)) {
          const m = k.substring(type.length + 1);
          if (m && /^\d{4}-\d{2}$/.test(m)) monthsSet.add(m);
        }
      } else {
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
      id: crypto.randomUUID(),
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

  // Alterna o status ativo/inativo de uma loja
  toggleStoreActive(id: string, referenceMonth?: string, reason?: string) {
    this.storesSignal.update(list => {
      const updated = list.map(store => {
        if (store.id !== id) return store;
        const newStatus = !store.active;
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
  }

  // Processa a importação mensal com detecção automática de substituições
  // Exemplo: LUC 1020 Burger King contrato 333 -> LUC 1020 Madero contrato 444:
  // Burger King vira inativo (histórico preservado) e Madero é criado como ativo.
  processMonthlyStoreImport(
    items: { luc: string; contrato: string; name: string }[],
    type: 'luz' | 'agua' | 'gas',
    referenceMonth: string,
    inactivateMissing: boolean = false
  ): MonthlyImportResult {
    const result: MonthlyImportResult = {
      maintainedCount: 0,
      newCount: 0,
      replacements: [],
      inactivatedMissing: []
    };

    const processedStoreIds = new Set<string>();

    this.storesSignal.update(currentList => {
      let list = [...currentList];
      const importedLucSet = new Set<string>();

      for (const item of items) {
        const cleanLuc = item.luc.trim();
        const cleanContrato = item.contrato.trim();
        const cleanName = item.name.trim();
        if (!cleanLuc) continue;

        importedLucSet.add(cleanLuc.toLowerCase());

        // 1. Procura loja ativa existente com o mesmo LUC
        const existingActiveIndex = list.findIndex(s => 
          s.active !== false && s.luc.toLowerCase() === cleanLuc.toLowerCase()
        );

        if (existingActiveIndex > -1) {
          const existingStore = list[existingActiveIndex];
          const existingContrato = (existingStore.contrato || '').trim();

          // Verifica se o contrato é o mesmo (ou se ambos estão vazios e o nome é similar)
          const sameContract = cleanContrato && existingContrato && 
            existingContrato.toLowerCase() === cleanContrato.toLowerCase();
          
          const sameNameAndNoContract = !cleanContrato && !existingContrato && 
            existingStore.name.toLowerCase() === cleanName.toLowerCase();

          if (sameContract || sameNameAndNoContract) {
            // Caso 1: Mesma loja e mesmo contrato mantidos!
            const updatedStore = { ...existingStore };
            if (cleanName) updatedStore.name = cleanName;
            if (cleanContrato) updatedStore.contrato = cleanContrato;
            if (type === 'luz') updatedStore.usesLuz = true;
            if (type === 'agua') updatedStore.usesAgua = true;
            if (type === 'gas') updatedStore.usesGas = true;
            
            list[existingActiveIndex] = updatedStore;
            processedStoreIds.add(updatedStore.id);
            result.maintainedCount++;
          } else {
            // Caso 2: SUBSTITUIÇÃO! Mesmo LUC, mas NOVO CONTRATO / NOVO LOJISTA!
            // Ex: Burger King contrato 333 -> Madero contrato 444
            // A loja antiga é INATIVADA com histórico 100% preservado pelo seu ID
            const deactivatedOldStore: Store = {
              ...existingStore,
              active: false,
              deactivatedAt: referenceMonth,
              deactivationReason: `Substituída por ${cleanName} (Contrato ${cleanContrato || 'S/N'})`
            };
            list[existingActiveIndex] = deactivatedOldStore;

            // Criamos a nova loja ativa com novo ID
            const newStore: Store = {
              id: crypto.randomUUID(),
              luc: cleanLuc,
              contrato: cleanContrato,
              name: cleanName,
              active: true,
              usesLuz: type === 'luz' || existingStore.usesLuz,
              usesAgua: type === 'agua' || existingStore.usesAgua,
              usesGas: type === 'gas' || existingStore.usesGas
            };
            list.push(newStore);
            processedStoreIds.add(newStore.id);

            result.replacements.push({
              luc: cleanLuc,
              oldName: existingStore.name,
              oldContrato: existingStore.contrato,
              newName: cleanName,
              newContrato: cleanContrato
            });
          }
        } else {
          // 2. Não há loja ativa neste LUC.
          // Verifica se já existia uma loja inativa com esse exato LUC e CONTRATO para reativar
          const existingInactiveIndex = list.findIndex(s => 
            s.active === false && 
            s.luc.toLowerCase() === cleanLuc.toLowerCase() &&
            (
              (cleanContrato && s.contrato && s.contrato.toLowerCase() === cleanContrato.toLowerCase()) ||
              (!cleanContrato && (!s.contrato || s.name.toLowerCase() === cleanName.toLowerCase()))
            )
          );

          if (existingInactiveIndex > -1) {
            // Reativa a loja existente
            const reactivatedStore: Store = {
              ...list[existingInactiveIndex],
              active: true,
              name: cleanName || list[existingInactiveIndex].name,
              deactivatedAt: undefined,
              deactivationReason: undefined
            };
            if (type === 'luz') reactivatedStore.usesLuz = true;
            if (type === 'agua') reactivatedStore.usesAgua = true;
            if (type === 'gas') reactivatedStore.usesGas = true;

            list[existingInactiveIndex] = reactivatedStore;
            processedStoreIds.add(reactivatedStore.id);
            result.maintainedCount++;
          } else {
            // Caso 3: Loja completamente NOVA no shopping
            const newStore: Store = {
              id: crypto.randomUUID(),
              luc: cleanLuc,
              contrato: cleanContrato,
              name: cleanName,
              active: true,
              usesLuz: type === 'luz',
              usesAgua: type === 'agua',
              usesGas: type === 'gas'
            };
            list.push(newStore);
            processedStoreIds.add(newStore.id);
            result.newCount++;
          }
        }
      }

      // 3. Se solicitado, inativa ou desvincula lojas da utilidade que não estavam presentes na planilha deste mês
      if (inactivateMissing) {
        list = list.map(store => {
          const usesUtil = type === 'luz' ? store.usesLuz : (type === 'agua' ? store.usesAgua : store.usesGas);
          if (store.active !== false && usesUtil && !importedLucSet.has(store.luc.toLowerCase())) {
            result.inactivatedMissing.push({
              luc: store.luc,
              name: store.name,
              contrato: store.contrato
            });

            // Verifica se a loja ainda utiliza outras utilidades ativas (ex.: ainda usa Luz ou Gás)
            const usesOther = (type !== 'luz' && store.usesLuz) ||
                              (type !== 'agua' && store.usesAgua) ||
                              (type !== 'gas' && store.usesGas);

            if (usesOther) {
              // A loja continua 100% ativa no shopping para as outras utilidades.
              // Para este mês nesta utilidade, ela simplesmente não entra na lista mensal deste mês.
              return store;
            } else {
              // A loja não utiliza mais nenhuma outra utilidade no shopping: inativação completa
              return {
                ...store,
                active: false,
                deactivatedAt: referenceMonth,
                deactivationReason: `Não constava na planilha mensal de ${type.toUpperCase()} (${referenceMonth})`
              };
            }
          }
          return store;
        });
      }

      this.persistStores(list);
      return list;
    });

    // Registra a lista de lojas pertencentes a este mês de vigência
    this.setMonthlyStoreList(type, referenceMonth, Array.from(processedStoreIds));

    return result;
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
      const updated = list.map(s => s.id === updatedStore.id ? updatedStore : s);
      this.persistStores(updated);
      return updated;
    });
  }
}