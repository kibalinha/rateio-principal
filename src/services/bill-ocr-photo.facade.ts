import { Injectable, inject, signal } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';
import { GeminiService } from './gemini.service';
import { OcrFeedbackService } from './ocr-feedback.service';
import { SupabaseService } from './supabase.service';
import { StoreService } from './store.service';
import { buildReadingContext } from './ocr-context';
import { analyzeAndEnhanceBase64Image } from './ocr-image-processor';
import { getRecommendedProvider } from './ocr-stats';
import {
  MeterOcrResult,
  MeterPhotoRecord,
  OcrPendingConfirmation,
  StoreReading,
  UtilityType
} from '../models';
import { BillTableRow, OcrFeedbackItem } from '../components/bill-subcomponents.types';

export interface BatchOcrProgress {
  current: number;
  total: number;
  progressPct: number;
  currentStoreName: string;
  currentLuc: string;
  successCount: number;
  failCount: number;
  currentModel: string;
}

export interface BillOcrPhotoHost {
  getUtilityType: () => UtilityType;
  getSelectedMonth: () => string;
  isLocked: () => boolean;
  getTableData: () => BillTableRow[];
  getReadingsForUtility: (type: UtilityType) => Map<string, StoreReading>;
  replaceReadingsForUtility: (type: UtilityType, updatedMap: Map<string, StoreReading>) => void;
  updateDetailedReading: (storeId: string, field: keyof StoreReading, value: any) => void;
  saveBill: () => void;
}

export interface BillOcrPhotoDependencies {
  indexedDb?: IndexedDbService;
  geminiService?: GeminiService;
  ocrFeedbackService?: OcrFeedbackService;
  supabaseService?: SupabaseService;
  storeService?: StoreService;
  analyzeImage?: typeof analyzeAndEnhanceBase64Image;
  batchDelayMs?: number;
}

const EMPTY_BATCH_PROGRESS: BatchOcrProgress = {
  current: 0,
  total: 0,
  progressPct: 0,
  currentStoreName: '',
  currentLuc: '',
  successCount: 0,
  failCount: 0,
  currentModel: ''
};

/**
 * Facade responsável pela orquestração de fotos de medidores (IndexedDB + Supabase + Realtime),
 * leitura automática por OCR (Qwen/Gemini + dupla checagem + fila em lote),
 * confirmação/feedback de OCR e sincronização de chaves de IA.
 */
@Injectable({
  providedIn: 'root'
})
export class BillOcrPhotoFacade {
  private indexedDb: IndexedDbService = {} as IndexedDbService;
  private geminiService: GeminiService = {} as GeminiService;
  private ocrFeedbackService: OcrFeedbackService = {} as OcrFeedbackService;
  private supabaseService: SupabaseService = {} as SupabaseService;
  private storeService: StoreService = {} as StoreService;
  private analyzeImage: typeof analyzeAndEnhanceBase64Image = analyzeAndEnhanceBase64Image;
  private batchDelayMs = 350;

  private host: BillOcrPhotoHost | null = null;
  private photoSubscriptionUnsubscribe: (() => void) | null = null;

  // --- METER PHOTO EVIDENCE STATE ---
  readonly meterPhotos = signal<Record<string, MeterPhotoRecord>>({});
  readonly prevMonthPhotos = signal<Record<string, MeterPhotoRecord>>({});
  readonly activePhotoRecord = signal<MeterPhotoRecord | null>(null);
  readonly showPhotoModal = signal<boolean>(false);
  readonly isCapturingPhoto = signal<string | null>(null);
  readonly isConfirmingPhotoDelete = signal<boolean>(false);

  // --- AI API KEY CONFIGURATION MODAL STATE ---
  readonly showAiKeyModal = signal<boolean>(false);
  readonly groqInputKey = signal<string>('');
  readonly geminiInputKey = signal<string>('');
  readonly pendingOcrStoreId = signal<string | null>(null);

  // --- BATCH OCR QUEUE STATE ---
  readonly showBatchOcrModal = signal<boolean>(false);
  readonly isBatchOcrRunning = signal<boolean>(false);
  readonly cancelBatchOcrRequested = signal<boolean>(false);
  readonly batchOcrProgress = signal<BatchOcrProgress>({ ...EMPTY_BATCH_PROGRESS });

  // --- OCR DUAL-ENGINE STATE ---
  readonly isReadingOcr = signal<string | null>(null);
  readonly ocrCurrentModelLabel = signal<string>('Qwen 3.8 27B (Groq)');
  readonly ocrFeedback = signal<Record<string, OcrFeedbackItem>>({});
  readonly ocrPending = signal<Record<string, OcrPendingConfirmation>>({});
  readonly showOcrQuality = signal<boolean>(false);

  constructor() {
    try {
      this.indexedDb = inject(IndexedDbService);
      this.geminiService = inject(GeminiService);
      this.ocrFeedbackService = inject(OcrFeedbackService);
      this.supabaseService = inject(SupabaseService);
      this.storeService = inject(StoreService);
    } catch {
      // Executando fora do contexto de injeção Angular (ex.: testes unitários isolados)
    }
  }

  /** Permite injetar mocks em testes unitários isolados sem Angular TestBed. */
  setDependenciesForTest(deps: BillOcrPhotoDependencies): void {
    if (deps.indexedDb) this.indexedDb = deps.indexedDb;
    if (deps.geminiService) this.geminiService = deps.geminiService;
    if (deps.ocrFeedbackService) this.ocrFeedbackService = deps.ocrFeedbackService;
    if (deps.supabaseService) this.supabaseService = deps.supabaseService;
    if (deps.storeService) this.storeService = deps.storeService;
    if (deps.analyzeImage) this.analyzeImage = deps.analyzeImage;
    if (deps.batchDelayMs !== undefined) this.batchDelayMs = deps.batchDelayMs;
  }

