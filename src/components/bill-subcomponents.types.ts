import { MeterPhotoRecord, StoreReading, UtilityType } from '../models';
import { AnomalySeverity, ValidationAlert } from '../services/bill-audit.helpers';

export interface BillTableRow {
  storeId: string;
  luc: string;
  contrato: string;
  storeName: string;
  routeOrder?: number;
  meterNumber: string;
  active: boolean;
  consumption: number;
  rawConsumption: number;
  gasFactor: number;
  isGasDistributed: boolean;
  cost: number;
  originalCost: number;
  excludedFromBill: boolean;
  hiddenFromTech: boolean;
  prevReading: number;
  prevConsumption: number;
  prevCost: number;
  prevReadingMonth: string;
  currentReading: number;
  constant: number;
  virtual?: number;
  adjustment: number;
  adjustmentAdd: number;
  fcm: number;
  fluxoCost: number;
  variation: number;
  note: string;
  hasPhoto: boolean;
  photoTimestamp?: string;
  isRead: boolean;
  isJustified: boolean;
  justificationReason: string;
  isFrequentZero: boolean;
  consecutiveZeroMonths: number;
  learnedReason: string;
  isNegative: boolean;
  isZeroActive: boolean;
  isHugeTypoJump: boolean;
  isAtypicalJump: boolean;
  hasSuspiciousAlert: boolean;
  anomalyConfirmed: boolean;
  isRollover: boolean;
  alertSeverity: AnomalySeverity;
  validationAlert: ValidationAlert;
  readingDiff: number;
}

export interface BillFieldStats {
  total: number;
  completed: number;
  pending: number;
  alerts: number;
  progressPct: number;
}

export interface OcrFeedbackItem {
  success: boolean;
  message: string;
  reading?: number | null;
  confidence?: string;
  explanation?: string;
  provider?: 'qwen' | 'gemini' | 'none';
  modelName?: string;
  fallbackUsed?: boolean;
}

export interface ReadingFieldChangeEvent {
  storeId: string;
  field: keyof StoreReading;
  value: any;
}

export interface ReadingPasteEvent {
  event: ClipboardEvent;
  storeId: string;
  field: keyof StoreReading;
}

export interface PhotoCaptureEvent {
  event: Event;
  storeId: string;
  storeName: string;
  luc: string;
  currentReading: number;
}

export interface PhotoViewerOpenEvent {
  storeId: string;
  customRecord?: MeterPhotoRecord;
}

export interface PhotoDeleteEvent {
  storeId: string;
  storeName: string;
}

export interface NoteEditorOpenEvent {
  storeId: string;
  currentNote?: string;
}

export interface QuickJustifyEvent {
  storeId: string;
  reason: string;
  replicatePrevReading: boolean;
}

export interface QuickTagEvent {
  storeId: string;
  tag: string;
}

export interface ConfirmOcrEvent {
  storeId: string;
  value: number | string | null | undefined;
}

export interface QuickAdjustEvent {
  stepStore: BillTableRow;
  delta: number;
}

export type BillUtilityType = UtilityType;
