import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { OcrFeedbackService } from '../services/ocr-feedback.service';
import { computeOcrStats, OcrBucketStats } from '../services/ocr-stats';

type Period = '30d' | 'all';

@Component({
  selector: 'app-ocr-quality-panel',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    @if (isOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" (click)="close.emit()"></div>

        <div class="relative z-10 w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white">📊 Qualidade do OCR</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">Baseado nas conferências dos técnicos neste aparelho</p>
            </div>
            <button type="button" (click)="close.emit()" class="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg p-1 cursor-pointer">✕</button>
          </div>

          <div class="p-4 overflow-y-auto space-y-5 text-sm">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex gap-2">
                <button type="button" (click)="period.set('30d')"
                  class="px-3 py-1 rounded-full text-xs font-bold border cursor-pointer"
                  [class]="period() === '30d' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'">
                  Últimos 30 dias
                </button>
                <button type="button" (click)="period.set('all')"
                  class="px-3 py-1 rounded-full text-xs font-bold border cursor-pointer"
                  [class]="period() === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'">
                  Tudo
                </button>
              </div>

              <button type="button" (click)="syncCloud()"
                [disabled]="isSyncing()"
                class="px-3 py-1 rounded-full text-xs font-bold border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 cursor-pointer flex items-center gap-1.5 transition-all">
                @if (isSyncing()) {
                  <span class="animate-spin text-xs">⏳</span>
                  <span>Sincronizando...</span>
                } @else {
                  <span>☁️</span>
                  <span>Sincronizar da Nuvem</span>
                }
              </button>
            </div>

            @if (stats().total === 0) {
              <div class="text-center py-10 text-slate-500 dark:text-slate-400">
                <p class="text-3xl mb-2">🤖</p>
                <p class="font-semibold">Ainda não há conferências registradas.</p>
                <p class="text-xs mt-1">Os dados aparecem quando técnicos confirmam ou corrigem leituras feitas pela IA.</p>
              </div>
            } @else {
              <!-- Resumo -->
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <p class="text-2xl font-black font-mono text-slate-900 dark:text-white">{{ stats().total }}</p>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400">Leituras conferidas</p>
                </div>
                <div class="p-3 rounded-xl border"
                     [class]="stats().accuracyPct >= 90 ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800' : (stats().accuracyPct >= 75 ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800' : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800')">
                  <p class="text-2xl font-black font-mono text-slate-900 dark:text-white">{{ stats().accuracyPct }}%</p>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400">Acertos sem correção</p>
                </div>
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <p class="text-2xl font-black font-mono text-slate-900 dark:text-white">{{ stats().corrected }}</p>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400">Corrigidas</p>
                </div>
              </div>

              @if (stats().corrected > 0) {
                <section>
                  <h4 class="font-bold text-slate-800 dark:text-slate-100 mb-1.5">Tipo dos erros</h4>
                  <div class="flex flex-wrap gap-2 text-xs">
                    <span class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">Dígito faltando: <b>{{ stats().errorKinds.missingDigit }}</b></span>
                    <span class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">Dígito a mais: <b>{{ stats().errorKinds.extraDigit }}</b></span>
                    <span class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">Dígito trocado: <b>{{ stats().errorKinds.wrongDigits }}</b></span>
                  </div>
                </section>
              }

              <ng-container *ngTemplateOutlet="table; context: { title: 'Por motor de IA', rows: stats().byProvider }"></ng-container>
              <ng-container *ngTemplateOutlet="table; context: { title: 'Por tipo de medidor', rows: stats().byMeterType }"></ng-container>
              <ng-container *ngTemplateOutlet="table; context: { title: 'Por utilidade', rows: stats().byUtility }"></ng-container>
              <ng-container *ngTemplateOutlet="table; context: { title: 'Por confiança informada pela IA', rows: stats().byConfidence }"></ng-container>

              <section>
                <h4 class="font-bold text-slate-800 dark:text-slate-100 mb-1.5">Lojas com mais correções</h4>
                @if (stats().worstStores.length === 0) {
                  <p class="text-xs text-slate-500 dark:text-slate-400">Nenhuma loja com correções repetidas até agora.</p>
                } @else {
                  <ul class="space-y-1">
                    @for (s of stats().worstStores; track s.key) {
                      <li class="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                        <span class="font-semibold truncate">{{ s.label }}</span>
                        <span class="shrink-0 font-mono">{{ s.corrected }}/{{ s.total }} corrigidas · {{ s.accuracyPct }}%</span>
                      </li>
                    }
                  </ul>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Pode indicar foto difícil, medidor danificado ou visor com reflexo.</p>
                }
              </section>

              <section>
                <h4 class="font-bold text-slate-800 dark:text-slate-100 mb-1.5">Correções recentes</h4>
                <ul class="space-y-1">
                  @for (r of recentCorrections(); track r.id) {
                    <li class="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                      <span class="truncate"><b>{{ r.storeName }}</b> · {{ r.confirmedAt | date:'dd/MM HH:mm' }}</span>
                      <span class="shrink-0 font-mono">{{ r.ocrValue }} → {{ r.finalValue }}</span>
                    </li>
                  } @empty {
                    <li class="text-xs text-slate-500 dark:text-slate-400">Nenhuma correção no período.</li>
                  }
                </ul>
              </section>
            }
          </div>
        </div>
      </div>
    }

    <ng-template #table let-title="title" let-rows="rows">
      @if (rows.length) {
        <section>
          <h4 class="font-bold text-slate-800 dark:text-slate-100 mb-1.5">{{ title }}</h4>
          <div class="space-y-1.5">
            @for (r of rows; track r.key) {
              <div>
                <div class="flex justify-between text-xs mb-0.5">
                  <span class="font-semibold">{{ r.label }}</span>
                  <span class="font-mono text-slate-500 dark:text-slate-400">{{ r.total - r.corrected }}/{{ r.total }} · {{ r.accuracyPct }}%</span>
                </div>
                <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div class="h-full rounded-full"
                       [style.width.%]="r.accuracyPct"
                       [class]="r.accuracyPct >= 90 ? 'bg-emerald-500' : (r.accuracyPct >= 75 ? 'bg-amber-500' : 'bg-rose-500')"></div>
                </div>
              </div>
            }
          </div>
        </section>
      }
    </ng-template>
  `
})
export class OcrQualityPanelComponent {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  private feedback = inject(OcrFeedbackService);
  period = signal<Period>('30d');

  private filtered = computed(() => {
    const all = this.feedback.entries();
    if (this.period() === 'all') return all;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return all.filter(e => new Date(e.confirmedAt).getTime() >= cutoff);
  });

  stats = computed(() => computeOcrStats(this.filtered()));

  recentCorrections = computed(() =>
    this.filtered()
      .filter(e => e.wasCorrected)
      .slice(-8)
      .reverse()
  );

  isSyncing = this.feedback.isSyncingCloud;

  async syncCloud() {
    await this.feedback.syncFromCloud();
  }
}

export type { OcrBucketStats };