  bindHost(host: BillOcrPhotoHost): void {
    this.host = host;
  }

  private isSelectionActive(type: UtilityType, month: string): boolean {
    if (!this.host) return false;
    return this.host.getUtilityType() === type && this.host.getSelectedMonth() === month;
  }

  /** Sincronização inteligente de chaves de IA (Desktop <-> Celular). */
  initAiKeysSync(): void {
    const localGroq = this.geminiService.getSavedGroqKey();
    const localGemini = this.geminiService.getSavedGeminiKey();
    if (localGroq || localGemini) {
      this.supabaseService.syncSystemAiKeys(localGroq, localGemini).catch(() => {});
    } else {
      this.supabaseService.fetchSystemAiKeys().then(cloudKeys => {
        if (cloudKeys) {
          this.geminiService.setCloudApiKeys(cloudKeys.groqKey, cloudKeys.geminiKey);
        }
      }).catch(() => {});
    }
  }

  /** Inscreve-se em eventos Realtime do Supabase para fotos (inserção, edição e exclusão). */
  subscribeToRealtimePhotos(): void {
    this.unsubscribeRealtimePhotos();
    this.photoSubscriptionUnsubscribe = this.supabaseService.subscribeToPhotos(async (payload) => {
      if (!this.host) return;
      const type = this.host.getUtilityType();
      const month = this.host.getSelectedMonth();

      // Evento DELETE direto no Supabase emitido por outro dispositivo (PC ou Mobile)
      if (payload?.eventType === 'DELETE' && payload.old) {
        const deletedId = String(payload.old.id || '');
        const deletedStoreId = payload.old.store_id || (deletedId ? deletedId.split('_')[2] : null);
        if (deletedStoreId) {
          if (this.isSelectionActive(type, month)) {
            this.meterPhotos.update(prev => {
              const copy = { ...prev };
              delete copy[deletedStoreId];
              return copy;
            });
          }
          await this.indexedDb.deleteMeterPhoto(type, month, deletedStoreId);
          if (this.isSelectionActive(type, month)) {
            this.host.updateDetailedReading(deletedStoreId, 'hasPhoto', false);
            this.host.updateDetailedReading(deletedStoreId, 'photoTimestamp', undefined);
          }
        }
      }

      // Re-sincroniza fotos da nuvem mantendo apenas fotos locais ainda não sincronizadas
      const cloudPhotos = await this.supabaseService.fetchMeterPhotos(type, month);
      if (!this.isSelectionActive(type, month)) return;
      if (cloudPhotos !== null) {
        const currentLocal = this.meterPhotos();
        const nextPhotos: Record<string, MeterPhotoRecord> = { ...cloudPhotos };

        for (const [storeId, p] of Object.entries(currentLocal)) {
          if (!p.synced && !cloudPhotos[storeId]) {
            nextPhotos[storeId] = p;
          } else if (p.synced && !cloudPhotos[storeId]) {
            // Foi excluída na nuvem por outro dispositivo: exclui do IndexedDB local também
            await this.indexedDb.deleteMeterPhoto(type, month, storeId);
            if (this.isSelectionActive(type, month)) {
              this.host.updateDetailedReading(storeId, 'hasPhoto', false);
              this.host.updateDetailedReading(storeId, 'photoTimestamp', undefined);
            }
          }
        }

        if (!this.isSelectionActive(type, month)) return;
        this.meterPhotos.set(nextPhotos);
      }
    });
  }

  unsubscribeRealtimePhotos(): void {
    if (this.photoSubscriptionUnsubscribe) {
      try {
        this.photoSubscriptionUnsubscribe();
      } catch {
        // Ignora erro de teardown
      }
      this.photoSubscriptionUnsubscribe = null;
    }
  }

  destroy(): void {
    this.unsubscribeRealtimePhotos();
  }

  resetSelectionUi(): void {
    this.showPhotoModal.set(false);
    this.activePhotoRecord.set(null);
    this.isConfirmingPhotoDelete.set(false);
  }

