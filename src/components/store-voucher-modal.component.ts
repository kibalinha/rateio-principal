import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe, DatePipe } from '@angular/common';

import { StoreVoucherData } from '../models';
import { ReportExportService } from '../services/report-export.service';
import { IndexedDbService } from '../services/indexed-db.service';

@Component({
  selector: 'app-store-voucher-modal',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, DatePipe],
  template: `
    @if (isOpen && voucher) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full my-auto shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          
          <!-- Modal Top Actions Bar -->
          <div class="p-3.5 sm:p-4 bg-slate-900 text-white flex justify-between items-center shrink-0 border-b border-slate-800">
            <div class="flex items-center gap-2">
              <span class="text-xl">📲</span>
              <div>
                <h3 class="text-sm font-bold leading-tight">Espelho Individual do Lojista</h3>
                <p class="text-[11px] text-slate-400">Comprovante de medição & memória de cálculo</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" (click)="onClose()" class="text-slate-400 hover:text-white text-lg p-1 cursor-pointer">✕</button>
            </div>
          </div>

          <!-- Printable / Previewable Voucher Body -->
          <div id="printable-store-voucher" class="p-5 overflow-y-auto space-y-4 text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
            
            <!-- Voucher Header Paper Style -->
            <div class="border-b-2 border-slate-900 dark:border-slate-700 pb-3 flex justify-between items-start">
              <div>
                <div class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-extrabold">ADMINISTRAÇÃO DO SHOPPING</div>
                <div class="text-base font-black text-slate-900 dark:text-white uppercase">Comprovante de Rateio</div>
                <div class="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                  {{ voucher.utilityLabel }} • Mês de Referência: {{ voucher.monthLabel || voucher.month }}
                </div>
              </div>
              <div class="text-right">
                <span class="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Via do Lojista
                </span>
                <div class="text-[9px] text-slate-400 mt-1">Emissão: {{ voucher.issueDate }}</div>
              </div>
            </div>

            <!-- Card Loja -->
            <div class="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div class="col-span-2 sm:col-span-1">
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Loja / Lojista</span>
                <strong class="text-sm font-bold text-slate-900 dark:text-white">{{ voucher.storeName }}</strong>
              </div>
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Espaço (LUC)</span>
                <span class="font-mono font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-xs">
                  {{ voucher.luc }}
                </span>
              </div>
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Contrato</span>
                <span class="font-mono text-slate-600 dark:text-slate-400 text-xs">{{ voucher.contrato || '—' }}</span>
              </div>
            </div>

            <!-- Dados da Medição -->
            <div class="space-y-1.5">
              <div class="font-bold text-[11px] text-slate-500 uppercase tracking-wider">Detalhamento da Medição</div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center font-mono">
                <div class="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div class="text-[10px] text-slate-400 font-sans">Leitura Anterior</div>
                  <strong class="text-xs text-slate-700 dark:text-slate-300">{{ voucher.prevReading | number:'1.0-0' }}</strong>
                </div>
                <div class="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div class="text-[10px] text-slate-400 font-sans">Leitura Atual</div>
                  <strong class="text-xs text-slate-900 dark:text-white">{{ voucher.currentReading | number:'1.0-2' }}</strong>
                </div>
                <div class="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-lg border border-teal-200 dark:border-teal-900">
                  <div class="text-[10px] text-teal-800 dark:text-teal-300 font-sans font-bold">Consumo Faturado</div>
                  <strong class="text-xs text-teal-700 dark:text-teal-300">{{ voucher.consumption | number:'1.0-2' }} {{ voucher.unit }}</strong>
                </div>
              </div>
            </div>

            @if (voucher.utilityType === 'gas' && voucher.gasFactor && voucher.gasFactor !== 1) {
              <div class="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-900 dark:text-indigo-200 space-y-1">
                <div class="font-bold flex items-center gap-1.5">
                  <span>⚖️ Rateio Dinâmico por Fator de Gás da Concessionária</span>
                </div>
                <p class="text-[10px] leading-relaxed">
                  Consumo Medido em Campo: <strong>{{ voucher.rawConsumption | number:'1.0-2' }} m³</strong> × Fator de Correção: <strong>{{ voucher.gasFactor | number:'1.4-4' }}</strong> = Faturado: <strong>{{ voucher.consumption | number:'1.0-2' }} m³</strong>.
                </p>
              </div>
            }

            <!-- Resumo Financeiro -->
            <div class="p-3.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <div>
                <div class="text-[10px] text-slate-500 uppercase font-bold">Tarifa Unitária de Rateio</div>
                <div class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {{ voucher.unitPrice | currency:'BRL':'symbol':'1.4-4' }} / {{ voucher.unit }}
                </div>
              </div>
              <div class="text-right">
                <div class="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-extrabold tracking-wider">Total a Pagar</div>
                <strong class="text-xl font-mono font-black text-emerald-700 dark:text-emerald-300">{{ voucher.totalCost | currency:'BRL' }}</strong>
              </div>
            </div>

            <!-- Foto do Medidor Incorporada -->
            @if (voucher.photoDataUrl) {
              <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div class="flex justify-between items-center">
                  <span class="font-bold text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <span>📷 Evidência Fotográfica do Relógio</span>
                    <span class="bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 text-[10px] px-1.5 py-0.2 rounded font-bold">Auditado</span>
                  </span>
                  @if (voucher.photoCapturedAt) {
                    <span class="text-[10px] font-mono text-slate-400">{{ voucher.photoCapturedAt | date:'dd/MM/yyyy HH:mm' }}</span>
                  }
                </div>
                <div class="flex justify-center bg-black/5 dark:bg-black/30 p-2 rounded-lg">
                  <img [src]="voucher.photoDataUrl" 
                       alt="Foto do Medidor" 
                       class="max-h-48 rounded-lg object-contain border border-slate-300 dark:border-slate-700 shadow-xs">
                </div>
              </div>
            }

            @if (voucher.note) {
              <div class="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs">
                <strong>Observação de Campo:</strong> {{ voucher.note }}
              </div>
            }

            <div class="text-[10px] text-slate-400 italic text-center pt-1 border-t border-slate-100 dark:border-slate-800">
              Comprovante gerado automaticamente pelo Sistema de Gestão & Rateio de Utilidades.
            </div>
          </div>

          <!-- Modal Bottom Actions -->
          <div class="p-3 sm:p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 justify-between items-center shrink-0">
            <button type="button" 
              (click)="onClose()" 
              class="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer transition-colors">
              Fechar
            </button>

            <div class="flex flex-wrap gap-2 ml-auto">
              <button type="button" 
                (click)="copyVoucherText()" 
                class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors">
                <span>📋</span>
                <span>Copiar Texto</span>
              </button>

              <button type="button" 
                (click)="downloadPdf()" 
                class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors">
                <span>📄</span>
                <span>Baixar PDF</span>
              </button>

              <button type="button" 
                (click)="shareWhatsApp()" 
                class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-all">
                <span>💬</span>
                <span>WhatsApp</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    }
  `
})
export class StoreVoucherModalComponent {
  @Input() isOpen = false;
  @Input() voucher: StoreVoucherData | null = null;

