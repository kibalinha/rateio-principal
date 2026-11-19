import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BillExportFacade, BillExportSnapshot } from './bill-export.facade';
import { MeterPhotoRecord } from '../models';
import { BillTableRow } from '../components/bill-subcomponents.types';

function makeTableRow(overrides: Partial<BillTableRow> = {}): BillTableRow {
  return {
    storeId: 'store-1',
    luc: 'L-101',
    contrato: '10423',
    storeName: 'Zara Moda',
    routeOrder: 1,
    meterNumber: 'REL-101',
    active: true,
    consumption: 150,
    rawConsumption: 150,
    gasFactor: 1,
    isGasDistributed: false,
    cost: 180.5,
    originalCost: 180.5,
    excludedFromBill: false,
    hiddenFromTech: false,
    prevReading: 1000,
    prevConsumption: 140,
    prevCost: 168,
    prevReadingMonth: '2026-10',
    currentReading: 1150,
    constant: 1,
    adjustment: 1,
    adjustmentAdd: 0,
    fcm: 1,
    fluxoCost: 0,
    variation: 7.14,
    note: 'Leitura conferida; OK',
    hasPhoto: true,
    photoTimestamp: '2026-11-10T10:00:00.000Z',
    isRead: true,
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
      avgConsumption: 140,
      prevConsumption: 140,
      prevReading: 1000,
      currentReading: 1150,
      consumption: 150,
      diffPct: 7.14
    },
    readingDiff: 150,
    ...overrides
  };
}

function makeSnapshot(overrides: Partial<BillExportSnapshot> = {}): BillExportSnapshot {
  return {
    utilityType: 'luz',
    month: '2026-11',
    unitPrice: 1.203333,
    totalBill: 1000,
    totalConsumption: 831.025,
    totalDistributedCost: 180.5,
    totalStoreConsumption: 150,
    airConditioningConsumption: 100,
    airConditioningCost: 120.33,
    commonAreaConsumption: 581.025,
    commonAreaCost: 699.17,
    costItems: [{ id: '1', name: 'Conta CEEE', value: 1000 }],
    consumptionInput: { bss1: 831.025, bss2: 0, bss3: 0, bss4: 0 },
    tableData: [makeTableRow()],
    ...overrides
  };
}

