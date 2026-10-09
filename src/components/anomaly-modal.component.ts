import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { AnomalyModalData } from '../models';

@Component({
  selector: 'app-anomaly-modal',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    @if (isOpen && data) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-xs animate-fade-in" (click)="onClose()"></div>
        
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg relative z-10 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-scale-in">
          <!-- Modal Header with Severity Theme -->
          <div class="p-4 sm:p-5 flex items-center justify-between border-b"
               [class]="data.severity === 'critical' 
                 ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-100' 
                 : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-100'">
            <div class="flex items-center gap-3">
              <span class="text-2xl p-2 rounded-xl"
                    [class]="data.severity === 'critical' ? 'bg-rose-200/80 dark:bg-rose-900/60' : 'bg-amber-200/80 dark:bg-amber-900/60'">
                {{ data.severity === 'critical' ? '🚨' : '⚠️' }}
              </span>
              <div>
                <h3 class="font-extrabold text-sm sm:text-base leading-tight">
                  {{ data.title }}
                </h3>
                <p class="text-xs opacity-80 mt-0.5 font-medium">
                  Loja: <strong>{{ data.storeName }}</strong> (LUC {{ data.luc }})
                </p>
              </div>
            </div>
            <button (click)="onClose()" 
                    class="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold p-1 cursor-pointer">✕</button>
          </div>

          <!-- Modal Content & Comparison Box -->
          <div class="p-4 sm:p-6 space-y-4 text-xs sm:text-sm">
            <div class="p-3.5 rounded-xl border bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 space-y-2">
              <p class="text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                {{ data.message }}
              </p>
            </div>

            <!-- Comparison Metrics Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-center">
              <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span class="text-[10px] text-slate-500 uppercase font-bold block font-sans">Leitura Ant.</span>
                <strong class="text-xs sm:text-sm text-slate-800 dark:text-slate-200">{{ data.prevReading | number:'1.0-0' }}</strong>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span class="text-[10px] text-slate-500 uppercase font-bold block font-sans">Leitura Atual</span>
                <strong class="text-xs sm:text-sm text-slate-900 dark:text-white"
                        [class.text-rose-600]="data.severity === 'critical'">
                  {{ data.currentReading | number:'1.0-2' }}
                </strong>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span class="text-[10px] text-slate-500 uppercase font-bold block font-sans">Consumo Atual</span>
                <strong class="text-xs sm:text-sm text-teal-700 dark:text-teal-300">
                  {{ data.consumption | number:'1.0-2' }} {{ data.unit }}
                </strong>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span class="text-[10px] text-slate-500 uppercase font-bold block font-sans">Média Histórica</span>
                <strong class="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                  {{ data.avgConsumption > 0 ? (data.avgConsumption | number:'1.0-1') : '-' }} {{ data.unit }}
                </strong>
              </div>
            </div>

            <div class="bg-amber-50/80 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <span>💡</span>
              <p>
                <strong>Dica de Auditoria:</strong> Se a leitura estiver correta e você conferiu no relógio, confirme abaixo para auditar a medição. Se for virada de relógio (ex: 9999 para 0010), clique em "Virada de Medidor".
              </p>
            </div>
          </div>

          <!-- Modal Action Buttons -->
          <div class="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 justify-end items-center">
            <button type="button" 
                    (click)="onClose()" 
                    class="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-650 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer transition-colors">
              🔍 Conferir Relógio
            </button>

            @if (data.type === 'negative') {
              <button type="button" 
                      (click)="onRollover(data.storeId)" 
                      class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                      title="O medidor passou do limite máximo (ex: 9999 para 0000)">
                <span>🔄 Virada de Medidor</span>
              </button>
            }

            <button type="button" 
                    (click)="onConfirm(data.storeId)" 
                    class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-all">
              <span>✓ Confirmar Leitura</span>
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class AnomalyModalComponent {
  @Input() data: AnomalyModalData | null = null;
  @Input() isOpen = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<string>();
  @Output() rollover = new EventEmitter<string>();

  onClose() {
    this.close.emit();
  }

  onConfirm(storeId: string) {
    this.confirm.emit(storeId);
  }

  onRollover(storeId: string) {
    this.rollover.emit(storeId);
  }
}
