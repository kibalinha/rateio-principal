import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ai-key-config-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2">
              <span class="text-2xl">🤖</span>
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-white">Chaves de IA para Leitura de Medidores</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">Configure para leitura automática de relógios por foto (OCR)</p>
              </div>
            </div>
            <button (click)="onClose()" class="text-slate-400 hover:text-slate-600 text-lg p-1 cursor-pointer">✕</button>
          </div>

          <div class="space-y-4 text-xs">
            <!-- Campo Groq -->
            <div class="space-y-1.5">
              <div class="flex justify-between items-center">
                <label class="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <span>⚡ Groq API Key</span>
                  <span class="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.2 rounded font-bold">Recomendado • Ultra Rápido</span>
                </label>
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" class="text-[11px] text-teal-600 dark:text-teal-400 hover:underline">
                  Obter chave gratuita ↗
                </a>
              </div>
              <input 
                type="password" 
                [(ngModel)]="localGroqKey"
                placeholder="gsk_..."
                class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-teal-500 outline-none">
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Utiliza o modelo Vision Qwen 2.5 da Groq (tempo de resposta: ~0.8s).</p>
            </div>

            <!-- Campo Gemini -->
            <div class="space-y-1.5">
              <div class="flex justify-between items-center">
                <label class="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <span>🤖 Google Gemini API Key</span>
                  <span class="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.2 rounded font-bold">Fallback Oficial</span>
                </label>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="text-[11px] text-teal-600 dark:text-teal-400 hover:underline">
                  Obter chave gratuita ↗
                </a>
              </div>
              <input 
                type="password" 
                [(ngModel)]="localGeminiKey"
                placeholder="AIzaSy..."
                class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-teal-500 outline-none">
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Utiliza Gemini 2.5 Flash como motor de verificação e contingência.</p>
            </div>

            <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
              <p class="font-bold text-slate-800 dark:text-slate-200">🔒 Armazenamento Seguro:</p>
              <p>As chaves são salvas com segurança no LocalStorage do seu navegador e utilizadas diretamente pelo seu dispositivo para se comunicar com as APIs de OCR.</p>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button 
              type="button" 
              (click)="onClose()" 
              class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 cursor-pointer">
              Cancelar
            </button>
            <button 
              type="button" 
              (click)="onSave()" 
              class="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm cursor-pointer">
              Salvar Chaves
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class AiKeyConfigModalComponent implements OnInit {
  @Input() isOpen = false;
  @Input() groqKey = '';
  @Input() geminiKey = '';

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<{ groqKey: string; geminiKey: string }>();

  localGroqKey = '';
  localGeminiKey = '';

  ngOnInit() {
    this.localGroqKey = this.groqKey;
    this.localGeminiKey = this.geminiKey;
  }

  ngOnChanges() {
    this.localGroqKey = this.groqKey;
    this.localGeminiKey = this.geminiKey;
  }

  onSave() {
    this.saved.emit({
      groqKey: this.localGroqKey,
      geminiKey: this.localGeminiKey
    });
  }

  onClose() {
    this.closed.emit();
  }
}
