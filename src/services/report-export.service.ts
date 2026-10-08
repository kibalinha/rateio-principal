import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { Store } from './store.service';
import { MonthlyChartItem } from '../components/store-report.component';

export interface StoreVoucherData {
  storeName: string;
  luc: string;
  contrato?: string;
  utilityType: 'luz' | 'agua' | 'gas';
  utilityLabel: string;
  unit: string;
  month: string;
  monthLabel: string;
  prevReading: number;
  currentReading: number;
  readingDiff: number;
  constant: number;
  adjustment: number;
  consumption: number;
  rawConsumption?: number;
  gasFactor?: number;
  unitPrice: number;
  totalCost: number;
  variationPct?: number;
  note?: string;
  photoDataUrl?: string;
  photoCapturedAt?: string;
  issueDate?: string;
}

export interface CalculatorExcelOptions {
  utilityType: 'luz' | 'agua' | 'gas';
  utilityLabel: string;
  unit: string;
  month: string;
  unitPrice: number;
  totalBill: number;
  totalConsumption: number;
  totalDistributedCost: number;
  totalStoreConsumption: number;
  costItems: { id: string; name: string; value: number }[];
  consumptionInput: any;
  tableData: any[];
}

export interface PackageZipOptions extends CalculatorExcelOptions {
  photos?: Record<string, {
    photoDataUrl?: string;
    luc?: string;
    storeName?: string;
    capturedAt?: string;
    readingValue?: number;
    note?: string;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class ReportExportService {

  // --- EXCEL EXPORT (.XLSX) ---
  exportToExcel(
    store: Store,
    utilityLabel: string,
    unit: string,
    startPeriod: string,
    endPeriod: string,
    chartData: MonthlyChartItem[],
    metrics: { totalConsumption: number; totalCost: number; avgConsumption: number; avgCost: number },
    diagnostic: any
  ) {
    const wb = XLSX.utils.book_new();

    // 1. Data rows for Monthly Details
    const detailsRows = chartData.map(item => ({
      'Mês': item.monthLabel,
      [`Consumo (${unit})`]: Number(item.consumption.toFixed(2)),
      'Desvio da Média (%)': Number(item.diffFromAvgPct.toFixed(1)),
      'Variação MoM (%)': item.momDiffPct !== null ? Number(item.momDiffPct.toFixed(1)) : '—',
      'Preço Unitário (R$)': Number(item.unitPrice.toFixed(4)),
      'Valor Faturado (R$)': Number(item.cost.toFixed(2)),
      'Diagnóstico': item.alertLevel === 'critical' 
        ? 'Salto Crítico' 
        : item.alertLevel === 'warning' 
          ? 'Acima da Média' 
          : item.alertLevel === 'drop' 
            ? 'Queda Atípica' 
            : 'Padrão Normal',
      '% Fatura Geral': Number(item.pctBill.toFixed(1))
    }));

    // Add totals row at bottom
    detailsRows.push({
      'Mês': 'TOTAL ACUMULADO',
      [`Consumo (${unit})`]: Number(metrics.totalConsumption.toFixed(2)),
      'Desvio da Média (%)': 0,
      'Variação MoM (%)': '—',
      'Preço Unitário (R$)': metrics.totalConsumption > 0 ? Number((metrics.totalCost / metrics.totalConsumption).toFixed(4)) : 0,
      'Valor Faturado (R$)': Number(metrics.totalCost.toFixed(2)),
      'Diagnóstico': '—',
      '% Fatura Geral': 0
    });

    const wsDetails = XLSX.utils.json_to_sheet(detailsRows);

    // 2. Summary & KPIs Sheet
    const summaryRows = [
      { 'Propriedade': 'Loja', 'Valor': store.name },
      { 'Propriedade': 'Código LUC', 'Valor': store.luc },
      { 'Propriedade': 'Número do Contrato', 'Valor': store.contrato || 'Não informado' },
      { 'Propriedade': 'Status da Loja', 'Valor': store.active === false ? 'Inativa' : 'Ativa' },
      { 'Propriedade': 'Insumo / Utilidade', 'Valor': utilityLabel },
      { 'Propriedade': 'Período Inicial', 'Valor': startPeriod },
      { 'Propriedade': 'Período Final', 'Valor': endPeriod },
      { 'Propriedade': `Consumo Total Acumulado (${unit})`, 'Valor': metrics.totalConsumption.toFixed(2) },
      { 'Propriedade': `Média Mensal de Consumo (${unit})`, 'Valor': metrics.avgConsumption.toFixed(2) },
      { 'Propriedade': 'Valor Total Faturado (R$)', 'Valor': metrics.totalCost.toFixed(2) },
      { 'Propriedade': 'Gasto Médio Mensal (R$)', 'Valor': metrics.avgCost.toFixed(2) },
      { 'Propriedade': 'Status do Diagnóstico', 'Valor': diagnostic?.title || 'Normal' },
      { 'Propriedade': 'Recomendação Operacional', 'Valor': diagnostic?.recommendation || 'Em conformidade' },
      { 'Propriedade': 'Data de Geração', 'Valor': new Date().toLocaleString('pt-BR') }
    ];

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

    // Append sheets to workbook
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo do Lojista');
    XLSX.utils.book_append_sheet(wb, wsDetails, 'Detalhamento Mensal');

    // Generate clean file name
    const safeStore = store.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Relatorio_${safeStore}_${utilityLabel}_${startPeriod}_a_${endPeriod}.xlsx`;

    XLSX.writeFile(wb, fileName);
  }

  // --- CALCULATOR EXCEL EXPORT (RATEIO MENSAL COMPLETO) ---
  buildCalculatorWorkbook(options: CalculatorExcelOptions): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    // 1. Sheet "Rateio_Lojas"
    const storesRows = options.tableData.map(row => {
      const diff = (row.currentReading || 0) - (row.prevReading || 0);
      const item: Record<string, any> = {
        'LUC': row.luc,
        'Contrato': row.contrato || '—',
        'Nome da Loja': row.storeName,
        'Leitura Anterior': row.prevReading || 0,
        'Leitura Atual': row.currentReading || 0,
        'Diferença': diff > 0 ? diff : 0,
      };

      if (options.utilityType === 'luz') {
        item['Constante'] = row.constant || 1;
        item['Ajuste'] = row.adjustment !== undefined ? row.adjustment : 1;
      } else if (options.utilityType === 'gas') {
        item['Ajuste Adic.'] = row.adjustmentAdd || 0;
        item['FCM'] = row.fcm || 1;
        if (row.rawConsumption !== undefined && Math.abs((row.gasFactor || 1) - 1) > 0.0001) {
          item['Medição Campo (m³)'] = Number((row.rawConsumption || 0).toFixed(4));
          item['Fator Rateio (x)'] = Number((row.gasFactor || 1).toFixed(4));
        }
      }

      if (row.virtual > 0) {
        item['Consumo Virtual'] = row.virtual;
      }

      item[`Consumo Calculado (${options.unit})`] = Number((row.consumption || 0).toFixed(4));
      item['Variação vs Mês Anterior (%)'] = row.variation ? Number(row.variation.toFixed(1)) : 0;
      item['Preço Unitário (R$)'] = Number(options.unitPrice.toFixed(4));

      if (options.utilityType === 'gas' && row.fluxoCost) {
        item['Custo Fluxo (R$)'] = Number(row.fluxoCost.toFixed(2));
      }

      item['Valor a Pagar (R$)'] = Number((row.cost || 0).toFixed(2));
      item['% no Rateio'] = options.totalDistributedCost > 0 
        ? Number(((row.cost / options.totalDistributedCost) * 100).toFixed(2)) 
        : 0;
      item['Status da Leitura'] = (row.currentReading || 0) > 0 ? 'Concluída' : 'Pendente';
      item['Observação de Campo'] = row.note || '';

      return item;
    });

    // Totals Row
    const totalsRow: Record<string, any> = {
      'LUC': 'TOTAL',
      'Contrato': '—',
      'Nome da Loja': `${options.tableData.length} Lojas Rateadas`,
      'Leitura Anterior': '',
      'Leitura Atual': '',
      'Diferença': '',
    };
    if (options.utilityType === 'luz') {
      totalsRow['Constante'] = '';
      totalsRow['Ajuste'] = '';
    } else if (options.utilityType === 'gas') {
      totalsRow['Ajuste Adic.'] = '';
      totalsRow['FCM'] = '';
      if (options.tableData.some(r => r.rawConsumption !== undefined && Math.abs((r.gasFactor || 1) - 1) > 0.0001)) {
        totalsRow['Medição Campo (m³)'] = Number(options.tableData.reduce((acc, r) => acc + (r.rawConsumption !== undefined ? r.rawConsumption : (r.consumption || 0)), 0).toFixed(4));
        totalsRow['Fator Rateio (x)'] = '—';
      }
    }
    totalsRow[`Consumo Calculado (${options.unit})`] = Number(options.totalStoreConsumption.toFixed(4));
    totalsRow['Variação vs Mês Anterior (%)'] = '';
    totalsRow['Preço Unitário (R$)'] = Number(options.unitPrice.toFixed(4));
    if (options.utilityType === 'gas') {
      totalsRow['Custo Fluxo (R$)'] = '';
    }
    totalsRow['Valor a Pagar (R$)'] = Number(options.totalDistributedCost.toFixed(2));
    totalsRow['% no Rateio'] = 100;
    totalsRow['Status da Leitura'] = '—';
    totalsRow['Observação de Campo'] = '';

    storesRows.push(totalsRow);

    const wsStores = XLSX.utils.json_to_sheet(storesRows);
    wsStores['!cols'] = [
      { wch: 12 }, // LUC
      { wch: 14 }, // Contrato
      { wch: 30 }, // Nome Loja
      { wch: 16 }, // Leitura Ant
      { wch: 16 }, // Leitura Atual
      { wch: 14 }, // Diferença
      { wch: 12 }, // Constante
      { wch: 12 }, // Ajuste
      { wch: 18 }, // Consumo
      { wch: 16 }, // Variação %
      { wch: 16 }, // Preço Unit
      { wch: 18 }, // Valor a Pagar
      { wch: 12 }, // % Rateio
      { wch: 16 }, // Status
      { wch: 25 }, // Observação
    ];

    // 2. Sheet "Fatura_Concessionaria"
    const summaryRows = [
      { 'Parâmetro da Fatura': 'Mês de Referência', 'Valor': options.month },
      { 'Parâmetro da Fatura': 'Tipo de Utilidade', 'Valor': options.utilityLabel },
      { 'Parâmetro da Fatura': `Consumo da Concessionária (${options.unit})`, 'Valor': options.totalConsumption },
      { 'Parâmetro da Fatura': 'Valor Total da Fatura (R$)', 'Valor': Number(options.totalBill.toFixed(2)) },
      { 'Parâmetro da Fatura': 'Preço Unitário Calculado (R$)', 'Valor': Number(options.unitPrice.toFixed(4)) },
      { 'Parâmetro da Fatura': `Consumo Total Rateado Lojas (${options.unit})`, 'Valor': Number(options.totalStoreConsumption.toFixed(4)) },
      { 'Parâmetro da Fatura': 'Valor Total Rateado Lojas (R$)', 'Valor': Number(options.totalDistributedCost.toFixed(2)) },
      { 'Parâmetro da Fatura': 'Diferença de Rateio (R$)', 'Valor': Number((options.totalBill - options.totalDistributedCost).toFixed(2)) },
      { 'Parâmetro da Fatura': 'Data de Exportação', 'Valor': new Date().toLocaleString('pt-BR') }
    ];

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

    // 3. Sheet "Composicao_Custos"
    const costRows = options.costItems.map(item => ({
      'Item de Despesa': item.name,
      'Valor (R$)': Number(item.value.toFixed(2)),
      '% da Fatura': options.totalBill > 0 ? Number(((item.value / options.totalBill) * 100).toFixed(1)) : 0
    }));
    costRows.push({
      'Item de Despesa': 'TOTAL DA FATURA',
      'Valor (R$)': Number(options.totalBill.toFixed(2)),
      '% da Fatura': 100
    });

    const wsCosts = XLSX.utils.json_to_sheet(costRows);

    XLSX.utils.book_append_sheet(wb, wsStores, 'Rateio das Lojas');
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Concessionária');
    XLSX.utils.book_append_sheet(wb, wsCosts, 'Itens da Fatura');

    return wb;
  }

  exportCalculatorToExcel(options: CalculatorExcelOptions) {
    const wb = this.buildCalculatorWorkbook(options);
    const fileName = `Rateio_${options.utilityLabel}_${options.month}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  // --- COMPLETE ZIP PACKAGE EXPORT (PLANILHA + FOTOS + MANIFESTO) ---
  async exportCompletePackageZip(options: PackageZipOptions): Promise<{ totalPhotos: number; fileName: string }> {
    const zip = new JSZip();

    // 1. Gera Planilha Excel e anexa ao ZIP
    const wb = this.buildCalculatorWorkbook(options);
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const excelName = `Planilha_Rateio_${options.utilityLabel}_${options.month}.xlsx`;
    zip.file(excelName, excelBuffer);

    // 2. Pasta com Fotos dos Medidores
    const photosFolderName = `Fotos_Medidores_${options.utilityLabel}_${options.month}`;
    const photosFolder = zip.folder(photosFolderName);
    let attachedPhotosCount = 0;

    const photosRecord = options.photos || {};
    const photoEntries = Object.entries(photosRecord);

    for (const [_, photo] of photoEntries) {
      if (!photo || !photo.photoDataUrl) continue;

      const safeLuc = (photo.luc || 'SEM_LUC').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeStoreName = (photo.storeName || 'Loja').replace(/[^a-zA-Z0-9_-]/g, '_');
      const datePart = photo.capturedAt ? photo.capturedAt.split('T')[0] : options.month;
      const photoFileName = `${safeLuc}_${safeStoreName}_${datePart}.jpg`;

      try {
        if (photo.photoDataUrl.startsWith('data:image/')) {
          const commaIdx = photo.photoDataUrl.indexOf(',');
          if (commaIdx !== -1) {
            const base64Data = photo.photoDataUrl.substring(commaIdx + 1);
            photosFolder?.file(photoFileName, base64Data, { base64: true });
            attachedPhotosCount++;
          }
        } else if (photo.photoDataUrl.startsWith('http://') || photo.photoDataUrl.startsWith('https://')) {
          const resp = await fetch(photo.photoDataUrl);
          if (resp.ok) {
            const buffer = await resp.arrayBuffer();
            photosFolder?.file(photoFileName, buffer);
            attachedPhotosCount++;
          }
        }
      } catch (err) {
        console.warn(`[ZIP Export] Não foi possível incluir foto da loja ${photo.storeName}:`, err);
      }
    }

    // 3. Manifesto / Resumo de Auditoria em Texto (.txt)
    const issueDate = new Date().toLocaleString('pt-BR');
    const storesAuditList = options.tableData.map(s => {
      const luc = (s.luc || '').padEnd(10);
      const name = (s.storeName || '').substring(0, 28).padEnd(30);
      const reading = (s.currentReading || 0).toString().padStart(10);
      const consumption = (s.consumption || 0).toFixed(2).padStart(12);
      const cost = `R$ ${(s.cost || 0).toFixed(2)}`.padStart(14);
      const hasPhoto = photosRecord[s.storeId]?.photoDataUrl ? 'SIM (Foto anexa)' : 'NÃO';
      return `${luc} | ${name} | ${reading} | ${consumption} | ${cost} | ${hasPhoto}`;
    }).join('\n');

    const costsSummary = options.costItems.map(c => {
      return ` - ${c.name.padEnd(35)}: R$ ${c.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }).join('\n');

    const manifestText = 
`================================================================================
                    PACOTE DE AUDITORIA E FECHAMENTO DE RATEIO
================================================================================
Shopping / Empreendimento : Rateio Principal
Insumo / Utilidade        : ${options.utilityLabel} (${options.unit})
Mês de Competência        : ${options.month}
Data e Hora de Geração    : ${issueDate}

1. RESUMO GERAL DA FATURA DA CONCESSIONÁRIA:
--------------------------------------------------------------------------------
Valor Total da Fatura     : R$ ${options.totalBill.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Consumo Faturado (Total)  : ${options.totalConsumption.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${options.unit}
Tarifa Unitária Rateada   : R$ ${options.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} / ${options.unit}
Consumo Total das Lojas   : ${options.totalStoreConsumption.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${options.unit}
Valor Total Rateado Lojas : R$ ${options.totalDistributedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Diferença Residual        : R$ ${(options.totalBill - options.totalDistributedCost).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

2. DISCRIMINAÇÃO DOS ITENS DE CUSTO DA CONCESSIONÁRIA:
--------------------------------------------------------------------------------
${costsSummary}

3. CONFERÊNCIA DE LOJAS & AUDITORIA FOTOGRÁFICA (${options.tableData.length} LOJAS):
--------------------------------------------------------------------------------
Total de Lojas Rateadas   : ${options.tableData.length}
Total de Fotos Anexadas   : ${attachedPhotosCount}
Pasta de Armazenamento    : ${photosFolderName}/

LUC        | Nome da Loja                   | Leitura    | Consumo (${options.unit}) | Valor Total    | Foto Auditada
--------------------------------------------------------------------------------
${storesAuditList}
--------------------------------------------------------------------------------
Total Geral Distribuído: R$ ${options.totalDistributedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

================================================================================
Pacote gerado eletronicamente para arquivamento financeiro, contábil e auditoria.
Todas as fotos foram conferidas pelo leiturista e processadas via OCR/inspeção visual.
================================================================================
`;

    zip.file('Resumo_Auditoria_Rateio.txt', manifestText);

    // 4. Compacta tudo e gera o Blob final
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const zipFileName = `Pacote_Rateio_${options.utilityLabel}_${options.month}.zip`;
    const downloadUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = zipFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    return { totalPhotos: attachedPhotosCount, fileName: zipFileName };
  }

  // --- PDF EXPORT (.PDF) ---
  async exportToPdf(
    store: Store,
    utilityLabel: string,
    unit: string,
    startPeriod: string,
    endPeriod: string,
    chartData: MonthlyChartItem[],
    metrics: { totalConsumption: number; totalCost: number; avgConsumption: number; avgCost: number },
    diagnostic: any,
    consumptionSvgEl?: SVGElement,
    costSvgEl?: SVGElement
  ): Promise<void> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    // Header Background Accent Bar
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 24, 'F');

    // Title & Brand
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('RELATÓRIO INDIVIDUAL DE CONSUMO E RATEIO', margin, 11);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Shopping Center — Gestão & Auditoria de Utilidades', margin, 17);

    // Generation timestamp
    const nowStr = new Date().toLocaleString('pt-BR');
    doc.setFontSize(7.5);
    doc.text(`Emissão: ${nowStr}`, pageWidth - margin, 17, { align: 'right' });

    y = 30;

    // 1. Store Details Card
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(margin, y, pageWidth - (margin * 2), 24, 2, 2, 'FD');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(store.name, margin + 4, y + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`LUC: ${store.luc}`, margin + 4, y + 14);
    doc.text(`Contrato: ${store.contrato || 'N/A'}`, margin + 35, y + 14);
    doc.text(`Status: ${store.active === false ? 'Inativa' : 'Ativa'}`, margin + 75, y + 14);

    doc.text(`Insumo: ${utilityLabel}`, margin + 4, y + 20);
    doc.text(`Período: ${startPeriod} a ${endPeriod}`, margin + 35, y + 20);

    y += 28;

    // 2. Metrics Summary (4 Box Columns)
    const boxWidth = (pageWidth - (margin * 2) - 9) / 4;
    const boxHeight = 16;

    // Box 1: Total Consumption
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, boxWidth, boxHeight, 1.5, 1.5, 'FD');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('CONSUMO TOTAL', margin + 3, y + 4.5);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${metrics.totalConsumption.toFixed(1)} ${unit}`, margin + 3, y + 11.5);

    // Box 2: Average Consumption
    const b2x = margin + boxWidth + 3;
    doc.roundedRect(b2x, y, boxWidth, boxHeight, 1.5, 1.5, 'FD');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('MÉDIA HISTÓRICA', b2x + 3, y + 4.5);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${metrics.avgConsumption.toFixed(1)} ${unit}`, b2x + 3, y + 11.5);

    // Box 3: Total Cost
    const b3x = b2x + boxWidth + 3;
    doc.roundedRect(b3x, y, boxWidth, boxHeight, 1.5, 1.5, 'FD');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('VALOR TOTAL (R$)', b3x + 3, y + 4.5);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129); // emerald
    doc.text(`R$ ${metrics.totalCost.toFixed(2)}`, b3x + 3, y + 11.5);

    // Box 4: Average Monthly Cost
    const b4x = b3x + boxWidth + 3;
    doc.roundedRect(b4x, y, boxWidth, boxHeight, 1.5, 1.5, 'FD');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('MÉDIA MENSAL (R$)', b4x + 3, y + 4.5);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`R$ ${metrics.avgCost.toFixed(2)}`, b4x + 3, y + 11.5);

    y += boxHeight + 4;

    // 3. Diagnostic & Alerts Banner
    if (diagnostic) {
      if (diagnostic.hasAlert) {
        doc.setFillColor(255, 241, 242); // rose-50
        doc.setDrawColor(254, 205, 211); // rose-200
        doc.roundedRect(margin, y, pageWidth - (margin * 2), 16, 1.5, 1.5, 'FD');
        
        doc.setTextColor(190, 18, 60); // rose-700
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.text(`DIAGNÓSTICO: ${diagnostic.title}`, margin + 4, y + 5.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(136, 19, 55);
        const recLines = doc.splitTextToSize(`Recomendação: ${diagnostic.recommendation}`, pageWidth - (margin * 2) - 8);
        doc.text(recLines, margin + 4, y + 10.5);
        y += 19;
      } else {
        doc.setFillColor(240, 253, 244); // emerald-50
        doc.setDrawColor(187, 247, 208); // emerald-200
        doc.roundedRect(margin, y, pageWidth - (margin * 2), 10, 1.5, 1.5, 'FD');

        doc.setTextColor(21, 128, 61); // emerald-700
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('DIAGNÓSTICO: Consumo estável e dentro da média histórica.', margin + 4, y + 6);
        y += 13;
      }
    }

    // 4. Embedded Charts (Rendered from SVG to PNG)
    if (consumptionSvgEl) {
      try {
        const consumptionImg = await this.svgToPngDataUrl(consumptionSvgEl);
        if (consumptionImg) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 41, 59);
          doc.text(`Gráfico de Consumo (${unit})`, margin, y);
          y += 3;

          const chartW = (pageWidth - (margin * 2));
          const chartH = 46;
          doc.addImage(consumptionImg, 'PNG', margin, y, chartW, chartH);
          y += chartH + 5;
        }
      } catch (err) {
        console.warn('Could not render consumption chart to PDF', err);
      }
    }

    // 5. Monthly Details Table
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Detalhamento Mensal de Consumo e Faturamento', margin, y);
    y += 4;

    // Table Header
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y, pageWidth - (margin * 2), 6, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);

    const colX = [
      margin + 2,                // Mês
      margin + 34,               // Consumo
      margin + 62,               // Desvio Média
      margin + 90,               // Variação MoM
      margin + 118,              // Preço Unit
      margin + 144,              // Valor Pago
      pageWidth - margin - 2     // % Fatura (right aligned)
    ];

    doc.text('Mês', colX[0], y + 4.2);
    doc.text(`Consumo (${unit})`, colX[1], y + 4.2);
    doc.text('Desvio Média', colX[2], y + 4.2);
    doc.text('Var. MoM', colX[3], y + 4.2);
    doc.text('Preço Unit.', colX[4], y + 4.2);
    doc.text('Valor Pago (R$)', colX[5], y + 4.2);
    doc.text('% Fatura', colX[6], y + 4.2, { align: 'right' });

    y += 6.5;

    // Table Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    for (let i = 0; i < chartData.length; i++) {
      // Check for page break
      if (y > 275) {
        doc.addPage();
        y = 15;
      }

      const item = chartData[i];

      // Subtle row shading for alert
      if (item.alertLevel === 'critical') {
        doc.setFillColor(255, 241, 242);
        doc.rect(margin, y - 0.5, pageWidth - (margin * 2), 5.5, 'F');
      } else if (item.alertLevel === 'warning') {
        doc.setFillColor(254, 243, 199);
        doc.rect(margin, y - 0.5, pageWidth - (margin * 2), 5.5, 'F');
      } else if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 0.5, pageWidth - (margin * 2), 5.5, 'F');
      }

      doc.setTextColor(30, 41, 59);
      doc.text(item.monthLabel, colX[0], y + 3.5);
      doc.text(item.consumption.toFixed(1), colX[1], y + 3.5);

      // Desvio vs media
      const diffSign = item.diffFromAvgPct >= 0 ? '+' : '';
      doc.text(`${diffSign}${item.diffFromAvgPct.toFixed(0)}%`, colX[2], y + 3.5);

      // MoM
      const momText = item.momDiffPct !== null ? `${item.momDiffPct >= 0 ? '+' : ''}${item.momDiffPct.toFixed(0)}%` : '—';
      doc.text(momText, colX[3], y + 3.5);

      // Preço Unit
      doc.text(`R$ ${item.unitPrice.toFixed(4)}`, colX[4], y + 3.5);

      // Valor Pago
      doc.text(`R$ ${item.cost.toFixed(2)}`, colX[5], y + 3.5);

      // % Fatura
      doc.text(`${item.pctBill.toFixed(1)}%`, colX[6], y + 3.5, { align: 'right' });

      y += 5.5;
    }

    // Totals row at table bottom
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, pageWidth - (margin * 2), 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('TOTAL / MÉDIA', colX[0], y + 4.2);
    doc.text(metrics.totalConsumption.toFixed(1), colX[1], y + 4.2);
    doc.text('—', colX[2], y + 4.2);
    doc.text('—', colX[3], y + 4.2);
    doc.text('—', colX[4], y + 4.2);
    doc.text(`R$ ${metrics.totalCost.toFixed(2)}`, colX[5], y + 4.2);
    doc.text('100%', colX[6], y + 4.2, { align: 'right' });

    y += 12;

    // Footer note
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Este documento foi gerado pelo Sistema de Gestão e Rateio de Utilidades para prestação de contas com o lojista.', margin, 287);

    // Save File
    const safeStore = store.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Relatorio_${safeStore}_${utilityLabel}_${startPeriod}_a_${endPeriod}.pdf`;
    doc.save(fileName);
  }

  // Convert D3 SVG element to PNG Data URL using native canvas
  private svgToPngDataUrl(svgElement: SVGElement): Promise<string> {
    return new Promise((resolve) => {
      try {
        const svgString = new XMLSerializer().serializeToString(svgElement);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const blobURL = URL.createObjectURL(svgBlob);
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement('canvas');
          const width = svgElement.clientWidth || 600;
          const height = svgElement.clientHeight || 300;
          canvas.width = width * 2; // high res scale 2x
          canvas.height = height * 2;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.scale(2, 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const png = canvas.toDataURL('image/png');
            URL.revokeObjectURL(blobURL);
            resolve(png);
          } else {
            URL.revokeObjectURL(blobURL);
            resolve('');
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(blobURL);
          resolve('');
        };

        img.src = blobURL;
      } catch {
        resolve('');
      }
    });
  }

  // --- COMPROVANTE INDIVIDUAL DO LOJISTA COM FOTO (ESPELHO EM PDF) ---
  exportStoreVoucherPdf(data: StoreVoucherData): void {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 14;

    // Header Background Accent Bar
    const bgHeader = data.utilityType === 'luz' ? [13, 148, 136] : (data.utilityType === 'agua' ? [37, 99, 235] : [225, 29, 72]);
    doc.setFillColor(bgHeader[0], bgHeader[1], bgHeader[2]);
    doc.rect(0, 0, pageWidth, 24, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('COMPROVANTE INDIVIDUAL DE MEDIÇÃO & RATEIO', margin, 11);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Shopping Center • ${data.utilityLabel.toUpperCase()} • Referência: ${data.monthLabel || data.month}`, margin, 17);

    const nowStr = data.issueDate || new Date().toLocaleString('pt-BR');
    doc.setFontSize(7.5);
    doc.text(`Emissão: ${nowStr}`, pageWidth - margin, 17, { align: 'right' });

    y = 30;

    // 1. Dados da Loja (Card Superior)
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, pageWidth - (margin * 2), 22, 2, 2, 'FD');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(data.storeName, margin + 4, y + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Espaço (LUC): ${data.luc}`, margin + 4, y + 14);
    doc.text(`Contrato: ${data.contrato || 'Não informado'}`, margin + 50, y + 14);
    doc.text(`Insumo: ${data.utilityLabel}`, margin + 100, y + 14);
    doc.text(`Mês de Vigência: ${data.monthLabel || data.month}`, margin + 145, y + 14);

    y += 27;

    // 2. Quadro de Apuração do Consumo e Custos
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text('MEMÓRIA DE CÁLCULO E VALORES APURADOS', margin + 3, y + 5);

    y += 9;

    const rowH = 7;
    const items: [string, string][] = [
      ['Leitura Anterior no Relógio', `${data.prevReading.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 4 })} ${data.unit}`],
      ['Leitura Atual Coletada em Campo', `${data.currentReading.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 4 })} ${data.unit}`],
      ['Diferença Bruta de Mostrador', `${data.readingDiff >= 0 ? '+' : ''}${data.readingDiff.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 4 })} ${data.unit}`],
      ['Fator Multiplicador / Constante', `${data.constant} (Ajuste: ${data.adjustment})`],
      ['Consumo Total Faturado', `${data.consumption.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.unit}`],
      ['Tarifa Unitária Rateada', `R$ ${data.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} por ${data.unit}`],
    ];

    if (data.utilityType === 'gas' && data.gasFactor && Math.abs(data.gasFactor - 1) > 0.0001) {
      if (data.rawConsumption !== undefined) {
        items.push(['Medição Bruta em Campo', `${data.rawConsumption.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 4 })} ${data.unit}`]);
      }
      items.push(['Fator de Fechamento da Fatura', `${data.gasFactor.toFixed(4)}x (100% Rateável)`]);
    }

    if (data.variationPct !== undefined && !isNaN(data.variationPct)) {
      items.push(['Variação vs Mês Anterior', `${data.variationPct >= 0 ? '+' : ''}${data.variationPct.toFixed(1)}%`]);
    }

    doc.setFontSize(8);
    items.forEach(([label, val], idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 1, pageWidth - (margin * 2), rowH, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(label, margin + 3, y + 4);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(val, pageWidth - margin - 3, y + 4, { align: 'right' });
      y += rowH;
    });

    // Box de Total a Pagar
    y += 2;
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(52, 211, 153);
    doc.roundedRect(margin, y, pageWidth - (margin * 2), 15, 2, 2, 'FD');

    doc.setTextColor(6, 78, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('TOTAL A COBRAR NO RATEIO:', margin + 5, y + 6);

    doc.setFontSize(13);
    doc.setTextColor(5, 150, 105);
    doc.text(`R$ ${data.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 5, y + 10.5, { align: 'right' });

    y += 20;

    // Observações de Campo se houver
    if (data.note) {
      doc.setFillColor(254, 243, 199);
      doc.setDrawColor(251, 191, 36);
      doc.roundedRect(margin, y, pageWidth - (margin * 2), 9, 1.5, 1.5, 'FD');
      doc.setTextColor(146, 64, 14);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(`Observação de Campo: ${data.note}`, margin + 4, y + 6);
      y += 13;
    }

    // 3. Foto de Evidência do Medidor (se disponível)
    if (data.photoDataUrl) {
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text('REGISTRO FOTOGRÁFICO DO MEDIDOR (EVIDÊNCIA AUDITADA)', margin + 3, y + 5);
      y += 9;

      const imgW = 75;
      const imgH = 60;
      const imgX = (pageWidth - imgW) / 2;

      try {
        doc.setDrawColor(203, 213, 225);
        doc.rect(imgX - 1, y - 1, imgW + 2, imgH + 2, 'S');
        doc.addImage(data.photoDataUrl, 'JPEG', imgX, y, imgW, imgH);

        y += imgH + 3;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        const photoDate = data.photoCapturedAt ? new Date(data.photoCapturedAt).toLocaleString('pt-BR') : 'Data não registrada';
        doc.text(`Foto capturada no local em: ${photoDate} • Registro autenticado`, pageWidth / 2, y + 2, { align: 'center' });
        y += 8;
      } catch (e) {
        console.warn('Erro ao inserir foto no voucher PDF:', e);
      }
    }

    // Rodapé de Autenticidade
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Este comprovante é emitido pela administração do shopping para conferência de leitura e rateio. Dúvidas contatar a equipe técnica.', margin, 287);

    const safeName = data.storeName.replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`Comprovante_${data.luc}_${safeName}_${data.month}.pdf`);
  }
}
