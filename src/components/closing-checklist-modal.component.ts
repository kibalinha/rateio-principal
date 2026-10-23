import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe, DatePipe } from '@angular/common';

@Component({
  selector: 'app-closing-checklist-modal',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, DatePipe],
  template: `
    @if (isOpen && checklist) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div class="absolute inset-0 bg-black/75 backdrop-blur-md animate-fade-in" (click)="onClose()"></div>

        <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl relative z-10 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-scale-in">
          
          <!-- Header do Modal -->
          <div class="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between border-b border-slate-700">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-xl shrink-0">
                🛡️
              </div>
              <div>
                <h3 class="font-extrabold text-base sm:text-lg leading-tight flex items-center gap-2">
                  <span>Auditoria e Fechamento do Mês</span>
                  @if (isLocked) {
                    <span class="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-black uppercase font-mono tracking-wider">
                      🔒 Mês Congelado
                    </span>
                  }
                </h3>
                <p class="text-xs text-slate-300 mt-0.5 font-medium flex items-center gap-2">
                  <span>Insumo: <strong class="text-teal-300 uppercase">{{ utilityType }}</strong></span>
                  <span>•</span>
                  <span>Mês: <strong class="text-white font-mono">{{ selectedMonth }}</strong></span>
                </p>
              </div>
            </div>
            <button (click)="onClose()" class="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer">✕</button>
          </div>

          <!-- Corpo com os 5 Pilares de Segurança -->
          <div class="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
            
            <!-- Resumo Executivo Superior -->
            <div class="p-3.5 rounded-2xl border flex items-center justify-between gap-3 flex-wrap"
                 [class]="checklist.canFreeze 
                   ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200' 
                   : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200'">
              <div class="flex items-center gap-2.5">
                <span class="text-2xl">{{ checklist.canFreeze ? '✅' : '⚠️' }}</span>
                <div>
                  <h4 class="font-bold text-sm">
                    {{ checklist.canFreeze ? 'Rateio Pronto para Fechamento!' : 'Atenção: Existem pendências de conferência' }}
                  </h4>
                  <p class="text-xs opacity-85">
                    {{ checklist.canFreeze 
                      ? 'Todas as lojas foram lidas e as medições estão auditadas sem inconformidades críticas.' 
                      : 'Resolva as pendências abaixo antes de emitir os relatórios definitivos aos lojistas.' }}
                  </p>
                </div>
              </div>
              <div class="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-white/70 dark:bg-slate-900/70 border border-black/10 dark:border-white/10 shrink-0">
                {{ checklist.readings.readStores }}/{{ checklist.readings.totalStores }} Lojas Lidas
              </div>
            </div>

            <!-- PILAR 1: 100% DAS LOJAS ATIVAS LIDAS -->
            <div class="p-4 rounded-2xl border transition-all"
                 [class]="checklist.readings.passed 
                   ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800/70' 
                   : 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-800/70'">
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  <span class="text-lg">{{ checklist.readings.passed ? '✅' : '⏳' }}</span>
                  <div>
                    <strong class="text-sm font-bold text-slate-900 dark:text-white">1. Medição das Lojas (100% Lidas)</strong>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Nenhuma loja ativa pode ficar sem leitura no fechamento.</p>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase font-mono"
                      [class]="checklist.readings.passed 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                        : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'">
                  {{ checklist.readings.passed ? '✓ 100% Concluído' : checklist.readings.pendingStores + ' Pendente(s)' }}
                </span>
              </div>

              @if (!checklist.readings.passed) {
                <div class="mt-3 p-3 bg-amber-50/80 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 space-y-2">
                  <span class="text-[11px] font-bold text-amber-900 dark:text-amber-200 block uppercase">
                    Lojas que ainda faltam ser lidas:
                  </span>
                  <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    @for (p of checklist.readings.pendingList; track p.id) {
                      <button type="button" 
                        (click)="filterPendingStores.emit()"
                        class="px-2 py-0.5 bg-white dark:bg-slate-800 hover:bg-amber-100 text-slate-800 dark:text-slate-200 border border-amber-300 dark:border-amber-700 rounded-md text-[11px] font-medium flex items-center gap-1 cursor-pointer">
                        <span class="font-mono font-bold">{{ p.luc }}</span>
                        <span class="truncate max-w-[120px]">{{ p.name }}</span>
                      </button>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- PILAR 2: ZERO INCONSISTÊNCIAS / AUDITORIA DE ANOMALIAS -->
            <div class="p-4 rounded-2xl border transition-all"
                 [class]="checklist.anomalies.passed 
                   ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800/70' 
                   : 'bg-white dark:bg-slate-900 border-rose-300 dark:border-rose-800/70'">
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  <span class="text-lg">{{ checklist.anomalies.passed ? '✅' : '🚨' }}</span>
                  <div>
                    <strong class="text-sm font-bold text-slate-900 dark:text-white">2. Inconsistências & Alertas Auditados</strong>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Suspeitas de vazamento, leitura menor ou zero a mais devem ser auditadas.</p>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase font-mono"
                      [class]="checklist.anomalies.passed 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'">
                  {{ checklist.anomalies.passed ? '✓ Zero Pendências' : checklist.anomalies.uninspectedCount + ' Alerta(s)' }}
                </span>
              </div>

              @if (!checklist.anomalies.passed) {
                <div class="mt-3 p-3 bg-rose-50/80 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800/60 space-y-2">
                  <span class="text-[11px] font-bold text-rose-900 dark:text-rose-200 block uppercase">
                    Lojas com anomalia sem confirmação em campo:
                  </span>
                  <div class="space-y-1.5 max-h-32 overflow-y-auto">
                    @for (a of checklist.anomalies.uninspectedList; track a.id) {
                      <div class="p-2 bg-white dark:bg-slate-800 rounded-lg border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <span class="font-mono font-bold">{{ a.luc }}</span> • <strong>{{ a.name }}</strong>: 
                          <span class="text-rose-700 dark:text-rose-300 font-semibold ml-1">{{ a.badge }}</span>
                        </div>
                        <button type="button" 
                          (click)="confirmAnomaly.emit(a.id)"
                          class="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold cursor-pointer shrink-0">
                          ✓ Confirmar
                        </button>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- PILAR 3: AUDITORIA DE CONTINUIDADE VS MÊS ANTERIOR (LOJAS ESQUECIDAS) -->
            <div class="p-4 rounded-2xl border transition-all"
                 [class]="checklist.continuity.passed 
                   ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800/70' 
                   : 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-800/70'">
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  <span class="text-lg">{{ checklist.continuity.passed ? '✅' : '⚠️' }}</span>
                  <div>
                    <strong class="text-sm font-bold text-slate-900 dark:text-white">3. Continuidade vs Mês Anterior</strong>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Garante que nenhuma loja medida no mês anterior seja esquecida sem leitura ou justificativa.</p>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase font-mono"
                      [class]="checklist.continuity.passed 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                        : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'">
                  {{ checklist.continuity.passed ? '✓ 100% Conferido' : checklist.continuity.pendingCount + ' Pendente(s)' }}
                </span>
              </div>

              @if (!checklist.continuity.passed) {
                <div class="mt-3 p-3 bg-amber-50/80 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] font-bold text-amber-900 dark:text-amber-200 block uppercase">
                      Lojas medidas no mês anterior sem leitura nem justificativa:
                    </span>
                    <button type="button" 
                      (click)="openPrevAudit.emit()"
                      class="text-xs font-bold text-amber-700 dark:text-amber-300 underline cursor-pointer">
                      Abrir Painel de Continuidade
                    </button>
                  </div>
                  <div class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    @for (p of checklist.continuity.pendingStores; track p.storeId) {
                      <div class="p-2 bg-white dark:bg-slate-800 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2 text-xs w-full sm:w-auto">
                        <div>
                          <span class="font-mono font-bold">{{ p.luc }}</span> • <strong>{{ p.storeName }}</strong>
                          <span class="text-[10px] text-slate-500 dark:text-slate-400 ml-1">
                            (Ant: {{ p.prevReading | number:'1.0-2' }})
                          </span>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          <button type="button" 
                            (click)="quickJustify.emit({ storeId: p.storeId, reason: p.learnedReason || 'Loja Fechada / Vaga', replicateReading: true })"
                            class="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold cursor-pointer"
                            title="Justificar rapidamente com consumo zero">
                            ⚡ Fechada
                          </button>
                          <button type="button" 
                            (click)="jumpToStore.emit(p.storeId)"
                            class="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-[11px] font-bold cursor-pointer">
                            ✏️ Ler
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- PILAR 4: CONCILIAÇÃO DA CONCESSIONÁRIA & SAP -->
            <div class="p-4 rounded-2xl border transition-all"
                 [class]="checklist.reconciliation.passed 
                   ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800/70' 
                   : 'bg-white dark:bg-slate-900 border-blue-300 dark:border-blue-800/70'">
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  <span class="text-lg">⚖️</span>
                  <div>
                    <strong class="text-sm font-bold text-slate-900 dark:text-white">4. Conciliação com Concessionária & SAP</strong>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Verifica se o rateio fecha sem furos nem sobras financeiras.</p>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase font-mono"
                      [class]="checklist.reconciliation.passed 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                        : 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300'">
                  {{ checklist.reconciliation.passed ? '✓ 100% Conciliado' : 'Conferir Balanço' }}
                </span>
              </div>

              <div class="mt-2.5 p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <span class="text-[10px] uppercase font-bold text-slate-400 block">Fatura Concessionária</span>
                  <strong class="font-mono text-sm text-slate-900 dark:text-white">
                    {{ checklist.reconciliation.billAmount | currency:'BRL' }}
                  </strong>
                </div>
                <div>
                  <span class="text-[10px] uppercase font-bold text-slate-400 block">Total Rateado (Lojas + AC + Comum)</span>
                  <strong class="font-mono text-sm text-teal-700 dark:text-teal-300">
                    {{ checklist.reconciliation.totalReconciled | currency:'BRL' }}
                  </strong>
                </div>
                <div>
                  <span class="text-[10px] uppercase font-bold text-slate-400 block">Diferença de Balanço</span>
                  <strong class="font-mono text-sm"
                          [class.text-emerald-600]="checklist.reconciliation.diffFinancial <= 0.50"
                          [class.text-rose-600]="checklist.reconciliation.diffFinancial > 0.50">
                    {{ checklist.reconciliation.diffFinancial | currency:'BRL' }}
                  </strong>
                </div>
              </div>

              @if (utilityType === 'gas') {
                <div class="mt-2 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                  🔥 <strong>Gás 100% Rateável:</strong> 
                  Fatura: {{ checklist.reconciliation.gasConcessionaria }} m³ • 
                  Medição Bruta Campo: {{ checklist.reconciliation.totalRawGas | number:'1.0-1' }} m³ • 
                  Distribuição automática: {{ checklist.reconciliation.isGasAuto ? 'Ativa (100% rateado)' : 'Manual' }}.
                </div>
              }
            </div>

            <!-- PILAR 5: CONGELAMENTO & SNAPSHOT DE AUDITORIA -->
            <div class="p-4 rounded-2xl border transition-all"
                 [class]="isLocked 
                   ? 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800' 
                   : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'">
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  <span class="text-lg">{{ isLocked ? '🔒' : '🔓' }}</span>
                  <div>
                    <strong class="text-sm font-bold text-slate-900 dark:text-white">5. Congelamento Contábil (Snapshot)</strong>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Trava todas as medições e custos contra alterações posteriores.</p>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase font-mono"
                      [class]="isLocked 
                        ? 'bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-200' 
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'">
                  {{ isLocked ? '🔒 Travado' : 'Aberto para Edição' }}
                </span>
              </div>

              @if (isLocked) {
                <div class="mt-2 text-xs text-amber-900 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/50 p-3 rounded-xl border border-amber-200 dark:border-amber-800/80">
                  <div>✓ Congelado em: <strong>{{ lockedAt | date:'dd/MM/yyyy HH:mm' }}</strong></div>
                  <div>✓ Responsável: <strong>{{ lockedBy || 'Administrador' }}</strong></div>
                  <div class="mt-1 text-[11px] opacity-80">Os relatórios e comprovantes deste mês foram carimbados e selados com garantia de integridade.</div>
                </div>
              }
            </div>

          </div>

          <!-- Rodapé com Botões de Ação Executiva -->
          <div class="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div class="flex items-center gap-2 w-full sm:w-auto">
              <button type="button" 
                (click)="exportExcel.emit()" 
                [disabled]="isExportingExcel"
                class="flex-1 sm:flex-none px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer">
                <span>📊</span>
                <span>Baixar Excel</span>
              </button>
              <button type="button" 
                (click)="exportZip.emit()" 
                [disabled]="isExportingZip"
                class="flex-1 sm:flex-none px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer">
                <span>📦</span>
                <span>Pacote ZIP</span>
              </button>
            </div>

            <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
              @if (!isLocked) {
                <button type="button" 
                  (click)="freezeMonth.emit()"
                  class="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-98 text-white font-black rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer">
                  <span>🔒</span>
                  <span>Fechar e Congelar Mês (1 Clique)</span>
                </button>
              } @else {
                <button type="button" 
                  (click)="unfreezeMonth.emit()"
                  class="w-full sm:w-auto px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs">
                  <span>🔓</span>
                  <span>Reabrir Mês para Alterações</span>
                </button>
              }
            </div>
          </div>

        </div>
      </div>
    }
  `
})
export class ClosingChecklistModalComponent {
  @Input() isOpen = false;
  @Input() checklist: any = null;
  @Input() isLocked = false;
  @Input() lockedAt: string | null = null;
  @Input() lockedBy: string | null = null;
  @Input() utilityType = 'luz';
  @Input() selectedMonth = '';
  @Input() isExportingExcel = false;
  @Input() isExportingZip = false;

  @Output() closed = new EventEmitter<void>();
  @Output() filterPendingStores = new EventEmitter<void>();
  @Output() confirmAnomaly = new EventEmitter<string>();
  @Output() openPrevAudit = new EventEmitter<void>();
  @Output() quickJustify = new EventEmitter<{ storeId: string; reason: string; replicateReading: boolean }>();
  @Output() jumpToStore = new EventEmitter<string>();
  @Output() exportExcel = new EventEmitter<void>();
  @Output() exportZip = new EventEmitter<void>();
  @Output() freezeMonth = new EventEmitter<void>();
  @Output() unfreezeMonth = new EventEmitter<void>();

  onClose() {
    this.closed.emit();
  }
}