  /**
   * Carrega fotos do mês selecionado e do mês anterior (incluindo retroativas)
   * preservando guardas de corrida assíncrona (`utilityType() === type && selectedMonth() === month`).
   */
  loadPhotosForSelection(
    type: UtilityType,
    month: string,
    prevMonth: string,
    prevMap: Map<string, { reading: number; consumption: number; cost?: number; month?: string }>
  ): Promise<void> {
    this.meterPhotos.set({});
    this.prevMonthPhotos.set({});

    const currentPhotosPromise = this.indexedDb.getMeterPhotosForMonth(type, month).then(async photos => {
      if (!this.isSelectionActive(type, month)) return;
      let combined: Record<string, MeterPhotoRecord> = { ...photos };

      if (this.indexedDb.isOnline()) {
        try {
          const cloudPhotos = await this.supabaseService.fetchMeterPhotos(type, month);
          if (!this.isSelectionActive(type, month)) return;
          if (cloudPhotos !== null) {
            combined = { ...cloudPhotos };
            // Preserva apenas fotos locais que ainda estão pendentes de sincronização (!synced)
            for (const [sId, p] of Object.entries(photos)) {
              if (!p.synced && !cloudPhotos[sId]) {
                combined[sId] = p;
              } else if (p.synced && !cloudPhotos[sId]) {
                // A foto foi excluída na nuvem: limpa do IndexedDB local para não ressuscitar a foto
                await this.indexedDb.deleteMeterPhoto(type, month, sId);
                if (this.isSelectionActive(type, month)) {
                  this.host?.updateDetailedReading(sId, 'hasPhoto', false);
                  this.host?.updateDetailedReading(sId, 'photoTimestamp', undefined);
                }
              }
            }
            // Salva em cache local do IndexedDB as fotos válidas da nuvem
            for (const cp of Object.values(cloudPhotos)) {
              if (!photos[cp.storeId]) {
                await this.indexedDb.saveMeterPhoto({ ...cp, synced: true });
              }
            }
          }
        } catch (e) {
          console.warn('Erro ao carregar fotos da nuvem:', e);
        }
      }

      if (!this.isSelectionActive(type, month)) return;
      this.meterPhotos.set(combined);

      // Reconcilia apenas metadados visuais de evidência (hasPhoto e photoTimestamp) sem sobrescrever valores numéricos
      if (this.host) {
        const currentReadings = this.host.getReadingsForUtility(type);
        let metaUpdated = false;
        const updatedMap = new Map(currentReadings);

        for (const [sId, p] of Object.entries(combined)) {
          const curReading = updatedMap.get(sId);
          if (curReading && (!curReading.hasPhoto || curReading.photoTimestamp !== p.capturedAt)) {
            updatedMap.set(sId, {
              ...curReading,
              hasPhoto: true,
              photoTimestamp: p.capturedAt
            });
            metaUpdated = true;
          }
        }

        if (metaUpdated && this.isSelectionActive(type, month)) {
          this.host.replaceReadingsForUtility(type, updatedMap);
        }
      }
    }).catch(() => {
      if (this.isSelectionActive(type, month)) {
        this.meterPhotos.set({});
      }
    });

    const prevPhotosPromise = this.indexedDb.getMeterPhotosForMonth(type, prevMonth).then(async prevPhotos => {
      if (!this.isSelectionActive(type, month)) return;
      let combinedPrev: Record<string, MeterPhotoRecord> = { ...prevPhotos };

      if (this.indexedDb.isOnline()) {
        try {
          const cloudPrev = await this.supabaseService.fetchMeterPhotos(type, prevMonth);
          if (!this.isSelectionActive(type, month)) return;
          if (cloudPrev) {
            combinedPrev = { ...cloudPrev, ...combinedPrev };
          }
        } catch {
          // Ignora falha temporária na nuvem para fotos anteriores
        }
      }

      // Se alguma loja teve a última medição em mês mais antigo, tenta buscar a foto daquele mês também
      for (const [storeId, prevInfo] of prevMap.entries()) {
        if (!this.isSelectionActive(type, month)) return;
        if (prevInfo.month && prevInfo.month !== prevMonth && !combinedPrev[storeId]) {
          try {
            const olderPhoto = await this.indexedDb.getMeterPhoto(type, prevInfo.month, storeId);
            if (olderPhoto) {
              combinedPrev[storeId] = olderPhoto;
            } else if (this.indexedDb.isOnline()) {
              const cloudPhotosOlder = await this.supabaseService.fetchMeterPhotos(type, prevInfo.month);
              if (cloudPhotosOlder && cloudPhotosOlder[storeId]) {
                combinedPrev[storeId] = cloudPhotosOlder[storeId];
              }
            }
          } catch {
            // Ignora falha individual
          }
        }
      }

      if (!this.isSelectionActive(type, month)) return;
      this.prevMonthPhotos.set(combinedPrev);
    }).catch(() => {
      if (this.isSelectionActive(type, month)) {
        this.prevMonthPhotos.set({});
      }
    });

    return Promise.all([currentPhotosPromise, prevPhotosPromise]).then(() => undefined);
  }

  /** Mantém o valor da leitura sincronizado na foto associada quando o usuário edita/apaga no campo. */
  syncPhotoReadingValue(storeId: string, cleanValue: number): void {
    const photo = this.meterPhotos()[storeId];
    if (!photo || photo.readingValue === cleanValue) return;

    const updatedPhoto: MeterPhotoRecord = { ...photo, readingValue: cleanValue };
    this.meterPhotos.update(prev => ({
      ...prev,
      [storeId]: updatedPhoto
    }));
    if (this.activePhotoRecord()?.storeId === storeId) {
      this.activePhotoRecord.set(updatedPhoto);
    }
    this.indexedDb.saveMeterPhoto(updatedPhoto).catch(() => {});
    if (this.indexedDb.isOnline()) {
      this.supabaseService.syncMeterPhoto(updatedPhoto).catch(() => {});
    }
  }

  /** Captura, comprime, aplica marca d'água, salva em IndexedDB/Supabase e aciona OCR automático. */
  async onPhotoCaptured(
    event: Event,
    storeId: string,
    storeName: string,
    luc: string,
    currentReading: number
  ): Promise<void> {
    if (!this.host) return;
    const input = event.target as HTMLInputElement;
    if (!input?.files || input.files.length === 0) return;
    const file = input.files[0];
    input.value = '';

    const type = this.host.getUtilityType();
    const month = this.host.getSelectedMonth();

    this.isCapturingPhoto.set(storeId);

    try {
      const utilLabel = type === 'luz' ? 'Luz' : type === 'agua' ? 'Água' : 'Gás';
      const watermark = `${luc} • ${storeName} • ${utilLabel} • Leitura: ${currentReading || 0}`;

      const compressedBase64 = await this.indexedDb.compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.72,
        watermarkText: watermark
      });

