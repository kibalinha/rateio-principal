import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { ExcelImportModalComponent } from '../components/excel-import-modal.component';
import { StoreService } from './store.service';
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

  it('Scenario 9: Importing Gás in an empty month auto-links existing catalog stores, auto-creates brand new stores, and hides non-gas empty rows', () => {
    const comp = new ExcelImportModalComponent();
    comp.utilityType = 'gas';
    comp.selectedMonth = '2026-11';
    comp.unit = 'm³';
    comp.activeStores = []; // Mês completamente vazio em Gás!
    comp.allStores = [
      // KFC já existe em Luz, mas ainda NÃO está vinculado a Gás
      { id: 'st-kfc', luc: '1078', contrato: '20000531', name: 'KFC', active: true, usesLuz: true, usesAgua: false, usesGas: false },
      // Tramontina existe em Luz, não usa Gás (virá vazia na planilha)
      { id: 'st-tram', luc: '1001/1002', contrato: '20000610', name: 'TRAMONTINA STORE', active: true, usesLuz: true, usesAgua: false, usesGas: false }
    ];

    const gasCsv = [
      'RATEIO GÁS 2026,,,Outubro,,,,,,,,,,,,Novembro,,,,,,,,,,',
      ',,Valor conta,138160.77,,,,,,,,,,,Valor conta,136093.69,,,,,,,,',
      ',,Consumo,21252.96,,,,,,,,,,,Consumo,20907.71,,,,,,,,',
      'LUC,Contrato,Nome Fantasia,Leitura,Cons. Virtual,Ajuste (x),Ajuste (+),FCM,Consumo Inicial,Consumo c/ FCC,Var (%),Custo R$,Rec. Fluxo,Custo total R$,,Leitura,Cons. Virtual,Ajuste (x),Ajuste (+),FCM,Consumo Inicial,Consumo c/ FCC,Var (%),Custo R$,Rec. Fluxo,Custo total R$',
      '1001/1002,20000610,TRAMONTINA STORE,,,,,1.0727,0,0,0,0,0,0,,,,,,1.0727,0,0,0,0,0,0',
      '1078,20000531,KFC,10983,,1.266,0.87,1.0727,611.48,655.93,0,4263.55,0,4263.55,,11477,,1.266,0.8702377,1.0727,625.404,670.87087,0,4367.74,0,4367.74',
      '1095/1096,20000682,PETISKEIRA,809,2099,,,1.0727,2099,2099,0,13643.5,0,13643.5,,809,2099,,,1.0727,2099,2099,0,13662.93,0,13662.93'
    ].join('\n');

    comp.importPastedText.set(gasCsv);
    comp.processPastedText();

    // Tramontina (vazia) é ocultada automaticamente por skipEmptyReadings
    expect(comp.hiddenEmptyRowsCount()).toBe(1);
    const preview = comp.importPreviewList();
    expect(preview.length).toBe(2);

    const kfc = preview.find(p => p.luc === '1078')!;
    expect(kfc.status).toBe('will_link');
    expect(kfc.catalogStore?.id).toBe('st-kfc');
    expect(kfc.reading).toBe(11477);
    expect(kfc.prevReading).toBe(10983);
    expect(kfc.adjustment).toBe(1.266);
    expect(kfc.adjustmentAdd).toBeCloseTo(0.8702377, 6);
    expect(kfc.fcm).toBe(1.0727);

    const petiskeira = preview.find(p => p.luc === '1095/1096')!;
    expect(petiskeira.status).toBe('will_create');
    expect(petiskeira.storeName).toBe('PETISKEIRA');
    expect(petiskeira.virtual).toBe(2099);

    expect(comp.importStats().readyToImport).toBe(2);
    expect(comp.importStats().willLink).toBe(1);
    expect(comp.importStats().willCreate).toBe(1);
    expect(comp.importStats().missingPrevBaselineCount).toBe(2);

    let emitted: any = null;
    comp.importSuccess.subscribe(ev => { emitted = ev; });
    comp.confirmAndApplyImport();

    expect(emitted).not.toBeNull();
    expect(emitted.updatedReadings.length).toBe(2);
    expect(emitted.updatedReadings[0].linkExistingStoreId).toBe('st-kfc');
    expect(emitted.updatedReadings[0].prevReadingFromSheet).toBe(10983);
    expect(emitted.updatedReadings[1].newStore).toEqual({
      luc: '1095/1096',
      name: 'PETISKEIRA',
      contrato: '20000682',
      meterNumber: undefined
    });
    expect(emitted.applyPreviousReadingsBaseline).toBe(true);
    expect(emitted.billSummary.totalBillFromItems).toBeCloseTo(136093.69, 2);
    expect(emitted.billSummary.totalConsumption).toBeCloseTo(20907.71, 2);
  });

  it('Scenario 10: StoreService.ensureStoresForUtilityImport creates/links stores strictly for Gás without touching Luz/Água', () => {
    const storeService = Object.create(StoreService.prototype) as StoreService;
    const initialStores: Store[] = [
      { id: 'st-kfc', luc: '1078', contrato: '20000531', name: 'KFC', active: true, usesLuz: true, usesAgua: false, usesGas: false }
    ];
    let currentStores = [...initialStores];
    let currentLists: Record<string, string[]> = { luz_2026_11: ['st-kfc'] };

    (storeService as any).storesSignal = Object.assign(() => currentStores, {
      set: (v: Store[]) => { currentStores = v; }
    });
    (storeService as any).monthlyStoreListsSignal = Object.assign(() => currentLists, {
      update: (fn: (curr: Record<string, string[]>) => Record<string, string[]>) => { currentLists = fn(currentLists); }
    });
    (storeService as any).persistStores = () => {};
    (storeService as any).persistMonthlyStoreLists = () => {};

    const res = storeService.ensureStoresForUtilityImport(
      [
        { storeId: 'st-kfc', linkExistingStoreId: 'st-kfc' },
        { newStore: { luc: '1095/1096', name: 'PETISKEIRA', contrato: '20000682' } }
      ],
      'gas',
      '2026-11'
    );

    expect(res.linkedCount).toBe(1);
    expect(res.createdCount).toBe(1);
    expect(res.resolvedIds.length).toBe(2);
    expect(res.resolvedIds[0]).toBe('st-kfc');
    expect(res.resolvedIds[1]).toBeTruthy();

    // KFC agora usa Gás E continua usando Luz (sem perder usesLuz e sem ganhar usesAgua)
    const kfcAfter = currentStores.find(s => s.id === 'st-kfc')!;
    expect(kfcAfter.usesGas).toBe(true);
    expect(kfcAfter.usesLuz).toBe(true);
    expect(kfcAfter.usesAgua).toBe(false);

    // PETISKEIRA foi criada EXCLUSIVAMENTE para Gás
    const petAfter = currentStores.find(s => s.id === res.resolvedIds[1])!;
    expect(petAfter.luc).toBe('1095/1096');
    expect(petAfter.name).toBe('PETISKEIRA');
    expect(petAfter.usesGas).toBe(true);
    expect(petAfter.usesLuz).toBe(false);
    expect(petAfter.usesAgua).toBe(false);

    // Lista mensal gas_2026-11 populada com ambas sem alterar outras utilidades
    expect(currentLists['gas_2026-11']).toEqual(['st-kfc', res.resolvedIds[1]]);
    expect(currentLists['agua_2026-11']).toBeUndefined();
  });
});
