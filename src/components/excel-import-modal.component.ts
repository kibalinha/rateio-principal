import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { Store, UtilityType, ExcelImportRowPreview } from '../models';

export interface ExcelImportSuccessEvent {
  updatedReadings: Array<{
    storeId: string;
    reading: number;
    calculatedConsumption: number;
    constant?: number;
    adjustment?: number;
    virtual?: number;
    adjustmentAdd?: number;
    fcm?: number;
    fluxoCost?: number;
    note?: string;
  }>;
}

@Component({
  selector: 'app-excel-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
    @if (isOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div class="absolute inset-0 bg-black/75 backdrop-blur-xs animate-fade-in" (click)="onClose()"></div>

        <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl relative z-10 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-scale-in">
          
          <!-- Modal Header -->
          <div class="p-4 sm:p-5 bg-gradient-to-r from-teal-800 to-slate-900 text-white flex items-center justify-between border-b border-teal-700/50">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-xl shrink-0">
                📥
              </div>
              <div>
                <h3 class="font-extrabold text-base sm:text-lg leading-tight flex items-center gap-2">
                  <span>Importar Planilha de Leituras</span>
                  <span class="text-[10px] bg-teal-500/30 text-teal-200 border border-teal-400/30 px-2 py-0.5 rounded-full font-mono uppercase font-bold">
                    {{ utilityType }}
                  </span>
                </h3>
                <p class="text-xs text-teal-200/80 mt-0.5 font-medium">
                  Carregue o arquivo Excel (.xlsx, .xls, .csv) ou cole os dados para atualizar as lojas do mês.
                </p>
              </div>
            </div>
            <button (click)="onClose()" class="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer">✕</button>
          </div>

          <!-- Modal Body (Scrollable) -->
          <div class="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-800 dark:text-slate-200 custom-scrollbar">
            
            <!-- Action Bar: Method Switcher & Download Template Button -->
            <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div class="inline-flex p-1 bg-slate-200 dark:bg-slate-700 rounded-xl gap-1">
                <button type="button"
                  (click)="importMethod.set('file')"
                  [class]="importMethod() === 'file' ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'"
                  class="px-3.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer">
                  <span>📁 Arquivo (.xlsx / .csv)</span>
                </button>
                <button type="button"
                  (click)="importMethod.set('paste')"
                  [class]="importMethod() === 'paste' ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'"
                  class="px-3.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer">
                  <span>📋 Colar Tabela (Ctrl+V)</span>
                </button>
              </div>

              <!-- Botão Baixar Modelo Formatado -->
              <button type="button"
                (click)="downloadImportTemplate()"
                class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer">
                <span>📑</span>
                <span>Baixar Planilha Modelo (.xlsx)</span>
              </button>
            </div>

            <!-- TAB 1: UPLOAD DE ARQUIVO -->
            @if (importMethod() === 'file') {
              <div 
                (dragover)="$event.preventDefault(); isDraggingFile.set(true)"
                (dragleave)="isDraggingFile.set(false)"
                (drop)="onExcelFileDrop($event)"
                [class]="isDraggingFile() ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-slate-300 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30'"
                class="border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer relative hover:border-teal-500">
                
                <input type="file" 
                  accept=".xlsx, .xls, .csv" 
                  (change)="onExcelFileSelected($event)" 
                  class="absolute inset-0 opacity-0 cursor-pointer w-full h-full">

                <div class="flex flex-col items-center justify-center gap-2 pointer-events-none">
                  <span class="text-4xl animate-bounce">📊</span>
                  <div class="font-extrabold text-sm sm:text-base text-slate-800 dark:text-white">
                    Arraste sua planilha aqui ou clique para selecionar
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    Compatível com planilhas Excel (.xlsx, .xls) ou valores separados por vírgula/ponto-e-vírgula (.csv)
                  </p>
                  @if (importedFileName()) {
                    <div class="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 rounded-lg text-xs font-mono font-bold">
                      <span>📄 Arquivo carregado:</span>
                      <strong>{{ importedFileName() }}</strong>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- TAB 2: COLAR DADOS DA ÁREA DE TRANSFERÊNCIA -->
            @if (importMethod() === 'paste') {
              <div class="space-y-3">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Copie as linhas da sua planilha no Excel e cole diretamente no campo abaixo:
                </label>
                <textarea 
                  [ngModel]="importPastedText()"
                  (ngModelChange)="importPastedText.set($event)"
                  rows="6"
                  placeholder="LUC	Nome da Loja	Leitura Atual&#10;101	Loja Exemplo	1520&#10;102	Loja Teste	3480"
                  class="w-full p-3 font-mono text-xs border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500">
                </textarea>
                <div class="flex justify-end">
                  <button type="button"
                    (click)="processPastedText()"
                    [disabled]="!importPastedText().trim()"
                    class="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer">
                    <span>⚡ Processar Dados Colados</span>
                  </button>
                </div>
              </div>
            }

            <!-- MAPEAÇÃO INTELIGENTE DE COLUNAS -->
            @if (rawExcelHeaders().length > 0) {
              <div class="space-y-3 p-4 bg-teal-50/50 dark:bg-teal-950/20 rounded-2xl border border-teal-200 dark:border-teal-900/50">
                <div class="flex items-center justify-between">
                  <h4 class="font-extrabold text-xs uppercase tracking-wider text-teal-900 dark:text-teal-200 flex items-center gap-2">
                    <span>⚙️ Mapeamento Inteligente de Colunas</span>
                  </h4>
                  <span class="text-[11px] text-teal-700 dark:text-teal-300 font-semibold">
                    Colunas detectadas automaticamente da planilha
                  </span>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <!-- Coluna Identificadora (LUC ou Nome) -->
                  <div>
                    <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                      Identificação da Loja (LUC ou Nome) <span class="text-rose-500">*</span>
                    </label>
                    <select 
                      [ngModel]="columnMappings().luc"
                      (ngModelChange)="updateColumnMapping('luc', $event)"
                      class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                      <option value="">-- Selecione a Coluna --</option>
                      @for (h of rawExcelHeaders(); track h) {
                        <option [value]="h">{{ h }}</option>
                      }
                    </select>
                  </div>

                  <!-- Coluna Leitura Atual -->
                  <div>
                    <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                      Leitura Atual do Medidor <span class="text-rose-500">*</span>
                    </label>
                    <select 
                      [ngModel]="columnMappings().reading"
                      (ngModelChange)="updateColumnMapping('reading', $event)"
                      class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                      <option value="">-- Selecione a Coluna --</option>
                      @for (h of rawExcelHeaders(); track h) {
                        <option [value]="h">{{ h }}</option>
                      }
                    </select>
                  </div>

                  <!-- Coluna Consumo Virtual -->
                  <div>
                    <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                      Consumo Virtual (Opcional)
                    </label>
                    <select 
                      [ngModel]="columnMappings().virtual"
                      (ngModelChange)="updateColumnMapping('virtual', $event)"
                      class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                      <option value="">-- Não Mapear --</option>
                      @for (h of rawExcelHeaders(); track h) {
                        <option [value]="h">{{ h }}</option>
                      }
                    </select>
                  </div>

                  <!-- Coluna Observação -->
                  <div>
                    <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                      Observação / Anotação de Campo
                    </label>
                    <select 
                      [ngModel]="columnMappings().note"
                      (ngModelChange)="updateColumnMapping('note', $event)"
                      class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                      <option value="">-- Não Mapear --</option>
                      @for (h of rawExcelHeaders(); track h) {
                        <option [value]="h">{{ h }}</option>
                      }
                    </select>
                  </div>
                </div>
              </div>
            }

            <!-- PRÉ-VISUALIZAÇÃO DOS DADOS IDENTIFICADOS -->
            @if (importPreviewList().length > 0) {
              <div class="space-y-3">
                
                <!-- Estatísticas de Correspondência -->
                <div class="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-bold">
                  <div class="flex items-center gap-3">
                    <span class="text-teal-700 dark:text-teal-300">
                      ✅ Lojas Identificadas: <strong>{{ importStats().matched }}</strong> de {{ importStats().total }}
                    </span>
                    @if (importStats().unmatched > 0) {
                      <span class="text-rose-600 dark:text-rose-400">
                        ⚠️ Não Encontradas: <strong>{{ importStats().unmatched }}</strong>
                      </span>
                    }
                  </div>
                  <span class="text-slate-500 font-mono text-[11px]">
                    Com leitura preenchida: {{ importStats().withReading }}
                  </span>
                </div>

                <!-- Tabela de Auditoria e Prévia -->
                <div class="overflow-x-auto max-h-60 rounded-xl border border-slate-200 dark:border-slate-700 custom-scrollbar">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th class="p-2.5">Status</th>
                        <th class="p-2.5">LUC</th>
                        <th class="p-2.5">Loja Identificada</th>
                        <th class="p-2.5 text-right">Leitura Ant.</th>
                        <th class="p-2.5 text-right">Leitura Planilha</th>
                        <th class="p-2.5 text-right">Consumo Previsto</th>
                        <th class="p-2.5">Observação</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                      @for (row of importPreviewList(); track $index) {
                        <tr [class]="row.status === 'matched' ? 'hover:bg-teal-50/40 dark:hover:bg-teal-950/20' : 'bg-rose-50/40 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400'">
                          <td class="p-2.5 font-sans">
                            @if (row.status === 'matched') {
                              <span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                                ✓ Reconhecido
                              </span>
                            } @else {
                              <span class="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-bold text-[10px]" [title]="row.message">
                                ✕ Ignorado
                              </span>
                            }
                          </td>
                          <td class="p-2.5 font-bold">{{ row.luc }}</td>
                          <td class="p-2.5 font-sans font-medium text-slate-800 dark:text-slate-200">
                            {{ row.storeName }}
                          </td>
                          <td class="p-2.5 text-right text-slate-400">
                            {{ row.prevReading | number:'1.0-0' }}
                          </td>
                          <td class="p-2.5 text-right font-bold text-teal-700 dark:text-teal-300">
                            {{ row.reading | number:'1.0-2' }}
                          </td>
                          <td class="p-2.5 text-right font-bold">
                            {{ row.consumptionPreview | number:'1.0-2' }} {{ unit }}
                          </td>
                          <td class="p-2.5 font-sans text-slate-500 text-[10px] truncate max-w-xs">
                            {{ row.note || '—' }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

          </div>

          <!-- Modal Footer Actions -->
          <div class="p-4 bg-slate-50 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <button type="button" 
                    (click)="onClose()"
                    class="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer">
              Cancelar
            </button>

            <div class="flex items-center gap-2">
              <button type="button"
                (click)="confirmAndApplyImport()"
                [disabled]="importStats().matched === 0"
                class="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer">
                <span>🚀</span>
                <span>Confirmar e Importar {{ importStats().matched }} Lojas</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    }
  `
})
export class ExcelImportModalComponent {
  @Input() isOpen = false;
  @Input() utilityType: UtilityType = 'luz';
  @Input() selectedMonth = '';
  @Input() activeStores: Store[] = [];
  @Input() previousReadings: Map<string, { reading: number; consumption: number }> = new Map();
  @Input() unit = '';

  @Output() close = new EventEmitter<void>();
  @Output() importSuccess = new EventEmitter<ExcelImportSuccessEvent>();

  // Import State
  importMethod = signal<'file' | 'paste'>('file');
  importedFileName = signal<string>('');
  importPastedText = signal<string>('');
  rawExcelHeaders = signal<string[]>([]);
  rawExcelRows = signal<Record<string, any>[]>([]);
  columnMappings = signal<Record<string, string>>({
    luc: '',
    reading: '',
    constant: '',
    adjustment: '',
    virtual: '',
    adjustmentAdd: '',
    fcm: '',
    fluxoCost: '',
    note: ''
  });
  isDraggingFile = signal<boolean>(false);

  importPreviewList = computed<ExcelImportRowPreview[]>(() => {
    const rows = this.rawExcelRows();
    if (rows.length === 0) return [];

    const mappings = this.columnMappings();
    const stores = this.activeStores;
    const prevReadings = this.previousReadings;
    const type = this.utilityType;

    const normalizeKey = (s: any) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]/gi, '');

    return rows.map((rawRow, idx) => {
      const rawLucVal = mappings.luc ? String(rawRow[mappings.luc] || '').trim() : '';
      const rawReadingVal = mappings.reading ? rawRow[mappings.reading] : '';
      const reading = this.parseExcelNumber(rawReadingVal);

      // Correspondência inteligente (LUC, Nome da Loja, Contrato ou Medidor)
      const normVal = normalizeKey(rawLucVal);
      const matchedStore = stores.find(s => {
        if (!normVal) return false;
        if (normalizeKey(s.luc) === normVal) return true;
        if (normalizeKey(s.name) === normVal) return true;
        if (s.contrato && normalizeKey(s.contrato) === normVal) return true;
        if (s.meterNumber && normalizeKey(s.meterNumber) === normVal) return true;
        if (s.name && s.name.toLowerCase().includes(rawLucVal.toLowerCase())) return true;
        return false;
      });

      const prevData = matchedStore ? prevReadings.get(matchedStore.id) : null;
      const prevReading = prevData ? prevData.reading : 0;
      const diff = reading > prevReading ? (reading - prevReading) : 0;

      const constant = mappings.constant ? this.parseExcelNumber(rawRow[mappings.constant]) : 1;
      const adjustment = mappings.adjustment ? this.parseExcelNumber(rawRow[mappings.adjustment]) : (type === 'gas' ? 1.347 : 1);
      const virtual = mappings.virtual ? this.parseExcelOptionalNumber(rawRow[mappings.virtual]) : undefined;
      const adjustmentAdd = mappings.adjustmentAdd ? this.parseExcelNumber(rawRow[mappings.adjustmentAdd]) : 0;
      const fcm = mappings.fcm ? this.parseExcelNumber(rawRow[mappings.fcm]) : 1.0727;
      const fluxoCost = mappings.fluxoCost ? this.parseExcelNumber(rawRow[mappings.fluxoCost]) : 0;
      const note = mappings.note ? String(rawRow[mappings.note] || '').trim() : '';

      let consumptionPreview = 0;
      if (virtual !== undefined) {
        consumptionPreview = virtual;
      } else if (type === 'gas') {
        consumptionPreview = ((diff * adjustment) + adjustmentAdd) * fcm;
      } else {
        consumptionPreview = diff * constant * adjustment;
      }

      if (matchedStore) {
        return {
          rawRow,
          matchedStore,
          storeName: matchedStore.name,
          luc: matchedStore.luc,
          reading,
          prevReading,
          consumptionPreview,
          constant,
          adjustment,
          virtual,
          adjustmentAdd,
          fcm,
          fluxoCost,
          note,
          status: 'matched' as const,
          message: virtual !== undefined 
            ? `Consumo Virtual: ${virtual} ${this.unit}` 
            : (reading > 0 ? `Leitura: ${reading} (${consumptionPreview.toFixed(1)} ${this.unit})` : 'Leitura zerada')
        };
      } else {
        return {
          rawRow,
          storeName: rawLucVal || `Linha ${idx + 1}`,
          luc: rawLucVal || '—',
          reading,
          prevReading: 0,
          consumptionPreview: 0,
          status: 'unmatched' as const,
          message: rawLucVal ? 'Loja não localizada no cadastro deste insumo' : 'Coluna de identificação vazia'
        };
      }
    });
  });

  importStats = computed(() => {
    const list = this.importPreviewList();
    const total = list.length;
    const matched = list.filter(r => r.status === 'matched').length;
    const unmatched = total - matched;
    const withReading = list.filter(r => r.status === 'matched' && r.reading > 0).length;
    return { total, matched, unmatched, withReading };
  });

  onClose() {
    this.close.emit();
  }

  updateColumnMapping(field: string, headerName: string) {
    this.columnMappings.update(curr => ({ ...curr, [field]: headerName }));
  }

  downloadImportTemplate() {
    const type = this.utilityType;
    const stores = this.activeStores;
    const prevReadings = this.previousReadings;
    const month = this.selectedMonth;

    const rows = stores.map(s => {
      const p = prevReadings.get(s.id) || { reading: 0, consumption: 0 };
      const item: Record<string, any> = {
        'LUC': s.luc,
        'Nome da Loja': s.name,
        'Contrato': s.contrato || '',
        'Medidor': s.meterNumber || '',
        'Leitura Anterior': p.reading || 0,
        'Leitura Atual': '',
      };
      if (type === 'luz') {
        item['Constante'] = 1;
        item['Ajuste'] = 1;
      } else if (type === 'gas') {
        item['Ajuste (x)'] = 1.347;
        item['Ajuste Add (+)'] = 0;
        item['FCM'] = 1.0727;
        item['Fluxo (R$)'] = 0;
      } else {
        item['Constante'] = 1;
        item['Ajuste'] = 1;
      }
      item['Consumo Virtual'] = '';
      item['Observacao'] = '';
      return item;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 30 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, `Modelo_${type.toUpperCase()}`);
    XLSX.writeFile(wb, `Planilha_Modelo_${type.toUpperCase()}_${month}.xlsx`);
  }

  onExcelFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.parseExcelFile(file);
    input.value = '';
  }

  onExcelFileDrop(event: DragEvent) {
    event.preventDefault();
    this.isDraggingFile.set(false);
    if (!event.dataTransfer || !event.dataTransfer.files || event.dataTransfer.files.length === 0) return;
    const file = event.dataTransfer.files[0];
    this.parseExcelFile(file);
  }

  parseExcelFile(file: File) {
    this.importedFileName.set(file.name);
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
        if (jsonData.length === 0) {
          alert('A planilha selecionada está vazia.');
          return;
        }
        this.processImportedJsonData(jsonData);
      } catch (err) {
        console.error('Erro ao ler planilha Excel:', err);
        alert('Não foi possível ler o arquivo. Certifique-se de que é um arquivo .xlsx, .xls ou .csv válido.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  processPastedText() {
    const text = this.importPastedText().trim();
    if (!text) {
      alert('Cole os dados copiados do Excel na caixa de texto.');
      return;
    }
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      alert('Cole pelo menos o cabeçalho e uma linha de dados.');
      return;
    }
    const headers = lines[0].split('\t').map(h => h.trim());
    const rows: Record<string, any>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      const row: Record<string, any> = {};
      headers.forEach((h, idx) => {
        row[h] = parts[idx] !== undefined ? parts[idx].trim() : '';
      });
      rows.push(row);
    }
    this.importedFileName.set('Tabela Colada (Ctrl+V)');
    this.processImportedJsonData(rows, headers);
  }

  processImportedJsonData(rows: any[], headers?: string[]) {
    const extractedHeaders = headers || Object.keys(rows[0] || {});
    this.rawExcelHeaders.set(extractedHeaders);
    this.rawExcelRows.set(rows);

    const mappings: Record<string, string> = {
      luc: '',
      reading: '',
      constant: '',
      adjustment: '',
      virtual: '',
      adjustmentAdd: '',
      fcm: '',
      fluxoCost: '',
      note: ''
    };

    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    extractedHeaders.forEach(h => {
      const nh = norm(h);
      if (!mappings.luc && (nh === 'luc' || nh.includes('luc') || nh.includes('loja') || nh.includes('nome') || nh.includes('codigo') || nh.includes('unidade'))) {
        mappings.luc = h;
      }
      if (!mappings.reading && (nh.includes('leitura atual') || nh === 'leitura' || nh.includes('medicao') || nh.includes('atual') || nh.includes('valor medido') || nh.includes('hidrometro'))) {
        mappings.reading = h;
      }
      if (!mappings.constant && (nh.includes('const') || nh.includes('constante'))) {
        mappings.constant = h;
      }
      if (!mappings.adjustment && (nh === 'ajuste' || nh.includes('ajuste (x)') || nh === 'aj(x)' || nh.includes('fator ajuste'))) {
        mappings.adjustment = h;
      }
      if (!mappings.virtual && (nh.includes('virtual') || nh.includes('consumo virtual'))) {
        mappings.virtual = h;
      }
      if (!mappings.adjustmentAdd && (nh.includes('aj(+)') || nh.includes('ajuste add') || nh.includes('adicional'))) {
        mappings.adjustmentAdd = h;
      }
      if (!mappings.fcm && (nh.includes('fcm') || nh.includes('fator correcao'))) {
        mappings.fcm = h;
      }
      if (!mappings.fluxoCost && (nh.includes('fluxo') || nh.includes('custo fluxo'))) {
        mappings.fluxoCost = h;
      }
      if (!mappings.note && (nh.includes('obs') || nh.includes('observacao') || nh.includes('nota') || nh.includes('comentario'))) {
        mappings.note = h;
      }
    });

    this.columnMappings.set(mappings);
  }

  confirmAndApplyImport() {
    const list = this.importPreviewList();
    const matchedItems = list.filter(item => item.status === 'matched' && item.matchedStore);

    if (matchedItems.length === 0) {
      alert('Nenhuma loja correspondente encontrada para importar. Verifique o mapeamento das colunas.');
      return;
    }

    const updatedReadings = matchedItems.map(item => ({
      storeId: item.matchedStore!.id,
      reading: item.reading,
      calculatedConsumption: item.consumptionPreview,
      constant: item.constant,
      adjustment: item.adjustment,
      virtual: this.columnMappings().virtual ? item.virtual : undefined,
      adjustmentAdd: item.adjustmentAdd,
      fcm: item.fcm,
      fluxoCost: item.fluxoCost,
      note: item.note
    }));

    this.importSuccess.emit({ updatedReadings });
  }

  private parseExcelNumber(val: any): number {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    let str = String(val).trim();
    if (!str) return 0;
    if (str.includes(',') && str.includes('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}\.\d{3}$/.test(str)) {
      str = str.replace(/\./g, '');
    } else if (str.includes(',')) {
      str = str.replace(',', '.');
    }
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }

  private parseExcelOptionalNumber(val: any): number | undefined {
    if (val === undefined || val === null) return undefined;
    const str = String(val).trim();
    if (str === '' || str === '-' || str === '—') return undefined;
    let clean = str;
    if (clean.includes(',') && clean.includes('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}\.\d{3}$/.test(clean)) {
      clean = clean.replace(/\./g, '');
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    }
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? undefined : parsed;
  }
}