      // Análise de qualidade da foto (iluminação / reflexo) & realce de contraste para OCR
      const { enhancedDataUrl, quality } = await this.analyzeImage(compressedBase64);
      if (quality.warningMessage) {
        this.indexedDb.showToast(quality.warningMessage);
      }

      const record: MeterPhotoRecord = {
        id: `${type}_${month}_${storeId}`,
        type,
        month,
        storeId,
        storeName,
        luc,
        readingValue: currentReading || 0,
        photoDataUrl: compressedBase64,
        capturedAt: new Date().toISOString(),
        synced: false
      };

      // 1. Salva sempre no IndexedDB local primeiro (garantia offline)
      await this.indexedDb.saveMeterPhoto(record);

      // 2. Se online, tenta enviar imediatamente para o Supabase
      if (this.indexedDb.isOnline()) {
        try {
          const ok = await this.supabaseService.syncMeterPhoto(record);
          if (ok) {
            record.synced = true;
            await this.indexedDb.saveMeterPhoto(record);
          }
        } catch (syncErr) {
          console.warn('Envio imediato ao Supabase pendente (será enviado na reconexão):', syncErr);
        }
      }

      await this.indexedDb.refreshPendingCount();

      // Guarda de corrida assíncrona antes de atualizar estado reativo da tela atual
      if (!this.isSelectionActive(type, month)) return;

      this.meterPhotos.update(prev => ({
        ...prev,
        [storeId]: { ...record }
      }));

      if (this.activePhotoRecord()?.storeId === storeId) {
        this.activePhotoRecord.set({ ...record });
      }

      this.host.updateDetailedReading(storeId, 'hasPhoto', true);
      this.host.updateDetailedReading(storeId, 'photoTimestamp', record.capturedAt);

