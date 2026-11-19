import { Injectable, inject, signal } from '@angular/core';
import { ReportExportService } from './report-export.service';
import { IndexedDbService } from './indexed-db.service';
import {
  CalculatorExcelOptions,
  CostItem,
  MeterPhotoRecord,
  PackageZipOptions,
  StoreVoucherData,
  UtilityType
} from '../models';
import { BillTableRow } from '../components/bill-subcomponents.types';

export interface BillExportSnapshot {
  utilityType: UtilityType;
  month: string;
  unitPrice: number;
  totalBill: number;
  totalConsumption: number;
  totalDistributedCost: number;
  totalStoreConsumption: number;
  airConditioningConsumption: number;
  airConditioningCost: number;
  commonAreaConsumption: number;
  commonAreaCost: number;
  costItems: CostItem[];
  consumptionInput: any;
  tableData: BillTableRow[];
}

export interface StoreVoucherContext {
  utilityType: UtilityType;
  month: string;
  unitPrice: number;
  meterPhotos: Record<string, MeterPhotoRecord>;
}

export interface BillExportDependencies {
  exportService?: ReportExportService;
  indexedDb?: IndexedDbService;
}

const MONTH_NAMES_PT_BR = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
] as const;

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Facade responsável pela exportação da calculadora (Excel, CSV, Pacote ZIP com fotos + manifesto)
 * e geração/estado do Espelho/Voucher Individual do Lojista.
 */
@Injectable({
  providedIn: 'root'
})
export class BillExportFacade {
  private exportService: ReportExportService = {} as ReportExportService;
  private indexedDb: IndexedDbService = {} as IndexedDbService;

  // --- EXPORT STATE ---
  readonly isExportingExcel = signal<boolean>(false);
  readonly isExportingZip = signal<boolean>(false);

  // --- STORE VOUCHER / ESPELHO DO LOJISTA STATE ---
  readonly showVoucherModal = signal<boolean>(false);
  readonly selectedVoucherData = signal<StoreVoucherData | null>(null);

  constructor() {
    try {
      this.exportService = inject(ReportExportService);
      this.indexedDb = inject(IndexedDbService);
    } catch {
      // Executando fora do contexto de injeção Angular (ex.: testes unitários isolados)
    }
  }

  /** Permite injetar mocks em testes unitários isolados sem Angular TestBed. */
  setDependenciesForTest(deps: BillExportDependencies): void {
    if (deps.exportService) this.exportService = deps.exportService;
    if (deps.indexedDb) this.indexedDb = deps.indexedDb;
  }

  getUnit(type: UtilityType): 'kWh' | 'm³' {
    switch (type) {
      case 'luz':
        return 'kWh';
      case 'agua':
        return 'm³';
      case 'gas':
        return 'm³';
    }
  }

  getUtilityExportLabel(type: UtilityType): 'Luz' | 'Agua' | 'Gas' {
    return type === 'luz' ? 'Luz' : type === 'agua' ? 'Agua' : 'Gas';
  }

  getUtilityDisplayLabel(type: UtilityType): 'Energia Elétrica' | 'Água & Esgoto' | 'Gás GLP' {
    switch (type) {
      case 'luz':
        return 'Energia Elétrica';
      case 'agua':
        return 'Água & Esgoto';
      case 'gas':
        return 'Gás GLP';
    }
  }

  formatMonthLabel(month: string): string {
    if (!month) return '';
    const [year, monthStr] = month.split('-');
    const idx = parseInt(monthStr, 10) - 1;
    return `${MONTH_NAMES_PT_BR[idx] || monthStr}/${year}`;
  }

  formatMonthLong(month: string): string {
    if (!month || !month.includes('-')) return month;
    const [yearStr, monthStr] = month.split('-');
    const idx = parseInt(monthStr, 10) - 1;
    const name = MONTH_NAMES_PT_BR[idx] || monthStr;
    return `${name} de ${yearStr}`;
  }

  buildExcelOptions(snapshot: BillExportSnapshot): CalculatorExcelOptions {
    return {
      utilityType: snapshot.utilityType,
      utilityLabel: this.getUtilityExportLabel(snapshot.utilityType),
      unit: this.getUnit(snapshot.utilityType),
      month: snapshot.month,
      unitPrice: snapshot.unitPrice,
      totalBill: snapshot.totalBill,
      totalConsumption: snapshot.totalConsumption,
      totalDistributedCost: snapshot.totalDistributedCost,
      totalStoreConsumption: snapshot.totalStoreConsumption,
      airConditioningConsumption: snapshot.airConditioningConsumption,
      airConditioningCost: snapshot.airConditioningCost,
      commonAreaConsumption: snapshot.commonAreaConsumption,
      commonAreaCost: snapshot.commonAreaCost,
      costItems: snapshot.costItems,
      consumptionInput: snapshot.consumptionInput,
      tableData: snapshot.tableData
    };
  }

  /** Exporta o demonstrativo completo de rateio em planilha Excel (.xlsx). */
  exportToExcel(snapshot: BillExportSnapshot): boolean {
    this.isExportingExcel.set(true);
    try {
      const options = this.buildExcelOptions(snapshot);
      this.exportService.exportCalculatorToExcel(options);
      return true;
    } catch (err) {
      console.error('Erro ao exportar rateio para Excel:', err);
      return false;
    } finally {
      this.isExportingExcel.set(false);
    }
  }

