import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe, UpperCasePipe } from '@angular/common';
import { MeterPhotoRecord } from '../models';

@Component({
  selector: 'app-meter-photo-modal',
  standalone: true,
  imports: [CommonModule, DatePipe, UpperCasePipe],
  template: `
    @if (isOpen && photo) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/85 backdrop-blur-sm" (click)="onClose()"></div>
        
        <!-- Modal Card -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg relative z-10 max-h-[92vh] flex flex-col animate-scale-in border border-slate-700">
          
          <!-- Modal Header -->
          <div class="bg-slate-900 text-white p-3.5 sm:p-4 flex justify-between items-center border-b border-slate-800">
            <div class="flex items-center gap-2.5">
              <span class="text-xs font-mono font-extrabold bg-teal-500 text-slate-950 px-2 py-0.5 rounded shadow-xs">
                {{ photo.luc }}
              </span>
              <div>
                <h3 class="font-bold text-sm sm:text-base leading-tight truncate max-w-[200px] sm:max-w-xs text-white">
                  {{ photo.storeName }}
                </h3>
                <p class="text-[10px] text-slate-400 mt-0.5">
                  Evidência Fotográfica • {{ photo.type | uppercase }} • Mês: {{ photo.month }}
                </p>
              </div>
            </div>
            <button (click)="onClose()" class="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer">✕</button>
          </div>

          <!-- Photo Canvas / Image Display -->
          <div class="flex-1 bg-slate-950 flex items-center justify-center overflow-hidden relative min-h-[260px] max-h-[58vh]">
            <img [src]="photo.photoDataUrl" 
                 alt="Foto do Medidor" 
                 class="max-w-full max-h-[58vh] object-contain select-none">
            
            <!-- Badge overlay with verified reading value -->
            <div class="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md text-white px-2.5 py-1 rounded-lg text-xs font-mono border border-slate-700 flex items-center gap-1.5 shadow-md">
              <span class="text-teal-400 font-bold">🔢 Leitura:</span>
              <strong class="text-white">{{ photo.readingValue || 0 }}</strong>
            </div>
          </div>

          <!-- Status de Leitura OCR com IA (se ativo) -->
          @if (isReadingOcr === photo.storeId) {
            <div class="p-3 bg-indigo-900/90 text-indigo-100 border-b border-indigo-700 flex items-center justify-between text-xs font-bold animate-pulse">
              <div class="flex items-center gap-2">
                <span class="text-lg">⚡</span>
                <div>
                  <p>{{ ocrModelLabel || 'IA' }} lendo mostrador...</p>
                  <p class="text-[10px] text-indigo-300 font-normal">Processando com Groq / Gemini para alta precisão</p>
                </div>
              </div>
              <span class="text-[10px] bg-indigo-700 px-2 py-0.5 rounded font-mono">OCR ATIVO</span>
            </div>
          }

          <!-- Feedback do OCR -->
          @if (ocrFeedback && ocrFeedback[photo.storeId]; as fb) {
            <div class="p-3 border-b text-xs flex flex-col gap-1.5"
                 [class]="fb.success ? 'bg-emerald-950/90 border-emerald-800 text-emerald-100' : 'bg-amber-950/90 border-amber-800 text-amber-100'">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-lg shrink-0">{{ fb.success ? (fb.provider === 'qwen' ? '⚡' : '🤖') : '⚠️' }}</span>
                  <div>
                    <p class="font-bold leading-tight">{{ fb.message }}</p>
                    @if (fb.explanation) {
                      <p class="text-[10px] opacity-85 mt-0.5">{{ fb.explanation }}</p>
                    }
                  </div>
                </div>
                <button (click)="dismissFeedback.emit(photo.storeId)" class="p-1 text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
              </div>
              @if (fb.success) {
                <div class="text-[10px] opacity-80 flex items-center justify-between border-t border-white/10 pt-1">
                  <span>Motor: {{ fb.modelName }}</span>
                  <span>Confiança: {{ fb.confidence === 'high' ? 'Alta' : 'Média' }}</span>
                </div>
              }
            </div>
          }

          <!-- Footer Details & Operations -->
          <div class="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div class="flex justify-between items-center text-xs text-slate-600 dark:text-slate-300 flex-wrap gap-2">
              <span class="flex items-center gap-1">
                <span>📅 Capturada em:</span>
                <strong class="font-mono text-slate-800 dark:text-white">{{ photo.capturedAt | date:'dd/MM/yyyy HH:mm:ss' }}</strong>
              </span>
              <div class="flex items-center gap-1.5 flex-wrap">
                @if (photo.synced) {
                  <span class="bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-300 dark:border-teal-800 flex items-center gap-1" title="Foto sincronizada na nuvem com Supabase">
                    <span>☁️</span>
                    <span>Supabase Nuvem</span>
                  </span>
                } @else {
                  <span class="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800 flex items-center gap-1" title="Foto salva localmente, aguardando envio para Supabase">
                    <span>⏳</span>
                    <span>Pendente Nuvem</span>
                  </span>
                  @if (isOnline) {
                    <button type="button" 
                            (click)="syncPhoto.emit(photo)" 
                            class="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2 py-0.5 rounded-full shadow-xs cursor-pointer"
                            title="Enviar esta foto agora para o Supabase">
                      ☁️ Enviar agora
                    </button>
                  }
                }
                <span class="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                  <span>✓</span>
                  <span>IndexedDB</span>
                </span>
              </div>
            </div>

            <!-- Botões Principais de Leitura por Foto OCR (se habilitado) -->
            @if (enableOcr) {
              <div class="space-y-1.5">
                <button type="button" 
                  (click)="runOcr.emit({ storeId: photo.storeId, provider: 'auto' })" 
                  [disabled]="isReadingOcr === photo.storeId"
                  class="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer">
                  @if (isReadingOcr === photo.storeId) {
                    <span class="animate-spin text-sm">⏳</span>
                    <span>Processando imagem...</span>
                  } @else {
                    <span class="text-base">⚡</span>
                    <span>Ler com Qwen 3.8 27B (Groq) • Fallback Gemini</span>
                  }
                </button>

                <div class="grid grid-cols-2 gap-2 text-[11px]">
                  <button type="button"
                    (click)="runOcr.emit({ storeId: photo.storeId, provider: 'qwen' })"
                    [disabled]="isReadingOcr === photo.storeId"
                    class="py-1.5 px-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors">
                    <span>⚡ Apenas Qwen</span>
                  </button>
                  <button type="button"
                    (click)="runOcr.emit({ storeId: photo.storeId, provider: 'gemini' })"
                    [disabled]="isReadingOcr === photo.storeId"
                    class="py-1.5 px-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors">
                    <span>🤖 Verificar com Gemini</span>
                  </button>
                </div>
              </div>
            }

            <!-- Action Buttons -->
            <div class="flex items-center gap-2 pt-1 flex-wrap">
              <button type="button" 
                (click)="download.emit(photo)" 
                class="flex-1 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer">
                <span>⬇️ Baixar Foto</span>
              </button>

              @if (enableVoucher) {
                <button type="button" 
                  (click)="openVoucher.emit(photo.storeId)" 
                  class="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer">
                  <span>📲 Ver Espelho</span>
                </button>
              }

              @if (enableReplace) {
                <label class="flex-1 py-2.5 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer text-center">
                  <span>🔄 Substituir</span>
                  <input type="file" 
                         accept="image/*" 
                         capture="environment" 
                         (change)="onPhotoFileChange($event)" 
                         class="hidden">
                </label>
              }

              <button type="button" 
                (click)="onClose()" 
                class="py-2.5 px-4 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer">
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class MeterPhotoModalComponent {
  @Input() photo: MeterPhotoRecord | null = null;
  @Input() isOpen = false;
  @Input() isOnline = true;
  @Input() enableOcr = false;
  @Input() enableVoucher = false;
  @Input() enableReplace = false;
  @Input() isReadingOcr: string | null = null;
  @Input() ocrModelLabel = '';
  @Input() ocrFeedback: Record<string, any> | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() download = new EventEmitter<MeterPhotoRecord>();
  @Output() syncPhoto = new EventEmitter<MeterPhotoRecord>();
  @Output() runOcr = new EventEmitter<{ storeId: string; provider: 'auto' | 'qwen' | 'gemini' }>();
  @Output() openVoucher = new EventEmitter<string>();
  @Output() replacePhoto = new EventEmitter<{ event: Event; photo: MeterPhotoRecord }>();
  @Output() dismissFeedback = new EventEmitter<string>();

  onClose() {
    this.close.emit();
  }

  onPhotoFileChange(event: Event) {
    if (this.photo) {
      this.replacePhoto.emit({ event, photo: this.photo });
    }
  }
}
