import { UtilityType } from './utility.model';
import { BillData } from './billing.model';

export interface MeterPhotoRecord {
  id: string;               // `${type}_${month}_${storeId}`
  type: UtilityType;
  month: string;            // 'YYYY-MM'
  storeId: string;
  storeName: string;
  luc: string;
  readingValue: number;     // Leitura capturada no momento
  photoDataUrl: string;     // Base64 comprimida (JPEG ~80-150KB) ou URL pública Supabase
  capturedAt: string;       // ISO Timestamp
  note?: string;            // Observação vinculada
  synced?: boolean;         // true se já sincronizado com Supabase (Storage + PostgreSQL)
}

export interface MeterOcrResult {
  success: boolean;
  reading: number | null;
  detectedDigits?: string | null;
  meterType?: 'digital' | 'analogico_rolete' | 'analogico_ponteiro' | 'indeterminado';
  confidence: 'high' | 'medium' | 'low';
  explanation?: string;
  error?: string;
  provider: 'qwen' | 'gemini' | 'none';
  modelName: string;
  fallbackUsed?: boolean;
  dualCheck?: DualCheckResult;
}

/** Resultado da verificação cruzada automática entre os dois motores (Qwen e Gemini). */
export interface DualCheckResult {
  performed: boolean;
  qwenValue: number | null;
  geminiValue: number | null;
  agreement: boolean;
  divergenceNotice?: string;
}

/** Contexto do medidor (histórico + correções passadas) injetado no prompt do OCR. */
export interface OcrReadingContext {
  previousReading?: number | null;
  expectedIntDigits?: number | null;
  meterType?: string;
  corrections?: { ocrValue: number; finalValue: number; sameStore: boolean }[];
}

/** Leitura sugerida pela IA aguardando conferência do técnico. */
export interface OcrPendingConfirmation {
  ocrValue: number;
  detectedDigits?: string | null;
  meterType?: string;
  confidence: 'high' | 'medium' | 'low';
  provider: 'qwen' | 'gemini' | 'none';
  modelName: string;
  fallbackUsed?: boolean;
  dualCheck?: DualCheckResult;
}

/** Registro de conferência do técnico: o que a IA leu vs. o valor final aceito. */
export interface OcrFeedbackEntry {
  id: string;
  storeId: string;
  storeName: string;
  utilityType: UtilityType;
  month: string;
  ocrValue: number;
  finalValue: number;
  wasCorrected: boolean;
  detectedDigits?: string | null;
  meterType?: string;
  confidence: 'high' | 'medium' | 'low';
  provider: 'qwen' | 'gemini' | 'none';
  modelName: string;
  fallbackUsed?: boolean;
  confirmedAt: string; // ISO
}

export interface SyncQueueItem {
  id?: number;
  type: string;
  month: string;
  data: BillData;
  timestamp: string;
  synced: boolean;
}
