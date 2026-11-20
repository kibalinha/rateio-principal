import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { ExcelImportModalComponent } from '../components/excel-import-modal.component';
import { Store } from '../models';

describe('Excel Import Modal: Route Ordering & Intelligent Template Import', () => {
  const mockStores: Store[] = [
    {
      id: 'store-c',
      luc: 'LUC-300',
      name: 'Restaurante Outback',
      contrato: 'CTR-999',
      meterNumber: 'MED-777',
      routeOrder: 3,
      active: true,
      usesLuz: true,
      usesAgua: true,
      usesGas: false
    },
    {
      id: 'store-a',
      luc: 'LUC-100',
      name: 'Farmácia Raia',
      contrato: 'CTR-111',
      meterNumber: 'MED-123',
      routeOrder: 1,
      active: true,
      usesLuz: true,
      usesAgua: true,
      usesGas: false
    },
    {
      id: 'store-b',
      luc: 'LUC-200',
      name: 'Livraria Leitura',
      contrato: 'CTR-222',
      meterNumber: 'MED-456',
      routeOrder: 2,
      active: true,
      usesLuz: true,
      usesAgua: true,
      usesGas: false
    },
    {
      id: 'store-d',
      luc: 'LUC-050',
      name: 'Quiosque Café',
      contrato: 'CTR-050',
      meterNumber: 'MED-050',
      routeOrder: undefined, // Sem rota definida
      active: true,
      usesLuz: true,
      usesAgua: true,
      usesGas: false
    }
  ];

  it('Scenario 1: downloadImportTemplate orders stores by physical route with simplified columns', () => {
    const comp = new ExcelImportModalComponent();
    comp.activeStores = mockStores;
    comp.utilityType = 'agua';
    comp.selectedMonth = '2026-11';
    comp.templateSortOrder.set('route');

    const { workbook, filename } = comp.generateImportTemplateWorkbook();

    expect(filename).toContain('Planilha_Leituras_AGUA_2026-11.xlsx');
    expect(workbook.SheetNames).toContain('Leituras_AGUA');

    const sheetData: any[] = XLSX.utils.sheet_to_json(workbook.Sheets['Leituras_AGUA']);
    expect(sheetData.length).toBe(4);

    // Deve estar ordenado por rota física: Farmácia Raia, Livraria Leitura, Outback, Quiosque Café
    expect(sheetData[0]['Nome da Loja']).toBe('Farmácia Raia');
    expect(sheetData[0]['LUC']).toBe('LUC-100');
    expect(sheetData[0]['Contrato']).toBe('CTR-111');
    expect(sheetData[0]).toHaveProperty('Leitura Anterior');
    expect(sheetData[0]).toHaveProperty('Leitura Atual');

    expect(sheetData[1]['Nome da Loja']).toBe('Livraria Leitura');
    expect(sheetData[2]['Nome da Loja']).toBe('Restaurante Outback');
    expect(sheetData[3]['Nome da Loja']).toBe('Quiosque Café');
  });

  it('Scenario 2: Template download supports sorting by LUC and Store Name if requested', () => {
    const comp = new ExcelImportModalComponent();
    comp.activeStores = mockStores;
    comp.utilityType = 'luz';
    comp.selectedMonth = '2026-11';

    // Ordenar por Nome
    comp.templateSortOrder.set('name');
    const { workbook: wbByName } = comp.generateImportTemplateWorkbook();
    const sheetByName: any[] = XLSX.utils.sheet_to_json(wbByName.Sheets['Leituras_LUZ']);
    expect(sheetByName[0]['Nome da Loja']).toBe('Farmácia Raia');
    expect(sheetByName[1]['Nome da Loja']).toBe('Livraria Leitura');
    expect(sheetByName[2]['Nome da Loja']).toBe('Quiosque Café');
    expect(sheetByName[3]['Nome da Loja']).toBe('Restaurante Outback');

    // Ordenar por LUC
    comp.templateSortOrder.set('luc');
    const { workbook: wbByLuc } = comp.generateImportTemplateWorkbook();
    const sheetByLuc: any[] = XLSX.utils.sheet_to_json(wbByLuc.Sheets['Leituras_LUZ']);
    expect(sheetByLuc[0]['LUC']).toBe('LUC-050');
    expect(sheetByLuc[1]['LUC']).toBe('LUC-100');
    expect(sheetByLuc[2]['LUC']).toBe('LUC-200');
    expect(sheetByLuc[3]['LUC']).toBe('LUC-300');
  });

  it('Scenario 3: processImportedJsonData safely distinguishes "Leitura Atual" from "Leitura Anterior" in simplified sheet', () => {
    const comp = new ExcelImportModalComponent();
    comp.activeStores = mockStores;
    comp.utilityType = 'agua';

    const testRows = [
      {
        'LUC': 'LUC-100',
        'Nome da Loja': 'Farmácia Raia',
        'Contrato': 'CTR-111',
        'Leitura Anterior': 1500,
        'Leitura Atual': 1580
      }
    ];

    comp.processImportedJsonData(testRows);

    const mappings = comp.columnMappings();
    expect(mappings.luc).toBe('LUC');
    expect(mappings.storeName).toBe('Nome da Loja');
    expect(mappings.contrato).toBe('Contrato');
    expect(mappings.reading).toBe('Leitura Atual'); // NUNCA deve mapear 'Leitura Anterior'

    const preview = comp.importPreviewList();
    expect(preview.length).toBe(1);
    expect(preview[0].status).toBe('matched');
    expect(preview[0].reading).toBe(1580);
    expect(preview[0].routeOrder).toBe(1);
  });

  it('Scenario 4: Multi-layered matching matches store even if only Medidor or Contrato is supplied in sheet', () => {
    const comp = new ExcelImportModalComponent();
    comp.activeStores = mockStores;
    comp.utilityType = 'gas';

    // O técnico anotou só o medidor e a leitura
    const testRows = [
      {
        'Identificador': 'MED-777', // Medidor do Outback
        'Leitura': 450
      },
      {
        'Identificador': 'CTR-222', // Contrato da Livraria Leitura
        'Leitura': 210
      }
    ];

    comp.processImportedJsonData(testRows, ['Identificador', 'Leitura']);
    comp.updateColumnMapping('luc', 'Identificador');
    comp.updateColumnMapping('reading', 'Leitura');

    const preview = comp.importPreviewList();
    expect(preview.length).toBe(2);

    const matchOutback = preview.find(p => p.storeName === 'Restaurante Outback');
    expect(matchOutback).toBeDefined();
    expect(matchOutback?.status).toBe('matched');
    expect(matchOutback?.reading).toBe(450);

    const matchLivraria = preview.find(p => p.storeName === 'Livraria Leitura');
    expect(matchLivraria).toBeDefined();
    expect(matchLivraria?.status).toBe('matched');
    expect(matchLivraria?.reading).toBe(210);
  });

  it('Scenario 5: When activeStores is empty in a new month, template uses allStores fallback', () => {
    const comp = new ExcelImportModalComponent();
    comp.activeStores = []; // Mês novo em branco no rateio!
    comp.allStores = mockStores; // Catálogo geral de lojas
    comp.utilityType = 'luz';
    comp.selectedMonth = '2026-11';

    const { workbook, filename } = comp.generateImportTemplateWorkbook();
    expect(filename).toContain('Planilha_Leituras_LUZ_2026-11.xlsx');

    const sheetData: any[] = XLSX.utils.sheet_to_json(workbook.Sheets['Leituras_LUZ']);
    expect(sheetData.length).toBe(4);
    expect(sheetData[0]['Nome da Loja']).toBe('Farmácia Raia');
    expect(sheetData[0]['LUC']).toBe('LUC-100');
  });

  it('Scenario 6: Even if both activeStores and allStores are empty, sheet is never blank and contains headers', () => {
    const comp = new ExcelImportModalComponent();
    comp.activeStores = [];
    comp.allStores = [];
    comp.utilityType = 'agua';
    comp.selectedMonth = '2026-11';

    const { workbook } = comp.generateImportTemplateWorkbook();
    const sheetData: any[] = XLSX.utils.sheet_to_json(workbook.Sheets['Leituras_AGUA']);
    expect(sheetData.length).toBeGreaterThan(0);
    expect(sheetData[0]).toHaveProperty('LUC');
    expect(sheetData[0]).toHaveProperty('Nome da Loja');
    expect(sheetData[0]).toHaveProperty('Contrato');
    expect(sheetData[0]).toHaveProperty('Leitura Anterior');
    expect(sheetData[0]).toHaveProperty('Leitura Atual');
  });

  it('Scenario 7: Importing 5-column template uses Leitura Anterior fallback and does not overwrite constant/adjustment', () => {
    const comp = new ExcelImportModalComponent();
    comp.activeStores = mockStores;
    comp.previousReadings = new Map(); // Sem leitura anterior no histórico em memória
    comp.utilityType = 'luz';

    const rows = [
      {
        'LUC': 'LUC-100',
        'Nome da Loja': 'Farmácia Raia',
        'Contrato': 'CTR-100',
        'Leitura Anterior': '1.200',
        'Leitura Atual': '1.500'
      }
    ];

    comp.processImportedJsonData(rows);
    const preview = comp.importPreviewList();
    expect(preview.length).toBe(1);
    expect(preview[0].prevReading).toBe(1200);
    expect(preview[0].reading).toBe(1500);
    expect(preview[0].consumptionPreview).toBe(300);

    let emittedEvent: any = null;
    comp.importSuccess.subscribe(ev => { emittedEvent = ev; });
    comp.confirmAndApplyImport();

    expect(emittedEvent).not.toBeNull();
    expect(emittedEvent.updatedReadings[0].constant).toBeUndefined();
    expect(emittedEvent.updatedReadings[0].adjustment).toBeUndefined();
  });

  it('Scenario 8: Pasting messy multi-month matrix selects active month block, matches multi-contract LUCs and extracts billSummary', () => {
    const comp = new ExcelImportModalComponent();
    comp.utilityType = 'luz';
    comp.selectedMonth = '2026-11';
    comp.activeStores = [
      { id: 'st-tram', luc: '1001/1002', contrato: '0000020000610', name: 'TRAMONTINA STORE', active: true, usesLuz: true },
      { id: 'st-seph', luc: '1008', contrato: '0000020000715', name: 'SEPHORA', active: true, usesLuz: true },
      { id: 'st-mh1', luc: 'MULTIPLAN HALL', contrato: '0000050001539', name: 'JIU-JITSU CHAMPIONSHIP', active: true, usesLuz: true },
      { id: 'st-mh2', luc: 'MULTIPLAN HALL', contrato: '0000050001540', name: 'CAFESTIVAL', active: true, usesLuz: true }
    ];

    const matrixCsv = [
      'RATEIO ENERGIA 2026,,,Outubro,,,,,,,,,,Novembro,,,,,,,,',
      ',,Valor conta CEEE BSS-1,344508.51,,,,,,,,,Valor conta CEEE BSS-1,368377.16,,,,,,,,',
      ',,Valor conta CEMIG BSS-1,267277.57,,,,,,,,,Valor conta CEMIG BSS-1,293850.21,,,,,,,,',
      ',,Consumo (ponta e fora ponta) BSS-1,924819,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,994683.48,,,,,,,,',
      ',,Consumo (ponta e fora ponta) BSS-2,29918.7,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,56889.59,,,,,,,,',
      ',,Ar Condicionado,81151.76,,,,,,,,,Ar Condicionado,114338.09,,,,,,,,',
      ',,,0.11,,,,,,,,,,0.14,,,,,,,,',
      ',,,114000,,,,,,,,,,162000,,,,,,,,',
      'LUC,Contrato,Nome Fantasia,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Rec. Fluxo,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Rec. Fluxo,Custo Total',
      '1001/1002,20000610,TRAMONTINA STORE,666669,1,,,3499,0,2490,,2490,,670743,1,,,4074,0,2875,,2875',
      '1008,20000715,SEPHORA,157438,1,1633,,1633,0,1162,,1162,,171522,1,1633,,1633,0,1152,,1152',
      'MULTIPLAN HALL,50001539,JIU-JITSU CHAMPIONSHIP,100,1,,,10,0,7,,7,,120,1,,,20,0,14,,14',
      'MULTIPLAN HALL,50001540,CAFESTIVAL,500,1,,,50,0,35,,35,,540,1,,,40,0,28,,28',
      'TOTAL GERAL,,Soma,,,,,,,,,,,,,,,,,,,'
    ].join('\n');

    comp.importPastedText.set(matrixCsv);
    comp.processPastedText();

    expect(comp.isMultiMonthMatrix()).toBe(true);
    expect(comp.selectedMonthBlockId()).toBe('11');
    expect(comp.ignoredNoiseRows()).toBe(1);

    const preview = comp.importPreviewList();
    expect(preview.length).toBe(4);
    expect(preview.every(p => p.status === 'matched')).toBe(true);

    const tram = preview.find(p => p.matchedStore?.id === 'st-tram')!;
    expect(tram.reading).toBe(670743);
    expect(tram.prevReading).toBe(666669);
    expect(tram.consumptionPreview).toBe(4074);

    const seph = preview.find(p => p.matchedStore?.id === 'st-seph')!;
    expect(seph.reading).toBe(171522);
    expect(seph.virtual).toBe(1633);
    expect(seph.consumptionPreview).toBe(1633);

    const mh1 = preview.find(p => p.matchedStore?.id === 'st-mh1')!;
    const mh2 = preview.find(p => p.matchedStore?.id === 'st-mh2')!;
    expect(mh1.reading).toBe(120);
    expect(mh2.reading).toBe(540);

    let emitted: any = null;
    comp.importSuccess.subscribe(ev => { emitted = ev; });
    comp.confirmAndApplyImport();

    expect(emitted).not.toBeNull();
    expect(emitted.updatedReadings.length).toBe(4);
    expect(emitted.billSummary).toBeDefined();
    expect(emitted.billSummary.costItems.length).toBe(2);
    expect(emitted.billSummary.totalBillFromItems).toBeCloseTo(662227.37, 2);
    expect(emitted.billSummary.luzConsumption.bss1).toBe(994683.48);
    expect(emitted.billSummary.acConsumption).toBe(162000);
  });
});
