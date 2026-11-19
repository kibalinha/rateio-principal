import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MeterPhotoRecord, OcrPendingConfirmation } from '../models';
import {
  BillTableRow,
  ConfirmOcrEvent,
  NoteEditorOpenEvent,
  OcrFeedbackItem,
  PhotoCaptureEvent,
  PhotoDeleteEvent,
  PhotoViewerOpenEvent,
  QuickJustifyEvent,
  QuickTagEvent,
  ReadingFieldChangeEvent
} from './bill-subcomponents.types';

@Component({
  selector: 'app-bill-mobile-cards',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DecimalPipe],
  template: `
                <div class="flex flex-col divide-y divide-slate-200 dark:divide-slate-800 bg-slate-100 dark:bg-slate-950">
                  @for (item of rows; track item.storeId) {
                     <div [id]="'store-card-' + item.storeId" class="p-4 bg-white dark:bg-slate-900 transition-colors"
                          [class.border-l-4]="true"
                          [class.border-l-rose-500]="item.validationAlert.severity === 'critical'"
                          [class.border-l-amber-500]="item.validationAlert.severity === 'warning'"
                          [class.border-l-emerald-500]="item.isRead && !item.validationAlert.hasAlert"
                          [class.border-l-slate-300]="!item.isRead"
                          [class.dark:border-l-slate-700]="!item.isRead">
                        
                        <!-- Header do Card: LUC, Nome e Status -->
                        <div class="flex justify-between items-start mb-2.5">
                           <div class="flex-1 pr-2">
                             <div class="flex items-center gap-1.5 flex-wrap">
                               @if (item.routeOrder) {
                                <span class="text-xs font-mono font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md shadow-xs border border-indigo-200 dark:border-indigo-800" title="Ordem da Rota">
                                  #{{ item.routeOrder }}
                                </span>
                              }
                              <span class="text-xs font-mono font-extrabold text-white bg-slate-900 dark:bg-slate-800 px-2 py-0.5 rounded-md shadow-xs border border-transparent dark:border-slate-700">
                                 {{ item.luc }}
                               </span>
                                @if (item.contrato) {
                                  <span class="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                    Ctr: {{ item.contrato }}
                                  </span>
                                }
                                <button type="button" 
                                  (click)="toggleExcludeFromBill.emit(item.storeId)" 
                                  [title]="item.excludedFromBill ? 'Esta loja está FORA DO SAP (seu consumo e custo vão para a Área Comum). Clique para incluir no SAP.' : 'Esta loja entra no Valor SAP. Clique para transferir seu valor para a Área Comum (Fora do SAP).'"
                                  class="text-[10px] font-bold px-2 py-0.5 rounded-md cursor-pointer flex items-center gap-1 transition-all border shadow-2xs"
                                  [class]="item.excludedFromBill 
                                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700' 
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'">
                                  <span>{{ item.excludedFromBill ? '🚫 Fora do SAP' : '✓ No SAP' }}</span>
                                </button>
                             </div>
                             <div class="font-bold text-slate-900 dark:text-white text-base mt-1 leading-tight">
                               {{ item.storeName }}
                             </div>
                           </div>

                           <div class="text-right shrink-0">
                              @if (item.validationAlert.hasAlert) {
                                <span class="text-[10px] font-black px-2 py-0.5 rounded-full border block shadow-2xs"
                                  [class.bg-rose-100]="item.validationAlert.severity === 'critical'"
                                  [class.text-rose-800]="item.validationAlert.severity === 'critical'"
                                  [class.border-rose-300]="item.validationAlert.severity === 'critical'"
                                  [class.dark:bg-rose-950/80]="item.validationAlert.severity === 'critical'"
                                  [class.dark:text-rose-200]="item.validationAlert.severity === 'critical'"
                                  [class.dark:border-rose-800]="item.validationAlert.severity === 'critical'"
                                  [class.bg-amber-100]="item.validationAlert.severity === 'warning'"
                                  [class.text-amber-900]="item.validationAlert.severity === 'warning'"
                                  [class.border-amber-300]="item.validationAlert.severity === 'warning'"
                                  [class.dark:bg-amber-950/80]="item.validationAlert.severity === 'warning'"
                                  [class.dark:text-amber-200]="item.validationAlert.severity === 'warning'"
                                  [class.dark:border-amber-800]="item.validationAlert.severity === 'warning'">
                                  {{ item.validationAlert.badgeLabel }}
                                </span>
                              } @else if (item.isJustified) {
                                <span class="bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-700 block" [title]="item.justificationReason">
                                  ⚖️ {{ item.justificationReason || 'Justificada' }}
                                </span>
                              } @else if (item.isRead) {
                                <span class="bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800 block">
                                  ✓ Lida
                                </span>
                              } @else {
                                <span class="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-medium px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 block">
                                  ⏳ Pendente
                                </span>
                              }
                           </div>
                        </div>
                        
                        <!-- Área de Leituras: Leitura Anterior (fixa) vs Leitura Atual (teclado numérico grande) -->
                        <div class="grid grid-cols-2 gap-3 items-center my-3">
                           <!-- Leitura Anterior -->
                           <div class="flex flex-col bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                              <label class="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-400 tracking-wider">Leitura Anterior</label>
                              <div class="text-slate-700 dark:text-slate-200 font-mono text-lg font-bold mt-0.5">
                                 {{ item.prevReading | number:'1.0-0' }} <span class="text-xs font-normal text-slate-400">{{ unit }}</span>
                                 @if (item.prevReadingMonth && item.prevReadingMonth !== prevMonth && item.prevReading > 0) {
                                   <span class="text-[10px] text-teal-600 dark:text-teal-400 font-bold ml-1">({{ item.prevReadingMonth }})</span>
                                 }
                              </div>
                           </div>
                           
                           <!-- Leitura Atual (Foco de Digitação em Campo) -->
                           <div class="flex flex-col">
                              <div class="flex items-center justify-between">
                                <label class="text-[10px] uppercase font-bold text-teal-700 dark:text-teal-400 tracking-wider">Leitura Atual</label>
                                @if (isReadingOcr === item.storeId) {
                                  <span class="text-[9px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 px-1.5 py-0.2 rounded-full font-bold flex items-center gap-1 animate-pulse">
                                    <span class="animate-spin text-[10px]">⚡</span>
                                    <span>Lendo...</span>
                                  </span>
                                }
                              </div>

                              <!-- Indicador OCR Ativo no Card -->
                              @if (isReadingOcr === item.storeId) {
                                <div class="mt-1 p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-[11px] font-bold flex items-center justify-between gap-1.5 animate-pulse">
                                  <span class="flex items-center gap-1">
                                    <span>⚡</span>
                                    <span>{{ ocrCurrentModelLabel }} lendo foto...</span>
                                  </span>
                                  <span class="text-[9px] bg-indigo-200 dark:bg-indigo-800 px-1 rounded">OCR</span>
                                </div>
                              }

                              <!-- Feedback OCR no Card -->
                              @if (ocrFeedback[item.storeId]; as fb) {
                                <div class="mt-1 p-1.5 rounded-lg text-[11px] flex items-center justify-between gap-1 transition-all"
                                     [class]="fb.success ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100' : 'bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'">
                                  <div class="flex items-center gap-1 truncate">
                                    <span>{{ fb.success ? '🤖✓' : '🤖⚠️' }}</span>
                                    <span class="font-bold truncate">{{ fb.message }}</span>
                                  </div>
                                  <button (click)="dismissOcrFeedback.emit(item.storeId)" class="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold cursor-pointer shrink-0">✕</button>
                                </div>
                              }

                              <!-- Conferência da leitura sugerida pela IA -->
                              @if (ocrPending[item.storeId]; as pend) {
                                <div class="mt-1 p-2 rounded-lg border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 text-[11px] space-y-1.5">
                                  <p class="font-bold text-indigo-900 dark:text-indigo-100">
                                    🤖 IA leu <span class="font-mono text-sm">{{ pend.ocrValue }}</span> — confere com a foto?
                                  </p>
                                  @if (pend.confidence !== 'high') {
                                    <p class="text-amber-700 dark:text-amber-300 font-semibold">⚠️ Confiança {{ pend.confidence === 'medium' ? 'média' : 'baixa' }}: confira com atenção.</p>
                                  }
                                  <p class="text-slate-600 dark:text-slate-400">Se estiver errado, corrija o número no campo abaixo e confirme.</p>

                                  <!-- Seleção Rápida de Divergência entre Motores de IA -->
                                  @if (pend.dualCheck && !pend.dualCheck.agreement && pend.dualCheck.qwenValue !== null && pend.dualCheck.geminiValue !== null) {
                                    <div class="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 space-y-1">
                                      <p class="font-bold text-[10px] flex items-center gap-1">
                                        <span>⚠️</span>
                                        <span>Motores de IA divergiram: toque no valor correto:</span>
                                      </p>
                                      <div class="grid grid-cols-2 gap-1.5">
                                        <button type="button" (click)="readingChange.emit({ storeId: item.storeId, field: 'reading', value: pend.dualCheck.qwenValue }); confirmOcrReading.emit({ storeId: item.storeId, value: pend.dualCheck.qwenValue })"
                                          class="py-1 px-1.5 rounded-md bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 font-mono font-bold text-xs hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer text-indigo-700 dark:text-indigo-300">
                                          ⚡ Qwen: {{ pend.dualCheck.qwenValue }}
                                        </button>
                                        <button type="button" (click)="readingChange.emit({ storeId: item.storeId, field: 'reading', value: pend.dualCheck.geminiValue }); confirmOcrReading.emit({ storeId: item.storeId, value: pend.dualCheck.geminiValue })"
                                          class="py-1 px-1.5 rounded-md bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 font-mono font-bold text-xs hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer text-teal-700 dark:text-teal-300">
                                          🤖 Gemini: {{ pend.dualCheck.geminiValue }}
                                        </button>
                                      </div>
                                    </div>
                                  }
                                  @if (item.validationAlert.hasAlert) {
                                    <div class="p-1.5 rounded-md bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 font-semibold">
                                      <p>{{ item.validationAlert.title }}</p>
                                      <p class="font-normal mt-0.5">{{ item.validationAlert.message }}</p>
                                      <button type="button" (click)="retryOcrWithOtherEngine.emit(item.storeId)"
                                        [disabled]="isReadingOcr === item.storeId"
                                        class="mt-1 w-full py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold cursor-pointer">
                                        🔄 Reler com {{ pend.provider === 'qwen' ? 'Gemini' : 'Qwen' }}
                                      </button>
                                    </div>
                                  }
                                  <button type="button" (click)="confirmOcrReading.emit({ storeId: item.storeId, value: item.currentReading })"
                                    [disabled]="!canEdit"
                                    class="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold cursor-pointer">
                                    ✓ Confirmar leitura
                                  </button>
                                </div>
                              }

                              <div class="relative mt-0.5">
                                <input type="number" 
                                   inputmode="decimal"
                                   step="0.0001"
                                   [ngModel]="item.currentReading" 
                                   (ngModelChange)="readingChange.emit({ storeId: item.storeId, field: 'reading', value: $event })"
                                   (blur)="readingBlur.emit(item.storeId)"
                                   (keyup.enter)="readingBlur.emit(item.storeId)"
                                   [disabled]="!canEdit"
                                   [id]="'reading-card-input-' + item.storeId"
                                   class="w-full text-right text-xl font-mono p-2.5 border-2 rounded-xl focus:ring-2 font-bold bg-white dark:bg-slate-950 text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800 transition-colors"
                                   [class.border-rose-500]="item.validationAlert.severity === 'critical'"
                                   [class.ring-2]="item.validationAlert.hasAlert"
                                   [class.ring-rose-400]="item.validationAlert.severity === 'critical'"
                                   [class.bg-rose-50/20]="item.validationAlert.severity === 'critical'"
                                   [class.border-amber-500]="item.validationAlert.severity === 'warning'"
                                   [class.ring-amber-400]="item.validationAlert.severity === 'warning'"
                                   [class.bg-amber-50/20]="item.validationAlert.severity === 'warning'"
                                   [class.border-emerald-500]="item.isRead && !item.validationAlert.hasAlert"
                                   [class.border-slate-300]="!item.isRead"
                                   [class.dark:border-slate-700]="!item.isRead"
                                   placeholder="0">
                              </div>
                           </div>
                        </div>

                        @if (item.isJustified) {
                          <div class="mb-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between text-xs">
                            <div class="flex items-center gap-2">
                              <span class="text-base">⚖️</span>
                              <div>
                                <span class="font-bold text-amber-900 dark:text-amber-200 block">Loja Justificada (Sem Consumo)</span>
                                <span class="text-[11px] text-amber-700 dark:text-amber-300 font-medium">{{ item.justificationReason || 'Sem consumo no mês' }}</span>
                              </div>
                            </div>
                            @if (canEdit) {
                              <button type="button" 
                                (click)="openQuickJustifyModal.emit(item)"
                                class="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 dark:bg-amber-900 dark:hover:bg-amber-800 text-amber-950 dark:text-amber-100 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs">
                                Alterar
                              </button>
                            }
                          </div>
                        } @else if (canEdit && !item.isRead) {
                          <div class="mb-3 flex items-center gap-2 flex-wrap">
                            @if (item.isFrequentZero) {
                              <button type="button"
                                (click)="quickJustifyStore.emit({ storeId: item.storeId, reason: item.learnedReason || 'Loja Fechada / Vaga', replicatePrevReading: true })"
                                class="flex-1 py-2 px-3 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                                [title]="item.consecutiveZeroMonths + ' meses com consumo zero'">
                                <span>⚡ 0 {{ unit }} (Histórico Zero: {{ item.consecutiveZeroMonths }}m)</span>
                              </button>
                            }
                            <button type="button"
                              (click)="openQuickJustifyModal.emit(item)"
                              class="py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors">
                              <span>⚖️ Justificar Loja</span>
                            </button>
                          </div>
                        }

                        <!-- ALERTA INSTANTÂNEO DE LEITURA SUSPEITA / ERRO DE DIGITAÇÃO -->
                        @if (item.validationAlert.hasAlert) {
                          <div class="mb-3 p-3 rounded-xl border flex items-start gap-2.5 text-xs shadow-xs"
                               [class.bg-rose-50]="item.validationAlert.severity === 'critical'"
                               [class.border-rose-300]="item.validationAlert.severity === 'critical'"
                               [class.text-rose-950]="item.validationAlert.severity === 'critical'"
                               [class.dark:bg-rose-950/40]="item.validationAlert.severity === 'critical'"
                               [class.dark:border-rose-800]="item.validationAlert.severity === 'critical'"
                               [class.dark:text-rose-200]="item.validationAlert.severity === 'critical'"
                               [class.bg-amber-50]="item.validationAlert.severity === 'warning'"
                               [class.border-amber-300]="item.validationAlert.severity === 'warning'"
                               [class.text-amber-950]="item.validationAlert.severity === 'warning'"
                               [class.dark:bg-amber-950/40]="item.validationAlert.severity === 'warning'"
                               [class.dark:border-amber-800]="item.validationAlert.severity === 'warning'"
                               [class.dark:text-amber-200]="item.validationAlert.severity === 'warning'">
                            <span class="text-xl shrink-0 leading-none">
                              {{ item.validationAlert.severity === 'critical' ? '🚨' : '⚠️' }}
                            </span>
                            <div class="flex-1 space-y-1">
                              <div class="font-extrabold flex items-center justify-between">
                                <span class="text-xs">{{ item.validationAlert.title }}</span>
                                <span class="px-2 py-0.2 rounded text-[9px] uppercase font-black tracking-wide"
                                  [class.bg-rose-600]="item.validationAlert.severity === 'critical'"
                                  [class.text-white]="item.validationAlert.severity === 'critical'"
                                  [class.bg-amber-500]="item.validationAlert.severity === 'warning'"
                                  [class.text-slate-950]="item.validationAlert.severity === 'warning'">
                                  {{ item.validationAlert.badgeLabel }}
                                </span>
                              </div>
                              <p class="leading-relaxed text-[11px] text-slate-700 dark:text-slate-300">
                                {{ item.validationAlert.message }}
                              </p>
                              <!-- Metadados de Comparação em Tempo Real -->
                              <div class="pt-1.5 mt-1 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                                <span>Anterior: <strong>{{ item.prevReading | number:'1.0-0' }}</strong></span>
                                <span>Digitada: <strong>{{ item.currentReading | number:'1.0-2' }}</strong></span>
                                @if (item.validationAlert.avgConsumption > 0) {
                                  <span>Média Histórica: <strong>{{ item.validationAlert.avgConsumption | number:'1.0-1' }} {{ unit }}</strong></span>
                                }
                              </div>
                              <div class="text-[10px] font-semibold text-rose-800 dark:text-rose-300 bg-white/70 dark:bg-slate-900/80 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800 mt-1 inline-block">
                                🔍 Confira no visor do relógio antes de sair da loja
                              </div>

                              <!-- Ações Imediatas de Auditoria no Card -->
                              <div class="flex items-center gap-2 mt-2 pt-1.5 border-t border-black/10 dark:border-white/10 flex-wrap">
                                @if (!item.anomalyConfirmed) {
                                  <button type="button" 
                                          (click)="confirmAnomaly.emit(item.storeId)"
                                          class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer shadow-xs">
                                    <span>✓ Confirmar como Correto</span>
                                  </button>
                                  @if (item.validationAlert.type === 'negative') {
                                    <button type="button" 
                                            (click)="markRollover.emit(item.storeId)"
                                            class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer shadow-xs">
                                      <span>🔄 Virada de Relógio</span>
                                    </button>
                                  }
                                } @else {
                                  <span class="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                    <span>✓ Auditado e confirmado pelo técnico</span>
                                  </span>
                                }
                              </div>
                            </div>
                          </div>
                        }

                        <!-- Resultados Calculados em Tempo Real -->
                        @if (item.isRead) {
                          <div class="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs mb-2">
                             <div>
                                <span class="text-[10px] text-slate-400 block">Diferença</span>
                                <strong class="font-mono text-slate-700 dark:text-slate-200">+{{ item.readingDiff | number:'1.0-2' }} {{ unit }}</strong>
                             </div>
                             <div>
                                <span class="text-[10px] text-slate-400 block">Consumo</span>
                                <strong class="font-mono text-slate-900 dark:text-white">{{ item.consumption | number:'1.0-2' }} {{ unit }}</strong>
                                @if (item.isGasDistributed) {
                                  <span class="text-[9px] text-red-600 dark:text-red-400 block font-sans">campo: {{ item.rawConsumption | number:'1.0-1' }}</span>
                                }
                             </div>
                             <div class="text-right">
                                <span class="text-[10px] text-slate-400 block">Custo Est.</span>
                                @if (item.excludedFromBill) {
                                  <span class="text-[10px] text-amber-600 dark:text-amber-400 line-through opacity-70 block font-mono">
                                    {{ item.originalCost | currency:'BRL' }}
                                  </span>
                                  <strong class="font-mono text-amber-700 dark:text-amber-300">R$ 0,00</strong>
                                  <span class="text-[9px] text-amber-600 dark:text-amber-400 font-bold block uppercase">Fora do SAP (Área Comum)</span>
                                } @else {
                                  <strong class="font-mono text-teal-700 dark:text-teal-400">{{ item.cost | currency:'BRL' }}</strong>
                                }
                             </div>
                          </div>
                        }

                        <!-- Observações de Campo Rápidas (Chips de 1 toque) -->
                        <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                           <div class="flex items-center gap-1 flex-wrap">
                             @if (item.note) {
                               <div class="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full text-xs border border-amber-200 dark:border-amber-800 font-medium">
                                 <span>📝 {{ item.note }}</span>
                                 <button (click)="clearNote.emit(item.storeId)" class="hover:text-red-600 font-bold ml-1 cursor-pointer" title="Remover observação">✕</button>
                               </div>
                             } @else {
                               <span class="text-[10px] text-slate-400">Etiqueta:</span>
                               <button type="button" (click)="applyQuickTag.emit({ storeId: item.storeId, tag: 'Porta Fechada' })" class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                                 🔒 Fechada
                               </button>
                               <button type="button" (click)="applyQuickTag.emit({ storeId: item.storeId, tag: 'Visor Embaçado' })" class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                                 👁️ Embaçado
                               </button>
                               <button type="button" (click)="applyQuickTag.emit({ storeId: item.storeId, tag: 'Relógio Trocado' })" class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                                 🔄 Novo
                               </button>
                             }
                           </div>

                           <button type="button" (click)="openNoteEditor.emit({ storeId: item.storeId, currentNote: item.note })" class="text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 text-xs font-semibold underline cursor-pointer">
                             {{ item.note ? 'Editar nota' : '+ Observação' }}
                           </button>
                        </div>

                        <!-- Foto de Evidência do Medidor (Offline no IndexedDB) -->
                        <div class="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div class="flex items-center gap-2">
                            @if (meterPhotos[item.storeId]) {
                              <div class="relative cursor-pointer group shrink-0" (click)="openPhotoViewer.emit({ storeId: item.storeId })" title="Visualizar comprovante fotográfico">
                                <img [src]="meterPhotos[item.storeId].photoDataUrl" 
                                     alt="Foto do Medidor" 
                                     class="w-10 h-10 object-cover rounded-xl border-2 border-teal-500 shadow-xs">
                                <span class="absolute -bottom-1 -right-1 bg-teal-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold shadow-xs">
                                  ✓
                                </span>
                              </div>
                              <div class="flex flex-col">
                                <button type="button" 
                                        (click)="openPhotoViewer.emit({ storeId: item.storeId })"
                                        class="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1 cursor-pointer text-left">
                                  <span>📷 Ver Foto Medidor</span>
                                </button>
                                <span class="text-[9px] font-mono flex items-center gap-1">
                                  <span class="text-slate-400">{{ meterPhotos[item.storeId].capturedAt | date:'dd/MM HH:mm' }}</span>
                                  @if (meterPhotos[item.storeId].synced) {
                                    <span class="text-teal-600 dark:text-teal-400" title="Foto sincronizada na nuvem">☁️ Nuvem</span>
                                  } @else {
                                    <span class="text-amber-500" title="Salva localmente, pendente envio para nuvem">💾 Local</span>
                                  }
                                </span>
                                <button type="button" 
                                        (click)="runOcr.emit(item.storeId)"
                                        [disabled]="isReadingOcr === item.storeId"
                                        class="mt-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer w-fit shadow-xs">
                                  @if (isReadingOcr === item.storeId) {
                                    <span class="animate-spin text-[10px]">⏳</span>
                                    <span>Lendo...</span>
                                  } @else {
                                    <span>⚡ Ler com IA</span>
                                  }
                                </button>
                              </div>
                            } @else {
                              <label class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition-all shadow-xs active:scale-95">
                                @if (isCapturingPhoto === item.storeId) {
                                  <span class="animate-spin text-xs">⏳</span>
                                  <span>Compactando...</span>
                                } @else {
                                  <span>📷</span>
                                  <span>Foto do Medidor</span>
                                }
                                <input type="file" 
                                       accept="image/*" 
                                       capture="environment" 
                                       (change)="photoCaptured.emit({ event: $event, storeId: item.storeId, storeName: item.storeName, luc: item.luc, currentReading: item.currentReading })" 
                                       class="hidden"
                                       [disabled]="isCapturingPhoto === item.storeId">
                              </label>
                            }
                          </div>

                          @if (meterPhotos[item.storeId]) {
                            <div class="flex items-center gap-2.5 shrink-0">
                              <label class="cursor-pointer text-[10px] font-semibold text-teal-700 dark:text-teal-400 hover:underline">
                                <span>Substituir</span>
                                <input type="file" 
                                       accept="image/*" 
                                       capture="environment" 
                                       (change)="photoCaptured.emit({ event: $event, storeId: item.storeId, storeName: item.storeName, luc: item.luc, currentReading: item.currentReading })" 
                                       class="hidden">
                              </label>
                              <button type="button" 
                                (click)="deletePhoto.emit({ storeId: item.storeId, storeName: item.storeName })" 
                                class="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer">
                                🗑️ Excluir
                              </button>
                            </div>
                          }
                        </div>
                     </div>
                  }

                  @if (rows.length === 0) {
                    <div class="p-8 text-center bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-xl my-3">
                      <div class="text-3xl mb-2">📋</div>
                      @if (statusFilter === 'prev_missing') {
                        <div class="py-4 space-y-2">
                          <div class="text-4xl">✨</div>
                          <p class="font-black text-emerald-600 dark:text-emerald-400 text-sm">100% do mês anterior conferido!</p>
                          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Todas as lojas que tinham valor em <strong>{{ prevMonth }}</strong> já foram lidas neste mês.
                          </p>
                          <button type="button" (click)="resetStatusFilter.emit()" class="mt-2 px-3.5 py-1.5 bg-slate-900 dark:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs">
                            Ver Todas as Lojas
                          </button>
                        </div>
                      } @else if (searchQuery) {
                        <p class="font-bold text-slate-700 dark:text-slate-300 text-sm">Nenhuma loja encontrada</p>
                        <p class="text-xs text-slate-400 mt-1">Ajuste o termo da busca ou o filtro.</p>
                      } @else if (!hasMonthlyListForSelectedMonth) {
                        <p class="font-bold text-slate-700 dark:text-slate-200 text-sm">Mês {{ selectedMonth }} em branco</p>
                        <p class="text-xs text-slate-400 mt-1">Nenhuma lista mensal importada para este mês.</p>
                        <a href="#stores" class="inline-block mt-3 px-3.5 py-1.5 bg-teal-600 text-white rounded text-xs font-bold">
                          Ir para Lojas e Subir Lista
                        </a>
                      } @else {
                        <p class="font-bold text-slate-700 dark:text-slate-300 text-sm">Nenhuma loja encontrada</p>
                        <button (click)="resetFilters.emit()" class="mt-3 px-3.5 py-1.5 bg-teal-600 text-white rounded text-xs font-bold cursor-pointer">
                          Ver Todas as Lojas
                        </button>
                      }
                    </div>
                  }
                </div>
  `
})
export class BillMobileCardsComponent {
  @Input({ required: true }) unit = 'kWh';
  @Input({ required: true }) selectedMonth = '';
  @Input({ required: true }) prevMonth = '';
  @Input({ required: true }) rows: BillTableRow[] = [];
  @Input({ required: true }) statusFilter = 'all';
  @Input({ required: true }) searchQuery = '';
  @Input({ required: true }) hasMonthlyListForSelectedMonth = true;
  @Input({ required: true }) canEdit = false;
  @Input({ required: true }) isReadingOcr: string | null = null;
  @Input({ required: true }) isCapturingPhoto: string | null = null;
  @Input({ required: true }) ocrCurrentModelLabel = '';
  @Input({ required: true }) ocrFeedback: Record<string, OcrFeedbackItem> = {};
  @Input({ required: true }) ocrPending: Record<string, OcrPendingConfirmation> = {};
  @Input({ required: true }) meterPhotos: Record<string, MeterPhotoRecord> = {};

