import { Component, Input, Output, EventEmitter, Optional, signal, computed } from '@angular/core';
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
  billSummary?: ExtractedBillSummary;
}

@Component({
  selector: 'app-excel-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, CurrencyPipe],
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

              <!-- Seletor de Ordenação & Botão Baixar Modelo Formatado -->
              <div class="flex items-center gap-2 flex-wrap">
                <div class="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs shadow-xs">
                  <span class="text-slate-400 font-medium">Ordem:</span>
                  <select [ngModel]="templateSortOrder()" 
                          (ngModelChange)="templateSortOrder.set($event)"
                          class="bg-transparent border-0 font-bold text-slate-800 dark:text-slate-200 text-xs focus:ring-0 cursor-pointer">
                    <option value="route">🚶 Rota de Leitura (Caminhada do Técnico)</option>
                    <option value="luc">🔢 Código LUC</option>
                    <option value="name">🔤 Nome da Loja (A-Z)</option>
                  </select>
                </div>

                <button type="button"
                  (click)="downloadImportTemplate()"
                  class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  [title]="'Baixar modelo oficial ordenado por ' + (templateSortOrder() === 'route' ? 'Rota Física' : templateSortOrder() === 'luc' ? 'LUC' : 'Nome')">
                  <span>📑</span>
                  <span>Baixar Planilha Modelo (.xlsx)</span>
                </button>
              </div>
            </div>

            <!-- INFORMAÇÃO SOBRE A QUANTIDADE E ORIGEM DAS LOJAS DA PLANILHA -->
            <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] px-3.5 py-2 bg-teal-50/80 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300 rounded-xl border border-teal-200 dark:border-teal-900/40">
              <span class="flex items-center gap-1.5 font-medium">
                <span>🏢</span>
                <span>
                  Planilha de Campo: <strong>{{ effectiveStores().length }} lojas</strong> preparadas na ordem física.
                </span>
              </span>
              @if (activeStores.length === 0 && effectiveStores().length > 0) {
                <span class="text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-800/50">
                  Mês novo/em branco: Lojas obtidas do cadastro geral do shopping
                </span>
              }
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

            <!-- BANNER DE DETECÇÃO INTELIGENTE (ABAS, MATRIZ ANUAL E FATURA) -->
            @if (workbookSheets().length > 1 || isMultiMonthMatrix() || detectedHeaderRowIndex() > 0 || (detectedUtility() && detectedUtility() !== utilityType)) {
              <div class="space-y-2.5 p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 text-xs">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2 font-bold text-indigo-900 dark:text-indigo-200">
                    <span>✨</span>
                    <span>
                      @if (isMultiMonthMatrix()) {
                        Planilha Mestre Anual Detectada
                      } @else {
                        Leitura Inteligente Ativada
                      }
                    </span>
                    @if (detectedHeaderRowIndex() > 0) {
                      <span class="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 font-mono">
                        Cabeçalho linha {{ detectedHeaderRowIndex() + 1 }}
                      </span>
                    }
                    @if (ignoredNoiseRows() > 0) {
                      <span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                        {{ ignoredNoiseRows() }} linha(s) de resumo ignoradas
                      </span>
                    }
                  </div>
                </div>

                @if (detectedUtility() && detectedUtility() !== utilityType) {
                  <div class="px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-semibold text-[11px]">
                    ⚠️ Atenção: o arquivo parece ser de <strong>{{ detectedUtility() === 'luz' ? 'Energia/Luz' : (detectedUtility() === 'agua' ? 'Água' : 'Gás') }}</strong>, mas você está importando na aba <strong>{{ utilityType.toUpperCase() }}</strong>.
                  </div>
                }

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  @if (workbookSheets().length > 1) {
                    <div>
                      <label class="block text-[11px] font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                        📑 Aba do Arquivo Excel
                      </label>
                      <select
                        [ngModel]="selectedSheetIndex()"
                        (ngModelChange)="onSelectSheet($event)"
                        class="w-full p-2 rounded-lg border border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 text-xs font-bold">
                        @for (sheet of workbookSheets(); track sheet.name; let i = $index) {
                          <option [ngValue]="i">{{ sheet.name }}</option>
                        }
                      </select>
                    </div>
                  }

                  @if (isMultiMonthMatrix() && detectedMonthBlocks().length > 0) {
                    <div>
                      <label class="block text-[11px] font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                        📅 Mês / Bloco da Planilha a Importar
                      </label>
                      <select
                        [ngModel]="selectedMonthBlockId()"
                        (ngModelChange)="onSelectMonthBlock($event)"
                        class="w-full p-2 rounded-lg border border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 text-xs font-bold">
                        @for (block of detectedMonthBlocks(); track block.id) {
                          <option [value]="block.id">
                            {{ block.label }}{{ block.year ? ('/' + block.year) : '' }} — {{ block.readingsCount }} leituras
                          </option>
                        }
                      </select>
                    </div>
                  }
                </div>

                <!-- Resumo da Fatura extraído do topo da planilha mestre -->
                @if (extractedBillSummary(); as bs) {
                  <div class="mt-1 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex flex-col gap-1.5">
                    <label class="flex items-start gap-2 cursor-pointer text-emerald-900 dark:text-emerald-200 font-bold text-[11px]">
                      <input
                        type="checkbox"
                        [ngModel]="applyBillSummary()"
                        (ngModelChange)="applyBillSummary.set($event)"
                        class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500">
                      <span>
                        Importar também Custos da Fatura e Consumo da Concessionária deste mês:
                        @if (bs.costItems.length > 0) {
                          <span class="font-mono text-emerald-700 dark:text-emerald-300 ml-1">
                            {{ bs.costItems.length }} itens ({{ bs.totalBillFromItems | currency:'BRL' }})
                          </span>
                        }
                        @if (bs.totalConsumption) {
                          <span class="font-mono text-emerald-700 dark:text-emerald-300 ml-1">
                            · {{ bs.totalConsumption | number:'1.0-2' }} {{ unit }}
                          </span>
                        }
                        @if (bs.acConsumption) {
                          <span class="font-mono text-emerald-700 dark:text-emerald-300 ml-1">
                            · AC: {{ bs.acConsumption | number:'1.0-0' }} {{ unit }}
                          </span>
                        }
                      </span>
                    </label>
                  </div>
                }
              </div>
            }

            <!-- MAPEAÇÃO INTELIGENTE DE COLUNAS -->
            @if (rawExcelHeaders().length > 0) {
              <div class="space-y-3 p-4 bg-teal-50/50 dark:bg-teal-950/20 rounded-2xl border border-teal-200 dark:border-teal-900/50">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h4 class="font-extrabold text-xs uppercase tracking-wider text-teal-900 dark:text-teal-200 flex items-center gap-2">
                    <span>⚙️ Mapeamento Inteligente de Colunas</span>
                  </h4>
                  <div class="flex items-center gap-2 flex-wrap">
                    <button type="button"
                      (click)="showAdvancedMappings.set(!showAdvancedMappings())"
                      class="text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 font-bold hover:bg-teal-50 cursor-pointer">
                      {{ showAdvancedMappings() ? '▲ Ocultar extras' : '▼ Constante / Ajuste / FCM / Contrato' }}
                    </button>
                    @if (canUseAiMapping()) {
                      <button type="button"
                        (click)="mapColumnsWithAi()"
                        [disabled]="isAiMapping()"
                        class="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold flex items-center gap-1 cursor-pointer">
                        <span>{{ isAiMapping() ? '⏳' : '✨' }}</span>
                        <span>{{ isAiMapping() ? 'Mapeando...' : 'Mapear com IA' }}</span>
                      </button>
                    }
                  </div>
                </div>

                @if (aiMappingFeedback()) {
                  <div class="text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 font-medium">
                    {{ aiMappingFeedback() }}
                  </div>
                }

                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <!-- Coluna Identificadora LUC -->
                  <div>
                    <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                      Coluna LUC / Código <span class="text-rose-500">*</span>
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

                  <!-- Coluna Nome da Loja -->
                  <div>
                    <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                      Nome da Loja (Opcional)
                    </label>
                    <select 
                      [ngModel]="columnMappings().storeName"
                      (ngModelChange)="updateColumnMapping('storeName', $event)"
                      class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                      <option value="">-- Não Mapear --</option>
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

                  <!-- Coluna Constante -->
                  <div>
                    <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                      Constante / TC (Opcional)
                    </label>
                    <select 
                      [ngModel]="columnMappings().constant"
                      (ngModelChange)="updateColumnMapping('constant', $event)"
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

                  @if (showAdvancedMappings()) {
                    <div>
                      <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                        Nº do Contrato
                      </label>
                      <select
                        [ngModel]="columnMappings().contrato"
                        (ngModelChange)="updateColumnMapping('contrato', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) {
                          <option [value]="h">{{ h }}</option>
                        }
                      </select>
                    </div>

                    <div>
                      <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                        Nº do Medidor / Hidrômetro
                      </label>
                      <select
                        [ngModel]="columnMappings().meterNumber"
                        (ngModelChange)="updateColumnMapping('meterNumber', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) {
                          <option [value]="h">{{ h }}</option>
                        }
                      </select>
                    </div>

                    <div>
                      <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                        Leitura Anterior (Fallback)
                      </label>
                      <select
                        [ngModel]="columnMappings().prevReading"
                        (ngModelChange)="updateColumnMapping('prevReading', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) {
                          <option [value]="h">{{ h }}</option>
                        }
                      </select>
                    </div>

                    <div>
                      <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                        Ajuste (x)
                      </label>
                      <select
                        [ngModel]="columnMappings().adjustment"
                        (ngModelChange)="updateColumnMapping('adjustment', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) {
                          <option [value]="h">{{ h }}</option>
                        }
                      </select>
                    </div>

                    <div>
                      <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                        Ajuste (+) (R$)
                      </label>
                      <select
                        [ngModel]="columnMappings().adjustmentAdd"
                        (ngModelChange)="updateColumnMapping('adjustmentAdd', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) {
                          <option [value]="h">{{ h }}</option>
                        }
                      </select>
                    </div>

                    <div>
                      <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                        FCM (Gás)
                      </label>
                      <select
                        [ngModel]="columnMappings().fcm"
                        (ngModelChange)="updateColumnMapping('fcm', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) {
                          <option [value]="h">{{ h }}</option>
                        }
                      </select>
                    </div>

                    <div>
                      <label class="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                        Rec. Fluxo (R$)
                      </label>
                      <select
                        [ngModel]="columnMappings().fluxoCost"
                        (ngModelChange)="updateColumnMapping('fluxoCost', $event)"
                        class="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-xs font-medium">
                        <option value="">-- Não Mapear --</option>
                        @for (h of rawExcelHeaders(); track h) {
                          <option [value]="h">{{ h }}</option>
                        }
                      </select>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- PRÉ-VISUALIZAÇÃO DOS DADOS IDENTIFICADOS -->
            @if (importPreviewList().length > 0) {
              <div class="space-y-3">
                
                <!-- Estatísticas de Correspondência -->
                <div class="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-bold">
                  <div class="flex items-center gap-3 flex-wrap">
                    <span class="text-teal-700 dark:text-teal-300">
                      ✅ Lojas Identificadas: <strong>{{ importStats().matched }}</strong> de {{ importStats().total }}
                    </span>
                    @if (importStats().unmatched > 0) {
                      <span class="text-rose-600 dark:text-rose-400">
                        ⚠️ Não Encontradas: <strong>{{ importStats().unmatched }}</strong>
                      </span>
                    }
                    <label class="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        [ngModel]="skipEmptyReadings()"
                        (ngModelChange)="skipEmptyReadings.set($event)"
                        class="rounded text-teal-600">
                      <span>Ignorar linhas vazias (sem leitura/virtual)</span>
                    </label>
                  </div>
                  <span class="text-slate-500 font-mono text-[11px]">
                    Com leitura/virtual: {{ importStats().withReading }}
                  </span>
                </div>

                <!-- Tabela de Auditoria e Prévia -->
                <div class="overflow-x-auto max-h-60 rounded-xl border border-slate-200 dark:border-slate-700 custom-scrollbar">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th class="p-2.5">Status</th>
                        <th class="p-2.5 text-center"># Rota</th>
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
                          <td class="p-2.5 text-center font-bold text-slate-500 dark:text-slate-400">
                            {{ row.routeOrder !== undefined && row.routeOrder !== null ? row.routeOrder : '—' }}
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
  @Input() allStores: Store[] = [];
  @Input() previousReadings: Map<string, { reading: number; consumption: number }> = new Map();
  @Input() unit = '';

  @Output() close = new EventEmitter<void>();
  @Output() importSuccess = new EventEmitter<ExcelImportSuccessEvent>();

  constructor(@Optional() private geminiService?: GeminiService) {}

  // Import State
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
  showAdvancedMappings = signal<boolean>(false);
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

  // Lista efetiva de lojas: Se o mês atual estiver em branco no rateio, busca do catálogo de lojas fornecido
  effectiveStores = computed<Store[]>(() => {
    // 1. Se activeStores foi injetado pelo componente pai e possui lojas, prioriza
    if (this.activeStores && this.activeStores.length > 0) {
      return this.activeStores;
    }

    const type = this.utilityType;
    const all = this.allStores || [];

    // 2. Fallback: Lojas ativas do catálogo geral cadastradas para este insumo
    const activeRegistered = all.filter(s => {
      const usesUtil = type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
      return usesUtil && s.active !== false;
    });
    if (activeRegistered.length > 0) {
      return activeRegistered;
    }

    // 3. Fallback: Qualquer loja cadastrada com este insumo
    return all.filter(s => {
      return type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
    });
  });

  importPreviewList = computed<ExcelImportRowPreview[]>(() => {
    const rows = this.rawExcelRows();
    if (rows.length === 0) return [];

    const mappings = this.columnMappings();
    const stores = this.effectiveStores();
    const prevReadings = this.previousReadings;
    const type = this.utilityType;

    const normalizeKey = (s: any) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]/gi, '');

    const previewRows = rows.map((rawRow, idx) => {
      const rawLucVal = mappings.luc ? String(rawRow[mappings.luc] || '').trim() : '';
      const rawNameVal = mappings.storeName ? String(rawRow[mappings.storeName] || '').trim() : '';
      const rawContratoVal = mappings.contrato ? String(rawRow[mappings.contrato] || '').trim() : '';
      const rawMeterVal = mappings.meterNumber ? String(rawRow[mappings.meterNumber] || '').trim() : '';
      const rawReadingVal = mappings.reading ? rawRow[mappings.reading] : '';
      const reading = this.parseExcelNumber(rawReadingVal);

      // Correspondência inteligente em múltiplas camadas:
      // 1. (LUC + Contrato) exato -> protege LUCs compartilhados (ex: MULTIPLAN HALL, SCE01)
      // 2. Contrato exato -> 3. Medidor exato -> 4. LUC normalizado -> 5. Nome normalizado -> fallbacks
      const normLucVal = normalizeLuc(rawLucVal);
      const normContrVal = normalizeContract(rawContratoVal);
      const normMeterVal = normalizeKey(rawMeterVal);
      const normNameVal = normalizeStoreName(rawNameVal);

      const matchedStore =
        (normLucVal && normContrVal
          ? stores.find(s => normalizeLuc(s.luc) === normLucVal && normalizeContract(s.contrato) === normContrVal)
          : undefined) ||
        (normContrVal
          ? stores.find(s => normalizeContract(s.contrato) === normContrVal)
          : undefined) ||
        (normMeterVal
          ? stores.find(s => s.meterNumber && normalizeKey(s.meterNumber) === normMeterVal)
          : undefined) ||
        (normLucVal
          ? stores.find(s => normalizeLuc(s.luc) === normLucVal)
          : undefined) ||
        (normNameVal
          ? stores.find(s => normalizeStoreName(s.name) === normNameVal)
          : undefined) ||
        stores.find(s => {
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
        });

      let prevData = matchedStore ? prevReadings.get(matchedStore.id) : null;
      if (!prevData && matchedStore) {
        const nLuc = normalizeLuc(matchedStore.luc);
        const nContr = normalizeContract(matchedStore.contrato);
        const nName = normalizeStoreName(matchedStore.name);
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
      const sheetPrevReading = mappings.prevReading ? this.parseExcelNumber(rawRow[mappings.prevReading]) : 0;
      const prevReading = (prevData && prevData.reading > 0) ? prevData.reading : sheetPrevReading;
      const diff = calculateReadingDifference(reading, prevReading, false);

      const rawConst = mappings.constant ? this.parseExcelNumber(rawRow[mappings.constant]) : 1;
      const constant = rawConst > 0 ? rawConst : 1;
      const rawAdj = mappings.adjustment ? this.parseExcelNumber(rawRow[mappings.adjustment]) : 0;
      const adjustment = rawAdj > 0 ? rawAdj : (type === 'gas' ? 1.347 : 1);
      const virtual = mappings.virtual ? this.parseExcelOptionalNumber(rawRow[mappings.virtual]) : undefined;
      const adjustmentAdd = mappings.adjustmentAdd ? this.parseExcelNumber(rawRow[mappings.adjustmentAdd]) : 0;
      const rawFcm = mappings.fcm ? this.parseExcelNumber(rawRow[mappings.fcm]) : 0;
      const fcm = rawFcm > 0 ? rawFcm : 1.0727;
      const fluxoCost = mappings.fluxoCost ? this.parseExcelNumber(rawRow[mappings.fluxoCost]) : 0;
      const note = mappings.note ? String(rawRow[mappings.note] || '').trim() : '';

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
          routeOrder: matchedStore.routeOrder,
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
          storeName: rawNameVal || rawLucVal || `Linha ${idx + 1}`,
          luc: rawLucVal || '—',
          reading,
          prevReading: 0,
          consumptionPreview: 0,
          status: 'unmatched' as const,
          message: rawLucVal ? 'Loja não localizada no cadastro deste insumo' : 'Coluna de identificação vazia'
        };
      }
    });

    // Ordena pré-visualização por Rota física (ou LUC numérico)
    return previewRows.sort((a, b) => {
      if (a.status === 'matched' && b.status === 'matched') {
        const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
        const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.luc || '').localeCompare(b.luc || '', undefined, { numeric: true });
      }
      if (a.status === 'matched') return -1;
      if (b.status === 'matched') return 1;
      return 0;
    });
  });

  importStats = computed(() => {
    const list = this.importPreviewList();
    const total = list.length;
    const matched = list.filter(r => r.status === 'matched').length;
    const unmatched = total - matched;
    const withReading = list.filter(
      r => r.status === 'matched' && (r.reading > 0 || r.virtual !== undefined || !!r.note || (r.fluxoCost && r.fluxoCost > 0))
    ).length;
    return { total, matched, unmatched, withReading };
  });

  onClose() {
    this.close.emit();
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

    // Se o banco estiver completamente vazio de lojas para este insumo, gera uma linha de exemplo
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
      { wch: 14 }, // LUC
      { wch: 35 }, // Nome da Loja
      { wch: 16 }, // Contrato
      { wch: 18 }, // Leitura Anterior
      { wch: 18 }, // Leitura Atual
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
    const extracted = extractSmartTableFromGrid(grid, {
      selectedMonth: this.selectedMonth,
      requestedBlockId,
      utilityType: this.utilityType,
      knownStores: this.effectiveStores()
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
    this.workbookSheets.set([{ name: 'Tabela Colada', grid }]);
    this.selectedSheetIndex.set(0);
    this.applySmartGridExtraction(grid, null);
  }

  processImportedJsonData(rows: any[], headers?: string[]) {
    const extractedHeaders = headers || Object.keys(rows[0] || {});
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
    this.columnMappings.set(autoMapColumns(extractedHeaders, rows, this.effectiveStores()));
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
    let matchedItems = list.filter(item => item.status === 'matched' && item.matchedStore);

    if (matchedItems.length === 0) {
      alert('Nenhuma loja correspondente encontrada para importar. Verifique o mapeamento das colunas.');
      return;
    }

    if (this.skipEmptyReadings()) {
      const populated = matchedItems.filter(
        item => item.reading > 0 || item.virtual !== undefined || !!item.note || (item.fluxoCost && item.fluxoCost > 0)
      );
      if (populated.length > 0) {
        matchedItems = populated;
      }
    }

    const m = this.columnMappings();
    const updatedReadings = matchedItems.map(item => ({
      storeId: item.matchedStore!.id,
      reading: item.reading,
      calculatedConsumption: item.consumptionPreview,
      constant: m.constant ? item.constant : undefined,
      adjustment: m.adjustment ? item.adjustment : undefined,
      virtual: m.virtual ? item.virtual : undefined,
      adjustmentAdd: m.adjustmentAdd ? item.adjustmentAdd : undefined,
      fcm: m.fcm ? item.fcm : undefined,
      fluxoCost: m.fluxoCost ? item.fluxoCost : undefined,
      note: m.note ? item.note : undefined
    }));

    const billSummary = this.applyBillSummary() ? (this.extractedBillSummary() || undefined) : undefined;
    this.importSuccess.emit({ updatedReadings, billSummary });
  }

  private parseExcelNumber(val: any): number {
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
      const firstPart = str.split('.')[0].replace('-', '');
      if (firstPart !== '0') {
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