describe('BillExportFacade', () => {
  let facade: BillExportFacade;
  let mockExportService: any;
  let mockIndexedDb: any;

  beforeEach(() => {
    mockExportService = {
      exportCalculatorToExcel: vi.fn(),
      exportCompletePackageZip: vi.fn().mockResolvedValue(undefined)
    };

    mockIndexedDb = {
      getMeterPhotosForMonth: vi.fn().mockResolvedValue({})
    };

    facade = new BillExportFacade();
    facade.setDependenciesForTest({
      exportService: mockExportService,
      indexedDb: mockIndexedDb
    });
  });

  it('formata rótulos de utilidade, unidade e meses corretamente', () => {
    expect(facade.getUnit('luz')).toBe('kWh');
    expect(facade.getUnit('agua')).toBe('m³');
    expect(facade.getUnit('gas')).toBe('m³');

    expect(facade.getUtilityExportLabel('luz')).toBe('Luz');
    expect(facade.getUtilityExportLabel('agua')).toBe('Agua');
    expect(facade.getUtilityExportLabel('gas')).toBe('Gas');

    expect(facade.getUtilityDisplayLabel('luz')).toBe('Energia Elétrica');
    expect(facade.getUtilityDisplayLabel('agua')).toBe('Água & Esgoto');
    expect(facade.getUtilityDisplayLabel('gas')).toBe('Gás GLP');

    expect(facade.formatMonthLabel('2026-11')).toBe('Novembro/2026');
    expect(facade.formatMonthLong('2026-11')).toBe('Novembro de 2026');
  });

  it('exportToExcel delega com opções completas e restaura isExportingExcel mesmo em erro', () => {
    const snap = makeSnapshot();
    const ok = facade.exportToExcel(snap);

    expect(ok).toBe(true);
    expect(facade.isExportingExcel()).toBe(false);
    expect(mockExportService.exportCalculatorToExcel).toHaveBeenCalledWith(
      expect.objectContaining({
        utilityType: 'luz',
        utilityLabel: 'Luz',
        unit: 'kWh',
        month: '2026-11',
        totalBill: 1000
      })
    );

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExportService.exportCalculatorToExcel.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    const failed = facade.exportToExcel(snap);
    expect(failed).toBe(false);
    expect(facade.isExportingExcel()).toBe(false);
    errSpy.mockRestore();
  });

  it('buildCsvContent gera CSV pt-BR com BOM, escape de ponto-e-vírgula e status correto', () => {
    const snap = makeSnapshot({
      tableData: [
        makeTableRow(),
        makeTableRow({
          storeId: 'store-2',
          luc: 'L-102',
          storeName: 'Loja "VIP"',
          excludedFromBill: true,
          cost: 0,
          note: ''
        })
      ]
    });

    const csv = facade.buildCsvContent(snap);
    expect(csv.startsWith('\uFEFFLUC;Contrato;Loja;')).toBe(true);
    expect(csv).toContain('"Leitura conferida; OK"');
    expect(csv).toContain('"Loja ""VIP"""');
    expect(csv).toContain(';Sim;Fora do SAP;');
  });

  it('exportPackageZip mescla fotos em memória com fotos do IndexedDB sem sobrescrever as já carregadas', async () => {
    const memPhoto: MeterPhotoRecord = {
      id: 'agua_2026-11_store-1',
      type: 'agua',
      month: '2026-11',
      storeId: 'store-1',
      storeName: 'Zara Moda',
      luc: 'L-101',
      readingValue: 1150,
      photoDataUrl: 'data:image/jpeg;base64,MEMORY',
      capturedAt: '2026-11-10T10:00:00.000Z'
    };

    const dbPhotoSameStore: MeterPhotoRecord = {
      ...memPhoto,
      photoDataUrl: 'data:image/jpeg;base64,OLD_DB'
    };

    const dbPhotoStore2: MeterPhotoRecord = {
      ...memPhoto,
      id: 'agua_2026-11_store-2',
      storeId: 'store-2',
      luc: 'L-102',
      photoDataUrl: 'data:image/jpeg;base64,DB_STORE_2'
    };

    mockIndexedDb.getMeterPhotosForMonth.mockResolvedValue({
      'store-1': dbPhotoSameStore,
      'store-2': dbPhotoStore2
    });

    const ok = await facade.exportPackageZip(
      makeSnapshot({ utilityType: 'agua' }),
      { 'store-1': memPhoto }
    );

    expect(ok).toBe(true);
    expect(facade.isExportingZip()).toBe(false);
    expect(mockIndexedDb.getMeterPhotosForMonth).toHaveBeenCalledWith('agua', '2026-11');
    expect(mockExportService.exportCompletePackageZip).toHaveBeenCalledWith(
      expect.objectContaining({
        utilityType: 'agua',
        utilityLabel: 'Agua',
        unit: 'm³',
        photos: {
          'store-1': memPhoto,
          'store-2': dbPhotoStore2
        }
      })
    );
  });

  it('exportPackageZip retorna false quando não há lojas na tabela', async () => {
    const ok = await facade.exportPackageZip(makeSnapshot({ tableData: [] }), {});
    expect(ok).toBe(false);
    expect(mockExportService.exportCompletePackageZip).not.toHaveBeenCalled();
  });

  it('openStoreVoucherByStoreId monta StoreVoucherData com foto e controla visibilidade do modal', () => {
    const row = makeTableRow({ storeId: 'store-1', consumption: 25, rawConsumption: 20, gasFactor: 1.25 });
    const photo: MeterPhotoRecord = {
      id: 'gas_2026-11_store-1',
      type: 'gas',
      month: '2026-11',
      storeId: 'store-1',
      storeName: 'Zara Moda',
      luc: 'L-101',
      readingValue: 1150,
      photoDataUrl: 'data:image/jpeg;base64,PHOTO',
      capturedAt: '2026-11-10T10:00:00.000Z'
    };

    const voucher = facade.openStoreVoucherByStoreId('store-1', [row], {
      utilityType: 'gas',
      month: '2026-11',
      unitPrice: 12.5,
      meterPhotos: { 'store-1': photo }
    });

    expect(voucher).not.toBeNull();
    expect(voucher?.utilityLabel).toBe('Gás GLP');
    expect(voucher?.unit).toBe('m³');
    expect(voucher?.monthLabel).toBe('Novembro/2026');
    expect(voucher?.photoDataUrl).toBe('data:image/jpeg;base64,PHOTO');
    expect(voucher?.gasFactor).toBe(1.25);
    expect(facade.showVoucherModal()).toBe(true);
    expect(facade.selectedVoucherData()).toEqual(voucher);

    facade.closeStoreVoucher();
    expect(facade.showVoucherModal()).toBe(false);
  });
});
