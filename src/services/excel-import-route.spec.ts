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

  it('Scenario 1: downloadImportTemplate orders stores by physical route and adds instructions sheet', () => {
    const comp = new ExcelImportModalComponent();
    comp.activeStores = mockStores;
    comp.utilityType = 'agua';
    comp.selectedMonth = '2026-11';
    comp.templateSortOrder.set('route');

    const { workbook, filename } = comp.generateImportTemplateWorkbook();

    expect(filename).toContain('Planilha_Roteiro_AGUA_2026-11.xlsx');
    expect(workbook.SheetNames).toContain('Leituras_AGUA');
    expect(workbook.SheetNames).toContain('Instrucoes_Leiturista');

    const sheetData: any[] = XLSX.utils.sheet_to_json(workbook.Sheets['Leituras_AGUA']);
    expect(sheetData.length).toBe(4);

    // Deve estar ordenado por routeOrder: 1 (Farmácia Raia), 2 (Livraria Leitura), 3 (Outback), e Quiosque Café no final
    expect(sheetData[0]['Nome da Loja']).toBe('Farmácia Raia');
    expect(sheetData[0]['Ordem / Rota']).toBe(1);
    expect(sheetData[1]['Nome da Loja']).toBe('Livraria Leitura');
    expect(sheetData[1]['Ordem / Rota']).toBe(2);
    expect(sheetData[2]['Nome da Loja']).toBe('Restaurante Outback');
    expect(sheetData[2]['Ordem / Rota']).toBe(3);
    expect(sheetData[3]['Nome da Loja']).toBe('Quiosque Café');

    // Verifica se a coluna "Leitura Atual (Preencher)" e "Nº Medidor" existem
    expect(sheetData[0]).toHaveProperty('Leitura Atual (Preencher)');
    expect(sheetData[0]).toHaveProperty('Nº Medidor');
    expect(sheetData[0]['Nº Medidor']).toBe('MED-123');
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

  it('Scenario 3: processImportedJsonData safely distinguishes "Leitura Atual (Preencher)" from "Leitura Anterior"', () => {
    const comp = new ExcelImportModalComponent();
    comp.activeStores = mockStores;
    comp.utilityType = 'agua';

    const testRows = [
      {
        'Ordem / Rota': 1,
        'LUC': 'LUC-100',
        'Nome da Loja': 'Farmácia Raia',
        'Contrato': 'CTR-111',
        'Nº Medidor': 'MED-123',
        'Leitura Anterior': 1500,
        'Leitura Atual (Preencher)': 1580,
        'Observacao de Campo': 'Hidrômetro limpo'
      }
    ];

    comp.processImportedJsonData(testRows);

    const mappings = comp.columnMappings();
    expect(mappings.luc).toBe('LUC');
    expect(mappings.storeName).toBe('Nome da Loja');
    expect(mappings.meterNumber).toBe('Nº Medidor');
    expect(mappings.reading).toBe('Leitura Atual (Preencher)'); // NUNCA deve mapear 'Leitura Anterior'
    expect(mappings.note).toBe('Observacao de Campo');

    const preview = comp.importPreviewList();
    expect(preview.length).toBe(1);
    expect(preview[0].status).toBe('matched');
    expect(preview[0].reading).toBe(1580);
    expect(preview[0].prevReading).toBe(0); // se não injetado no map
    expect(preview[0].note).toBe('Hidrômetro limpo');
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
});
