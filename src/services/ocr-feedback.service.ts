import { Injectable, signal, inject } from '@angular/core';
import { OcrFeedbackEntry, OcrPendingConfirmation, UtilityType } from '../models';
import { SupabaseService } from './supabase.service';

const STORAGE_KEY = 'ocr_feedback_log_v1';
const MAX_ENTRIES = 1000;

/**
 * Registra cada conferência do técnico (valor lido pela IA vs. valor final).
 * Esses dados alimentam a validação por histórico, o contexto/few-shot no prompt,
 * a seleção automática do melhor motor e o painel de qualidade do OCR.
 */
@Injectable({ providedIn: 'root' })
export class OcrFeedbackService {
  private supabase = inject(SupabaseService);
  private readonly _entries = signal<OcrFeedbackEntry[]>(this.load());
  readonly entries = this._entries.asReadonly();
  readonly isSyncingCloud = signal<boolean>(false);

  constructor() {
    // Sincroniza em background dados da equipe se online
    if (typeof window !== 'undefined' && navigator.onLine) {
      setTimeout(() => this.syncFromCloud(), 1500);
    }
  }

  record(params: {
    storeId: string;
    storeName: string;
    utilityType: UtilityType;
    month: string;
    finalValue: number;
    pending: OcrPendingConfirmation;
  }): OcrFeedbackEntry {
    const { pending } = params;
    const entry: OcrFeedbackEntry = {
      id: `${params.utilityType}_${params.month}_${params.storeId}_${Date.now()}`,
      storeId: params.storeId,
      storeName: params.storeName,
      utilityType: params.utilityType,
      month: params.month,
      ocrValue: pending.ocrValue,
      finalValue: params.finalValue,
      wasCorrected: Math.abs(pending.ocrValue - params.finalValue) > 1e-9,
      detectedDigits: pending.detectedDigits ?? null,
      meterType: pending.meterType,
      confidence: pending.confidence,
      provider: pending.provider,
      modelName: pending.modelName,
      fallbackUsed: pending.fallbackUsed,
      confirmedAt: new Date().toISOString()
    };

    const next = [...this._entries(), entry].slice(-MAX_ENTRIES);
    this._entries.set(next);
    this.persist(next);

    // Sincroniza assincronamente com Supabase
    this.supabase.syncOcrFeedback(entry).catch(() => {});

    return entry;
  }

  /**
   * Baixa os registros da nuvem (Supabase) gerados por outros leituristas/administradores
   * e faz merge com os locais.
   */
  async syncFromCloud(): Promise<number> {
    this.isSyncingCloud.set(true);
    try {
      const cloudEntries = await this.supabase.fetchOcrFeedbacks();
      if (!cloudEntries || cloudEntries.length === 0) return 0;

      const current = this._entries();
      const currentMap = new Map(current.map(e => [e.id, e]));

      let added = 0;
      for (const ce of cloudEntries) {
        if (!currentMap.has(ce.id)) {
          currentMap.set(ce.id, ce);
          added++;
        }
      }

      if (added > 0) {
        const merged = Array.from(currentMap.values())
          .sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt))
          .slice(-MAX_ENTRIES);
        this._entries.set(merged);
        this.persist(merged);
      }
      return added;
    } catch {
      return 0;
    } finally {
      this.isSyncingCloud.set(false);
    }
  }

  /** Entradas de uma loja/utilidade, da mais recente para a mais antiga. */
  forStore(storeId: string, utilityType: UtilityType): OcrFeedbackEntry[] {
    return this._entries()
      .filter(e => e.storeId === storeId && e.utilityType === utilityType)
      .reverse();
  }

  private load(): OcrFeedbackEntry[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private persist(entries: OcrFeedbackEntry[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn('Não foi possível salvar o log de feedback do OCR:', e);
    }
  }
}
