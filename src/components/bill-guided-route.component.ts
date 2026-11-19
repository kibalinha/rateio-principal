import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { BillCalculatorComponent } from './bill-calculator.component';

@Component({
  selector: 'app-bill-guided-route',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
                <div class="p-2 sm:p-5 bg-slate-100 dark:bg-slate-950 min-h-[480px] flex flex-col justify-between transition-colors">
                  @if (calc.currentStepStore(); as stepStore) {
                    <div class="max-w-2xl mx-auto w-full bg-white dark:bg-slate-900 rounded-3xl shadow-md border border-slate-200/90 dark:border-slate-800 p-4 sm:p-6 space-y-4 transition-all">
                      
                      <!-- Barra Superior de Gamificação & Progresso da Rota -->
                      <div class="space-y-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div class="flex items-center justify-between text-xs">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs font-black px-2.5 py-1 bg-indigo-100 dark:bg-indigo-950/90 text-indigo-900 dark:text-indigo-200 rounded-full font-mono border border-indigo-200 dark:border-indigo-800">
                              📍 Rota #{{ stepStore.routeOrder || (calc.stepIndex() + 1) }}
                            </span>
                            <span class="text-xs font-bold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full font-mono">
                              Loja {{ calc.stepIndex() + 1 }} de {{ calc.fieldTableData().length }}
                            </span>
                            @if (stepStore.isRead) {
                              <span class="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-1 rounded-full border border-emerald-300 dark:border-emerald-800 shadow-2xs">
                                ✓ Lida ({{ stepStore.currentReading }})
                              </span>
                            } @else {
                              <span class="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/70 px-2.5 py-1 rounded-full border border-amber-300 dark:border-amber-800 animate-pulse">
                                ⏳ Pendente
                              </span>
                            }
                          </div>

                          <div class="flex items-center gap-2">
                            <button type="button" 
                              (click)="calc.jumpToNextPending()" 
                              class="px-2.5 py-1.5 bg-amber-400 dark:bg-amber-500 hover:bg-amber-500 text-slate-950 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs flex items-center gap-1 shrink-0"
                              title="Pula direto para a próxima loja que ainda não foi lida">
                              <span>⚡</span>
                              <span class="hidden xs:inline">Próx. Pendente</span>
                            </button>
                          </div>
                        </div>

                        <!-- Barra de Progresso Visual da Meta de Coleta -->
                        <div class="space-y-1">
                          <div class="flex justify-between items-center text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            <span>Progresso da Rota: {{ calc.stepReadCount() }} de {{ calc.fieldTableData().length }} lojas</span>
                            <span class="font-mono text-teal-600 dark:text-teal-400">{{ calc.stepProgressPercent() }}%</span>
                          </div>
                          <div class="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200/50 dark:border-slate-700/50">
                            <div class="h-full rounded-full transition-all duration-300"
                                 [style.width.%]="calc.stepProgressPercent()"
                                 [class]="calc.utilityType() === 'luz' 
                                   ? 'bg-gradient-to-r from-amber-400 to-yellow-500' 
                                   : (calc.utilityType() === 'gas' ? 'bg-gradient-to-r from-orange-500 to-rose-500' : 'bg-gradient-to-r from-teal-500 to-emerald-500')">
                            </div>
                          </div>
                        </div>

                        <!-- Seletor Dropdown Rápido de Lojas na Rota -->
                        <div class="pt-1">
                          <select 
                            [ngModel]="calc.stepIndex()" 
                            (ngModelChange)="calc.setStepIndex(\$event)"
                            class="w-full text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2 font-mono text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500">
                            @for (st of calc.fieldTableData(); track st.storeId; let sIdx = \$index) {
                              <option [ngValue]="sIdx">
                                {{ st.routeOrder ? '#' + st.routeOrder + ' ' : '' }}{{ st.luc }} - {{ st.storeName }} {{ st.isRead ? '✓ (' + st.currentReading + ')' : '⏳' }}
                              </option>
                            }
                          </select>
                        </div>
                      </div>

                      <!-- Identificação da Loja e Relógio Físico -->
                      <div class="bg-gradient-to-br from-slate-50 to-slate-100/70 dark:from-slate-800/80 dark:to-slate-900/90 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-2xs">
                        <div class="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-mono font-black text-white bg-slate-950 dark:bg-slate-800 px-3 py-1 rounded-xl shadow-xs border border-transparent dark:border-slate-700 tracking-wider">
                              {{ stepStore.luc }}
                            </span>
                            @if (stepStore.contrato) {
                              <span class="text-xs font-mono text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                Ctr: {{ stepStore.contrato }}
                              </span>
                            }
                            <button type="button" 
                              (click)="calc.toggleExcludeFromBill(stepStore.storeId)" 
                              [title]="stepStore.excludedFromBill ? 'Esta loja está FORA DO SAP (seu consumo e custo vão para a Área Comum). Clique para incluir no SAP.' : 'Esta loja entra no Valor SAP. Clique para transferir seu valor para a Área Comum (Fora do SAP).'"
                              class="text-xs font-bold px-2.5 py-1 rounded-lg cursor-pointer flex items-center gap-1.5 transition-all border shadow-2xs"
                              [class]="stepStore.excludedFromBill 
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700' 
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'">
                              <span>{{ stepStore.excludedFromBill ? '🚫 Fora do SAP' : '✓ No SAP' }}</span>
                            </button>
                          </div>

                          <span class="text-xs font-mono font-bold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/70 px-2.5 py-1 rounded-lg border border-teal-200 dark:border-teal-800 flex items-center gap-1">
                            <span>🏷️ Relógio:</span>
                            <strong>{{ stepStore.meterNumber || ('M-' + stepStore.luc) }}</strong>
                          </span>
                        </div>

                        <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1 leading-tight tracking-tight">
                          {{ stepStore.storeName }}
                        </h2>
                      </div>

                      <!-- COMPARATIVO FOTOGRÁFICO & EVIDÊNCIA (MÊS ANTERIOR vs ESTE MÊS) -->
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        
                        <!-- LADO 1: Foto do Mês Anterior (Referência do Técnico) -->
                        <div class="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/90 dark:border-slate-700 flex flex-col justify-between shadow-2xs">
                          <div>
                            <div class="flex items-center justify-between mb-2">
                              <span class="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1">
                                <span>📷</span>
                                <span>Mês Anterior (Gabarito)</span>
                              </span>
                              @if (calc.prevMonthPhotos()[stepStore.storeId]) {
                                <span class="text-[9px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold">
                                  Foto Salva
                                </span>
                              }
                            </div>

                            @if (calc.prevMonthPhotos()[stepStore.storeId]; as prevPhoto) {
                              <div class="flex items-center gap-3">
                                <div class="relative cursor-pointer shrink-0 group" 
                                     (click)="calc.openPhotoViewer(stepStore.storeId, prevPhoto)"
                                     title="Clique para ampliar a foto do mês anterior">
                                  <img [src]="prevPhoto.photoDataUrl" 
                                       alt="Foto Mês Anterior" 
                                       class="w-16 h-16 object-cover rounded-xl border-2 border-indigo-400 dark:border-indigo-600 shadow-sm group-hover:scale-105 transition-transform">
                                  <span class="absolute -bottom-1 -right-1 bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-xs">
                                    🔍
                                  </span>
                                </div>
                                <div class="flex flex-col text-xs space-y-0.5">
                                  <span class="text-slate-500 dark:text-slate-400 text-[10px]">
                                    {{ prevPhoto.capturedAt | date:'dd/MM/yy' }}
                                  </span>
                                  <span class="text-slate-900 dark:text-slate-100 font-mono font-black text-base">
                                    {{ stepStore.prevReading | number:'1.0-0' }} <span class="text-xs font-normal text-slate-400">{{ calc.getUnit() }}</span>
                                    @if (stepStore.prevReadingMonth && stepStore.prevReadingMonth !== calc.getPreviousMonth(calc.selectedMonth()) && stepStore.prevReading > 0) {
                                      <span class="text-[10px] text-teal-600 dark:text-teal-400 font-bold ml-1">({{ stepStore.prevReadingMonth }})</span>
                                    }
                                  </span>
                                  <span class="text-[11px] text-teal-700 dark:text-teal-400 font-sans font-semibold">
                                    Consumo Ant: <strong>{{ stepStore.prevConsumption | number:'1.0-2' }} {{ calc.getUnit() }}</strong>
                                  </span>
                                  @if (stepStore.prevCost) {
                                    <span class="text-[11px] text-slate-600 dark:text-slate-300 font-sans font-semibold">
                                      Valor Pago Ant: <strong>{{ stepStore.prevCost | currency:'BRL' }}</strong>
                                    </span>
                                  }
                                  <button type="button" 
                                    (click)="calc.openPhotoViewer(stepStore.storeId, prevPhoto)"
                                    class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold text-left cursor-pointer">
                                    Ampliar foto anterior ↗
                                  </button>
                                </div>
                              </div>
                            } @else {
                              <div class="py-1">
                                <span class="text-xs font-mono font-black text-slate-800 dark:text-slate-200 block text-sm">
                                  Leitura Anterior: {{ stepStore.prevReading | number:'1.0-0' }} {{ calc.getUnit() }}
                                  @if (stepStore.prevReadingMonth && stepStore.prevReadingMonth !== calc.getPreviousMonth(calc.selectedMonth()) && stepStore.prevReading > 0) {
                                    <span class="text-[10px] text-teal-600 dark:text-teal-400 font-bold ml-1">({{ stepStore.prevReadingMonth }})</span>
                                  }
                                </span>
                                <span class="text-xs text-teal-700 dark:text-teal-400 font-sans font-semibold block mt-0.5">
                                  Consumo Anterior: <strong>{{ stepStore.prevConsumption | number:'1.0-2' }} {{ calc.getUnit() }}</strong>
                                </span>
                                @if (stepStore.prevCost) {
                                  <span class="text-xs text-slate-600 dark:text-slate-300 font-sans font-semibold block mt-0.5">
                                    Valor Pago Anterior: <strong>{{ stepStore.prevCost | currency:'BRL' }}</strong>
                                  </span>
                                }
                                @if (stepStore.validationAlert.avgConsumption > 0) {
                                  <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                    Média Histórica: {{ stepStore.validationAlert.avgConsumption | number:'1.0-1' }} {{ calc.getUnit() }}
                                  </span>
                                }
                              </div>
                            }
                          </div>
                        </div>

                        <!-- LADO 2: Foto Deste Mês & Leitura por Câmera / OCR -->
                        <div class="p-3.5 bg-teal-50/60 dark:bg-teal-950/40 rounded-2xl border border-teal-200 dark:border-teal-800/80 flex flex-col justify-between shadow-2xs">
                          <div>
                            <div class="flex items-center justify-between mb-2">
                              <span class="text-[10px] uppercase font-black text-teal-800 dark:text-teal-300 tracking-wider flex items-center gap-1">
                                <span>📸</span>
                                <span>Foto Atual (Evidência)</span>
                              </span>
                              @if (calc.meterPhotos()[stepStore.storeId]) {
                                <span class="text-[9px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                                  ✓ Registrada
                                </span>
                              }
                            </div>

                            @if (calc.meterPhotos()[stepStore.storeId]; as curPhoto) {
                              <div class="flex items-center gap-3">
                                <div class="relative cursor-pointer shrink-0 group" 
                                     (click)="calc.openPhotoViewer(stepStore.storeId)"
                                     title="Clique para ver a foto tirada">
                                  <img [src]="curPhoto.photoDataUrl" 
                                       alt="Foto Medidor Atual" 
                                       class="w-16 h-16 object-cover rounded-xl border-2 border-emerald-500 shadow-sm group-hover:scale-105 transition-transform">
                                  <span class="absolute -bottom-1 -right-1 bg-emerald-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-xs">
                                    ✓
                                  </span>
                                </div>
                                <div class="flex flex-col text-xs space-y-1">
                                  <div class="flex items-center gap-1.5 text-[10px]">
                                    <span class="text-slate-500 dark:text-slate-400">{{ curPhoto.capturedAt | date:'dd/MM HH:mm' }}</span>
                                    @if (curPhoto.synced) {
                                      <span class="text-teal-600 dark:text-teal-400 font-bold" title="Salva na nuvem">☁️ Nuvem</span>
                                    } @else {
                                      <span class="text-amber-500 font-bold" title="Salva localmente">💾 Local</span>
                                    }
                                  </div>
                                  <div class="flex items-center gap-2">
                                    <button type="button" 
                                      (click)="runOcrOnPhoto(stepStore.storeId)"
                                      [disabled]="calc.isReadingOcr() === stepStore.storeId"
                                      class="text-[11px] font-bold text-indigo-600 dark:text-indigo-300 hover:underline cursor-pointer flex items-center gap-1">
                                      <span>⚡ Reler com IA</span>
                                    </button>
                                    <label class="text-[11px] text-slate-500 dark:text-slate-400 hover:underline cursor-pointer">
                                      <span>Trocar</span>
                                      <input type="file" accept="image/*" capture="environment" (change)="calc.onPhotoCaptured(\$event, stepStore.storeId, stepStore.storeName, stepStore.luc, stepStore.currentReading)" class="hidden">
                                    </label>
                                    <button type="button" 
                                      (click)="confirmDeletePhoto(stepStore.storeId, stepStore.storeName)" 
                                      class="text-[11px] text-rose-500 dark:text-rose-400 hover:underline cursor-pointer">
                                      <span>Excluir</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            } @else {
                              <label class="cursor-pointer flex flex-col items-center justify-center p-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm">
                                @if (calc.isCapturingPhoto() === stepStore.storeId) {
                                  <span class="animate-spin text-lg mb-1">⏳</span>
                                  <span>Compactando foto...</span>
                                } @else {
                                  <span class="text-xl mb-1">📸</span>
                                  <span>Tirar Foto / Leitura com IA</span>
                                }
                                <input type="file" 
                                       accept="image/*" 
                                       capture="environment" 
                                       (change)="calc.onPhotoCaptured(\$event, stepStore.storeId, stepStore.storeName, stepStore.luc, stepStore.currentReading)" 
                                       class="hidden"
                                       [disabled]="calc.isCapturingPhoto() === stepStore.storeId">
                              </label>
                            }
                          </div>
                        </div>

                      </div>

                      <!-- CAMPO GIGANTE PARA LEITURA ATUAL COM STEPPERS ERGONÔMICOS -->
                      <div class="space-y-2">
                        <div class="flex items-center justify-between">
                          <label class="text-xs uppercase font-black text-slate-700 dark:text-slate-200 tracking-wider flex items-center gap-1">
                            <span>DIGITAR LEITURA ATUAL ({{ calc.getUnit() }}):</span>
                          </label>
                          @if (calc.isReadingOcr() === stepStore.storeId) {
                            <span class="text-[11px] bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse">
                              <span class="animate-spin">⚡</span>
                              <span>{{ ocrCurrentModelLabel() }} lendo visor...</span>
                            </span>
                          }
                        </div>

                        <!-- Feedback de Leitura Automática OCR -->
                        @if (ocrFeedback()[stepStore.storeId]; as fb) {
                          <div class="p-3 rounded-2xl text-xs flex items-center justify-between gap-2 shadow-xs transition-all"
                               [class]="fb.success ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100' : 'bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'">
                            <div class="flex items-center gap-2 truncate">
                              <span class="text-base shrink-0">{{ fb.success ? (fb.provider === 'qwen' ? '⚡' : '🤖') : '⚠️' }}</span>
                              <div class="truncate">
                                <p class="font-bold leading-tight truncate">{{ fb.message }}</p>
                                @if (fb.explanation) {
                                  <p class="text-[10px] opacity-85 mt-0.5 truncate">{{ fb.explanation }}</p>
                                }
                              </div>
                            </div>
                            <button (click)="dismissOcrFeedback(stepStore.storeId)" class="p-1 text-slate-400 hover:text-slate-800 font-bold cursor-pointer">✕</button>
                          </div>
                        }

                        <!-- Conferência da leitura sugerida pela IA -->
                        @if (ocrPending()[stepStore.storeId]; as pend) {
                          <div class="p-3.5 rounded-2xl border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 text-xs space-y-2">
                            <p class="font-bold text-indigo-900 dark:text-indigo-100 text-sm">
                              🤖 A IA leu <span class="font-mono text-lg font-black">{{ pend.ocrValue }}</span> — confere com a foto?
                            </p>
                            @if (pend.confidence !== 'high') {
                              <p class="text-amber-700 dark:text-amber-300 font-semibold">⚠️ Confiança {{ pend.confidence === 'medium' ? 'média' : 'baixa' }}: confira com atenção.</p>
                            }
                            <p class="text-slate-600 dark:text-slate-400">Se estiver errado, corrija o número no campo abaixo e confirme.</p>

                            <!-- Seleção Rápida de Divergência entre Motores de IA no Passo a Passo -->
                            @if (pend.dualCheck && !pend.dualCheck.agreement && pend.dualCheck.qwenValue !== null && pend.dualCheck.geminiValue !== null) {
                              <div class="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 space-y-1.5">
                                <p class="font-bold text-xs flex items-center gap-1">
                                  <span>⚠️</span>
                                  <span>Motores de IA divergiram: toque no valor correto da foto:</span>
                                </p>
                                <div class="grid grid-cols-2 gap-2">
                                  <button type="button" (click)="calc.updateDetailedReading(stepStore.storeId, 'reading', pend.dualCheck.qwenValue); confirmOcrReading(stepStore.storeId, pend.dualCheck.qwenValue)"
                                    class="py-2 px-2 rounded-lg bg-white dark:bg-slate-900 border-2 border-indigo-300 dark:border-indigo-700 font-mono font-bold text-sm hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer text-indigo-700 dark:text-indigo-300">
                                    ⚡ Qwen: {{ pend.dualCheck.qwenValue }}
                                  </button>
                                  <button type="button" (click)="calc.updateDetailedReading(stepStore.storeId, 'reading', pend.dualCheck.geminiValue); confirmOcrReading(stepStore.storeId, pend.dualCheck.geminiValue)"
                                    class="py-2 px-2 rounded-lg bg-white dark:bg-slate-900 border-2 border-teal-300 dark:border-teal-700 font-mono font-bold text-sm hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer text-teal-700 dark:text-teal-300">
                                    🤖 Gemini: {{ pend.dualCheck.geminiValue }}
                                  </button>
                                </div>
                              </div>
                            }
                            @if (stepStore.validationAlert.hasAlert) {
                              <div class="p-2 rounded-lg bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 font-semibold">
                                <p>{{ stepStore.validationAlert.title }}</p>
                                <p class="font-normal mt-0.5">{{ stepStore.validationAlert.message }}</p>
                                <button type="button" (click)="retryOcrWithOtherEngine(stepStore.storeId)"
                                  [disabled]="calc.isReadingOcr() === stepStore.storeId"
                                  class="mt-1.5 w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold cursor-pointer">
                                  🔄 Reler com {{ pend.provider === 'qwen' ? 'Gemini' : 'Qwen' }}
                                </button>
                              </div>
                            }
                            <button type="button" (click)="confirmOcrReading(stepStore.storeId, stepStore.currentReading)"
                              [disabled]="!calc.canEdit()"
                              class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold cursor-pointer">
                              ✓ Confirmar leitura
                            </button>
                          </div>
                        }

                        <!-- Input Numérico Principal -->
                        <div class="relative">
                          <input type="number" 
                            inputmode="decimal"
                            step="0.0001"
                            [ngModel]="stepStore.currentReading" 
                            (ngModelChange)="calc.updateDetailedReading(stepStore.storeId, 'reading', \$event)"
                            (blur)="calc.onReadingBlur(stepStore.storeId)"
                            (keyup.enter)="calc.saveAndNextStep(stepStore)"
                            [disabled]="!calc.canEdit()"
                            class="w-full text-center text-4xl sm:text-5xl font-mono font-black p-4 border-2 rounded-2xl focus:ring-4 transition-all bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-inner"
                            [class.border-rose-500]="stepStore.validationAlert.severity === 'critical'"
                            [class.ring-4]="stepStore.validationAlert.hasAlert"
                            [class.ring-rose-300]="stepStore.validationAlert.severity === 'critical'"
                            [class.bg-rose-50/20]="stepStore.validationAlert.severity === 'critical'"
                            [class.border-amber-500]="stepStore.validationAlert.severity === 'warning'"
                            [class.ring-amber-300]="stepStore.validationAlert.severity === 'warning'"
                            [class.bg-amber-50/20]="stepStore.validationAlert.severity === 'warning'"
                            [class.border-emerald-500]="stepStore.isRead && !stepStore.validationAlert.hasAlert"
                            [class.border-slate-300]="!stepStore.isRead"
                            [class.dark:border-slate-700]="!stepStore.isRead"
                            placeholder="0">
                        </div>

                        <!-- BARRA DE STEPPERS TÁTEIS & REPETIÇÃO DE LEITURA (1 TOQUE) -->
                        <div class="flex items-center gap-1.5 flex-wrap pt-1">
                          <!-- Botão Inteligente: Repetir Leitura Anterior (Consumo 0) -->
                          <button type="button"
                            (click)="calc.copyPreviousReading(stepStore)"
                            [disabled]="!calc.canEdit()"
                            class="flex-1 min-w-[170px] py-2 px-3 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-2xs"
                            title="Preenche a leitura atual exatamente com a anterior (Consumo 0)">
                            <span>🔁</span>
                            <span>Mesma Leitura (Consumo 0)</span>
                          </button>

                          <!-- Steppers Rápidos de Incremento / Decremento -->
                          <div class="flex items-center gap-1 shrink-0">
                            <button type="button"
                              (click)="calc.quickAdjustReading(stepStore, -1)"
                              [disabled]="!calc.canEdit()"
                              class="w-10 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-mono font-black text-xs transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700">
                              -1
                            </button>
                            <button type="button"
                              (click)="calc.quickAdjustReading(stepStore, 1)"
                              [disabled]="!calc.canEdit()"
                              class="w-10 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-mono font-black text-xs transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700">
                              +1
                            </button>
                            <button type="button"
                              (click)="calc.quickAdjustReading(stepStore, 5)"
                              [disabled]="!calc.canEdit()"
                              class="w-10 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-mono font-black text-xs transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700">
                              +5
                            </button>
                            <button type="button"
                              (click)="calc.quickAdjustReading(stepStore, 10)"
                              [disabled]="!calc.canEdit()"
                              class="w-10 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-mono font-black text-xs transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700">
                              +10
                            </button>
                          </div>
                        </div>
                      </div>

                      <!-- ALERTA INSTANTÂNEO DE CONSISTÊNCIA / AUDITORIA -->
                      @if (stepStore.validationAlert.hasAlert) {
                        <div class="p-4 rounded-2xl border text-xs flex items-start gap-3 shadow-sm transition-all"
                             [class.bg-rose-50]="stepStore.validationAlert.severity === 'critical'"
                             [class.border-rose-300]="stepStore.validationAlert.severity === 'critical'"
                             [class.text-rose-950]="stepStore.validationAlert.severity === 'critical'"
                             [class.dark:bg-rose-950/40]="stepStore.validationAlert.severity === 'critical'"
                             [class.dark:border-rose-800]="stepStore.validationAlert.severity === 'critical'"
                             [class.dark:text-rose-200]="stepStore.validationAlert.severity === 'critical'"
                             [class.bg-amber-50]="stepStore.validationAlert.severity === 'warning'"
                             [class.border-amber-300]="stepStore.validationAlert.severity === 'warning'"
                             [class.text-amber-950]="stepStore.validationAlert.severity === 'warning'"
                             [class.dark:bg-amber-950/40]="stepStore.validationAlert.severity === 'warning'"
                             [class.dark:border-amber-800]="stepStore.validationAlert.severity === 'warning'"
                             [class.dark:text-amber-200]="stepStore.validationAlert.severity === 'warning'">
                          <span class="text-2xl shrink-0 leading-none">
                            {{ stepStore.validationAlert.severity === 'critical' ? '🚨' : '⚠️' }}
                          </span>
                          <div class="flex-1 space-y-1.5">
                            <div class="flex items-center justify-between">
                              <strong class="text-sm font-black">{{ stepStore.validationAlert.title }}</strong>
                              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide"
                                [class.bg-rose-600]="stepStore.validationAlert.severity === 'critical'"
                                [class.text-white]="stepStore.validationAlert.severity === 'critical'"
                                [class.bg-amber-500]="stepStore.validationAlert.severity === 'warning'"
                                [class.text-slate-950]="stepStore.validationAlert.severity === 'warning'">
                                {{ stepStore.validationAlert.badgeLabel }}
                              </span>
                            </div>
                            <p class="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                              {{ stepStore.validationAlert.message }}
                            </p>
                            <div class="pt-1 flex flex-wrap items-center gap-2">
                              <button type="button" 
                                (click)="confirmAnomaly(stepStore.storeId)"
                                class="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-lg text-xs hover:bg-slate-50 cursor-pointer shadow-2xs">
                                ✓ Confirmar como Correto
                              </button>
                              @if (stepStore.validationAlert.type === 'negative') {
                                <button type="button" 
                                  (click)="markRollover(stepStore.storeId)"
                                  class="px-3 py-1 bg-indigo-600 text-white font-bold rounded-lg text-xs hover:bg-indigo-700 cursor-pointer shadow-2xs">
                                  🔄 Virada de Relógio
                                </button>
                              }
                            </div>
                          </div>
                        </div>
                      }

                      <!-- Consumo e Custo Estimado em Tempo Real -->
                      @if (stepStore.isRead) {
                        <div class="bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/40 dark:to-emerald-950/30 p-3.5 rounded-2xl border border-teal-200 dark:border-teal-800/80 grid grid-cols-2 gap-3 text-xs shadow-2xs">
                          <div>
                            <span class="text-[10px] uppercase font-black text-teal-800 dark:text-teal-300 block tracking-wider">Consumo Calculado</span>
                            <strong class="font-mono text-xl font-black text-teal-950 dark:text-teal-100">{{ stepStore.consumption | number:'1.0-2' }} {{ calc.getUnit() }}</strong>
                            @if (stepStore.consumption === 0) {
                              <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold block mt-0.5">🟡 Sem Consumo (0)</span>
                            } @else if (stepStore.validationAlert.avgConsumption > 0) {
                              <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                Ref. Média: {{ stepStore.validationAlert.avgConsumption | number:'1.0-1' }} {{ calc.getUnit() }}
                              </span>
                            }
                          </div>
                          <div class="text-right">
                            <span class="text-[10px] uppercase font-black text-teal-800 dark:text-teal-300 block tracking-wider">Custo Estimado</span>
                            <strong class="font-mono text-xl font-black text-teal-950 dark:text-teal-100">{{ stepStore.cost | currency:'BRL' }}</strong>
                            <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">Rateio em Tempo Real</span>
                          </div>
                        </div>
                      }

                      <!-- Observação de Campo e Ocorrências Rápidas -->
                      <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                        <div class="flex items-center justify-between text-xs">
                          <span class="font-bold text-slate-600 dark:text-slate-300">Ocorrência de Campo:</span>
                          <button (click)="calc.openNoteEditor(stepStore.storeId, stepStore.note)" class="text-teal-700 dark:text-teal-400 font-bold hover:underline cursor-pointer">
                            {{ stepStore.note ? 'Editar Nota ✎' : '+ Escrever Nota' }}
                          </button>
                        </div>
                        @if (stepStore.note) {
                          <div class="bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 p-2.5 rounded-xl text-xs flex justify-between items-center shadow-2xs">
                            <span class="font-medium">📝 {{ stepStore.note }}</span>
                            <button (click)="clearNote(stepStore.storeId)" class="text-red-500 hover:text-red-700 font-bold ml-2 cursor-pointer p-1">✕</button>
                          </div>
                        } @else {
                          <div class="flex gap-1.5 flex-wrap">
                            <button (click)="applyQuickTag(stepStore.storeId, 'Porta Fechada')" class="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 transition-all cursor-pointer font-medium active:scale-95 border border-slate-200 dark:border-slate-700">
                              🔒 Porta Fechada
                            </button>
                            <button (click)="applyQuickTag(stepStore.storeId, 'Visor Embaçado')" class="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 transition-all cursor-pointer font-medium active:scale-95 border border-slate-200 dark:border-slate-700">
                              👁️ Visor Embaçado
                            </button>
                            <button (click)="applyQuickTag(stepStore.storeId, 'Relógio Trocado')" class="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 transition-all cursor-pointer font-medium active:scale-95 border border-slate-200 dark:border-slate-700">
                              🔄 Relógio Trocado
                            </button>
                          </div>
                        }
                      </div>

                      <!-- BOTÃO PRINCIPAL DE AÇÃO: SALVAR E PRÓXIMA LOJA (POLEGAR ERGONÔMICO) -->
                      <div class="pt-3 border-t border-slate-200/90 dark:border-slate-800 space-y-2.5">
                        <button type="button" 
                          (click)="calc.saveAndNextStep(stepStore)"
                          class="w-full py-4 px-6 bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 hover:from-teal-700 hover:to-emerald-800 active:scale-98 text-white font-black text-base rounded-2xl shadow-lg shadow-teal-700/25 transition-all flex flex-col items-center justify-center cursor-pointer">
                          <div class="flex items-center gap-2">
                            <span class="text-xl">💾</span>
                            <span>Salvar e Próxima Loja ▶</span>
                          </div>
                          @if (calc.nextStepStore(); as nxt) {
                            <span class="text-[11px] font-normal text-teal-100 opacity-90 mt-0.5">
                              Próxima: #{{ nxt.routeOrder || (calc.stepIndex() + 2) }} {{ nxt.luc }} - {{ nxt.storeName }}
                            </span>
                          } @else {
                            <span class="text-[11px] font-normal text-teal-100 opacity-90 mt-0.5">
                              🏁 Última loja da rota!
                            </span>
                          }
                        </button>

                        <div class="flex items-center gap-2">
                          <button type="button" 
                            (click)="calc.prevStep()" 
                            [disabled]="calc.stepIndex() === 0"
                            class="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer border border-slate-200 dark:border-slate-700 active:scale-95">
                            <span>◀ Anterior</span>
                          </button>

                          <button type="button" 
                            (click)="calc.jumpToNextPending()" 
                            class="flex-1 py-3 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black rounded-xl text-xs transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95">
                            <span>⚡ Pendente</span>
                          </button>

                          <button type="button" 
                            (click)="calc.nextStep()" 
                            [disabled]="calc.stepIndex() >= calc.fieldTableData().length - 1"
                            class="flex-1 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-30 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer border border-slate-300 dark:border-slate-600 active:scale-95">
                            <span>Pular ▶</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  } @else {
                    <div class="max-w-md mx-auto p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div class="text-4xl mb-3">📋</div>
                      <p class="text-base font-bold text-slate-800 dark:text-slate-200">Nenhuma loja cadastrada para este insumo.</p>
                      <p class="text-xs text-slate-400 mt-1">Selecione outro mês ou cadastre as lojas na aba Gerenciar Lojas.</p>
                    </div>
                  }
                </div>
  `
})
export class BillGuidedRouteComponent {
  @Input({ required: true }) calc!: BillCalculatorComponent;
}