      // --- LEITURA AUTOMÁTICA DO MEDIDOR POR FOTO COM SELEÇÃO INTELIGENTE E DUPLA CHECAGEM ---
      const isOnline = (typeof navigator !== 'undefined' && navigator.onLine) || this.indexedDb.isOnline();
      if (isOnline) {
        await this.ensureApiKeysFromCloud();
        if (!this.isSelectionActive(type, month)) return;

        if (!this.geminiService.hasConfiguredApiKey()) {
          this.pendingOcrStoreId.set(storeId);
          await this.openAiKeyModal();
          this.indexedDb.showToast('⚙️ Configure a chave Groq ou Gemini no ícone 🤖 para ativar a IA no celular.');
          this.ocrFeedback.update(prev => ({
            ...prev,
            [storeId]: {
              success: false,
              message: 'Chave de IA não configurada. Configure a chave no ícone 🤖 no topo para ativar a leitura automática.',
              confidence: 'low',
              provider: 'none',
              modelName: 'Sem chave configurada'
            }
          }));
          return;
        }

        this.indexedDb.showToast('🤖 Lendo visor do medidor com IA...');
        this.isReadingOcr.set(storeId);
        const ocrCtx = this.buildOcrContext(storeId, type);
        const smartProvider = getRecommendedProvider(this.ocrFeedbackService.entries(), type, ocrCtx?.meterType);
        const initialLabel = smartProvider === 'gemini'
          ? 'Gemini 3.8 Flash (Recomendado pelo Histórico)'
          : smartProvider === 'qwen'
            ? 'Qwen 3.8 27B (Groq)'
            : 'Qwen 3.8 27B + Gemini Fallback';
        this.ocrCurrentModelLabel.set(initialLabel);

        try {
          const ocrResult = await this.geminiService.extractWithDualCheck(
            enhancedDataUrl,
            type,
            ocrCtx
          );

          if (!this.isSelectionActive(type, month)) return;

          if (ocrResult.success && ocrResult.reading !== null) {
            this.host.updateDetailedReading(storeId, 'reading', ocrResult.reading);
            this.registerOcrPending(storeId, ocrResult);

            record.readingValue = ocrResult.reading;
            await this.indexedDb.saveMeterPhoto(record);
            if (this.indexedDb.isOnline()) {
              this.supabaseService.syncMeterPhoto(record).catch(() => {});
            }

            if (!this.isSelectionActive(type, month)) return;

            if (this.activePhotoRecord()?.storeId === storeId) {
              this.activePhotoRecord.set({ ...record });
            }
            this.meterPhotos.update(prev => ({ ...prev, [storeId]: { ...record } }));

            this.host.saveBill();

            const modelDesc = ocrResult.fallbackUsed
              ? '🤖 Gemini 3.8 Flash (Fallback)'
              : ocrResult.provider === 'qwen'
                ? '⚡ Qwen 3.8 27B (Groq)'
                : '🤖 Gemini 3.8 Flash';

            this.ocrFeedback.update(prev => ({
              ...prev,
              [storeId]: {
                success: true,
                message: `${modelDesc}: Leitura ${ocrResult.reading} preenchida automaticamente!`,
                reading: ocrResult.reading,
                confidence: ocrResult.confidence,
                explanation: ocrResult.explanation,
                provider: ocrResult.provider,
                modelName: ocrResult.modelName,
                fallbackUsed: ocrResult.fallbackUsed
              }
            }));
          } else {
            this.ocrFeedback.update(prev => ({
              ...prev,
              [storeId]: {
                success: false,
                message: ocrResult.explanation || ocrResult.error || 'A IA não identificou com nitidez os números do visor. Você pode digitar manualmente.',
                confidence: ocrResult.confidence,
                provider: ocrResult.provider,
                modelName: ocrResult.modelName
              }
            }));
          }
        } catch (ocrErr) {
          console.error('Falha no pipeline de OCR do medidor:', ocrErr);
        } finally {
          if (this.isReadingOcr() === storeId) {
            this.isReadingOcr.set(null);
          }
        }
      } else {
        this.ocrFeedback.update(prev => ({
          ...prev,
          [storeId]: {
            success: true,
            message: 'Foto salva no IndexedDB! Em modo offline, digite a leitura manualmente.',
            confidence: 'medium',
            provider: 'none',
            modelName: 'Offline IndexedDB'
          }
        }));
      }
    } catch (err) {
      console.error('Erro ao processar foto:', err);
    } finally {
      if (this.isCapturingPhoto() === storeId) {
        this.isCapturingPhoto.set(null);
      }
      input.value = '';
    }
  }

  // --- AI API KEY CONFIGURATION ---

  private async ensureApiKeysFromCloud(): Promise<void> {
    if (this.geminiService.hasConfiguredApiKey()) return;
    try {
      const cloudKeys = await this.supabaseService.fetchSystemAiKeys();
      if (cloudKeys) {
        this.geminiService.setCloudApiKeys(cloudKeys.groqKey, cloudKeys.geminiKey);
      }
    } catch {
      // Ignora indisponibilidade temporária
    }
  }

  async openAiKeyModal(): Promise<void> {
    let groq = this.geminiService.getSavedGroqKey();
    let gemini = this.geminiService.getSavedGeminiKey();
    if (!groq && !gemini) {
      try {
        const cloud = await this.supabaseService.fetchSystemAiKeys();
        if (cloud) {
          groq = cloud.groqKey || '';
          gemini = cloud.geminiKey || '';
          this.geminiService.setCloudApiKeys(groq, gemini);
        }
      } catch {
        // Ignora indisponibilidade temporária
      }
    }
    this.groqInputKey.set(groq);
    this.geminiInputKey.set(gemini);
    this.showAiKeyModal.set(true);
  }

  onAiKeysSaved(keys: { groqKey: string; geminiKey: string }): void {
    this.groqInputKey.set(keys.groqKey);
    this.geminiInputKey.set(keys.geminiKey);
    this.saveAiKeysAndProceed();
  }

  closeAiKeyModal(): void {
    this.showAiKeyModal.set(false);
    this.pendingOcrStoreId.set(null);
  }

  saveAiKeysAndProceed(): void {
    try {
      this.geminiService.saveApiKeys(this.groqInputKey(), this.geminiInputKey());
      this.supabaseService.syncSystemAiKeys(this.groqInputKey(), this.geminiInputKey()).catch(() => {});
      this.showAiKeyModal.set(false);
      this.indexedDb.showToast('✓ Chaves de IA salvas com segurança e sincronizadas na nuvem!');
      const pendingId = this.pendingOcrStoreId();
      if (pendingId) {
        this.pendingOcrStoreId.set(null);
        void this.runOcrOnPhoto(pendingId);
      }
    } catch (err: any) {
      this.indexedDb.showToast(`⚠️ ${err?.message || 'Erro ao validar formato de chaves'}`);
    }
  }

  // --- SINGLE PHOTO OCR ---

  async runOcrOnPhoto(storeId: string, forceProvider?: 'auto' | 'qwen' | 'gemini'): Promise<void> {
    if (!this.host) return;
    const effectiveProvider: 'qwen' | 'gemini' | undefined = forceProvider === 'auto' ? undefined : forceProvider;
    const type = this.host.getUtilityType();
    const month = this.host.getSelectedMonth();
    const photo = this.meterPhotos()[storeId];
    if (!photo) return;

    if (!this.geminiService.hasConfiguredApiKey()) {
      await this.ensureApiKeysFromCloud();
      if (!this.isSelectionActive(type, month)) return;
    }

    if (!this.geminiService.hasConfiguredApiKey()) {
      this.pendingOcrStoreId.set(storeId);
      await this.openAiKeyModal();
      this.indexedDb.showToast('⚙️ Configure sua chave Groq ou Gemini para ativar a leitura por IA.');
      return;
    }

    const ocrCtx = this.buildOcrContext(storeId, type);
    const smartProvider = effectiveProvider || getRecommendedProvider(this.ocrFeedbackService.entries(), type, ocrCtx?.meterType);

    this.isReadingOcr.set(storeId);
    this.ocrCurrentModelLabel.set(
      effectiveProvider === 'gemini'
        ? 'Gemini 3.8 Flash'
        : effectiveProvider === 'qwen'
          ? 'Qwen 3.8 27B (Groq)'
          : smartProvider === 'gemini'
            ? 'Gemini 3.8 Flash (Recomendado)'
            : 'Qwen 3.8 27B (Groq) + Gemini Fallback'
    );

    try {
      // Se não forçar provedor estrito, executa com dupla checagem (consenso)
      const ocrResult = effectiveProvider
        ? await this.geminiService.extractMeterReading(
            photo.photoDataUrl,
            type,
            effectiveProvider,
            ocrCtx
          )
        : await this.geminiService.extractWithDualCheck(
            photo.photoDataUrl,
            type,
            ocrCtx
          );

      if (!this.isSelectionActive(type, month)) return;

      if (ocrResult.success && ocrResult.reading !== null) {
        this.host.updateDetailedReading(storeId, 'reading', ocrResult.reading);
        this.registerOcrPending(storeId, ocrResult);

        const updatedPhoto: MeterPhotoRecord = { ...photo, readingValue: ocrResult.reading };
        await this.indexedDb.saveMeterPhoto(updatedPhoto);
        if (this.indexedDb.isOnline()) {
          this.supabaseService.syncMeterPhoto(updatedPhoto).catch(() => {});
        }

        if (!this.isSelectionActive(type, month)) return;

        if (this.activePhotoRecord()?.storeId === storeId) {
          this.activePhotoRecord.set(updatedPhoto);
        }
        this.meterPhotos.update(prev => ({ ...prev, [storeId]: updatedPhoto }));

        this.host.saveBill();

        const modelLabel = ocrResult.fallbackUsed
          ? '🤖 Gemini 3.8 Flash (Fallback)'
          : ocrResult.provider === 'qwen'
            ? '⚡ Qwen 3.8 27B (Groq)'
            : '🤖 Gemini 3.8 Flash';

        this.ocrFeedback.update(prev => ({
          ...prev,
          [storeId]: {
            success: true,
            message: `${modelLabel}: Leitura ${ocrResult.reading} detectada (${ocrResult.confidence === 'high' ? 'Alta Confiança' : 'Média'})!`,
            reading: ocrResult.reading,
            confidence: ocrResult.confidence,
            explanation: ocrResult.explanation,
            provider: ocrResult.provider,
            modelName: ocrResult.modelName,
            fallbackUsed: ocrResult.fallbackUsed
          }
        }));
      } else {
        this.ocrFeedback.update(prev => ({
          ...prev,
          [storeId]: {
            success: false,
            message: ocrResult.explanation || ocrResult.error || 'Não foi possível detectar os dígitos do mostrador nesta foto.',
            confidence: ocrResult.confidence,
            provider: ocrResult.provider,
            modelName: ocrResult.modelName
          }
        }));
      }
    } catch {
      if (this.isSelectionActive(type, month)) {
        this.ocrFeedback.update(prev => ({
          ...prev,
          [storeId]: {
            success: false,
            message: 'Erro na comunicação com o serviço de IA para leitura.',
            provider: 'none',
            modelName: 'Error'
          }
        }));
      }
    } finally {
      if (this.isReadingOcr() === storeId) {
        this.isReadingOcr.set(null);
      }
    }
  }

  /** Guarda a leitura da IA para o técnico conferir (passo 1 do aprendizado do OCR). */
  registerOcrPending(storeId: string, ocrResult: MeterOcrResult): void {
    if (ocrResult.reading === null) return;
    this.ocrPending.update(prev => ({
      ...prev,
      [storeId]: {
        ocrValue: ocrResult.reading as number,
        detectedDigits: ocrResult.detectedDigits ?? null,
        meterType: ocrResult.meterType,
        confidence: ocrResult.confidence,
        provider: ocrResult.provider,
        modelName: ocrResult.modelName,
        fallbackUsed: ocrResult.fallbackUsed,
        dualCheck: ocrResult.dualCheck
      }
    }));
  }

  /** Contexto do medidor (leitura anterior + correções passadas) para melhorar a precisão do OCR. */
  buildOcrContext(storeId: string, utilityTypeOverride?: UtilityType) {
    const type = utilityTypeOverride || this.host?.getUtilityType() || 'luz';
    const item = this.host?.getTableData().find(s => s.storeId === storeId);
    return buildReadingContext(this.ocrFeedbackService.entries(), {
      storeId,
      utilityType: type,
      previousReading: item?.prevReading ?? null
    });
  }

  /** Relê a foto com o motor diferente do usado antes. */
  retryOcrWithOtherEngine(storeId: string): Promise<void> {
    const pending = this.ocrPending()[storeId];
    const next: 'qwen' | 'gemini' = pending?.provider === 'qwen' ? 'gemini' : 'qwen';
    return this.runOcrOnPhoto(storeId, next);
  }

  /** Técnico confirma (ou corrige no campo) a leitura sugerida pela IA e a correção é registrada. */
  confirmOcrReading(storeId: string, currentValue: number | string | null | undefined): void {
    if (!this.host) return;
    const pending = this.ocrPending()[storeId];
    if (!pending) return;

    const finalValue = Number(currentValue);
    if (currentValue === null || currentValue === undefined || currentValue === '' || !Number.isFinite(finalValue)) {
      this.indexedDb.showToast('⚠️ Informe a leitura antes de confirmar.');
      return;
    }

    const store = this.storeService.stores().find(s => s.id === storeId);
    const entry = this.ocrFeedbackService.record({
      storeId,
      storeName: store?.name || this.meterPhotos()[storeId]?.storeName || storeId,
      utilityType: this.host.getUtilityType(),
      month: this.host.getSelectedMonth(),
      finalValue,
      pending
    });

    // Mantém o registro fotográfico alinhado com o valor conferido
    const photo = this.meterPhotos()[storeId];
    if (photo && photo.readingValue !== finalValue) {
      const updated = { ...photo, readingValue: finalValue };
      this.indexedDb.saveMeterPhoto(updated).then(() => {
        if (this.indexedDb.isOnline()) {
          this.supabaseService.syncMeterPhoto(updated).catch(() => {});
        }
      });
      this.meterPhotos.update(prev => ({ ...prev, [storeId]: updated }));
      if (this.activePhotoRecord()?.storeId === storeId) {
        this.activePhotoRecord.set(updated);
      }
    }

    this.ocrPending.update(prev => {
      const next = { ...prev };
      delete next[storeId];
      return next;
    });
    this.dismissOcrFeedback(storeId);
    this.host.saveBill();
    this.indexedDb.showToast(
      entry.wasCorrected
        ? `✏️ Correção registrada: IA ${entry.ocrValue} → ${entry.finalValue}`
        : '✓ Leitura confirmada!'
    );
  }

  dismissOcrFeedback(storeId: string): void {
    this.ocrFeedback.update(prev => {
      const next = { ...prev };
      delete next[storeId];
      return next;
    });
  }

  // --- BATCH OCR QUEUE EXECUTION ---

  async openBatchOcrModal(pendingCount: number, totalPhotosCount: number): Promise<void> {
    await this.ensureApiKeysFromCloud();
    if (!this.geminiService.hasConfiguredApiKey()) {
      await this.openAiKeyModal();
      this.indexedDb.showToast('⚙️ Configure sua chave Groq ou Gemini para ativar a leitura por IA.');
      return;
    }
    if (totalPhotosCount === 0) {
      this.indexedDb.showToast('Nenhuma foto capturada neste mês para processar.');
      return;
    }
    this.batchOcrProgress.set({
      current: 0,
      total: pendingCount > 0 ? pendingCount : totalPhotosCount,
      progressPct: 0,
      currentStoreName: '',
      currentLuc: '',
      successCount: 0,
      failCount: 0,
      currentModel: 'Qwen 3.8 27B (Groq) + Gemini'
    });
    this.showBatchOcrModal.set(true);
  }

  closeBatchOcrModal(): void {
    if (this.isBatchOcrRunning()) return;
    this.showBatchOcrModal.set(false);
  }

  cancelBatchOcr(): void {
    this.cancelBatchOcrRequested.set(true);
  }

  async executeBatchOcr(reprocessAll: boolean = false): Promise<void> {
    if (!this.host) return;
    const type = this.host.getUtilityType();
    const month = this.host.getSelectedMonth();

    if (!this.geminiService.hasConfiguredApiKey()) {
      await this.ensureApiKeysFromCloud();
      if (!this.isSelectionActive(type, month)) return;
    }

    if (!this.geminiService.hasConfiguredApiKey()) {
      await this.openAiKeyModal();
      this.indexedDb.showToast('⚙️ Configure sua chave Groq ou Gemini para ativar a leitura por IA.');
      return;
    }

    if (this.host.isLocked()) {
      this.indexedDb.showToast('🔒 Mês bloqueado para edições.');
      return;
    }

    const candidates = this.host.getTableData().filter(s => {
      if (!s.hasPhoto) return false;
      if (reprocessAll) return true;
      return !s.isRead || s.currentReading === 0;
    });

    if (candidates.length === 0) {
      this.indexedDb.showToast('Nenhuma foto pendente encontrada para processamento.');
      return;
    }

    this.isBatchOcrRunning.set(true);
    this.cancelBatchOcrRequested.set(false);
    this.showBatchOcrModal.set(true);

    let success = 0;
    let fail = 0;
    const total = candidates.length;

    this.batchOcrProgress.set({
      current: 0,
      total,
      progressPct: 0,
      currentStoreName: candidates[0]?.storeName || '',
      currentLuc: candidates[0]?.luc || '',
      successCount: 0,
      failCount: 0,
      currentModel: 'Qwen 3.8 27B / Gemini 3.8'
    });

    let abortedByNavigation = false;

    try {
      for (let i = 0; i < candidates.length; i++) {
        if (!this.isSelectionActive(type, month)) {
          abortedByNavigation = true;
          break;
        }
        if (this.cancelBatchOcrRequested()) {
          this.indexedDb.showToast(`⏹️ Fila cancelada pelo usuário. (${success} leitura(s) salvas)`);
          break;
        }

        const storeItem = candidates[i];
        let photo: MeterPhotoRecord | undefined = this.meterPhotos()[storeItem.storeId];

        if (!photo) {
          const diskRec = await this.indexedDb.getMeterPhoto(type, month, storeItem.storeId);
          if (!this.isSelectionActive(type, month)) {
            abortedByNavigation = true;
            break;
          }
          if (diskRec) {
            photo = diskRec;
            this.meterPhotos.update(prev => ({ ...prev, [storeItem.storeId]: diskRec }));
          }
        }

        const pct = Math.round(((i + 1) / total) * 100);
        this.batchOcrProgress.set({
          current: i + 1,
          total,
          progressPct: pct,
          currentStoreName: storeItem.storeName,
          currentLuc: storeItem.luc,
          successCount: success,
          failCount: fail,
          currentModel: 'Qwen 3.8 27B (Groq) + Gemini'
        });

        if (photo && photo.photoDataUrl) {
          try {
            const ocrResult = await this.geminiService.extractMeterReading(
              photo.photoDataUrl,
              type,
              undefined,
              this.buildOcrContext(storeItem.storeId, type)
            );

            if (!this.isSelectionActive(type, month)) {
              abortedByNavigation = true;
              break;
            }

            if (ocrResult.success && ocrResult.reading !== null) {
              this.host.updateDetailedReading(storeItem.storeId, 'reading', ocrResult.reading);
              this.registerOcrPending(storeItem.storeId, ocrResult);
              const updatedPhoto: MeterPhotoRecord = { ...photo, readingValue: ocrResult.reading };
              await this.indexedDb.saveMeterPhoto(updatedPhoto);
              if (this.indexedDb.isOnline()) {
                this.supabaseService.syncMeterPhoto(updatedPhoto).catch(() => {});
              }
              if (this.isSelectionActive(type, month)) {
                this.meterPhotos.update(prev => ({ ...prev, [storeItem.storeId]: updatedPhoto }));
              }
              success++;
            } else {
              fail++;
            }
          } catch {
            fail++;
          }
        } else {
          fail++;
        }

        this.batchOcrProgress.update(p => ({
          ...p,
          successCount: success,
          failCount: fail
        }));

        // Pequeno intervalo para proteger contra limites de requisições de API (rate limit)
        if (i < candidates.length - 1 && this.batchDelayMs > 0) {
          await new Promise(r => setTimeout(r, this.batchDelayMs));
        }
      }
    } finally {
      this.isBatchOcrRunning.set(false);
    }

    if (!abortedByNavigation && this.isSelectionActive(type, month)) {
      this.host.saveBill();
      this.indexedDb.showToast(`⚡ Fila finalizada: ${success} leitura(s) extraídas com sucesso, ${fail} não detectadas.`);
    }
  }

  // --- PHOTO VIEWER & MANAGEMENT ---

  openPhotoViewer(storeId: string, customRecord?: MeterPhotoRecord): void {
    if (customRecord) {
      this.activePhotoRecord.set(customRecord);
      this.showPhotoModal.set(true);
      return;
    }

    const photo = this.meterPhotos()[storeId];
    if (photo) {
      this.activePhotoRecord.set(photo);
      this.showPhotoModal.set(true);
      return;
    }

    if (!this.host) return;
    const type = this.host.getUtilityType();
    const month = this.host.getSelectedMonth();
    this.indexedDb.getMeterPhoto(type, month, storeId).then(async rec => {
      if (!this.isSelectionActive(type, month)) return;
      if (rec) {
        this.meterPhotos.update(prev => ({ ...prev, [storeId]: rec }));
        this.activePhotoRecord.set(rec);
        this.showPhotoModal.set(true);
      } else if (this.indexedDb.isOnline()) {
        const cloudPhotos = await this.supabaseService.fetchMeterPhotos(type, month);
        if (!this.isSelectionActive(type, month)) return;
        if (cloudPhotos && cloudPhotos[storeId]) {
          const cloudPhoto = cloudPhotos[storeId];
          this.meterPhotos.update(prev => ({ ...prev, [storeId]: cloudPhoto }));
          this.activePhotoRecord.set(cloudPhoto);
          this.showPhotoModal.set(true);
          await this.indexedDb.saveMeterPhoto(cloudPhoto);
        }
      }
    });
  }

  async syncSinglePhoto(photo: MeterPhotoRecord): Promise<void> {
    if (!this.indexedDb.isOnline()) {
      this.indexedDb.showToast('⚠️ Sem conexão com a internet no momento.');
      return;
    }
    const ok = await this.supabaseService.syncMeterPhoto(photo);
    if (ok) {
      const syncedPhoto: MeterPhotoRecord = { ...photo, synced: true };
      await this.indexedDb.saveMeterPhoto(syncedPhoto);
      if (this.isSelectionActive(photo.type, photo.month)) {
        this.meterPhotos.update(prev => ({ ...prev, [photo.storeId]: syncedPhoto }));
        if (this.activePhotoRecord()?.storeId === photo.storeId) {
          this.activePhotoRecord.set(syncedPhoto);
        }
      }
      await this.indexedDb.refreshPendingCount();
      this.indexedDb.showToast(`☁️ Foto de ${photo.luc} enviada ao Supabase com sucesso!`);
    } else {
      this.indexedDb.showToast(`⚠️ Falha ao sincronizar foto de ${photo.luc} com Supabase.`);
    }
  }

  closePhotoViewer(): void {
    this.showPhotoModal.set(false);
    this.activePhotoRecord.set(null);
    this.isConfirmingPhotoDelete.set(false);
  }

  confirmDeletePhoto(storeId: string, storeName?: string): void {
    const name = storeName || 'desta loja';
    if (confirm(`Tem certeza que deseja excluir a foto do medidor de ${name}?`)) {
      void this.removePhoto(storeId);
    }
  }

  async removePhoto(storeId: string): Promise<void> {
    if (!this.host) return;
    const type = this.host.getUtilityType();
    const month = this.host.getSelectedMonth();

    // 1. Fecha o visualizador de foto instantaneamente
    this.closePhotoViewer();

    // 2. Atualiza estado reativo local imediatamente
    this.meterPhotos.update(prev => {
      const copy = { ...prev };
      delete copy[storeId];
      return copy;
    });

    // 3. Limpa referências de foto na leitura da loja
    this.host.updateDetailedReading(storeId, 'hasPhoto', false);
    this.host.updateDetailedReading(storeId, 'photoTimestamp', undefined);

    // 4. Salva a fatura no histórico e na nuvem
    this.host.saveBill();

    // 5. Exclui do IndexedDB local (que gerencia fila offline se sem internet) e do Supabase
    await this.indexedDb.deleteMeterPhoto(type, month, storeId);
    if (this.indexedDb.isOnline()) {
      await this.supabaseService.deleteMeterPhoto(type, month, storeId).catch(() => {});
    }

    // 6. Notificação de confirmação imediata
    this.indexedDb.showToast('🗑️ Foto excluída com sucesso do dispositivo e da nuvem!');
  }

  downloadActivePhoto(): void {
    const photo = this.activePhotoRecord();
    if (!photo || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = photo.photoDataUrl;
    a.download = `Evidencia_Medidor_${photo.type.toUpperCase()}_${photo.month}_${photo.luc}.jpg`;
    a.click();
  }
}