  @Output() close = new EventEmitter<void>();

  private exportService = inject(ReportExportService);
  private indexedDb = inject(IndexedDbService);

  onClose() {
    this.close.emit();
  }

  downloadPdf() {
    if (!this.voucher) return;
    this.exportService.exportStoreVoucherPdf(this.voucher);
    this.indexedDb.showToast(`📄 PDF de ${this.voucher.storeName} (${this.voucher.luc}) baixado com sucesso!`);
  }

  buildWhatsAppMessage(): string {
    const v = this.voucher;
    if (!v) return '';

    return [
      '🏬 *COMPROVANTE DE RATEIO - SHOPPING*',
      `📍 *Loja:* ${v.storeName} (LUC: ${v.luc}${v.contrato ? ' • Ctr: ' + v.contrato : ''})`,
      `📅 *Mês de Referência:* ${v.monthLabel || v.month}`,
      `⚡ *Insumo:* ${v.utilityLabel}`,
      '',
      `🔢 *Leitura Anterior:* ${v.prevReading.toLocaleString('pt-BR')} ${v.unit}`,
      `🔢 *Leitura Atual:* ${v.currentReading.toLocaleString('pt-BR')} ${v.unit}`,
      `📊 *Consumo Faturado:* ${v.consumption.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${v.unit}`,
      (v.utilityType === 'gas' && v.gasFactor && Math.abs(v.gasFactor - 1) > 0.0001) ? (`⚖️ _Consumo rateado conforme fatura da concessionária (Fator: ${v.gasFactor.toFixed(4)}x)_`) : '',
      `💵 *Tarifa de Rateio:* R$ ${v.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} / ${v.unit}`,
      `💰 *VALOR A PAGAR:* R$ ${v.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      v.note ? `📝 *Observação de Campo:* ${v.note}` : '',
      '',
      v.photoDataUrl ? '📸 _Foto do relógio auditada e arquivada pela administração._' : '',
      `_Emitido em: ${v.issueDate || new Date().toLocaleString('pt-BR')}_`
    ].filter(Boolean).join('\n');
  }

  shareWhatsApp() {
    const msg = this.buildWhatsAppMessage();
    if (!msg) return;
    const url = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(msg);
    window.open(url, '_blank');
  }

  async copyVoucherText() {
    const msg = this.buildWhatsAppMessage();
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg);
      this.indexedDb.showToast('📋 Comprovante copiado! Pronto para colar no WhatsApp.');
    } catch {
      this.indexedDb.showToast('Erro ao copiar texto.');
    }
  }
}
