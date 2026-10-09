import { Store } from './store.model';
import { CostItem } from './utility.model';

export type StoreReading = {
  reading: number;       // Leitura Atual
  constant: number;      // Constante do medidor (Luz)
  virtual?: number | null; // Consumo Virtual (override)
  adjustment: number;    // Fator de ajuste Multiplicador (Luz/Água/Gás - Ajuste X)
  
  // Campos opcionais para Gás
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
  meterNumber?: string;       // Número de identificação/série do relógio
};

export interface BillData {
  costItems: CostItem[] | any[];
  consumptionInput: any;
  acInput: number;
  readings: Record<string, StoreReading | number>; 
  manualBill?: number;
  manualConsumption?: number;
  lastUpdated: string;
  isLocked?: boolean;
  lockedAt?: string;
  lockedBy?: string;
  gasAutoDistribute?: boolean; // Rateio 100% proporcional automático no Gás
}

export interface ExcelImportRowPreview {
  rawRow: Record<string, any>;
  matchedStore?: Store;
  storeName: string;
  luc: string;
  reading: number;
  prevReading: number;
  consumptionPreview: number;
  constant?: number;
  adjustment?: number;
  virtual?: number;
  adjustmentAdd?: number;
  fcm?: number;
  fluxoCost?: number;
  note?: string;
  status: 'matched' | 'unmatched';
  message: string;
}

export interface AnomalyModalData {
  storeId: string;
  storeName: string;
  luc: string;
  type: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'confirmed' | 'none';
  currentReading: number;
  prevReading: number;
  consumption: number;
  avgConsumption: number;
  unit: string;
  isConfirmed: boolean;
  isRollover: boolean;
  diffPct: number | null;
}
