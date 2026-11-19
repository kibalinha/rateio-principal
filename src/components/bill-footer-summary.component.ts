import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { UtilityType } from '../models';

@Component({
  selector: 'app-bill-footer-summary',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe],
  template: `
          <div class="rounded-xl overflow-hidden border border-orange-200 dark:border-orange-900/60 shadow-sm font-sans animate-fade-in">
             <!-- Compact Mobile Summary -->
             <div class="md:hidden p-4 bg-orange-50 dark:bg-orange-950/60 space-y-2.5">
                <div class="flex justify-between items-center text-sm">
                   <div class="flex flex-col">
                     <span class="font-bold text-orange-900 dark:text-orange-200">Áreas Comuns</span>
                     <span class="text-[10px] text-orange-700 dark:text-orange-400 font-mono">{{ commonAreaConsumption | number:'1.0-4' }} {{ unit }} ({{ commonAreaPct }}%)</span>
                   </div>
                   <span class="font-mono font-bold text-orange-800 dark:text-orange-300">{{ commonAreaCost | currency:'BRL' }}</span>
                </div>
                @if(utilityType !== 'gas') {
                  <div class="flex justify-between items-center text-sm pt-2 border-t border-orange-200/60 dark:border-orange-900/40">
                     <div class="flex flex-col">
                       <span class="font-bold text-orange-900 dark:text-orange-200">Ar Condicionado</span>
                       <span class="text-[10px] text-orange-700 dark:text-orange-400 font-mono">{{ airConditioningConsumption | number:'1.0-4' }} {{ unit }} ({{ airConditioningPct }}%)</span>
                     </div>
                     <span class="font-mono font-bold text-orange-800 dark:text-orange-300">{{ airConditioningCost | currency:'BRL' }}</span>
                  </div>
                }
                <div class="flex justify-between items-center text-sm pt-2 border-t border-orange-200/60 dark:border-orange-900/40">
                   <div>
                     <span class="font-bold text-orange-900 dark:text-orange-200">Valor SAP (Lojistas)</span>
                     <span class="text-[10px] text-orange-700 dark:text-orange-400 font-mono block">{{ totalDistributedConsumption | number:'1.0-4' }} {{ unit }} ({{ distributedPct }}%)</span>
                     @if (excludedSapCost > 0) {
                       <span class="text-[10px] text-amber-700 dark:text-amber-400 block font-semibold">
                         ({{ excludedSapCount }} loja(s) fora do SAP transferidas para Área Comum: {{ excludedSapCost | currency:'BRL' }})
                       </span>
                     }
                   </div>
                   <span class="font-mono font-bold text-orange-800 dark:text-orange-300">{{ totalDistributedCost | currency:'BRL' }}</span>
                </div>
             </div>

             <!-- Full Desktop Summary (Keep existing layout for desktop) -->
             <div class="hidden md:block">
                <!-- 1. Áreas Comuns Row -->
                <div class="bg-orange-600 text-white grid grid-cols-1 md:grid-cols-12 items-center p-3 border-b border-orange-700">
                    <div class="md:col-span-6 font-bold text-right pr-4 text-sm uppercase tracking-wide">
                      Áreas Comuns
                    </div>
                    <div class="md:col-span-3 text-right pr-4">
                      <div class="font-mono font-bold text-lg leading-tight">{{ commonAreaCost | currency:'BRL' }}</div>
                      <div class="text-xs opacity-80">{{ commonAreaPct }}%</div>
                    </div>
                    <div class="md:col-span-3 text-right font-mono text-sm pl-4 border-l border-orange-500">
                      {{ commonAreaConsumption | number:'1.0-4' }} {{ unit }}
                    </div>
                </div>

                <!-- 2. Ar Condicionado Row -->
                @if(utilityType !== 'gas') {
                  <div class="bg-orange-200 dark:bg-orange-950/70 text-orange-900 dark:text-orange-100 grid grid-cols-1 md:grid-cols-12 items-center p-3 border-b border-orange-300 dark:border-orange-900">
                      <div class="md:col-span-6 font-bold text-right pr-4 text-sm uppercase tracking-wide">
                        Ar Condicionado
                      </div>
                      <div class="md:col-span-3 text-right pr-4">
                        <div class="font-mono font-bold text-lg leading-tight">{{ airConditioningCost | currency:'BRL' }}</div>
                        <div class="text-xs opacity-70">{{ airConditioningPct }}%</div>
                      </div>
                      <div class="md:col-span-3 text-right pl-4 border-l border-orange-300 dark:border-orange-900">
                        <div class="flex items-center justify-end gap-2">
                          <label class="text-[10px] uppercase font-bold opacity-60">Consumo:</label>
                          <input type="text" inputmode="decimal"
                              [value]="acConsumptionFormatted"
                              (input)="acInput.emit($event)"
                              (blur)="acBlur.emit($event)"
                              [disabled]="!canConfigure"
                              class="w-28 px-2 py-1 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-orange-300 dark:border-orange-800 rounded text-right font-mono focus:ring-1 focus:ring-orange-500 disabled:bg-transparent disabled:border-transparent"
                              placeholder="0">
                            <span class="text-xs font-mono">{{ unit }}</span>
                        </div>
                      </div>
                  </div>
                }

                <!-- 3. Valor SAP Row -->
                <div class="bg-orange-700 text-white grid grid-cols-1 md:grid-cols-12 items-center p-3 border-b border-orange-800">
                    <div class="md:col-span-6 text-right pr-4">
                      <div class="font-bold text-sm uppercase tracking-wide">Valor SAP — Incorridos (Lojistas)</div>
                      @if (excludedSapCost > 0) {
                        <div class="text-[11px] text-orange-200">
                          {{ excludedSapCount }} loja(s) fora do SAP transferidas para Área Comum ({{ excludedSapCost | currency:'BRL' }})
                        </div>
                      }
                    </div>
                    <div class="md:col-span-3 text-right pr-4">
                      <div class="font-mono font-bold text-xl leading-tight text-white">{{ totalDistributedCost | currency:'BRL' }}</div>
                      <div class="text-xs opacity-80">{{ distributedPct }}%</div>
                    </div>
                    <div class="md:col-span-3 text-right font-mono text-sm pl-4 border-l border-orange-600">
                      {{ totalDistributedConsumption | number:'1.0-4' }} {{ unit }}
                    </div>
                </div>
             </div>
          </div>
  `
})
export class BillFooterSummaryComponent {
  @Input({ required: true }) utilityType: UtilityType = 'luz';
  @Input({ required: true }) unit = 'kWh';
  @Input({ required: true }) commonAreaConsumption = 0;
  @Input({ required: true }) commonAreaCost = 0;
  @Input({ required: true }) commonAreaPct = '0.0';
  @Input({ required: true }) airConditioningConsumption = 0;
  @Input({ required: true }) airConditioningCost = 0;
  @Input({ required: true }) airConditioningPct = '0.0';
  @Input({ required: true }) totalDistributedConsumption = 0;
  @Input({ required: true }) totalDistributedCost = 0;
  @Input({ required: true }) distributedPct = '0.0';
  @Input({ required: true }) excludedSapCost = 0;
  @Input({ required: true }) excludedSapCount = 0;
  @Input({ required: true }) acConsumptionFormatted = '';
  @Input({ required: true }) canConfigure = false;

  @Output() acInput = new EventEmitter<Event>();
  @Output() acBlur = new EventEmitter<Event>();
}
