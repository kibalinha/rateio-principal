import { Component, Input } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { BillCalculatorComponent } from './bill-calculator.component';

@Component({
  selector: 'app-bill-desktop-table',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DecimalPipe],
  template: `
              <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                <thead class="sticky top-0 z-20 shadow-md backdrop-blur-md transition-all border-b-2"
                       [class]="calc.utilityType() === 'luz' 
                         ? 'bg-slate-900/95 text-white border-amber-400' 
                         : (calc.utilityType() === 'gas' 
                           ? 'bg-slate-900/95 text-white border-orange-500' 
                           : 'bg-slate-900/95 text-white border-teal-400')">
                  <tr>
                    <th (click)="calc.toggleSort('storeName')" class="p-3 font-bold uppercase text-[11px] tracking-wider w-28 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Loja">
                      <div class="flex items-center justify-between gap-1">
                        <span>Loja</span>
                        <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'storeName' || calc.sortBy() === 'name'" [class.opacity-40]="calc.sortBy() !== 'storeName' && calc.sortBy() !== 'name'">
                          {{ (calc.sortBy() === 'storeName' || calc.sortBy() === 'name') ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    <th (click)="calc.toggleSort('prevReading')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-28 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Leitura / Consumo Anterior">
                      <div class="flex items-center justify-center gap-1">
                        <span>Leit. / Cons. Ant.</span>
                        <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'prevReading' || calc.sortBy() === 'prevConsumption'" [class.opacity-40]="calc.sortBy() !== 'prevReading' && calc.sortBy() !== 'prevConsumption'">
                          {{ (calc.sortBy() === 'prevReading' || calc.sortBy() === 'prevConsumption') ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    <th (click)="calc.toggleSort('currentReading')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-24 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Leitura Atual">
                      <div class="flex items-center justify-end gap-1">
                        <span>Leitura</span>
                        <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'currentReading'" [class.opacity-40]="calc.sortBy() !== 'currentReading'">
                          {{ calc.sortBy() === 'currentReading' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    @if (calc.utilityType() === 'luz') {
                      <th (click)="calc.toggleSort('constant')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-16 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Constante">
                        <div class="flex items-center justify-center gap-1">
                          <span>Const.</span>
                          <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'constant'" [class.opacity-40]="calc.sortBy() !== 'constant'">
                            {{ calc.sortBy() === 'constant' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                          </span>
                        </div>
                      </th>
                    }
                    <th (click)="calc.toggleSort('virtual')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-20 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Virtual">
                      <div class="flex items-center justify-end gap-1">
                        <span>Virtual</span>
                        <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'virtual'" [class.opacity-40]="calc.sortBy() !== 'virtual'">
                          {{ calc.sortBy() === 'virtual' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    @if (calc.utilityType() === 'gas') {
                       <th (click)="calc.toggleSort('adjustment')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-16 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Ajuste Multiplicador">
                         <div class="flex items-center justify-center gap-1">
                           <span>Aj(x)</span>
                           <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'adjustment'" [class.opacity-40]="calc.sortBy() !== 'adjustment'">
                             {{ calc.sortBy() === 'adjustment' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                           </span>
                         </div>
                       </th>
                       <th (click)="calc.toggleSort('adjustmentAdd')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-20 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ajuste Adicional em R\$ (soma ao valor final a pagar)">
                         <div class="flex items-center justify-center gap-1">
                           <span>Aj(+) R\$</span>
                           <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'adjustmentAdd'" [class.opacity-40]="calc.sortBy() !== 'adjustmentAdd'">
                             {{ calc.sortBy() === 'adjustmentAdd' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                           </span>
                         </div>
                       </th>
                       <th (click)="calc.toggleSort('fcm')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-16 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por FCM">
                         <div class="flex items-center justify-center gap-1">
                           <span>FCM</span>
                           <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'fcm'" [class.opacity-40]="calc.sortBy() !== 'fcm'">
                             {{ calc.sortBy() === 'fcm' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                           </span>
                         </div>
                       </th>
                    } @else {
                       <th (click)="calc.toggleSort('adjustment')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-16 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Ajuste">
                         <div class="flex items-center justify-center gap-1">
                           <span>Ajuste</span>
                           <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'adjustment'" [class.opacity-40]="calc.sortBy() !== 'adjustment'">
                             {{ calc.sortBy() === 'adjustment' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                           </span>
                         </div>
                       </th>
                    }
                    <th (click)="calc.toggleSort('consumption')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-24 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Consumo">
                      <div class="flex items-center justify-end gap-1">
                        <span>{{ calc.utilityType() === 'gas' ? 'Cons. Rateado' : 'Consumo' }}</span>
                        <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'consumption'" [class.opacity-40]="calc.sortBy() !== 'consumption'">
                          {{ calc.sortBy() === 'consumption' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    <th (click)="calc.toggleSort('variation')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-16 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Variação">
                      <div class="flex items-center justify-end gap-1">
                        <span>Var (%)</span>
                        <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'variation'" [class.opacity-40]="calc.sortBy() !== 'variation'">
                          {{ calc.sortBy() === 'variation' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    @if (calc.utilityType() === 'gas') {
                      <th (click)="calc.toggleSort('fluxoCost')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-24 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Fluxo">
                        <div class="flex items-center justify-end gap-1">
                          <span>Fluxo</span>
                          <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'fluxoCost'" [class.opacity-40]="calc.sortBy() !== 'fluxoCost'">
                            {{ calc.sortBy() === 'fluxoCost' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                          </span>
                        </div>
                      </th>
                    }
                    <th (click)="calc.toggleSort('note')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-24 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Observações de Campo">
                      <div class="flex items-center justify-end gap-1">
                        <span>Obs. Campo</span>
                        <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'note'" [class.opacity-40]="calc.sortBy() !== 'note'">
                          {{ calc.sortBy() === 'note' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    <th (click)="calc.toggleSort('hasPhoto')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-24 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Foto do Medidor">
                      <div class="flex items-center justify-center gap-1">
                        <span>Foto Medidor</span>
                        <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'hasPhoto'" [class.opacity-40]="calc.sortBy() !== 'hasPhoto'">
                          {{ calc.sortBy() === 'hasPhoto' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    <th (click)="calc.toggleSort('cost')" class="p-3 font-black uppercase text-[11px] tracking-wider text-right w-28 bg-slate-950 text-emerald-400 cursor-pointer select-none hover:bg-slate-900 transition-colors border-l border-slate-800" title="Ordenar por Custo Total">
                      <div class="flex items-center justify-end gap-1">
                        <span>Custo Total</span>
                        <span class="text-[10px]" [class.opacity-100]="calc.sortBy() === 'cost'" [class.opacity-40]="calc.sortBy() !== 'cost'">
                          {{ calc.sortBy() === 'cost' ? (calc.sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900 transition-colors">
                  @for (item of calc.filteredTableData(); track item.storeId) {
                    <tr [id]="'store-row-' + item.storeId" class="transition-colors group text-xs border-b border-slate-100 dark:border-slate-800/60"
                        [class.hover:bg-slate-50/90]="!item.validationAlert.hasAlert"
                        [class.dark:hover:bg-slate-800/60]="!item.validationAlert.hasAlert"
                        [class.border-l-4]="true"
                        [class.border-l-rose-500]="item.validationAlert.severity === 'critical'"
                        [class.border-l-amber-500]="item.validationAlert.severity === 'warning'"
                        [class.border-l-emerald-500]="item.isRead && !item.validationAlert.hasAlert"
                        [class.border-l-slate-200]="!item.isRead"
                        [class.dark:border-l-slate-700]="!item.isRead"
                        [class.bg-rose-50/30]="item.validationAlert.severity === 'critical'"
                        [class.dark:bg-rose-950/20]="item.validationAlert.severity === 'critical'"
                        [class.bg-amber-50/20]="item.validationAlert.severity === 'warning'"
                        [class.dark:bg-amber-950/15]="item.validationAlert.severity === 'warning'">
                      <td class="p-3 font-medium text-slate-800 dark:text-slate-100 border-r border-slate-100 dark:border-slate-800">
                          <div class="truncate max-w-[140px] font-semibold flex items-center gap-1.5" [title]="item.storeName">
                            <span>{{ item.storeName }}</span>
                            @if (item.validationAlert.hasAlert) {
                              <span class="text-[10px] px-1.5 py-0.5 rounded font-black cursor-help shrink-0 shadow-2xs"
                                [class.bg-rose-600]="item.validationAlert.severity === 'critical'"
                                [class.text-white]="item.validationAlert.severity === 'critical'"
                                [class.bg-amber-500]="item.validationAlert.severity === 'warning'"
                                [class.text-slate-950]="item.validationAlert.severity === 'warning'"
                                [title]="item.validationAlert.message">
                                {{ item.validationAlert.badgeLabel }}
                              </span>
                            }
                          </div>
                          <div class="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5 flex-wrap">
                            @if (item.routeOrder) {
                              <span class="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.2 rounded font-bold shadow-2xs" title="Posição {{ item.routeOrder }} na rota de leitura">#{{ item.routeOrder }}</span>
                            }
                            <span class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1 py-0.5 rounded font-semibold">{{ item.luc }}</span>
                            @if (item.contrato) {
                              <span class="text-slate-300 dark:text-slate-600">•</span>
                              <span class="text-slate-500 dark:text-slate-400 font-medium">Ctr: {{ item.contrato }}</span>
                            }
                            <button type="button" 
                              (click)="calc.toggleExcludeFromBill(item.storeId)" 
                              [disabled]="!calc.canConfigure()"
                              [title]="item.excludedFromBill ? 'Esta loja está FORA DO SAP (seu consumo e custo vão para a Área Comum). Clique para incluir no SAP.' : 'Esta loja entra no Valor SAP. Clique para transferir seu valor para a Área Comum (Fora do SAP).'" 
                              class="text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1 transition-all border shadow-2xs disabled:opacity-60 disabled:cursor-default"
                              [class]="item.excludedFromBill 
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700' 
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-700'">
                              <span>{{ item.excludedFromBill ? '🚫 Fora do SAP' : '✓ No SAP' }}</span>
                            </button>
                            @if (calc.authService.canConfigureBill()) {
                              <button type="button"
                                (click)="calc.toggleHideFromTech(item.storeId)"
                                [title]="item.hiddenFromTech ? 'Esta loja está OCULTA para o Técnico em Campo (aparece apenas para ADM / SAP). Clique para mostrar novamente ao técnico.' : 'Visível para o Técnico em Campo. Clique para ocultar do técnico sem excluir do rateio/SAP.'"
                                class="text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1 transition-all border shadow-2xs"
                                [class]="item.hiddenFromTech
                                  ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-purple-700 dark:text-slate-400 border-slate-200 dark:border-slate-700'">
                                <span>{{ item.hiddenFromTech ? '🙈 Só ADM' : '👁️ Téc.' }}</span>
                              </button>
                            }
                            <button type="button" (click)="calc.openStoreVoucher(item)" title="Gerar espelho do lojista" class="ml-auto text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-0.5"><span>📲</span><span>Espelho</span></button>
                          </div>
                      </td>
                      <td class="p-2.5 text-center font-mono border-r border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        <div class="font-bold text-slate-700 dark:text-slate-300 text-xs tabular-nums" [title]="'Leitura registrada no medidor no mês anterior (' + (item.prevReadingMonth || 'mês anterior') + ')'">
                          {{ item.prevReading | number:'1.0-0' }}
                        </div>
                        <div class="text-[10px] font-sans font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800/80 mt-1 inline-block" [title]="'Consumo faturado no mês anterior (' + (item.prevReadingMonth || 'mês anterior') + ')'">
                          Ant: {{ item.prevConsumption | number:'1.0-2' }} {{ calc.getUnit() }}
                        </div>
                        @if (item.prevReadingMonth && item.prevReadingMonth !== calc.getPreviousMonth(calc.selectedMonth()) && item.prevReading > 0) {
                          <span class="block text-[9px] text-indigo-600 dark:text-indigo-400 font-bold font-sans mt-0.5" [title]="'Última leitura válida no histórico (' + item.prevReadingMonth + ')'">
                            Ref: {{ item.prevReadingMonth }}
                          </span>
                        }
                      </td>
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                         <div class="flex flex-col gap-1">
                            <input type="number" 
                              step="0.0001" 
                              inputmode="decimal"
                              [ngModel]="item.currentReading" 
                              (ngModelChange)="calc.updateDetailedReading(item.storeId, 'reading', \$event)" 
                              (blur)="calc.onReadingBlur(item.storeId)"
                              (keyup.enter)="calc.onReadingBlur(item.storeId)"
                              (paste)="calc.onPasteCell(\$event, item.storeId, 'reading')" 
                              [disabled]="!calc.canEdit()" 
                              [id]="'reading-input-' + item.storeId"
                              class="w-full text-right bg-white dark:bg-slate-950 dark:text-white border-2 rounded-lg px-2 py-1 focus:ring-2 font-mono font-black tabular-nums transition-all text-xs"
                              [class.border-rose-500]="item.validationAlert.severity === 'critical'"
                              [class.ring-2]="item.validationAlert.hasAlert && !item.anomalyConfirmed"
                              [class.ring-rose-400]="item.validationAlert.severity === 'critical' && !item.anomalyConfirmed"
                              [class.border-amber-500]="item.validationAlert.severity === 'warning' && !item.anomalyConfirmed"
                              [class.ring-amber-400]="item.validationAlert.severity === 'warning' && !item.anomalyConfirmed"
                              [class.border-emerald-400]="(item.isRead && !item.validationAlert.hasAlert) || item.anomalyConfirmed"
                              [class.border-slate-300]="!item.isRead"
                              [class.dark:border-slate-700]="!item.isRead"
                              [title]="item.validationAlert.hasAlert ? item.validationAlert.message : ''"
                              placeholder="0">

                            @if (item.validationAlert.hasAlert) {
                              <button type="button" 
                                (click)="calc.openAnomalyModal(item)"
                                class="text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1 shadow-2xs transition-all w-fit self-end"
                                [class]="item.anomalyConfirmed 
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                  : (item.validationAlert.severity === 'critical'
                                      ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800 animate-pulse'
                                      : 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800')">
                                <span>{{ item.validationAlert.badgeLabel }}</span>
                              </button>
                            }

                            @if (item.isJustified) {
                              <div class="flex items-center justify-between gap-1 mt-0.5">
                                <span class="text-[9px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 px-1.5 py-0.2 rounded border border-amber-300 dark:border-amber-800 truncate" [title]="'Justificada: ' + (item.justificationReason || '')">
                                  ⚖️ {{ item.justificationReason || 'Justificada' }}
                                </span>
                                @if (calc.canEdit()) {
                                  <button type="button" 
                                    (click)="calc.openQuickJustifyModal(item)"
                                    class="text-[9px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                    title="Alterar justificativa">✏️</button>
                                }
                              </div>
                            } @else if (calc.canEdit() && !item.isRead) {
                              <div class="flex items-center gap-1 justify-end mt-0.5">
                                @if (item.isFrequentZero) {
                                  <button type="button" 
                                    (click)="quickJustifyStore(item.storeId, item.learnedReason || 'Loja Fechada / Vaga', true)"
                                    class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 cursor-pointer shadow-2xs flex items-center gap-0.5"
                                    [title]="'Preenchimento rápido: ' + item.consecutiveZeroMonths + ' meses com consumo zero (' + item.learnedReason + ')'">
                                    <span>⚡ 0</span>
                                  </button>
                                }
                                <button type="button"
                                  (click)="calc.openQuickJustifyModal(item)"
                                  class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 cursor-pointer"
                                  title="Justificar loja não lida (ex: fechada/em reforma)">
                                  <span>⚖️ Justificar</span>
                                </button>
                              </div>
                            }
                         </div>
                      </td>
                      
                      @if (calc.utilityType() === 'luz') {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.0001" [ngModel]="item.constant" (ngModelChange)="calc.updateDetailedReading(item.storeId, 'constant', \$event)" (paste)="calc.onPasteCell(\$event, item.storeId, 'constant')" [disabled]="!calc.canConfigure()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-600 dark:text-slate-300 disabled:opacity-50" placeholder="1">
                          </td>
                      }
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                          <input type="number" step="0.0001" [ngModel]="item.virtual" (ngModelChange)="calc.updateDetailedReading(item.storeId, 'virtual', \$event)" (paste)="calc.onPasteCell(\$event, item.storeId, 'virtual')" [disabled]="!calc.canConfigure()" class="w-full text-right bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 focus:border-teal-500 text-blue-600 dark:text-blue-400 placeholder-slate-300 disabled:border-none disabled:text-slate-400 font-semibold" placeholder="—" title="Consumo Virtual (override manual - deixe vazio para usar medição normal)">
                      </td>

                      @if (calc.utilityType() === 'gas') {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.000001" [ngModel]="item.adjustment" (ngModelChange)="calc.updateDetailedReading(item.storeId, 'adjustment', \$event)" (paste)="calc.onPasteCell(\$event, item.storeId, 'adjustment')" [disabled]="!calc.canConfigure()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-500 dark:text-slate-400 disabled:opacity-50" placeholder="1.347">
                          </td>
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.01" [ngModel]="item.adjustmentAdd" (ngModelChange)="calc.updateDetailedReading(item.storeId, 'adjustmentAdd', \$event)" (paste)="calc.onPasteCell(\$event, item.storeId, 'adjustmentAdd')" [disabled]="!calc.canConfigure()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-600 dark:text-slate-300 disabled:opacity-50 font-mono" placeholder="0.00" title="Ajuste Adicional em R\$ (soma ao valor final a pagar)">
                          </td>
                           <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.000001" [ngModel]="item.fcm" (ngModelChange)="calc.updateDetailedReading(item.storeId, 'fcm', \$event)" (paste)="calc.onPasteCell(\$event, item.storeId, 'fcm')" [disabled]="!calc.canConfigure()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-500 dark:text-slate-400 disabled:opacity-50" placeholder="1.0727">
                          </td>
                      } @else {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                            <input type="number" step="0.000001" [ngModel]="item.adjustment" (ngModelChange)="calc.updateDetailedReading(item.storeId, 'adjustment', \$event)" (paste)="calc.onPasteCell(\$event, item.storeId, 'adjustment')" [disabled]="!calc.canConfigure()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-500 dark:text-slate-400 disabled:opacity-50" placeholder="1">
                          </td>
                      }
                      <td class="p-3 text-right font-mono border-r border-slate-100 dark:border-slate-800">
                        <div class="font-black text-slate-800 dark:text-slate-100 text-sm tabular-nums" [title]="'Consumo atual faturado: ' + (item.consumption | number:'1.0-4') + ' ' + calc.getUnit() + (item.prevConsumption ? ' (Mês anterior: ' + (item.prevConsumption | number:'1.0-2') + ' ' + calc.getUnit() + ')' : '')">
                          {{ item.consumption | number:'1.0-4' }}
                        </div>
                        <div class="text-[10px] text-slate-400 dark:text-slate-500 font-sans font-medium mt-0.5" title="Consumo registrado no mês anterior">
                          ant: {{ item.prevConsumption | number:'1.0-2' }}
                        </div>
                        @if (item.isGasDistributed) {
                          <div class="text-[10px] text-orange-600 dark:text-orange-400 font-sans font-bold" [title]="'Medição bruta em campo: ' + (item.rawConsumption | number:'1.0-4') + ' m³ (ajustado pelo fator ' + (item.gasFactor | number:'1.4-4') + 'x)'">
                            bruto: {{ item.rawConsumption | number:'1.0-2' }}
                          </div>
                        }
                      </td>
                      <td class="p-3 text-right font-mono text-[10px] border-r border-slate-100 dark:border-slate-800">
                        @if (item.variation !== 0) {
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded-md font-bold tabular-nums shadow-2xs" 
                                [class]="item.variation > 0 ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'">
                            {{ item.variation > 0 ? '+' : '' }}{{ item.variation | number:'1.1-1' }}%
                          </span>
                        } @else {
                          <span class="text-slate-400 dark:text-slate-500 font-mono text-[10px]">0,0%</span>
                        }
                      </td>
                      @if (calc.utilityType() === 'gas') {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.01" [ngModel]="item.fluxoCost" (ngModelChange)="calc.updateDetailedReading(item.storeId, 'fluxoCost', \$event)" (paste)="calc.onPasteCell(\$event, item.storeId, 'fluxoCost')" [disabled]="!calc.canConfigure()" class="w-full text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-600 dark:text-slate-300 disabled:opacity-50" placeholder="0.00">
                          </td>
                      }
                      <!-- Observação de Campo Desktop -->
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800 text-right">
                        @if (item.note) {
                          <span class="inline-block max-w-[100px] truncate bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded text-[10px] shadow-2xs font-medium" [title]="item.note">
                            {{ item.note }}
                          </span>
                        } @else {
                          <button (click)="calc.openNoteEditor(item.storeId)" class="text-[10px] text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer">
                            + nota
                          </button>
                        }
                      </td>
                      <!-- Foto do Medidor Desktop -->
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800 text-center">
                        @if (calc.isReadingOcr() === item.storeId) {
                          <span class="inline-flex items-center gap-1 text-[10px] text-indigo-700 dark:text-indigo-300 font-bold animate-pulse">
                            <span class="animate-spin text-xs">⚡</span>
                            <span>Lendo IA...</span>
                          </span>
                        } @else if (calc.meterPhotos()[item.storeId]) {
                          <div class="inline-flex items-center gap-1">
                            <button type="button" 
                              (click)="calc.openPhotoViewer(item.storeId)" 
                              class="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded text-[10px] font-bold transition-all cursor-pointer shadow-2xs">
                              <span>📷 Foto</span>
                              @if (calc.meterPhotos()[item.storeId].synced) {
                                <span class="text-[9px] text-teal-600 dark:text-teal-400" title="Foto sincronizada na nuvem com Supabase">☁️</span>
                              } @else {
                                <span class="text-[9px] text-amber-500" title="Salva localmente no IndexedDB, pendente envio para nuvem">⏳</span>
                              }
                            </button>
                            <button type="button" 
                              (click)="runOcrOnPhoto(item.storeId)" 
                              class="inline-flex items-center px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded text-[9px] font-bold transition-all cursor-pointer shadow-2xs"
                              title="Ler visor com IA (Groq Qwen ou Gemini)">
                              <span>⚡</span>
                            </button>
                            <button type="button" 
                              (click)="confirmDeletePhoto(item.storeId, item.storeName)" 
                              class="p-0.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer text-[10px]"
                              title="Excluir foto do medidor">
                              <span>🗑️</span>
                            </button>
                          </div>
                        } @else {
                          <label class="cursor-pointer text-[10px] text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 inline-flex items-center gap-0.5 transition-colors">
                            <span>+ foto</span>
                            <input type="file" 
                              accept="image/*" 
                              capture="environment" 
                              (change)="calc.onPhotoCaptured(\$event, item.storeId, item.storeName, item.luc, item.currentReading)" 
                              class="hidden">
                          </label>
                        }
                      </td>
                      <td class="p-3 text-right font-mono font-black tabular-nums text-sm bg-slate-50/70 dark:bg-slate-950/50 border-l border-slate-100 dark:border-slate-800"
                          [class.text-amber-500]="calc.utilityType() === 'luz'"
                          [class.text-orange-500]="calc.utilityType() === 'gas'"
                          [class.text-teal-700]="calc.utilityType() === 'agua'"
                          [class.dark:text-teal-400]="calc.utilityType() === 'agua'">
                        @if (item.excludedFromBill) {
                          <span class="text-amber-600 dark:text-amber-400 block line-through opacity-60 text-[10px]">
                            {{ item.originalCost | currency:'BRL' }}
                          </span>
                          <span class="text-amber-700 dark:text-amber-300 font-extrabold text-xs block">
                            R\$ 0,00
                          </span>
                          <span class="text-[9px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider block">
                            Fora do SAP (Área Comum)
                          </span>
                        } @else {
                          {{ item.cost | currency:'BRL' }}
                        }
                        @if (item.prevCost) {
                          <div class="text-[10px] text-slate-400 dark:text-slate-500 font-sans font-medium mt-0.5 tracking-tight" [title]="'Valor faturado no mês anterior (' + (item.prevReadingMonth || 'mês anterior') + ')'">
                            ant: {{ item.prevCost | currency:'BRL' }}
                          </div>
                        }
                      </td>
                    </tr>
                  }
                  @if (calc.filteredTableData().length === 0) {
                    <tr>
                      <td colspan="15" class="p-10 text-center text-slate-400 text-xs">
                        @if (calc.statusFilter() === 'prev_missing') {
                          <div class="py-6 space-y-2 max-w-md mx-auto">
                            <div class="text-4xl">✨</div>
                            <p class="font-black text-emerald-600 dark:text-emerald-400 text-sm">Todas as lojas do mês anterior já foram lidas!</p>
                            <p class="text-slate-500 dark:text-slate-400 text-xs">
                              Parabéns! Nenhuma loja que tinha medição em <strong>{{ calc.getPreviousMonth(calc.selectedMonth()) }}</strong> ficou para trás neste mês.
                            </p>
                            <button type="button" (click)="calc.statusFilter.set('all')" class="mt-2 px-3.5 py-1.5 bg-slate-900 dark:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs">
                              Ver Todas as Lojas
                            </button>
                          </div>
                        } @else if (calc.searchQuery()) {
                          Nenhuma loja encontrada para o termo pesquisado.
                        } @else if (!calc.hasMonthlyListForSelectedMonth()) {
                          <div class="py-4 space-y-2 max-w-md mx-auto">
                            <div class="text-3xl">📋</div>
                            <p class="font-bold text-slate-700 dark:text-slate-200 text-sm">Mês {{ calc.selectedMonth() }} em branco</p>
                            <p class="text-slate-400 text-xs">
                              Nenhuma lista de lojas foi importada para <strong>{{ calc.selectedMonth() }}</strong>.
                              Os meses sem importação permanecem em branco.
                            </p>
                            <a href="#stores" class="inline-block mt-2 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-bold transition-colors">
                              Ir para a aba Lojas e Subir Lista Mensal
                            </a>
                          </div>
                        } @else {
                          Nenhuma loja encontrada para os filtros selecionados.
                        }
                      </td>
                    </tr>
                  }
                </tbody>
                <!-- Rodapé Contábil da Tabela Desktop -->
                <tfoot class="sticky bottom-0 z-10 bg-slate-900 text-white border-t-2 border-slate-700 font-mono text-xs shadow-lg">
                  <tr>
                    <td class="p-3 font-bold border-r border-slate-800" colspan="2">
                      <div class="flex items-center justify-between">
                        <span class="text-[11px] uppercase tracking-wider text-slate-400 font-sans">Totais:</span>
                        <span class="text-xs text-slate-200 font-sans font-bold">
                          {{ calc.filteredTableData().length }} lojas ({{ calc.fieldStats().completed }} lidas)
                        </span>
                      </div>
                    </td>
                    <td class="p-3 text-right border-r border-slate-800 text-slate-400 text-[11px]">—</td>
                    @if (calc.utilityType() === 'luz') {
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    }
                    <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    @if (calc.utilityType() === 'gas') {
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    } @else {
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    }
                    <td class="p-3 text-right font-black border-r border-slate-800 text-slate-100 tabular-nums">
                      {{ calc.totalDistributedConsumption() | number:'1.0-4' }}
                    </td>
                    <td class="p-3 text-right border-r border-slate-800 text-slate-500 text-[10px]">—</td>
                    @if (calc.utilityType() === 'gas') {
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    }
                    <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    <td class="p-3 text-right font-black tabular-nums text-sm border-l border-slate-800"
                        [class.text-amber-400]="calc.utilityType() === 'luz'"
                        [class.text-orange-400]="calc.utilityType() === 'gas'"
                        [class.text-teal-300]="calc.utilityType() === 'agua'">
                      {{ calc.totalDistributedCost() | currency:'BRL' }}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
  `
})
export class BillDesktopTableComponent {
  @Input({ required: true }) calc!: BillCalculatorComponent;
}