  @Output() toggleExcludeFromBill = new EventEmitter<string>();
  @Output() readingChange = new EventEmitter<ReadingFieldChangeEvent>();
  @Output() readingBlur = new EventEmitter<string>();
  @Output() dismissOcrFeedback = new EventEmitter<string>();
  @Output() confirmOcrReading = new EventEmitter<ConfirmOcrEvent>();
  @Output() retryOcrWithOtherEngine = new EventEmitter<string>();
  @Output() openQuickJustifyModal = new EventEmitter<BillTableRow>();
  @Output() quickJustifyStore = new EventEmitter<QuickJustifyEvent>();
  @Output() confirmAnomaly = new EventEmitter<string>();
  @Output() markRollover = new EventEmitter<string>();
  @Output() clearNote = new EventEmitter<string>();
  @Output() applyQuickTag = new EventEmitter<QuickTagEvent>();
  @Output() openNoteEditor = new EventEmitter<NoteEditorOpenEvent>();
  @Output() openPhotoViewer = new EventEmitter<PhotoViewerOpenEvent>();
  @Output() runOcr = new EventEmitter<string>();
  @Output() photoCaptured = new EventEmitter<PhotoCaptureEvent>();
  @Output() deletePhoto = new EventEmitter<PhotoDeleteEvent>();
  @Output() resetStatusFilter = new EventEmitter<void>();
  @Output() resetFilters = new EventEmitter<void>();
}
