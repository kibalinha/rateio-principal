import { Component, Input, Output, EventEmitter, Optional, OnChanges, SimpleChanges, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { Store, UtilityType, ExcelImportRowPreview } from '../models';
import { normalizeLuc, normalizeContract, normalizeStoreName } from '../services/store.service';
import { calculateReadingDifference } from '../services/apportionment-engine.service';
import { GeminiService } from '../services/gemini.service';
import {
  ParsedSheetGrid,
  DetectedMonthBlock,
  ExtractedBillSummary,
  extractSheetsFromWorkbook,
  chooseBestSheetIndex,
  parseTextToGrid,
  extractSmartTableFromGrid,
  autoMapColumns
} from '../services/spreadsheet-smart-parser';

export interface ExcelImportReadingItem {
  storeId?: string;
  linkExistingStoreId?: string;
  newStore?: {
    luc: string;
    name: string;
    contrato?: string;
    meterNumber?: string;
  };
  reading: number;
  prevReadingFromSheet?: number;
  hasPrevInSystem?: boolean;
  calculatedConsumption: number;
  constant?: number;
  adjustment?: number;
  virtual?: number;
  adjustmentAdd?: number;
  fcm?: number;
  fluxoCost?: number;
  note?: string;
}

export interface ExcelImportSuccessEvent {
  updatedReadings: ExcelImportReadingItem[];
  billSummary?: ExtractedBillSummary;
  applyPreviousReadingsBaseline?: boolean;
}

@Component({
  selector: 'app-excel-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, CurrencyPipe],
  template: `
    @if (isOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4">
        <div class="absolute inset-0 bg-slate-950/75 backdrop-blur-sm animate-fade-in" (click)="onClose()"></div>

        <div class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-5xl relative z-10 border border-slate-200/90 dark:border-slate-800 overflow-hidden flex flex-col max-h-[93vh] animate-scale-in">

          <!-- TOP HEADER (Clean, moderno e temático por insumo) -->
          <div class="px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <div class="flex items-center gap-3.5 min-w-0">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                   [class]="utilityAccent().iconBox">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight leading-tight">
                    Importar Planilha
                  </h3>
                  <span class="px-2 py-0.5 rounded-md text-[11px] font-bold border"
                        [class]="utilityAccent().badge">
                    {{ utilityAccent().emoji }} {{ utilityAccent().label }}
                  </span>
                  @if (selectedMonth) {
                    <span class="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {{ selectedMonth }}
                    </span>
                  }
                  @if (activeStores.length === 0) {
                    <span class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                      ✨ Mês sem lojas · auto-cadastro ativo
                    </span>
                  }
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  Envie qualquer planilha (.xlsx, .xls, .csv) — inclusive a planilha mestre anual — ou cole do Excel.
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              @if (hasLoadedData()) {
                <button type="button"
                  (click)="resetLoadedSpreadsheet()"
                  class="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                  Trocar arquivo
                </button>
              }
              <button type="button"
                (click)="onClose()"
                aria-label="Fechar"
                class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- BODY -->
          <div class="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-slate-800 dark:text-slate-200 custom-scrollbar">

            <!-- ================================================================ -->
            <!-- ESTADO 1: ENTRADA DE DADOS (SUBIR ARQUIVO / COLAR / BAIXAR MODELO) -->
            <!-- ================================================================ -->
            @if (!hasLoadedData()) {
              <!-- Seletor de Modo Clean -->
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="inline-flex p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl border border-slate-200/80 dark:border-slate-700/80 gap-1">
                  <button type="button"
                    (click)="setInputMode('file')"
                    [class]="activeInputTab() === 'file'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'"
                    class="px-3.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Subir Arquivo</span>
                  </button>
                  <button type="button"
                    (click)="setInputMode('paste')"
                    [class]="activeInputTab() === 'paste'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'"
                    class="px-3.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>Colar do Excel</span>
                  </button>
                  <button type="button"
                    (click)="setInputMode('template')"
                    [class]="activeInputTab() === 'template'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'"
                    class="px-3.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Baixar Modelo</span>
                  </button>
                </div>

                <div class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  @if (effectiveStores().length > 0) {
                    <span>{{ effectiveStores().length }} loja(s) já cadastrada(s) em {{ utilityAccent().label }}</span>
                  } @else {
                    <span>Nenhuma loja cadastrada em {{ utilityAccent().label }} — o importador criará automaticamente</span>
                  }
                </div>
              </div>

              <!-- MODO 1: UPLOAD DE ARQUIVO -->
              @if (activeInputTab() === 'file') {
                <div
                  (dragover)="$event.preventDefault(); isDraggingFile.set(true)"
                  (dragleave)="isDraggingFile.set(false)"
                  (drop)="onExcelFileDrop($event)"
                  [class]="isDraggingFile()
                    ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/30 scale-[1.005]'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 hover:border-teal-500/80 hover:bg-slate-50 dark:hover:bg-slate-800/50'"
                  class="relative border-2 border-dashed rounded-2xl px-6 py-12 sm:py-14 text-center transition-all cursor-pointer group">

                  <input type="file"
                    accept=".xlsx, .xls, .csv"
                    (change)="onExcelFileSelected($event)"
                    class="absolute inset-0 opacity-0 cursor-pointer w-full h-full">

                  <div class="flex flex-col items-center justify-center gap-3 pointer-events-none max-w-md mx-auto">
                    <div class="w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-teal-600 dark:text-teal-400 group-hover:scale-105 transition-transform">
                      <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p class="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                        Arraste sua planilha aqui ou <span class="text-teal-600 dark:text-teal-400 underline underline-offset-2">clique para selecionar</span>
                      </p>
                      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Suporta <span class="font-mono font-semibold">.xlsx</span>, <span class="font-mono font-semibold">.xls</span> e <span class="font-mono font-semibold">.csv</span> — mesmo fora do padrão ou com várias abas.
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Chips de capacidades inteligentes -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-start gap-2">
                    <span class="text-teal-600 dark:text-teal-400 font-bold">✓</span>
                    <div>
                      <div class="font-bold text-slate-800 dark:text-slate-200">Planilha Mestre Anual</div>
                      <div class="text-slate-500 dark:text-slate-400 text-[10px]">Detecta meses e cabeçalho</div>
                    </div>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-start gap-2">
                    <span class="text-teal-600 dark:text-teal-400 font-bold">✓</span>
                    <div>
                      <div class="font-bold text-slate-800 dark:text-slate-200">Cria Lojas no Mês</div>
                      <div class="text-slate-500 dark:text-slate-400 text-[10px]">Funciona em mês vazio</div>
                    </div>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-start gap-2">
                    <span class="text-teal-600 dark:text-teal-400 font-bold">✓</span>
                    <div>
                      <div class="font-bold text-slate-800 dark:text-slate-200">Fatura & Consumo</div>
                      <div class="text-slate-500 dark:text-slate-400 text-[10px]">Puxa custos do topo</div>
                    </div>
                  </div>
                  <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-start gap-2">
                    <span class="text-teal-600 dark:text-teal-400 font-bold">✓</span>
                    <div>
                      <div class="font-bold text-slate-800 dark:text-slate-200">Água · Luz · Gás</div>
                      <div class="text-slate-500 dark:text-slate-400 text-[10px]">100% independentes</div>
                    </div>
                  </div>
                </div>
              }

              <!-- MODO 2: COLAR DADOS -->
              @if (activeInputTab() === 'paste') {
                <div class="space-y-3">
                  <div class="flex items-center justify-between gap-2">
                    <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Cole os dados copiados diretamente do Excel (Ctrl+C → Ctrl+V)
                    </label>
                    <span class="text-[11px] text-slate-400">Aceita planilha inteira ou colunas simples</span>
                  </div>
                  <textarea
                    [ngModel]="importPastedText()"
                    (ngModelChange)="importPastedText.set($event)"
                    rows="8"
                    placeholder="LUC	Contrato	Nome Fantasia	Leitura Atual&#10;1078	20000531	KFC	11477&#10;1095/1096	20000682	PETISKEIRA	809"
                    class="w-full p-3.5 font-mono text-xs border border-slate-300 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none">
                  </textarea>
                  <div class="flex justify-end">
                    <button type="button"
                      (click)="processPastedText()"
                      [disabled]="!importPastedText().trim()"
                      class="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer">
                      <span>⚡ Analisar Dados Colados</span>
                    </button>
                  </div>
                </div>
              }

              <!-- MODO 3: BAIXAR PLANILHA MODELO -->
              @if (activeInputTab() === 'template') {
                <div class="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4">
                  <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      📑
                    </div>
                    <div>
                      <h4 class="font-bold text-sm text-slate-900 dark:text-white">Gerar Planilha Modelo de Campo (.xlsx)</h4>
                      <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Útil se você quiser entregar uma planilha limpa para o técnico preencher em campo e depois subir aqui.
                        Atualmente existem <strong>{{ effectiveStores().length }} lojas</strong> prontas para exportação em {{ utilityAccent().label }}.
                      </p>
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-3 pt-1">
                    <div class="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                      <span class="text-slate-500 dark:text-slate-400 font-medium">Ordenar por:</span>
                      <select [ngModel]="templateSortOrder()"
                              (ngModelChange)="templateSortOrder.set($event)"
                              class="bg-transparent border-0 font-bold text-slate-800 dark:text-slate-200 text-xs focus:ring-0 cursor-pointer">
                        <option value="route">Rota de Leitura</option>
                        <option value="luc">Código LUC</option>
                        <option value="name">Nome da Loja (A-Z)</option>
                      </select>
                    </div>

                    <button type="button"
                      (click)="downloadImportTemplate()"
                      class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-2 cursor-pointer">
                      <span>⬇️ Baixar Modelo (.xlsx)</span>
                    </button>
                  </div>
                </div>
              }
            }

            <!-- ================================================================ -->
            <!-- ESTADO 2: DIAGNÓSTICO INTELIGENTE, OPÇÕES E PRÉ-VISUALIZAÇÃO     -->
            <!-- ================================================================ -->
            @if (hasLoadedData()) {

              <!-- Barra Compacta do Arquivo + Aba + Mês da Matriz -->
              <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2.5">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0 text-sm font-bold">
                      📄
                    </div>
                    <div class="min-w-0">
                      <div class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                        {{ importedFileName() || 'Dados Carregados' }}
                      </div>
                      <div class="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        @if (isMultiMonthMatrix()) {
                          <span class="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-bold">
                            Planilha Mestre Anual
                          </span>
                        }
                        @if (detectedHeaderRowIndex() >= 0) {
                          <span class="font-mono">Cabeçalho linha {{ detectedHeaderRowIndex() + 1 }}</span>
                        }
                        @if (ignoredNoiseRows() > 0) {
                          <span>· {{ ignoredNoiseRows() }} resumo(s) ignorado(s)</span>
                        }
                        @if (hiddenEmptyRowsCount() > 0) {
                          <span>· {{ hiddenEmptyRowsCount() }} linha(s) sem leitura ocultada(s)</span>
                        }
                      </div>
                    </div>
                  </div>

                  <!-- Seletores inline de Aba e Mês/Bloco -->
                  <div class="flex items-center gap-2 flex-wrap">
                    @if (workbookSheets().length > 1) {
                      <div class="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                        <span class="text-slate-400 font-semibold text-[11px]">Aba:</span>
                        <select
                          [ngModel]="selectedSheetIndex()"
                          (ngModelChange)="onSelectSheet($event)"
                          class="bg-transparent border-0 text-xs font-bold text-slate-800 dark:text-slate-100 focus:ring-0 cursor-pointer p-0 pr-5">
                          @for (sheet of workbookSheets(); track sheet.name; let i = $index) {
                            <option [ngValue]="i">{{ sheet.name }}</option>
                          }
                        </select>
                      </div>
                    }

                    @if (isMultiMonthMatrix() && detectedMonthBlocks().length > 0) {
                      <div class="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/80 text-xs">
                        <span class="text-indigo-500 dark:text-indigo-400 font-semibold text-[11px]">Bloco:</span>
                        <select
                          [ngModel]="selectedMonthBlockId()"
                          (ngModelChange)="onSelectMonthBlock($event)"
                          class="bg-transparent border-0 text-xs font-bold text-indigo-900 dark:text-indigo-200 focus:ring-0 cursor-pointer p-0 pr-5">
                          @for (block of detectedMonthBlocks(); track block.id) {
                            <option [value]="block.id">
                              {{ block.label }}{{ block.year ? ('/' + block.year) : '' }} ({{ block.readingsCount }} leit.)
                            </option>
                          }
                        </select>
                      </div>
                    }
                  </div>
                </div>

                @if (detectedUtility() && detectedUtility() !== utilityType) {
                  <div class="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-semibold text-xs flex items-center gap-2">
                    <span>⚠️</span>
                    <span>
                      Esta planilha parece ser de <strong>{{ detectedUtility() === 'luz' ? 'Energia/Luz' : (detectedUtility() === 'agua' ? 'Água' : 'Gás') }}</strong>, mas você abriu a importação na aba <strong>{{ utilityAccent().label }}</strong>.
                    </span>
                  </div>
                }
              </div>

              <!-- PAINEL DE RESUMO EXECUTIVO (Cards Modernos + Toggles Inteligentes) -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <!-- Card 1: Lojas a Importar -->
                <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between gap-2">
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Lojas a Importar</span>
                    <span class="text-lg font-black font-mono text-teal-600 dark:text-teal-400">{{ importStats().readyToImport }}</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5 text-[10px] font-bold">
                    @if (importStats().matched > 0) {
                      <span class="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70">
                        ✓ {{ importStats().matched }} cadastrada(s)
                      </span>
                    }
                    @if (importStats().willLink > 0) {
                      <span class="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/70">
                        🔗 {{ importStats().willLink }} vincular a {{ utilityAccent().label }}
                      </span>
                    }
                    @if (importStats().willCreate > 0) {
                      <span class="px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/70">
                        ✨ {{ importStats().willCreate }} nova(s)
                      </span>
                    }
                    @if (importStats().unmatched > 0) {
                      <span class="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/70">
                        ✕ {{ importStats().unmatched }} ignorada(s)
                      </span>
                    }
                  </div>
                </div>

                <!-- Card 2: Fatura Extraída (ou status sem fatura) -->
                @if (extractedBillSummary(); as bs) {
                  <label class="p-3.5 rounded-2xl border transition-colors cursor-pointer flex flex-col justify-between gap-2"
                         [class]="applyBillSummary()
                           ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                           : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-75'">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        Fatura da Concessionária
                      </span>
                      <input type="checkbox"
                        [ngModel]="applyBillSummary()"
                        (ngModelChange)="applyBillSummary.set($event)"
                        class="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer">
                    </div>
                    <div class="space-y-0.5">
                      @if (bs.costItems.length > 0) {
                        <div class="font-extrabold font-mono text-sm text-emerald-900 dark:text-emerald-200">
                          {{ bs.totalBillFromItems | currency:'BRL' }}
                          <span class="text-[10px] font-sans font-semibold text-emerald-700/80 dark:text-emerald-400">
                            ({{ bs.costItems.length }} {{ bs.costItems.length === 1 ? 'item' : 'itens' }})
                          </span>
                        </div>
                      }
                      <div class="text-[11px] font-mono text-emerald-800/90 dark:text-emerald-300/90 flex items-center gap-2 flex-wrap">
                        @if (bs.totalConsumption) {
                          <span>{{ bs.totalConsumption | number:'1.0-2' }} {{ unit }}</span>
                        }
                        @if (bs.acConsumption) {
                          <span>· AC {{ bs.acConsumption | number:'1.0-0' }} {{ unit }}</span>
                        }
                      </div>
                    </div>
                  </label>
                } @else {
                  <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-1">
                    <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Escopo da Planilha</span>
                    <p class="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      Apenas medições das lojas (sem tabela de custos da fatura no topo).
                    </p>
                  </div>
                }

                <!-- Card 3: Controles Inteligentes -->
                <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-center gap-2 text-[11px]">
                  <label class="flex items-start gap-2 cursor-pointer text-slate-700 dark:text-slate-200 font-semibold">
                    <input type="checkbox"
                      [ngModel]="autoCreateMissingStores()"
                      (ngModelChange)="autoCreateMissingStores.set($event)"
                      class="mt-0.5 rounded text-violet-600 focus:ring-violet-500 cursor-pointer">
                    <span>Criar/vincular lojas faltantes em <strong>{{ utilityAccent().label }}</strong></span>
                  </label>

                  <label class="flex items-start gap-2 cursor-pointer text-slate-700 dark:text-slate-200 font-semibold">
                    <input type="checkbox"
                      [ngModel]="skipEmptyReadings()"
                      (ngModelChange)="skipEmptyReadings.set($event)"
                      class="mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer">
                    <span>Somente lojas com leitura/consumo</span>
                  </label>

                  @if (importStats().missingPrevBaselineCount > 0) {
                    <label class="flex items-start gap-2 cursor-pointer text-indigo-700 dark:text-indigo-300 font-semibold">
                      <input type="checkbox"
                        [ngModel]="applyPreviousReadingsBaseline()"
                        (ngModelChange)="applyPreviousReadingsBaseline.set($event)"
                        class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer">
                      <span>Gravar {{ importStats().missingPrevBaselineCount }} leitura(s) anterior(es) como base</span>
                    </label>
                  }
                </div>
              </div>

              <!-- GAVETA COLAPSÁVEL DE MAPEAMENTO DE COLUNAS -->
              <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 overflow-hidden">
                <div class="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2 flex-wrap min-w-0 text-xs">
                    <span class="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <span>⚙️</span>
                      <span>Colunas:</span>
                    </span>
                    @for (chip of activeMappedChips(); track chip.label) {
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <strong class="text-slate-400 font-sans">{{ chip.label }}:</strong> {{ chip.value }}
                      </span>
                    }
                    @if (!columnMappings().luc || !columnMappings().reading) {
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
                        ⚠️ Selecione LUC e Leitura
                      </span>
                    }
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    @if (canUseAiMapping()) {
                      <button type="button"
                        (click)="mapColumnsWithAi()"
                        [disabled]="isAiMapping()"
                        class="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold flex items-center gap-1 cursor-pointer transition-colors">
                        <span>{{ isAiMapping() ? '⏳' : '✨' }}</span>
                        <span>{{ isAiMapping() ? 'Mapeando...' : 'IA' }}</span>
                      </button>
                    }
                    <button type="button"
                      (click)="showColumnMapping.set(!showColumnMapping())"
                      class="text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                      {{ showColumnMapping() ? 'Ocultar colunas ▲' : 'Ajustar colunas ▼' }}
                    </button>
                  </div>
                </div>

                @if (aiMappingFeedback()) {
                  <div class="px-3.5 pb-2.5 text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">
                    {{ aiMappingFeedback() }}
                  </div>
                }

                @if (showColumnMapping()) {
                  <div class="px-3.5 pb-3.5 pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">LUC / Código *</label>
                      <select [ngModel]="columnMappings().luc" (ngModelChange)="updateColumnMapping('luc', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Selecione --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Nome da Loja</label>
                      <select [ngModel]="columnMappings().storeName" (ngModelChange)="updateColumnMapping('storeName', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Leitura Atual *</label>
                      <select [ngModel]="columnMappings().reading" (ngModelChange)="updateColumnMapping('reading', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Selecione --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Leitura Anterior</label>
                      <select [ngModel]="columnMappings().prevReading" (ngModelChange)="updateColumnMapping('prevReading', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Consumo Virtual</label>
                      <select [ngModel]="columnMappings().virtual" (ngModelChange)="updateColumnMapping('virtual', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Constante / TC</label>
                      <select [ngModel]="columnMappings().constant" (ngModelChange)="updateColumnMapping('constant', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Ajuste (x)</label>
                      <select [ngModel]="columnMappings().adjustment" (ngModelChange)="updateColumnMapping('adjustment', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Ajuste (+) R$</label>
                      <select [ngModel]="columnMappings().adjustmentAdd" (ngModelChange)="updateColumnMapping('adjustmentAdd', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">FCM (Gás)</label>
                      <select [ngModel]="columnMappings().fcm" (ngModelChange)="updateColumnMapping('fcm', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Rec. Fluxo (R$)</label>
                      <select [ngModel]="columnMappings().fluxoCost" (ngModelChange)="updateColumnMapping('fluxoCost', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Nº Contrato</label>
                      <select [ngModel]="columnMappings().contrato" (ngModelChange)="updateColumnMapping('contrato', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                    <div>
                      <label class="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Observação</label>
                      <select [ngModel]="columnMappings().note" (ngModelChange)="updateColumnMapping('note', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) { <option [value]="h">{{ h }}</option> }
                      </select>
                    </div>
                  </div>
                }
              </div>

              <!-- TABELA DE PRÉVIA COM FILTROS E BUSCA -->
              <div class="space-y-2.5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <!-- Filter Pills -->
                  <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-[11px] font-bold">
                    <button type="button"
                      (click)="previewStatusFilter.set('all')"
                      [class]="previewStatusFilter() === 'all' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                      class="px-2.5 py-1 rounded-lg transition-all cursor-pointer">
                      Todas ({{ importPreviewList().length }})
                    </button>
                    @if (importStats().willCreate + importStats().willLink > 0) {
                      <button type="button"
                        (click)="previewStatusFilter.set('new_or_link')"
                        [class]="previewStatusFilter() === 'new_or_link' ? 'bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                        class="px-2.5 py-1 rounded-lg transition-all cursor-pointer">
                        Novas / Vincular ({{ importStats().willCreate + importStats().willLink }})
                      </button>
                    }
                    @if (importStats().matched > 0) {
                      <button type="button"
                        (click)="previewStatusFilter.set('matched')"
                        [class]="previewStatusFilter() === 'matched' ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                        class="px-2.5 py-1 rounded-lg transition-all cursor-pointer">
                        Cadastradas ({{ importStats().matched }})
                      </button>
                    }
                    @if (importStats().unmatched > 0) {
                      <button type="button"
                        (click)="previewStatusFilter.set('unmatched')"
                        [class]="previewStatusFilter() === 'unmatched' ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
                        class="px-2.5 py-1 rounded-lg transition-all cursor-pointer">
                        Ignoradas ({{ importStats().unmatched }})
                      </button>
                    }
                  </div>

                  <!-- Busca Rápida -->
                  <div class="relative w-full sm:w-56">
                    <input type="text"
                      [ngModel]="previewSearch()"
                      (ngModelChange)="previewSearch.set($event)"
                      placeholder="Filtrar LUC ou loja..."
                      class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none">
                    <svg class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                <div class="overflow-x-auto max-h-[320px] rounded-2xl border border-slate-200 dark:border-slate-800 custom-scrollbar">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead class="bg-slate-50 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 sticky top-0 text-[10px] uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-700 z-10">
                      <tr>
                        <th class="px-3 py-2.5">Ação</th>
                        <th class="px-3 py-2.5">LUC</th>
                        <th class="px-3 py-2.5">Loja</th>
                        <th class="px-3 py-2.5 text-right">Leit. Ant.</th>
                        <th class="px-3 py-2.5 text-right">Leit. Atual</th>
                        <th class="px-3 py-2.5 text-right">Consumo Prev.</th>
                        <th class="px-3 py-2.5">Parâmetros</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-[11px]">
                      @for (row of filteredPreviewList(); track $index) {
                        <tr class="transition-colors"
                            [class]="row.status === 'unmatched'
                              ? 'bg-rose-50/40 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'">
                          <td class="px-3 py-2 whitespace-nowrap">
                            @if (row.status === 'matched') {
                              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                                ✓ Pronta
                              </span>
                            } @else if (row.status === 'will_link') {
                              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 font-bold text-[10px]" [title]="row.message">
                                🔗 Vincular
                              </span>
                            } @else if (row.status === 'will_create') {
                              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-950/80 text-violet-800 dark:text-violet-300 font-bold text-[10px]" [title]="row.message">
                                ✨ Nova Loja
                              </span>
                            } @else {
                              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 font-bold text-[10px]" [title]="row.message">
                                ✕ Ignorada
                              </span>
                            }
                          </td>
                          <td class="px-3 py-2 font-mono font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                            {{ row.luc }}
                          </td>
                          <td class="px-3 py-2 font-medium text-slate-800 dark:text-slate-100 max-w-[210px] truncate" [title]="row.storeName">
                            <div>{{ row.storeName }}</div>
                            @if (row.contrato) {
                              <div class="text-[10px] font-mono text-slate-400">Ctr {{ row.contrato }}</div>
                            }
                          </td>
                          <td class="px-3 py-2 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {{ row.prevReading | number:'1.0-2' }}
                          </td>
                          <td class="px-3 py-2 text-right font-mono tabular-nums font-bold text-teal-700 dark:text-teal-300 whitespace-nowrap">
                            {{ row.reading | number:'1.0-2' }}
                          </td>
                          <td class="px-3 py-2 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {{ row.consumptionPreview | number:'1.0-2' }} <span class="text-[10px] font-normal text-slate-400">{{ unit }}</span>
                          </td>
                          <td class="px-3 py-2">
                            <div class="flex items-center gap-1 flex-wrap text-[10px] font-mono">
                              @if (row.virtual !== undefined) {
                                <span class="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300">Virt {{ row.virtual }}</span>
                              }
                              @if (columnMappings().constant && row.constant && row.constant !== 1) {
                                <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">TC {{ row.constant }}</span>
                              }
                              @if (columnMappings().adjustment && row.adjustment && row.adjustment !== 1) {
                                <span class="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">Aj(x) {{ row.adjustment | number:'1.0-3' }}</span>
                              }
                              @if (columnMappings().adjustmentAdd && row.adjustmentAdd && row.adjustmentAdd > 0) {
                                <span class="px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/70 text-orange-800 dark:text-orange-300">+R$ {{ row.adjustmentAdd | number:'1.2-2' }}</span>
                              }
                              @if (columnMappings().fcm && row.fcm && row.fcm !== 1) {
                                <span class="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300">FCM {{ row.fcm | number:'1.0-4' }}</span>
                              }
                              @if (columnMappings().fluxoCost && row.fluxoCost && row.fluxoCost > 0) {
                                <span class="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">Fluxo {{ row.fluxoCost | number:'1.2-2' }}</span>
                              }
                              @if (row.note) {
                                <span class="font-sans text-slate-500 truncate max-w-[120px]" [title]="row.note">{{ row.note }}</span>
                              }
                            </div>
                          </td>
                        </tr>
                      } @empty {
                        <tr>
                          <td colspan="7" class="p-8 text-center text-slate-400 text-xs">
                            Nenhuma loja encontrada com os filtros atuais.
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          </div>

          <!-- FOOTER FIXO -->
          <div class="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div class="text-xs text-slate-500 dark:text-slate-400">
              @if (hasLoadedData() && importStats().readyToImport > 0) {
                <span>
                  Importará <strong class="text-slate-800 dark:text-slate-100">{{ importStats().readyToImport }} loja(s)</strong>
                  @if (importStats().willCreate + importStats().willLink > 0) {
                    <span> ({{ importStats().willLink + importStats().willCreate }} adicionada(s) em {{ utilityAccent().label }})</span>
                  }
                  @if (applyBillSummary() && extractedBillSummary()) {
                    <span> + <strong class="text-emerald-700 dark:text-emerald-400">Fatura</strong></span>
                  }
                </span>
              } @else {
                <span>Nenhuma alteração será aplicada até você confirmar.</span>
              }
            </div>

            <div class="flex items-center gap-2.5">
              <button type="button"
                (click)="onClose()"
                class="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer">
                Cancelar
              </button>

              @if (hasLoadedData()) {
                <button type="button"
                  (click)="confirmAndApplyImport()"
                  [disabled]="importStats().readyToImport === 0"
                  class="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold transition-all shadow-sm flex items-center gap-2 cursor-pointer">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>
                    Importar {{ importStats().readyToImport }} {{ importStats().readyToImport === 1 ? 'Loja' : 'Lojas' }}@if (applyBillSummary() && extractedBillSummary()) { + Fatura }
                  </span>
                </button>
              }
            </div>
          </div>

        </div>
      </div>
    }
  `
})
export class ExcelImportModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() utilityType: UtilityType = 'luz';
  @Input() selectedMonth = '';
  @Input() activeStores: Store[] = [];
  @Input() allStores: Store[] = [];
  @Input() previousReadings: Map<string, { reading: number; consumption: number }> = new Map();
  @Input() unit = '';

  @Output() close = new EventEmitter<void>();
  @Output() importSuccess = new EventEmitter<ExcelImportSuccessEvent>();

  constructor(@Optional() private geminiService?: GeminiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    const openedNow = Boolean(changes['isOpen'] && changes['isOpen'].currentValue === true && !changes['isOpen'].previousValue);
    const contextChanged = Boolean(
      (changes['utilityType'] && !changes['utilityType'].firstChange) ||
      (changes['selectedMonth'] && !changes['selectedMonth'].firstChange)
    );
    if (openedNow || contextChanged) {
      this.resetLoadedSpreadsheet();
      this.activeInputTab.set('file');
      this.importPastedText.set('');
    }
  }

  // Input & UI State
  activeInputTab = signal<'file' | 'paste' | 'template'>('file');
  importMethod = signal<'file' | 'paste'>('file');
  importedFileName = signal<string>('');
  importPastedText = signal<string>('');
  templateSortOrder = signal<'route' | 'luc' | 'name'>('route');
  rawExcelHeaders = signal<string[]>([]);
  rawExcelRows = signal<Record<string, any>[]>([]);
  workbookSheets = signal<ParsedSheetGrid[]>([]);
  selectedSheetIndex = signal<number>(0);
  isMultiMonthMatrix = signal<boolean>(false);
  detectedMonthBlocks = signal<DetectedMonthBlock[]>([]);
  selectedMonthBlockId = signal<string | null>(null);
  detectedHeaderRowIndex = signal<number>(-1);
  detectedUtility = signal<UtilityType | null>(null);
  ignoredNoiseRows = signal<number>(0);
  extractedBillSummary = signal<ExtractedBillSummary | null>(null);
  applyBillSummary = signal<boolean>(true);
  skipEmptyReadings = signal<boolean>(true);
  autoCreateMissingStores = signal<boolean>(true);
  applyPreviousReadingsBaseline = signal<boolean>(true);
  showColumnMapping = signal<boolean>(false);
  showAdvancedMappings = signal<boolean>(false);
  previewStatusFilter = signal<'all' | 'new_or_link' | 'matched' | 'unmatched'>('all');
  previewSearch = signal<string>('');
  isAiMapping = signal<boolean>(false);
  aiMappingFeedback = signal<string>('');
  columnMappings = signal<Record<string, string>>({
    luc: '',
    storeName: '',
    contrato: '',
    meterNumber: '',
    prevReading: '',
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

  hasLoadedData = computed(() => this.rawExcelHeaders().length > 0 && this.rawExcelRows().length > 0);

  utilityAccent = computed(() => {
    if (this.utilityType === 'agua') {
      return {
        emoji: '💧',
        label: 'Água',
        iconBox: 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400',
        badge: 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300'
      };
    }
    if (this.utilityType === 'gas') {
      return {
        emoji: '🔥',
        label: 'Gás',
        iconBox: 'bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400',
        badge: 'bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300'
      };
    }
    return {
      emoji: '⚡',
      label: 'Energia',
      iconBox: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400',
      badge: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
    };
  });

  activeMappedChips = computed(() => {
    const m = this.columnMappings();
    const list: Array<{ label: string; value: string }> = [];
    if (m.luc) list.push({ label: 'LUC', value: m.luc });
    if (m.storeName) list.push({ label: 'Loja', value: m.storeName });
    if (m.reading) list.push({ label: 'Leitura', value: m.reading });
    if (m.prevReading) list.push({ label: 'Ant.', value: m.prevReading });
    if (m.virtual) list.push({ label: 'Virtual', value: m.virtual });
    if (m.constant) list.push({ label: 'TC', value: m.constant });
    if (m.adjustment) list.push({ label: 'Aj(x)', value: m.adjustment });
    if (m.adjustmentAdd) list.push({ label: 'Aj(+)', value: m.adjustmentAdd });
    if (m.fcm) list.push({ label: 'FCM', value: m.fcm });
    if (m.fluxoCost) list.push({ label: 'Fluxo', value: m.fluxoCost });
    return list;
  });

  setInputMode(tab: 'file' | 'paste' | 'template') {
    this.activeInputTab.set(tab);
    if (tab === 'file' || tab === 'paste') {
      this.importMethod.set(tab);
    }
  }

  // Lista efetiva de lojas já vinculadas a esta utilidade
  effectiveStores = computed<Store[]>(() => {
    if (this.activeStores && this.activeStores.length > 0) {
      return this.activeStores;
    }

    const type = this.utilityType;
    const all = this.allStores || [];

    const activeRegistered = all.filter(s => {
      const usesUtil = type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
      return usesUtil && s.active !== false;
    });
    if (activeRegistered.length > 0) {
      return activeRegistered;
    }

    return all.filter(s => {
      return type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
    });
  });

  // Análise completa de todas as linhas da planilha
  private analyzedRows = computed<ExcelImportRowPreview[]>(() => {
    const rows = this.rawExcelRows();
    if (rows.length === 0) return [];

    const mappings = this.columnMappings();
    const utilityStores = this.effectiveStores();
    const allCatalogStores = this.allStores || [];
    const prevReadings = this.previousReadings;
    const type = this.utilityType;
    const allowAutoCreate = this.autoCreateMissingStores();

    const normalizeKey = (s: any) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]/gi, '');

    const findMatchInPool = (
      pool: Store[],
      rawLucVal: string,
      rawNameVal: string,
      normLucVal: string,
      normContrVal: string,
      normMeterVal: string,
      normNameVal: string,
      allowFuzzyName: boolean
    ): Store | undefined => {
      if (pool.length === 0) return undefined;
      return (
        (normLucVal && normContrVal
          ? pool.find(s => normalizeLuc(s.luc) === normLucVal && normalizeContract(s.contrato) === normContrVal)
          : undefined) ||
        (normContrVal
          ? pool.find(s => normalizeContract(s.contrato) === normContrVal)
          : undefined) ||
        (normMeterVal
          ? pool.find(s => s.meterNumber && normalizeKey(s.meterNumber) === normMeterVal)
          : undefined) ||
        (normLucVal
          ? pool.find(s => normalizeLuc(s.luc) === normLucVal)
          : undefined) ||
        (normNameVal
          ? pool.find(s => normalizeStoreName(s.name) === normNameVal)
          : undefined) ||
        (allowFuzzyName
          ? pool.find(s => {
              const sContr = s.contrato ? normalizeKey(s.contrato) : '';
              const sMeter = s.meterNumber ? normalizeKey(s.meterNumber) : '';
              const sName = normalizeStoreName(s.name);
              const rawLucKey = normalizeKey(rawLucVal);

              if (rawLucKey) {
                if (sContr && sContr === rawLucKey) return true;
                if (sMeter && sMeter === rawLucKey) return true;
                if (sName && sName === normalizeStoreName(rawLucVal)) return true;
                if (rawLucVal.length >= 3 && s.name && s.name.toLowerCase().includes(rawLucVal.toLowerCase())) return true;
              }
              if (rawNameVal.length >= 3 && s.name && s.name.toLowerCase().includes(rawNameVal.toLowerCase())) return true;
              return false;
            })
          : undefined)
      );
    };

    return rows.map((rawRow, idx) => {
      const rawLucVal = mappings.luc ? String(rawRow[mappings.luc] ?? '').trim() : '';
      const rawNameVal = mappings.storeName ? String(rawRow[mappings.storeName] ?? '').trim() : '';
      const rawContratoVal = mappings.contrato ? String(rawRow[mappings.contrato] ?? '').trim() : '';
      const rawMeterVal = mappings.meterNumber ? String(rawRow[mappings.meterNumber] ?? '').trim() : '';
      const rawReadingVal = mappings.reading ? rawRow[mappings.reading] : '';
      const reading = this.parseExcelNumber(rawReadingVal);

      const normLucVal = normalizeLuc(rawLucVal);
      const normContrVal = normalizeContract(rawContratoVal);
      const normMeterVal = normalizeKey(rawMeterVal);
      const normNameVal = normalizeStoreName(rawNameVal);

      // Camada 1: Loja já cadastrada nesta utilidade
      const matchedStore = findMatchInPool(
        utilityStores, rawLucVal, rawNameVal, normLucVal, normContrVal, normMeterVal, normNameVal, true
      );

      // Camada 2: Loja já existe no catálogo geral (ex: Luz/Água), pronta para vincular a esta utilidade
      let catalogStore: Store | undefined;
      if (!matchedStore && allCatalogStores.length > 0) {
        const activePool = allCatalogStores.filter(s => s.active !== false);
        catalogStore =
          findMatchInPool(activePool, rawLucVal, rawNameVal, normLucVal, normContrVal, normMeterVal, normNameVal, false) ||
          findMatchInPool(allCatalogStores, rawLucVal, rawNameVal, normLucVal, normContrVal, normMeterVal, normNameVal, false);
      }

      const refStore = matchedStore || catalogStore;

      let prevData = refStore ? prevReadings.get(refStore.id) : null;
      if (!prevData && refStore) {
        const nLuc = normalizeLuc(refStore.luc);
        const nContr = normalizeContract(refStore.contrato);
        const nName = normalizeStoreName(refStore.name);
        if (nLuc && nContr && prevReadings.has(`luc_contrato:${nLuc}_${nContr}`)) {
          prevData = prevReadings.get(`luc_contrato:${nLuc}_${nContr}`)!;
        } else if (nLuc && nName && prevReadings.has(`luc_name:${nLuc}_${nName}`)) {
          prevData = prevReadings.get(`luc_name:${nLuc}_${nName}`)!;
        } else if (nLuc && prevReadings.has(`luc:${nLuc}`)) {
          prevData = prevReadings.get(`luc:${nLuc}`)!;
        } else if (nContr && prevReadings.has(`contrato:${nContr}`)) {
          prevData = prevReadings.get(`contrato:${nContr}`)!;
        } else if (nName && prevReadings.has(`name:${nName}`)) {
          prevData = prevReadings.get(`name:${nName}`)!;
        }
      }
      if (!prevData && normLucVal) {
        const nLuc = normalizeLuc(rawLucVal);
        const nContr = normalizeContract(rawLucVal);
        const nName = normalizeStoreName(rawLucVal);
        if (nLuc && prevReadings.has(`luc:${nLuc}`)) {
          prevData = prevReadings.get(`luc:${nLuc}`)!;
        } else if (nContr && prevReadings.has(`contrato:${nContr}`)) {
          prevData = prevReadings.get(`contrato:${nContr}`)!;
        } else if (nName && prevReadings.has(`name:${nName}`)) {
          prevData = prevReadings.get(`name:${nName}`)!;
        }
      }

      const hasPrevInSystem = Boolean(prevData && prevData.reading > 0);
      const sheetPrevReading = mappings.prevReading ? this.parseExcelNumber(rawRow[mappings.prevReading]) : 0;
      const prevReading = hasPrevInSystem ? prevData!.reading : sheetPrevReading;
      const diff = calculateReadingDifference(reading, prevReading, false);

      const rawConst = mappings.constant ? this.parseExcelNumber(rawRow[mappings.constant], false) : 1;
      const constant = rawConst > 0 ? rawConst : 1;
      const rawAdj = mappings.adjustment ? this.parseExcelNumber(rawRow[mappings.adjustment], true) : 0;
      const adjustment = rawAdj > 0 ? rawAdj : (type === 'gas' ? 1.347 : 1);
      const virtual = mappings.virtual ? this.parseExcelOptionalNumber(rawRow[mappings.virtual]) : undefined;
      const adjustmentAdd = mappings.adjustmentAdd ? this.parseExcelNumber(rawRow[mappings.adjustmentAdd], true) : 0;
      const rawFcm = mappings.fcm ? this.parseExcelNumber(rawRow[mappings.fcm], true) : 0;
      const fcm = rawFcm > 0 ? rawFcm : 1.0727;
      const fluxoCost = mappings.fluxoCost ? this.parseExcelNumber(rawRow[mappings.fluxoCost], false) : 0;
      const note = mappings.note ? String(rawRow[mappings.note] ?? '').trim() : '';

      const hasActivity =
        reading > 0 ||
        virtual !== undefined ||
        Boolean(note) ||
        fluxoCost > 0 ||
        adjustmentAdd > 0;

      let consumptionPreview = 0;
      if (virtual !== undefined) {
        consumptionPreview = virtual;
      } else if (type === 'gas') {
        consumptionPreview = diff * adjustment * fcm;
      } else {
        consumptionPreview = diff * constant * adjustment;
      }

      if (matchedStore) {
        return {
          rawRow,
          matchedStore,
          storeName: matchedStore.name,
          luc: matchedStore.luc,
          contrato: matchedStore.contrato || rawContratoVal || undefined,
          meterNumber: matchedStore.meterNumber || rawMeterVal || undefined,
          routeOrder: matchedStore.routeOrder,
          reading,
          prevReading,
          sheetPrevReading,
          hasPrevInSystem,
          consumptionPreview,
          constant,
          adjustment,
          virtual,
          adjustmentAdd,
          fcm,
          fluxoCost,
          note,
          hasActivity,
          status: 'matched' as const,
          message: virtual !== undefined
            ? `Consumo Virtual: ${virtual} ${this.unit}`
            : (reading > 0 ? `Leitura: ${reading} (${consumptionPreview.toFixed(1)} ${this.unit})` : 'Leitura zerada')
        };
      }

      if (catalogStore && allowAutoCreate) {
        return {
          rawRow,
          catalogStore,
          storeName: catalogStore.name,
          luc: catalogStore.luc,
          contrato: rawContratoVal || catalogStore.contrato || undefined,
          meterNumber: rawMeterVal || catalogStore.meterNumber || undefined,
          routeOrder: catalogStore.routeOrder,
          reading,
          prevReading,
          sheetPrevReading,
          hasPrevInSystem,
          consumptionPreview,
          constant,
          adjustment,
          virtual,
          adjustmentAdd,
          fcm,
          fluxoCost,
          note,
          hasActivity,
          status: 'will_link' as const,
          message: `Loja encontrada no catálogo geral — será vinculada a ${this.utilityAccent().label} neste mês`
        };
      }

      const canCreateFromRow = Boolean(rawLucVal || rawContratoVal) && Boolean(rawNameVal || rawLucVal);
      if (canCreateFromRow && allowAutoCreate) {
        return {
          rawRow,
          storeName: rawNameVal || rawLucVal,
          luc: rawLucVal || rawContratoVal,
          contrato: rawContratoVal || undefined,
          meterNumber: rawMeterVal || undefined,
          reading,
          prevReading,
          sheetPrevReading,
          hasPrevInSystem,
          consumptionPreview,
          constant,
          adjustment,
          virtual,
          adjustmentAdd,
          fcm,
          fluxoCost,
          note,
          hasActivity,
          status: 'will_create' as const,
          message: `Nova loja será cadastrada automaticamente em ${this.utilityAccent().label} para ${this.selectedMonth || 'este mês'}`
        };
      }

      return {
        rawRow,
        storeName: rawNameVal || rawLucVal || `Linha ${idx + 1}`,
        luc: rawLucVal || '—',
        contrato: rawContratoVal || undefined,
        reading,
        prevReading: 0,
        sheetPrevReading,
        hasPrevInSystem: false,
        consumptionPreview: 0,
        hasActivity,
        status: 'unmatched' as const,
        message: !allowAutoCreate
          ? 'Auto-cadastro desativado e loja não localizada neste insumo'
          : (rawLucVal ? 'Dados insuficientes para cadastrar loja' : 'Coluna de identificação vazia')
      };
    });
  });

  hiddenEmptyRowsCount = computed(() => {
    const all = this.analyzedRows();
    if (!this.skipEmptyReadings()) return 0;
    const active = all.filter(r => r.hasActivity);
    if (active.length === 0) return 0;
    return all.length - active.length;
  });

  importPreviewList = computed<ExcelImportRowPreview[]>(() => {
    const all = this.analyzedRows();
    let list = all;

    if (this.skipEmptyReadings()) {
      const populated = all.filter(r => r.hasActivity);
      if (populated.length > 0) {
        list = populated;
      }
    }

    const rank = (s: ExcelImportRowPreview['status']) =>
      s === 'matched' ? 0 : (s === 'will_link' ? 1 : (s === 'will_create' ? 2 : 3));

    return [...list].sort((a, b) => {
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      if (a.status !== 'unmatched' && b.status !== 'unmatched') {
        const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
        const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.luc || '').localeCompare(b.luc || '', undefined, { numeric: true });
      }
      return 0;
    });
  });

  filteredPreviewList = computed<ExcelImportRowPreview[]>(() => {
    let list = this.importPreviewList();
    const filter = this.previewStatusFilter();
    if (filter === 'matched') {
      list = list.filter(r => r.status === 'matched');
    } else if (filter === 'new_or_link') {
      list = list.filter(r => r.status === 'will_link' || r.status === 'will_create');
    } else if (filter === 'unmatched') {
      list = list.filter(r => r.status === 'unmatched');
    }

    const q = this.previewSearch().trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        (r.luc || '').toLowerCase().includes(q) ||
        (r.storeName || '').toLowerCase().includes(q) ||
        (r.contrato || '').toLowerCase().includes(q)
      );
    }
    return list;
  });

  importStats = computed(() => {
    const list = this.importPreviewList();
    const total = list.length;
    const matched = list.filter(r => r.status === 'matched').length;
    const willLink = list.filter(r => r.status === 'will_link').length;
    const willCreate = list.filter(r => r.status === 'will_create').length;
    const unmatched = list.filter(r => r.status === 'unmatched').length;
    const readyToImport = matched + willLink + willCreate;
    const withReading = list.filter(r => r.status !== 'unmatched' && r.hasActivity).length;
    const missingPrevBaselineCount = list.filter(
      r => r.status !== 'unmatched' && !r.hasPrevInSystem && (r.sheetPrevReading || 0) > 0
    ).length;

    return {
      total,
      matched,
      willLink,
      willCreate,
      unmatched,
      readyToImport,
      withReading,
      missingPrevBaselineCount
    };
  });

  onClose() {
    this.close.emit();
  }

  resetLoadedSpreadsheet() {
    this.importedFileName.set('');
    this.rawExcelHeaders.set([]);
    this.rawExcelRows.set([]);
    this.workbookSheets.set([]);
    this.selectedSheetIndex.set(0);
    this.isMultiMonthMatrix.set(false);
    this.detectedMonthBlocks.set([]);
    this.selectedMonthBlockId.set(null);
    this.detectedHeaderRowIndex.set(-1);
    this.detectedUtility.set(null);
    this.ignoredNoiseRows.set(0);
    this.extractedBillSummary.set(null);
    this.aiMappingFeedback.set('');
    this.previewStatusFilter.set('all');
    this.previewSearch.set('');
    this.showColumnMapping.set(false);
  }

  updateColumnMapping(field: string, headerName: string) {
    this.columnMappings.update(curr => ({ ...curr, [field]: headerName }));
  }

  generateImportTemplateWorkbook(): { workbook: XLSX.WorkBook; filename: string } {
    const type = this.utilityType;
    const stores = this.effectiveStores();
    const prevReadings = this.previousReadings;
    const month = this.selectedMonth;
    const mode = this.templateSortOrder();

    const sortedStores = [...stores].sort((a, b) => {
      if (mode === 'route') {
        const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
        const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.luc || '').localeCompare(b.luc || '', undefined, { numeric: true });
      } else if (mode === 'luc') {
        return (a.luc || '').localeCompare(b.luc || '', undefined, { numeric: true });
      } else {
        return (a.name || '').localeCompare(b.name || '');
      }
    });

    const rows = sortedStores.map(s => {
      const nLuc = normalizeLuc(s.luc);
      const nContr = normalizeContract(s.contrato);
      const nName = normalizeStoreName(s.name);
      const p = prevReadings.get(s.id)
        || (nLuc && nContr ? prevReadings.get(`luc_contrato:${nLuc}_${nContr}`) : undefined)
        || (nLuc && nName ? prevReadings.get(`luc_name:${nLuc}_${nName}`) : undefined)
        || (nLuc ? prevReadings.get(`luc:${nLuc}`) : undefined)
        || (nContr ? prevReadings.get(`contrato:${nContr}`) : undefined)
        || (nName ? prevReadings.get(`name:${nName}`) : undefined)
        || { reading: 0, consumption: 0 };

      return {
        'LUC': s.luc || '',
        'Nome da Loja': s.name || '',
        'Contrato': s.contrato || '',
        'Leitura Anterior': p.reading || 0,
        'Leitura Atual': '',
      };
    });

    if (rows.length === 0) {
      rows.push({
        'LUC': 'LUC-001',
        'Nome da Loja': 'Loja Exemplo',
        'Contrato': '1001',
        'Leitura Anterior': 100,
        'Leitura Atual': '',
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 35 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, `Leituras_${type.toUpperCase()}`);
    return {
      workbook: wb,
      filename: `Planilha_Leituras_${type.toUpperCase()}_${month}.xlsx`
    };
  }

  downloadImportTemplate() {
    const { workbook, filename } = this.generateImportTemplateWorkbook();
    XLSX.writeFile(workbook, filename);
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
    this.aiMappingFeedback.set('');
    this.previewStatusFilter.set('all');
    this.previewSearch.set('');
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        if (isCsv) {
          const text = String(e.target?.result || '');
          const grid = parseTextToGrid(text);
          if (grid.length === 0) {
            alert('A planilha selecionada está vazia.');
            return;
          }
          this.workbookSheets.set([{ name: file.name, grid }]);
          this.selectedSheetIndex.set(0);
          this.applySmartGridExtraction(grid, null);
        } else {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheets = extractSheetsFromWorkbook(workbook);
          if (sheets.length === 0 || sheets.every(s => s.grid.length === 0)) {
            alert('A planilha selecionada está vazia.');
            return;
          }
          const bestIdx = chooseBestSheetIndex(sheets, this.utilityType, this.selectedMonth);
          this.workbookSheets.set(sheets);
          this.selectedSheetIndex.set(bestIdx);
          this.applySmartGridExtraction(sheets[bestIdx].grid, null);
        }
      } catch (err) {
        console.error('Erro ao ler planilha Excel:', err);
        alert('Não foi possível ler o arquivo. Certifique-se de que é um arquivo .xlsx, .xls ou .csv válido.');
      }
    };
    if (isCsv) {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
  }

  onSelectSheet(idx: number) {
    const sheets = this.workbookSheets();
    const safeIdx = Number(idx);
    if (!sheets[safeIdx]) return;
    this.selectedSheetIndex.set(safeIdx);
    this.applySmartGridExtraction(sheets[safeIdx].grid, null);
  }

  onSelectMonthBlock(blockId: string) {
    const sheets = this.workbookSheets();
    const activeSheet = sheets[this.selectedSheetIndex()];
    if (!activeSheet) return;
    this.applySmartGridExtraction(activeSheet.grid, blockId);
  }

  private applySmartGridExtraction(grid: any[][], requestedBlockId: string | null) {
    const knownStoresPool = this.effectiveStores().length > 0 ? this.effectiveStores() : (this.allStores || []);
    const extracted = extractSmartTableFromGrid(grid, {
      selectedMonth: this.selectedMonth,
      requestedBlockId,
      utilityType: this.utilityType,
      knownStores: knownStoresPool
    });

    this.detectedHeaderRowIndex.set(extracted.headerRowIndex);
    this.isMultiMonthMatrix.set(extracted.isMultiMonthMatrix);
    this.detectedMonthBlocks.set(extracted.monthBlocks);
    this.selectedMonthBlockId.set(extracted.selectedBlockId);
    this.detectedUtility.set(extracted.detectedUtility);
    this.ignoredNoiseRows.set(extracted.ignoredNoiseRows);
    this.extractedBillSummary.set(extracted.billSummary);
    this.applyBillSummary.set(Boolean(extracted.billSummary && (extracted.billSummary.costItems.length > 0 || extracted.billSummary.totalConsumption)));

    this.rawExcelHeaders.set(extracted.headers);
    this.rawExcelRows.set(extracted.rows);
    this.columnMappings.set(extracted.suggestedMappings);
    // Só abre automaticamente a gaveta de colunas se faltou mapear LUC ou Leitura
    this.showColumnMapping.set(!extracted.suggestedMappings.luc || !extracted.suggestedMappings.reading);
  }

  processPastedText() {
    const text = this.importPastedText().trim();
    if (!text) {
      alert('Cole os dados copiados do Excel na caixa de texto.');
      return;
    }
    const grid = parseTextToGrid(text);
    if (grid.length === 0) {
      alert('Não foi possível identificar linhas válidas no texto colado.');
      return;
    }
    this.importedFileName.set('Tabela Colada (Ctrl+V)');
    this.aiMappingFeedback.set('');
    this.previewStatusFilter.set('all');
    this.previewSearch.set('');
    this.workbookSheets.set([{ name: 'Tabela Colada', grid }]);
    this.selectedSheetIndex.set(0);
    this.applySmartGridExtraction(grid, null);
  }

  processImportedJsonData(rows: any[], headers?: string[]) {
    const extractedHeaders = headers || Object.keys(rows[0] || {});
    const knownStoresPool = this.effectiveStores().length > 0 ? this.effectiveStores() : (this.allStores || []);
    this.workbookSheets.set([]);
    this.isMultiMonthMatrix.set(false);
    this.detectedMonthBlocks.set([]);
    this.selectedMonthBlockId.set(null);
    this.detectedHeaderRowIndex.set(0);
    this.detectedUtility.set(null);
    this.ignoredNoiseRows.set(0);
    this.extractedBillSummary.set(null);

    this.rawExcelHeaders.set(extractedHeaders);
    this.rawExcelRows.set(rows);
    const mapped = autoMapColumns(extractedHeaders, rows, knownStoresPool);
    this.columnMappings.set(mapped);
    this.showColumnMapping.set(!mapped.luc || !mapped.reading);
  }

  canUseAiMapping(): boolean {
    return Boolean(this.geminiService && this.geminiService.hasConfiguredApiKey());
  }

  async mapColumnsWithAi() {
    if (!this.geminiService || this.isAiMapping()) return;
    const headers = this.rawExcelHeaders();
    const rows = this.rawExcelRows();
    if (headers.length === 0) return;

    this.isAiMapping.set(true);
    this.aiMappingFeedback.set('');
    try {
      const suggestion = await this.geminiService.suggestSpreadsheetMapping(headers, rows.slice(0, 6), this.utilityType);
      if (suggestion) {
        this.columnMappings.update(curr => ({
          ...curr,
          ...Object.fromEntries(Object.entries(suggestion).filter(([, v]) => Boolean(v)))
        }));
        this.aiMappingFeedback.set('✨ Colunas mapeadas pela IA! Revise a prévia abaixo antes de confirmar.');
      } else {
        this.aiMappingFeedback.set('⚠️ A IA não conseguiu sugerir um mapeamento diferente. Ajuste nos seletores abaixo.');
      }
    } catch (err) {
      console.error('Erro no mapeamento com IA:', err);
      this.aiMappingFeedback.set('⚠️ Falha ao consultar IA. Você pode ajustar as colunas manualmente.');
    } finally {
      this.isAiMapping.set(false);
    }
  }

  confirmAndApplyImport() {
    const list = this.importPreviewList();
    let readyItems = list.filter(item => item.status !== 'unmatched');

    if (readyItems.length === 0) {
      alert('Nenhuma loja válida encontrada para importar. Verifique o mapeamento das colunas ou habilite o auto-cadastro.');
      return;
    }

    if (this.skipEmptyReadings()) {
      const populated = readyItems.filter(item => item.hasActivity);
      if (populated.length > 0) {
        readyItems = populated;
      }
    }

    const m = this.columnMappings();
    const updatedReadings: ExcelImportReadingItem[] = readyItems.map(item => {
      const base: ExcelImportReadingItem = {
        reading: item.reading,
        prevReadingFromSheet: (item.sheetPrevReading || 0) > 0 ? item.sheetPrevReading : undefined,
        hasPrevInSystem: item.hasPrevInSystem,
        calculatedConsumption: item.consumptionPreview,
        constant: m.constant ? item.constant : undefined,
        adjustment: m.adjustment ? item.adjustment : undefined,
        virtual: m.virtual ? item.virtual : undefined,
        adjustmentAdd: m.adjustmentAdd ? item.adjustmentAdd : undefined,
        fcm: m.fcm ? item.fcm : undefined,
        fluxoCost: m.fluxoCost ? item.fluxoCost : undefined,
        note: m.note ? item.note : undefined
      };

      if (item.status === 'matched' && item.matchedStore) {
        base.storeId = item.matchedStore.id;
      } else if (item.status === 'will_link' && item.catalogStore) {
        base.storeId = item.catalogStore.id;
        base.linkExistingStoreId = item.catalogStore.id;
      } else if (item.status === 'will_create') {
        base.newStore = {
          luc: item.luc,
          name: item.storeName,
          contrato: item.contrato,
          meterNumber: item.meterNumber
        };
      }

      return base;
    });

    const billSummary = this.applyBillSummary() ? (this.extractedBillSummary() || undefined) : undefined;
    this.importSuccess.emit({
      updatedReadings,
      billSummary,
      applyPreviousReadingsBaseline: this.applyPreviousReadingsBaseline()
    });
  }

  private parseExcelNumber(val: any, isFactorField: boolean = false): number {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    let str = String(val).trim().replace(/[^\d.,-]/g, '');
    if (!str || str === '-') return 0;
    if (str.includes(',') && str.includes('.')) {
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        str = str.replace(/,/g, '');
      }
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(str)) {
      const dotCount = (str.match(/\./g) || []).length;
      const firstPart = str.split('.')[0].replace('-', '');
      // Em campos de fator/ajuste (ex: Ajuste (x) = 1.266, FCM = 1.073), 1 ponto decimal não é separador de milhar
      if (firstPart !== '0' && (!isFactorField || dotCount > 1)) {
        str = str.replace(/\./g, '');
      }
    } else if (str.includes(',')) {
      str = str.replace(',', '.');
    }
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }

  private parseExcelOptionalNumber(val: any): number | undefined {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'number') return isNaN(val) ? undefined : val;
    const rawStr = String(val).trim();
    if (rawStr === '' || rawStr === '-' || rawStr === '—') return undefined;
    let clean = rawStr.replace(/[^\d.,-]/g, '');
    if (!clean || clean === '-') return undefined;
    if (clean.includes(',') && clean.includes('.')) {
      if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
        clean = clean.replace(/,/g, '');
      }
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(clean)) {
      const firstPart = clean.split('.')[0].replace('-', '');
      if (firstPart !== '0') {
        clean = clean.replace(/\./g, '');
      }
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    }
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? undefined : parsed;
  }
}