  /** Gera o conteúdo CSV (separado por ponto-e-vírgula pt-BR) do rateio mensal. */
  buildCsvContent(snapshot: BillExportSnapshot): string {
    const unit = this.getUnit(snapshot.utilityType);
    const headers = [
      'LUC',
      'Contrato',
      'Loja',
      'Leitura Anterior',
      'Leitura Atual',
      `Consumo (${unit})`,
      'Tarifa Unitária (R$)',
      'Valor a Pagar (R$)',
      'Fora do SAP',
      'Status',
      'Observação'
    ];

    const lines: string[] = [headers.map(escapeCsvCell).join(';')];

    for (const row of snapshot.tableData) {
      const status = row.excludedFromBill
        ? 'Fora do SAP'
        : row.isJustified
          ? `Justificada (${row.justificationReason || 'Sem consumo'})`
          : row.isRead
            ? 'Concluída'
            : 'Pendente';

      lines.push(
        [
          row.luc,
          row.contrato || '',
          row.storeName,
          row.prevReading ?? 0,
          row.currentReading ?? 0,
          Number((row.consumption || 0).toFixed(4)),
          Number((snapshot.unitPrice || 0).toFixed(6)),
          Number((row.cost || 0).toFixed(2)),
          row.excludedFromBill ? 'Sim' : 'Não',
          status,
          row.note || ''
        ].map(escapeCsvCell).join(';')
      );
    }

    return '\uFEFF' + lines.join('\r\n');
  }

  /** Exporta o rateio mensal como arquivo CSV compatível com Excel pt-BR. */
  exportToCsv(snapshot: BillExportSnapshot): boolean {
    if (snapshot.tableData.length === 0 || typeof document === 'undefined' || typeof Blob === 'undefined') {
      return false;
    }
    try {
      const csv = this.buildCsvContent(snapshot);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rateio_${this.getUtilityExportLabel(snapshot.utilityType)}_${snapshot.month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      console.error('Erro ao exportar rateio para CSV:', err);
      return false;
    }
  }

  /**
   * Exporta o pacote completo ZIP (Planilha Excel + Fotos dos Medidores + Manifesto Contábil),
   * mesclando fotos já em memória com eventuais fotos locais no IndexedDB para o mesmo `(utilityType, month)`.
   */
  async exportPackageZip(
    snapshot: BillExportSnapshot,
    currentPhotos: Record<string, MeterPhotoRecord>
  ): Promise<boolean> {
    if (this.isExportingZip() || snapshot.tableData.length === 0) return false;
    this.isExportingZip.set(true);

    try {
      const photosMap: Record<string, MeterPhotoRecord> = { ...currentPhotos };
      try {
        const localDbPhotos = await this.indexedDb.getMeterPhotosForMonth(snapshot.utilityType, snapshot.month);
        if (localDbPhotos) {
          Object.entries(localDbPhotos).forEach(([storeId, p]) => {
            if (!photosMap[storeId] && p?.photoDataUrl) {
              photosMap[storeId] = p;
            }
          });
        }
      } catch (e) {
        console.warn('Erro ao consultar fotos do IndexedDB para compor pacote ZIP:', e);
      }

      const zipOptions: PackageZipOptions = {
        ...this.buildExcelOptions(snapshot),
        photos: photosMap
      };

      await this.exportService.exportCompletePackageZip(zipOptions);
      return true;
    } catch (err) {
      console.error('Erro ao gerar pacote ZIP de rateio:', err);
      if (typeof alert === 'function') {
        alert('Houve um erro ao gerar o pacote ZIP de auditoria. Verifique o console.');
      }
      return false;
    } finally {
      this.isExportingZip.set(false);
    }
  }

  // --- STORE VOUCHER / ESPELHO DO LOJISTA ---

  buildStoreVoucherData(item: BillTableRow, context: StoreVoucherContext): StoreVoucherData {
    const photo = context.meterPhotos[item.storeId];
    return {
      storeName: item.storeName,
      luc: item.luc,
      contrato: item.contrato,
      utilityType: context.utilityType,
      utilityLabel: this.getUtilityDisplayLabel(context.utilityType),
      unit: this.getUnit(context.utilityType),
      month: context.month,
      monthLabel: this.formatMonthLabel(context.month),
      prevReading: item.prevReading || 0,
      prevConsumption: item.prevConsumption || 0,
      prevCost: item.prevCost || 0,
      currentReading: item.currentReading || 0,
      readingDiff: item.readingDiff !== undefined ? item.readingDiff : ((item.currentReading || 0) - (item.prevReading || 0)),
      constant: item.constant || 1,
      adjustment: item.adjustment || 1,
      adjustmentAdd: item.adjustmentAdd,
      fluxoCost: item.fluxoCost,
      consumption: item.consumption || 0,
      rawConsumption: item.rawConsumption,
      gasFactor: item.gasFactor,
      unitPrice: context.unitPrice || 0,
      totalCost: item.cost || 0,
      originalCost: item.originalCost,
      excludedFromBill: item.excludedFromBill,
      variationPct: item.variation,
      note: item.note,
      photoDataUrl: photo?.photoDataUrl,
      photoCapturedAt: photo?.capturedAt || item.photoTimestamp,
      issueDate: new Date().toLocaleString('pt-BR')
    };
  }

  openStoreVoucher(item: BillTableRow | null | undefined, context: StoreVoucherContext): StoreVoucherData | null {
    if (!item) return null;
    const data = this.buildStoreVoucherData(item, context);
    this.selectedVoucherData.set(data);
    this.showVoucherModal.set(true);
    return data;
  }

  openStoreVoucherByStoreId(
    storeId: string | null | undefined,
    tableData: BillTableRow[],
    context: StoreVoucherContext
  ): StoreVoucherData | null {
    if (!storeId) return null;
    const item = tableData.find(s => s.storeId === storeId);
    if (!item) return null;
    return this.openStoreVoucher(item, context);
  }

  closeStoreVoucher(): void {
    this.showVoucherModal.set(false);
  }
}
