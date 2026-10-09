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
}

export interface SyncQueueItem {
  id?: number;
  type: string;
  month: string;
  data: BillData;
  timestamp: string;
  synced: boolean;
}
