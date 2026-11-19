import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BillOcrPhotoFacade, BillOcrPhotoHost } from './bill-ocr-photo.facade';
import { MeterOcrResult, MeterPhotoRecord, StoreReading, UtilityType } from '../models';
import { BillTableRow } from '../components/bill-subcomponents.types';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makePhoto(overrides: Partial<MeterPhotoRecord> = {}): MeterPhotoRecord {
  return {
    id: 'luz_2026-11_store-1',
    type: 'luz',
    month: '2026-11',
    storeId: 'store-1',
    storeName: 'Zara Moda',
    luc: 'L-101',
    readingValue: 100,
    photoDataUrl: 'data:image/jpeg;base64,AAA',
    capturedAt: '2026-11-10T10:00:00.000Z',
    synced: true,
    ...overrides
  };
}

function makeRow(overrides: Partial<BillTableRow> = {}): BillTableRow {
  return {
    storeId: 'store-1',
    luc: 'L-101',
    contrato: '10423',
    storeName: 'Zara Moda',
    meterNumber: 'M-101',
    active: true,
    consumption: 0,
    rawConsumption: 0,
    gasFactor: 1,
    isGasDistributed: false,
    cost: 0,
    originalCost: 0,
    excludedFromBill: false,
    hiddenFromTech: false,
    prevReading: 100,
    prevConsumption: 20,
    prevCost: 40,
    prevReadingMonth: '2026-10',
    currentReading: 0,
    constant: 1,
    adjustment: 1,
    adjustmentAdd: 0,
    fcm: 1,
    fluxoCost: 0,
    variation: 0,
    note: '',
    hasPhoto: true,
    photoTimestamp: '2026-11-10T10:00:00.000Z',
    isRead: false,
    isJustified: false,
    justificationReason: '',
    isFrequentZero: false,
    consecutiveZeroMonths: 0,
    learnedReason: '',
    isNegative: false,
    isZeroActive: false,
    isHugeTypoJump: false,
    isAtypicalJump: false,
    hasSuspiciousAlert: false,
    anomalyConfirmed: false,
    isRollover: false,
    alertSeverity: 'none',
    validationAlert: {
      hasAlert: false,
      type: 'none',
      severity: 'none',
      badgeLabel: '',
      title: '',
      message: '',
      avgConsumption: 0,
      prevConsumption: 20,
      prevReading: 100,
      currentReading: 0,
      consumption: 0,
      diffPct: null
    },
    readingDiff: 0,
    ...overrides
  };
}

