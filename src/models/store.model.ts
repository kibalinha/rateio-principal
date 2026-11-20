export interface Store {
  id: string;        // Identificador interno do sistema (UUID)
  luc: string;       // Código da Loja (LUC)
  contrato?: string; // Número do Contrato
  name: string;      // Nome da Loja
  routeOrder?: number; // Ordem física no corredor / rota do leiturista (1, 2, 3...)
  meterNumber?: string; // Número de série / identificador do medidor físico (relógio)
  
  // Status de Atividade (Preservação de Histórico)
  active: boolean;             // true = Ativa no rateio atual, false = Inativa
  deactivatedAt?: string;      // Mês/data de inativação (ex: '2026-02')
  deactivationReason?: string; // Motivo da inativação (ex: 'Substituída por Madero (Contrato 444)')

  // Configurações de Consumo
  usesLuz: boolean;
  usesAgua: boolean;
  usesGas: boolean;

  // Visibilidade em Campo (Oculta apenas para o perfil Técnico TEC; permanece ativa no rateio/SAP para ADM)
  hiddenFromTech?: boolean;

  // Controle de sincronização offline
  _offlineCreated?: boolean;
}

export interface MonthlyImportResult {
  maintainedCount: number;
  newCount: number;
  reactivatedCount?: number;
  duplicateRowsIgnored?: number;
  replacements: { luc: string; oldName: string; oldContrato?: string; newName: string; newContrato?: string }[];
  inactivatedMissing: { luc: string; name: string; contrato?: string }[];
}

export type MonthlyImportRowAction = 'maintained' | 'reactivated' | 'replacement' | 'new' | 'duplicate';

export interface MonthlyImportPreview {
  maintained: ParsedStoreRow[];
  reactivated: { row: ParsedStoreRow; existingStore: Store }[];
  replacements: { luc: string; oldStore: Store; newName: string; newContrato: string; reactivatedStore?: Store }[];
  brandNew: ParsedStoreRow[];
  duplicateRows: ParsedStoreRow[];
  missingStores: { store: Store; willInactivateGlobally: boolean; protectedByFutureMonth: boolean }[];
  rowActions: MonthlyImportRowAction[];
}

export interface ParsedStoreRow {
  luc: string;
  contrato: string;
  name: string;
}

export type StoreStatusFilter = 'all' | 'active' | 'inactive' | 'alert';
