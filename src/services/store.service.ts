import { Injectable, signal, computed, inject } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';
import { SupabaseService } from './supabase.service';

export interface Store {
  id: string;        // Identificador interno do sistema (UUID)
  luc: string;       // Código da Loja (LUC)
  contrato?: string; // Número do Contrato
  name: string;      // Nome da Loja
  routeOrder?: number; // Ordem física no corredor / rota do leiturista (1, 2, 3...)
  
  // Status de Atividade (Preservação de Histórico)
  active: boolean;             // true = Ativa no rateio atual, false = Inativa
  deactivatedAt?: string;      // Mês/data de inativação (ex: '2026-02')
  deactivationReason?: string; // Motivo da inativação (ex: 'Substituída por Madero (Contrato 444)')

  // Configurações de Consumo
  usesLuz: boolean;
  usesAgua: boolean;
  usesGas: boolean;

  // Controle de sincronização offline
  _offlineCreated?: boolean;
}

export interface MonthlyImportResult {
  maintainedCount: number;
  newCount: number;
  replacements: { luc: string; oldName: string; oldContrato?: string; newName: string; newContrato?: string }[];
  inactivatedMissing: { luc: string; name: string; contrato?: string }[];
}

@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private readonly STORAGE_KEY = 'shop_rateio_stores_data';
  private indexedDb = inject(IndexedDbService);
  private supabase = inject(SupabaseService);

  private defaultStores: Store[] = [
    { id: '1', luc: 'L-101', contrato: '10423', name: 'Zara Moda', active: true, usesLuz: true, usesAgua: true, usesGas: false },
    { id: '2', luc: 'L-104', contrato: '10428', name: 'Burger King', active: true, usesLuz: true, usesAgua: true, usesGas: true },
    { id: '3', luc: 'L-205', contrato: '20511', name: 'Livraria Leitura', active: true, usesLuz: true, usesAgua: false, usesGas: false },
    { id: '4', luc: 'Q-012', contrato: '30114', name: 'Samsung Store', active: true, usesLuz: true, usesAgua: false, usesGas: false },
    { id: '5', luc: 'Q-015', contrato: '30118', name: 'Kopenhagen', active: true, usesLuz: true, usesAgua: true, usesGas: false },
  ];

  private storesSignal = signal<Store[]>(this.loadInitialStores());

  readonly stores = computed(() => this.storesSignal());

  constructor() {
    this.syncWithSupabaseOnStart();
    this.setupRealtimeSync();
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
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
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

  addStore(store: Omit<Store, 'id'>) {
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

    this.storesSignal.update(currentList => {
      let list = [...currentList];
      const processedStoreIds = new Set<string>();
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
            cleanContrato && s.contrato && s.contrato.toLowerCase() === cleanContrato.toLowerCase()
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

      // 3. Se solicitado, inativa lojas da utilidade que não estavam presentes na planilha deste mês
      if (inactivateMissing) {
        list = list.map(store => {
          const usesUtil = type === 'luz' ? store.usesLuz : (type === 'agua' ? store.usesAgua : store.usesGas);
          if (store.active !== false && usesUtil && !importedLucSet.has(store.luc.toLowerCase())) {
            result.inactivatedMissing.push({
              luc: store.luc,
              name: store.name,
              contrato: store.contrato
            });
            return {
              ...store,
              active: false,
              deactivatedAt: referenceMonth,
              deactivationReason: `Não constava na planilha mensal de ${referenceMonth}`
            };
          }
          return store;
        });
      }

      this.persistStores(list);
      return list;
    });

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