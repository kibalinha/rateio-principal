import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-prev-month-audit-modal',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    @if (isOpen && audit) {
      <div class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
           (click)="onClose()">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
             (click)="$event.stopPropagation()">
          
          <!-- Modal Header -->
          <div class="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center text-xl shadow-md shrink-0">
                ⏮️
              </div>
              <div>
                <h3 class="font-black text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <span>Conferência vs Mês Anterior</span>
                  <span class="text-xs px-2 py-0.5 rounded-full font-mono font-bold"
                        [class]="audit.pendingCount > 0 ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700'">
                    {{ selectedMonth }} vs {{ previousMonth }}
                  </span>
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Lojas de <strong>{{ utilityType === 'luz' ? 'Energia/Luz' : (utilityType === 'agua' ? 'Água' : 'Gás') }}</strong> que tiveram consumo/leitura em {{ previousMonth }}.
                </p>
              </div>
            </div>
            <button (click)="onClose()" 
              class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-base font-bold cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Stats Bar -->
          <div class="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-center py-3 text-xs">
            <div>
              <div class="text-[10px] uppercase font-bold text-slate-400">Medidas Mês Anterior</div>
              <div class="text-lg font-black font-mono text-slate-800 dark:text-slate-100 mt-0.5">{{ audit.totalCount }}</div>
            </div>
            <div>
              <div class="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Já Lidas Neste Mês</div>
              <div class="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">{{ audit.completedCount }}</div>
            </div>
            <div>
              <div class="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Faltam Ler</div>
              <div class="text-lg font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5">{{ audit.pendingCount }}</div>
            </div>
          </div>

          <!-- Tabs: Pendentes vs Já Lidas -->
          <div class="px-5 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button type="button"
                (click)="tab.set('pending')"
                [class]="tab() === 'pending' ? 'bg-amber-600 text-white font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
                class="px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5">
                <span>⚠️ Faltam Ler</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
                      [class]="tab() === 'pending' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'">
                  {{ audit.pendingCount }}
                </span>
              </button>
              <button type="button"
                (click)="tab.set('completed')"
                [class]="tab() === 'completed' ? 'bg-emerald-600 text-white font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
                class="px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5">
                <span>✅ Já Lidas</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
                      [class]="tab() === 'completed' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'">
                  {{ audit.completedCount }}
                </span>
              </button>
            </div>

            @if (audit.pendingCount > 0) {
              <button type="button"
                (click)="filterAndClose.emit()"
                class="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900 text-amber-950 dark:text-amber-100 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs">
                <span>🔍 Filtrar na Tabela</span>
              </button>
            }
          </div>

          <!-- List Content -->
          <div class="overflow-y-auto p-4 sm:p-5 flex-1 divide-y divide-slate-100 dark:divide-slate-800 space-y-2">
            @if (tab() === 'pending') {
              @if (audit.pendingCount === 0) {
                <div class="py-12 text-center">
                  <div class="text-5xl mb-3">🎉</div>
                  <h4 class="font-black text-slate-800 dark:text-white text-base">Nenhuma loja esquecida!</h4>
                  <p class="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                    Todas as lojas que foram medidas em <strong>{{ previousMonth }}</strong> já possuem leitura registrada ou justificativa neste mês.
                  </p>
                </div>
              } @else {
                <!-- Card Inteligente de Aprendizado de Consumo Zero em Lote -->
                @if (audit.frequentZeroPending && audit.frequentZeroPending.length > 0) {
                  <div class="mb-3 p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 rounded-2xl border border-amber-300 dark:border-amber-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div class="flex items-start gap-2.5">
                      <span class="text-2xl shrink-0">💡</span>
                      <div>
                        <strong class="text-xs font-bold text-amber-950 dark:text-amber-100 block">
                          Aprendizado de Consumo Zero: {{ audit.frequentZeroPending.length }} lojas com histórico recorrente sem consumo
                        </strong>
                        <p class="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-snug">
                          Lojas fechadas, desocupadas ou sem medição frequente nos meses anteriores. Deseja justificar e preencher todas com 1 clique?
                        </p>
                      </div>
                    </div>
                    <button type="button"
                      (click)="batchJustifyZero.emit()"
                      class="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-black rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-transform active:scale-95">
                      <span>⚡ Preencher {{ audit.frequentZeroPending.length }} Lojas em 1 Toque</span>
                    </button>
                  </div>
                }

                @for (store of audit.pendingStores; track store.storeId) {
                  <div class="pt-2 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-850/50 p-2.5 rounded-2xl transition-colors">
                    <div class="flex items-start gap-3">
                      <div class="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 flex items-center justify-center font-mono font-black text-xs shrink-0 border border-amber-300 dark:border-amber-800">
                        {{ store.luc }}
                      </div>
                      <div>
                        <div class="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5 flex-wrap">
                          @if (store.routeOrder) {
                            <span class="text-[10px] font-mono font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-1.5 py-0.2 rounded border border-indigo-200 dark:border-indigo-800" title="Ordem física de caminhada no shopping">
                              #{{ store.routeOrder }}
                            </span>
                          }
                          <span>{{ store.storeName }}</span>
                          @if (store.isFrequentZero) {
                            <span class="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-300 dark:border-amber-700 flex items-center gap-0.5">
                              <span>💡 Consumo 0 Recorrente ({{ store.consecutiveZeroMonths }}m)</span>
                            </span>
                          }
                          @if (store.contrato) {
                            <span class="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                              Ctr: {{ store.contrato }}
                            </span>
                          }
                          @if (store.meterNumber) {
                            <span class="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                              Med: {{ store.meterNumber }}
                            </span>
                          }
                        </div>
                        <div class="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1 flex items-center gap-2">
                          <span>Leitura Anterior: <strong class="text-slate-700 dark:text-slate-200">{{ store.prevReading | number:'1.0-2' }}</strong></span>
                          <span>•</span>
                          <span>Consumo Anterior: <strong class="text-teal-700 dark:text-teal-400">{{ store.prevConsumption | number:'1.0-2' }} {{ unit }}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1.5 self-end sm:self-auto shrink-0 flex-wrap">
                      @if (store.isFrequentZero) {
                        <button type="button"
                          (click)="quickJustify.emit({ storeId: store.storeId, reason: store.learnedReason, replicateReading: true })"
                          class="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/70 hover:bg-amber-100 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1 shadow-2xs whitespace-nowrap"
                          title="Histórico de consumo zero: preencher rapidamente com 0">
                          <span>⚡ 0 {{ unit }}</span>
                        </button>
                      }
                      <button type="button"
                        (click)="openJustifyStore.emit(store)"
                        class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1 shadow-2xs whitespace-nowrap"
                        title="Justificar loja (fechada, vaga, reforma)">
                        <span>⚖️ Justificar</span>
                      </button>
                      <button type="button"
                        (click)="jumpToStore.emit(store.storeId)"
                        class="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap transition-transform active:scale-95">
                        <span>✏️ Preencher</span>
                      </button>
                    </div>
                  </div>
                }
              }
            } @else {
              <!-- Tab: Lojas Já Lidas -->
              @for (store of audit.completedStores; track store.storeId) {
                <div class="pt-2 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-850/50 p-2.5 rounded-2xl transition-colors">
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-mono font-black text-xs shrink-0 border border-emerald-300 dark:border-emerald-800">
                      {{ store.luc }}
                    </div>
                    <div>
                      <div class="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5 flex-wrap">
                        <span>{{ store.storeName }}</span>
                        @if (store.isJustified) {
                          <span class="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800">
                            ⚖️ Justificada: {{ store.justificationReason || store.note }}
                          </span>
                        } @else {
                          <span class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                            ✓ Lida
                          </span>
                        }
                      </div>
                      <div class="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1 flex items-center gap-2">
                        <span>Ant: <strong>{{ store.prevReading | number:'1.0-2' }}</strong></span>
                        <span>➜</span>
                        <span>Atual: <strong class="text-emerald-700 dark:text-emerald-300">{{ store.currentReading | number:'1.0-2' }}</strong></span>
                        <span>•</span>
                        <span>Consumo: <strong class="text-slate-700 dark:text-slate-200">{{ store.consumption | number:'1.0-2' }} {{ unit }}</strong></span>
                      </div>
                    </div>
                  </div>

                  <button type="button"
                    (click)="jumpToStore.emit(store.storeId)"
                    class="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap shrink-0 transition-colors">
                    <span>Ver na tabela</span>
                  </button>
                </div>
              }
            }
          </div>

          <!-- Modal Footer -->
          <div class="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850 flex items-center justify-between gap-3">
            <span class="text-xs text-slate-500 dark:text-slate-400">
              @if (audit.pendingCount > 0) {
                Ainda restam <strong class="text-amber-600 dark:text-amber-400">{{ audit.pendingCount }} lojas</strong> para completar a conferência.
              } @else {
                <span class="text-emerald-600 dark:text-emerald-400 font-bold">✓ Conferência concluída com sucesso!</span>
              }
            </span>
            <div class="flex items-center gap-2">
              @if (audit.pendingCount > 0) {
                <button type="button"
                  (click)="filterAndClose.emit()"
                  class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer transition-all">
                  Filtrar as {{ audit.pendingCount }} na Tela
                </button>
              }
              <button type="button"
                (click)="onClose()"
                class="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-colors">
                Fechar
              </button>
            </div>
          </div>

        </div>
      </div>
    }
  `
})
export class PrevMonthAuditModalComponent {
  @Input() isOpen = false;
  @Input() audit: any = null;
  @Input() selectedMonth = '';
  @Input() previousMonth = '';
  @Input() utilityType = 'luz';
  @Input() unit = '';

  @Output() filterAndClose = new EventEmitter<void>();
  @Output() batchJustifyZero = new EventEmitter<void>();
  @Output() quickJustify = new EventEmitter<{ storeId: string; reason: string; replicateReading: boolean }>();
  @Output() openJustifyStore = new EventEmitter<any>();
  @Output() jumpToStore = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  tab = signal<'pending' | 'completed'>('pending');

  onClose() {
    this.closed.emit();
  }
}
