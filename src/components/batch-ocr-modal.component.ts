import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-batch-ocr-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen || isRunning) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
          
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl">⚡</span>
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Processamento de Fotos em Lote</span>
                  @if (isRunning) {
                    <span class="animate-pulse bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      Em execução
                    </span>
                  }
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">Extração automática de leituras por IA (Qwen 3.8 / Gemini)</p>
              </div>
            </div>
            @if (!isRunning) {
              <button (click)="onClose()" class="text-slate-400 hover:text-slate-600 text-lg p-1 cursor-pointer">✕</button>
            }
          </div>

          <!-- Progresso Geral -->
          <div class="space-y-3">
            <div class="flex justify-between items-center text-xs">
              <span class="font-bold text-slate-700 dark:text-slate-300">
                Progresso: {{ progress?.current || 0 }} de {{ progress?.total || 0 }} fotos
              </span>
              <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {{ progress?.progressPct || 0 }}%
              </span>
            </div>

            <!-- Barra de Progresso -->
            <div class="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden shadow-inner border border-slate-200 dark:border-slate-700">
              <div class="h-full bg-gradient-to-r from-indigo-500 via-teal-500 to-emerald-500 rounded-full transition-all duration-300"
                   [style.width.%]="progress?.progressPct || 0"></div>
            </div>

            <!-- Loja Atual em Processamento -->
            @if (isRunning && progress?.currentStoreName) {
              <div class="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3 text-xs animate-pulse">
                <div class="flex items-center gap-2">
                  <span class="animate-spin text-base">⏳</span>
                  <div>
                    <div class="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span class="font-mono bg-white dark:bg-slate-800 px-1.5 py-0.2 rounded border border-indigo-200 dark:border-indigo-800 font-bold text-indigo-700 dark:text-indigo-300">{{ progress.currentLuc }}</span>
                      <span>{{ progress.currentStoreName }}</span>
                    </div>
                    <span class="text-[11px] text-slate-500 dark:text-slate-400">Consultando {{ progress.currentModel }}...</span>
                  </div>
                </div>
              </div>
            }

            <!-- Contadores de Resultados em Tempo Real -->
            <div class="grid grid-cols-2 gap-3 pt-1">
              <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2.5">
                <span class="text-xl">✅</span>
                <div>
                  <span class="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 block">Identificadas</span>
                  <strong class="text-base font-mono font-bold text-emerald-700 dark:text-emerald-300">{{ progress?.successCount || 0 }}</strong>
                </div>
              </div>

              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                <span class="text-xl">⚠️</span>
                <div>
                  <span class="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block">Falhas / Ilegíveis</span>
                  <strong class="text-base font-mono font-bold text-slate-700 dark:text-slate-300">{{ progress?.failCount || 0 }}</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- Rodapé / Ações -->
          <div class="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
            @if (isRunning) {
              <span class="text-[11px] text-slate-400 italic">Processando em segundo plano...</span>
              <button 
                type="button" 
                (click)="onCancel()" 
                class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs">
                ⏹️ Cancelar Fila
              </button>
            } @else {
              <button 
                type="button" 
                (click)="onClose()" 
                class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                Fechar
              </button>
              <div class="flex gap-2">
                <button 
                  type="button" 
                  (click)="onExecute(true)" 
                  class="px-3.5 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer"
                  title="Reprocessar todas as fotos deste mês mesmo as que já possuem leitura">
                  🔄 Reprocessar Todas
                </button>
                <button 
                  type="button" 
                  (click)="onExecute(false)" 
                  class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer">
                  ⚡ Processar Pendentes ({{ pendingCount }})
                </button>
              </div>
            }
          </div>

        </div>
      </div>
    }
  `
})
export class BatchOcrModalComponent {
  @Input() isOpen = false;
  @Input() isRunning = false;
  @Input() progress: any = null;
  @Input() pendingCount = 0;

  @Output() closed = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() execute = new EventEmitter<boolean>();

  onClose() {
    this.closed.emit();
  }

  onCancel() {
    this.cancel.emit();
  }

  onExecute(forceAll: boolean) {
    this.execute.emit(forceAll);
  }
}