describe('BillOcrPhotoFacade', () => {
  let facade: BillOcrPhotoFacade;
  let currentUtility: UtilityType;
  let currentMonth: string;
  let locked: boolean;
  let tableRows: BillTableRow[];
  let readingsByUtility: Record<UtilityType, Map<string, StoreReading>>;

  let mockIndexedDb: any;
  let mockGemini: any;
  let mockOcrFeedback: any;
  let mockSupabase: any;
  let mockStoreService: any;
  let mockAnalyzeImage: any;
  let realtimeCallback: ((payload: any) => Promise<void>) | null;
  let host: BillOcrPhotoHost;

  beforeEach(() => {
    currentUtility = 'luz';
    currentMonth = '2026-11';
    locked = false;
    tableRows = [makeRow()];
    readingsByUtility = {
      luz: new Map([['store-1', { reading: 120, constant: 1, adjustment: 1, calculatedConsumption: 20 }]]),
      agua: new Map(),
      gas: new Map()
    };
    realtimeCallback = null;

    mockIndexedDb = {
      isOnline: vi.fn(() => true),
      getMeterPhotosForMonth: vi.fn().mockResolvedValue({}),
      getMeterPhoto: vi.fn().mockResolvedValue(null),
      saveMeterPhoto: vi.fn().mockResolvedValue(undefined),
      deleteMeterPhoto: vi.fn().mockResolvedValue(undefined),
      compressImage: vi.fn().mockResolvedValue('data:image/jpeg;base64,COMPRESSED'),
      refreshPendingCount: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn()
    };

    mockGemini = {
      getSavedGroqKey: vi.fn(() => 'gsk_valid_key'),
      getSavedGeminiKey: vi.fn(() => ''),
      setCloudApiKeys: vi.fn(),
      hasConfiguredApiKey: vi.fn(() => true),
      saveApiKeys: vi.fn(),
      extractWithDualCheck: vi.fn().mockResolvedValue({
        success: true,
        reading: 155,
        confidence: 'high',
        provider: 'qwen',
        modelName: 'Qwen 3.8 27B'
      } as MeterOcrResult),
      extractMeterReading: vi.fn().mockResolvedValue({
        success: true,
        reading: 160,
        confidence: 'high',
        provider: 'gemini',
        modelName: 'Gemini 3.8 Flash'
      } as MeterOcrResult)
    };

    mockOcrFeedback = {
      entries: vi.fn(() => []),
      record: vi.fn((params: any) => ({
        ...params,
        ocrValue: params.pending.ocrValue,
        wasCorrected: params.pending.ocrValue !== params.finalValue
      }))
    };

    mockSupabase = {
      syncSystemAiKeys: vi.fn().mockResolvedValue(undefined),
      fetchSystemAiKeys: vi.fn().mockResolvedValue(null),
      fetchMeterPhotos: vi.fn().mockResolvedValue({}),
      syncMeterPhoto: vi.fn().mockResolvedValue(true),
      deleteMeterPhoto: vi.fn().mockResolvedValue(true),
      subscribeToPhotos: vi.fn((cb: any) => {
        realtimeCallback = cb;
        return vi.fn();
      })
    };

    mockStoreService = {
      stores: vi.fn(() => [{ id: 'store-1', luc: 'L-101', name: 'Zara Moda' }])
    };

    mockAnalyzeImage = vi.fn().mockResolvedValue({
      enhancedDataUrl: 'data:image/jpeg;base64,ENHANCED',
      quality: { warningMessage: null }
    });

    host = {
      getUtilityType: () => currentUtility,
      getSelectedMonth: () => currentMonth,
      isLocked: () => locked,
      getTableData: () => tableRows,
      getReadingsForUtility: (type) => readingsByUtility[type],
      replaceReadingsForUtility: vi.fn((type, updatedMap) => {
        readingsByUtility[type] = updatedMap;
      }),
      updateDetailedReading: vi.fn(),
      saveBill: vi.fn()
    };

    facade = new BillOcrPhotoFacade();
    facade.setDependenciesForTest({
      indexedDb: mockIndexedDb,
      geminiService: mockGemini,
      ocrFeedbackService: mockOcrFeedback,
      supabaseService: mockSupabase,
      storeService: mockStoreService,
      analyzeImage: mockAnalyzeImage,
      batchDelayMs: 0
    });
    facade.bindHost(host);
  });

  it('guarda de corrida: ignora fotos carregadas se o usuário trocar de utilidade ou mês antes do retorno assíncrono', async () => {
    const cloudDeferred = createDeferred<Record<string, MeterPhotoRecord>>();
    mockIndexedDb.getMeterPhotosForMonth.mockResolvedValue({});
    mockSupabase.fetchMeterPhotos.mockReturnValueOnce(cloudDeferred.promise);

    const loadPromise = facade.loadPhotosForSelection('luz', '2026-11', '2026-10', new Map());

    // Usuário troca de aba para 'agua' antes da nuvem responder para 'luz'
    currentUtility = 'agua';
    cloudDeferred.resolve({ 'store-1': makePhoto({ type: 'luz', month: '2026-11' }) });
    await loadPromise;

    expect(facade.meterPhotos()).toEqual({});
    expect(host.replaceReadingsForUtility).not.toHaveBeenCalled();
  });

  it('loadPhotosForSelection mescla fotos locais não sincronizadas, remove fotos deletadas na nuvem e reconcilia metadados sem alterar leitura numérica', async () => {
    const localUnsynced = makePhoto({ storeId: 'store-local', synced: false, capturedAt: '2026-11-11T10:00:00.000Z' });
    const localDeletedInCloud = makePhoto({ storeId: 'store-deleted', synced: true });
    const cloudPhoto = makePhoto({ storeId: 'store-1', synced: true, capturedAt: '2026-11-12T10:00:00.000Z' });

    mockIndexedDb.getMeterPhotosForMonth
      .mockResolvedValueOnce({
        'store-local': localUnsynced,
        'store-deleted': localDeletedInCloud
      })
      .mockResolvedValueOnce({});

    mockSupabase.fetchMeterPhotos
      .mockResolvedValueOnce({ 'store-1': cloudPhoto })
      .mockResolvedValueOnce({});

    await facade.loadPhotosForSelection('luz', '2026-11', '2026-10', new Map());

    expect(Object.keys(facade.meterPhotos()).sort()).toEqual(['store-1', 'store-local']);
    expect(mockIndexedDb.deleteMeterPhoto).toHaveBeenCalledWith('luz', '2026-11', 'store-deleted');
    expect(host.updateDetailedReading).toHaveBeenCalledWith('store-deleted', 'hasPhoto', false);
    expect(mockIndexedDb.saveMeterPhoto).toHaveBeenCalledWith({ ...cloudPhoto, synced: true });

    // Reconciliou apenas hasPhoto e photoTimestamp, preservando leitura numérica (120)
    const updatedStore1 = readingsByUtility.luz.get('store-1');
    expect(updatedStore1?.reading).toBe(120);
    expect(updatedStore1?.hasPhoto).toBe(true);
    expect(updatedStore1?.photoTimestamp).toBe('2026-11-12T10:00:00.000Z');
  });

  it('guarda de corrida no realtime: descarta atualização da nuvem se o mês mudou durante o fetch', async () => {
    const cloudDeferred = createDeferred<Record<string, MeterPhotoRecord>>();
    mockSupabase.fetchMeterPhotos.mockReturnValueOnce(cloudDeferred.promise);

    facade.subscribeToRealtimePhotos();
    expect(realtimeCallback).not.toBeNull();

    const eventPromise = realtimeCallback!({ eventType: 'INSERT' });
    // Usuário muda o mês enquanto fetchMeterPhotos está pendente
    currentMonth = '2026-12';
    cloudDeferred.resolve({ 'store-1': makePhoto({ month: '2026-11' }) });
    await eventPromise;

    expect(facade.meterPhotos()).toEqual({});
  });

  it('runOcrOnPhoto executa dupla checagem no modo auto e respeita guarda de corrida ao trocar de aba', async () => {
    facade.meterPhotos.set({ 'store-1': makePhoto() });

    const ocrDeferred = createDeferred<MeterOcrResult>();
    mockGemini.extractWithDualCheck.mockReturnValueOnce(ocrDeferred.promise);

    const runPromise = facade.runOcrOnPhoto('store-1', 'auto');
    expect(facade.isReadingOcr()).toBe('store-1');

    // Troca de utilidade antes do OCR retornar
    currentUtility = 'gas';
    ocrDeferred.resolve({
      success: true,
      reading: 999,
      confidence: 'high',
      provider: 'qwen',
      modelName: 'Qwen 3.8 27B'
    });
    await runPromise;

    expect(host.updateDetailedReading).not.toHaveBeenCalled();
    expect(host.saveBill).not.toHaveBeenCalled();
    expect(facade.isReadingOcr()).toBeNull();
  });

  it('runOcrOnPhoto aplica leitura, registra pendência de confirmação e salva quando a seleção continua ativa', async () => {
    facade.meterPhotos.set({ 'store-1': makePhoto() });

    await facade.runOcrOnPhoto('store-1', 'gemini');

    expect(mockGemini.extractMeterReading).toHaveBeenCalledTimes(1);
    expect(host.updateDetailedReading).toHaveBeenCalledWith('store-1', 'reading', 160);
    expect(host.saveBill).toHaveBeenCalledTimes(1);
    expect(facade.ocrPending()['store-1']?.ocrValue).toBe(160);
    expect(facade.ocrFeedback()['store-1']?.success).toBe(true);
    expect(facade.meterPhotos()['store-1']?.readingValue).toBe(160);
  });

  it('confirmOcrReading registra correção no OcrFeedbackService, sincroniza valor na foto e limpa pendência', () => {
    facade.meterPhotos.set({ 'store-1': makePhoto({ readingValue: 160 }) });
    facade.registerOcrPending('store-1', {
      success: true,
      reading: 160,
      confidence: 'high',
      provider: 'gemini',
      modelName: 'Gemini 3.8 Flash'
    });

    facade.confirmOcrReading('store-1', 165);

    expect(mockOcrFeedback.record).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        utilityType: 'luz',
        month: '2026-11',
        finalValue: 165
      })
    );
    expect(facade.ocrPending()['store-1']).toBeUndefined();
    expect(facade.meterPhotos()['store-1']?.readingValue).toBe(165);
    expect(host.saveBill).toHaveBeenCalledTimes(1);
  });

  it('executeBatchOcr processa fotos pendentes e interrompe imediatamente se o usuário trocar de mês no meio da fila', async () => {
    tableRows = [
      makeRow({ storeId: 'store-1', luc: 'L-101', hasPhoto: true, isRead: false }),
      makeRow({ storeId: 'store-2', luc: 'L-102', hasPhoto: true, isRead: false })
    ];
    facade.meterPhotos.set({
      'store-1': makePhoto({ storeId: 'store-1', luc: 'L-101' }),
      'store-2': makePhoto({ storeId: 'store-2', luc: 'L-102' })
    });

    mockGemini.extractMeterReading.mockImplementationOnce(async () => {
      // Simula troca de mês durante o primeiro item da fila
      currentMonth = '2026-12';
      return {
        success: true,
        reading: 250,
        confidence: 'high',
        provider: 'qwen',
        modelName: 'Qwen 3.8 27B'
      } as MeterOcrResult;
    });

    await facade.executeBatchOcr(false);

    expect(mockGemini.extractMeterReading).toHaveBeenCalledTimes(1);
    expect(host.updateDetailedReading).not.toHaveBeenCalled();
    expect(host.saveBill).not.toHaveBeenCalled();
    expect(facade.isBatchOcrRunning()).toBe(false);
  });

  it('removePhoto limpa estado local, sinalizadores na leitura, salva fatura e remove do IndexedDB e Supabase', async () => {
    facade.meterPhotos.set({ 'store-1': makePhoto() });
    facade.openPhotoViewer('store-1');
    expect(facade.showPhotoModal()).toBe(true);

    await facade.removePhoto('store-1');

    expect(facade.showPhotoModal()).toBe(false);
    expect(facade.meterPhotos()['store-1']).toBeUndefined();
    expect(host.updateDetailedReading).toHaveBeenCalledWith('store-1', 'hasPhoto', false);
    expect(host.updateDetailedReading).toHaveBeenCalledWith('store-1', 'photoTimestamp', undefined);
    expect(host.saveBill).toHaveBeenCalledTimes(1);
    expect(mockIndexedDb.deleteMeterPhoto).toHaveBeenCalledWith('luz', '2026-11', 'store-1');
    expect(mockSupabase.deleteMeterPhoto).toHaveBeenCalledWith('luz', '2026-11', 'store-1');
  });

  it('onPhotoCaptured comprime, sincroniza foto, executa OCR e protege contra troca de mês durante captura', async () => {
    const fakeFile = new Blob(['img'], { type: 'image/jpeg' }) as unknown as File;
    const fakeInput = { files: [fakeFile], value: 'fake.jpg' } as unknown as HTMLInputElement;
    const event = { target: fakeInput } as unknown as Event;

    await facade.onPhotoCaptured(event, 'store-1', 'Zara Moda', 'L-101', 120);

    expect(mockIndexedDb.compressImage).toHaveBeenCalledTimes(1);
    expect(mockIndexedDb.saveMeterPhoto).toHaveBeenCalled();
    expect(mockSupabase.syncMeterPhoto).toHaveBeenCalled();
    expect(mockGemini.extractWithDualCheck).toHaveBeenCalledWith(
      'data:image/jpeg;base64,ENHANCED',
      'luz',
      expect.anything()
    );
    expect(host.updateDetailedReading).toHaveBeenCalledWith('store-1', 'reading', 155);
    expect(host.saveBill).toHaveBeenCalledTimes(1);
    expect(facade.isCapturingPhoto()).toBeNull();
  });

  it('abre modal de chaves de IA quando não há chave configurada e retoma OCR pendente ao salvar', async () => {
    facade.meterPhotos.set({ 'store-1': makePhoto() });
    mockGemini.hasConfiguredApiKey.mockReturnValue(false);

    await facade.runOcrOnPhoto('store-1');
    expect(facade.showAiKeyModal()).toBe(true);
    expect(facade.pendingOcrStoreId()).toBe('store-1');

    mockGemini.hasConfiguredApiKey.mockReturnValue(true);
    facade.onAiKeysSaved({ groqKey: 'gsk_new_key', geminiKey: '' });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockGemini.saveApiKeys).toHaveBeenCalledWith('gsk_new_key', '');
    expect(facade.showAiKeyModal()).toBe(false);
    expect(mockGemini.extractWithDualCheck).toHaveBeenCalledTimes(1);
  });
});
