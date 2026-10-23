import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-quick-justify-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen && store) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div class="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                  LUC {{ store.luc }}
                </span>
                @if (store.routeOrder) {
                  <span class="text-xs font-mono font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                    #{{ store.routeOrder }}
                  </span>
                }
              </div>
              <h3 class="font-bold text-slate-900 dark:text-white text-base mt-1.5">{{ store.storeName }}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Selecione o motivo da justificativa para registro em campo e no Excel:</p>
            </div>
            <button (click)="onClose()" class="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg font-bold cursor-pointer">✕</button>
          </div>

          <!-- Opções de Justificativa em 1 Toque -->
          <div class="grid grid-cols-1 gap-2.5">
            <button type="button"
              (click)="selectReason('Loja Fechada / Vaga', true)"
              class="p-3 text-left rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all cursor-pointer flex items-center gap-3 group">
              <span class="text-2xl shrink-0 group-hover:scale-110 transition-transform">🏢</span>
              <div>
                <strong class="text-xs font-bold text-slate-900 dark:text-white block">Loja Fechada / Vaga</strong>
                <span class="text-[11px] text-slate-500 dark:text-slate-400">Replicar leitura anterior (0 {{ unit }}). Exporta no Excel com observação.</span>
              </div>
            </button>

            <button type="button"
              (click)="selectReason('Em Reforma / Obra', true)"
              class="p-3 text-left rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all cursor-pointer flex items-center gap-3 group">
              <span class="text-2xl shrink-0 group-hover:scale-110 transition-transform">🔨</span>
              <div>
                <strong class="text-xs font-bold text-slate-900 dark:text-white block">Em Reforma / Obra</strong>
                <span class="text-[11px] text-slate-500 dark:text-slate-400">Loja em obras sem consumo de hidrômetro/medidor ativo no período.</span>
              </div>
            </button>

            <button type="button"
              (click)="selectReason('Sem Consumo no Mês', true)"
              class="p-3 text-left rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all cursor-pointer flex items-center gap-3 group">
              <span class="text-2xl shrink-0 group-hover:scale-110 transition-transform">⏸️</span>
              <div>
                <strong class="text-xs font-bold text-slate-900 dark:text-white block">Sem Consumo no Mês (0 {{ unit }})</strong>
                <span class="text-[11px] text-slate-500 dark:text-slate-400">Medidor verificado em campo: ponteiro inalterado, consumo zero confirmado.</span>
              </div>
            </button>

            <button type="button"
              (click)="selectReason('Medidor Inacessível / Trancado', true)"
              class="p-3 text-left rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all cursor-pointer flex items-center gap-3 group">
              <span class="text-2xl shrink-0 group-hover:scale-110 transition-transform">🔒</span>
              <div>
                <strong class="text-xs font-bold text-slate-900 dark:text-white block">Medidor Inacessível / Trancado</strong>
                <span class="text-[11px] text-slate-500 dark:text-slate-400">Porta trancada sem acesso pelo técnico. Justificativa registrada para fechamento.</span>
              </div>
            </button>

            <button type="button"
              (click)="selectReason('Sem Ponto / Inativo', true)"
              class="p-3 text-left rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all cursor-pointer flex items-center gap-3 group">
              <span class="text-2xl shrink-0 group-hover:scale-110 transition-transform">❌</span>
              <div>
                <strong class="text-xs font-bold text-slate-900 dark:text-white block">Sem Ponto / Inativo</strong>
                <span class="text-[11px] text-slate-500 dark:text-slate-400">Ponto não conectado a esta utilidade neste ciclo de rateio.</span>
              </div>
            </button>
          </div>

          <div class="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" 
              (click)="onClose()" 
              class="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class QuickJustifyModalComponent {
  @Input() isOpen = false;
  @Input() store: any = null;
  @Input() unit = '';

  @Output() justify = new EventEmitter<{ storeId: string; reason: string; replicateReading: boolean }>();
  @Output() closed = new EventEmitter<void>();

  selectReason(reason: string, replicateReading: boolean = true) {
    if (!this.store) return;
    this.justify.emit({
      storeId: this.store.storeId,
      reason,
      replicateReading
    });
  }

  onClose() {
    this.closed.emit();
  }
}
