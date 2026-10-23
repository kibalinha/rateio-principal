import { Component, inject, signal, computed, effect, untracked, OnDestroy, HostListener } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StoreService, normalizeLuc, normalizeContract, normalizeStoreName } from '../services/store.service';
import { HistoryService } from '../services/history.service';
import { AuthService } from '../services/auth.service';
import { ReportExportService } from '../services/report-export.service';
import { IndexedDbService } from '../services/indexed-db.service';
import { GeminiService } from '../services/gemini.service';
import { OcrFeedbackService } from '../services/ocr-feedback.service';
import { buildReadingContext } from '../services/ocr-context';
import { analyzeAndEnhanceBase64Image } from '../services/ocr-image-processor';
import { getRecommendedProvider } from '../services/ocr-stats';
import { SupabaseService } from '../services/supabase.service';
import * as XLSX from 'xlsx';
import { ApportionmentEngineService } from '../services/apportionment-engine.service';

import {
  Store,
  BillData,
  StoreReading,
  StoreVoucherData,
  MeterPhotoRecord,
  MeterOcrResult,
  OcrPendingConfirmation,
  CostItem,
  ExcelImportRowPreview,
  AnomalyModalData
} from '../models';

import { AnomalyModalComponent } from './anomaly-modal.component';
import { MeterPhotoModalComponent } from './meter-photo-modal.component';
import { OcrQualityPanelComponent } from './ocr-quality-panel.component';
import { ExcelImportModalComponent, ExcelImportSuccessEvent } from './excel-import-modal.component';
import { StoreVoucherModalComponent } from './store-voucher-modal.component';

export type { ExcelImportRowPreview, AnomalyModalData, ExcelImportSuccessEvent };

@Component({
  selector: 'app-bill-calculator',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DecimalPipe,
    DatePipe,
    AnomalyModalComponent,
    MeterPhotoModalComponent,
    OcrQualityPanelComponent,
    ExcelImportModalComponent,
    StoreVoucherModalComponent
  ],
  template: `
    <div class="space-y-6 pb-20 md:pb-0">
      
      <!-- Top Bar: Month Selection, Utility Pills & Actions (Terceiro Pilar) -->
      <div class="bg-white dark:bg-slate-900 p-3.5 md:p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-3.5 transition-colors">
        
        <div class="flex items-center justify-between gap-3 flex-wrap">
          
          <!-- SELETOR MENSAL DE REFERÊNCIA PREMIUM COM CONTROLES TEMPORAIS -->
          <div class="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            
            <!-- Botão Mês Anterior -->
            <button type="button" 
              (click)="goToPreviousMonth()" 
              class="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs transition-all active:scale-95 cursor-pointer border border-slate-200/80 dark:border-slate-600/80"
              title="Ir para o mês anterior">
              ◀
            </button>

            <!-- Card Central do Mês com Input Nativo Integrado -->
            <div class="flex items-center gap-1.5 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xs">
              <span class="text-xs">📅</span>
              <div class="flex flex-col text-left">
                <span class="text-[9px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-wider">Mês de Referência</span>
                <div class="flex items-center gap-1">
                  <input type="month" 
                    [ngModel]="selectedMonth()" 
                    (ngModelChange)="onMonthChange($event)"
                    class="bg-transparent border-none text-slate-800 dark:text-slate-100 font-extrabold text-xs sm:text-sm focus:ring-0 p-0 cursor-pointer outline-none font-mono"
                    title="Clique para escolher qualquer mês no calendário">
                  @if (isLocked()) {
                    <span class="text-[9px] bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1 py-0.2 rounded-md font-mono font-bold" title="Mês Congelado e Fechado para cobrança">🔒 Fechado</span>
                  }
                </div>
              </div>
            </div>

            <!-- Botão Próximo Mês -->
            <button type="button" 
              (click)="goToNextMonth()" 
              class="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs transition-all active:scale-95 cursor-pointer border border-slate-200/80 dark:border-slate-600/80"
              title="Ir para o próximo mês">
              ▶
            </button>

            <!-- Botão 'Hoje' / Mês Atual -->
            @if (!isCurrentMonth()) {
              <button type="button" 
                (click)="goToCurrentMonth()" 
                class="px-2 py-1 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-[10px] font-extrabold cursor-pointer transition-all shadow-2xs whitespace-nowrap"
                title="Voltar para o mês corrente atual">
                Hoje
              </button>
            }
          </div>

          <!-- ALTERNADOR DE CONCESSIONÁRIAS / UTILITIES SEGMENTED CONTROL -->
          <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            
            <!-- Energia / Luz -->
            <button type="button" (click)="setUtility('luz')"
              [class]="utilityType() === 'luz' 
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black shadow-md ring-2 ring-amber-400/40' 
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 font-bold'"
              class="px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer">
              <span>⚡ Energia</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold"
                    [class]="utilityType() === 'luz' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'">
                {{ utilityStats().luz.completed }}/{{ utilityStats().luz.total }}
              </span>
            </button>

            <!-- Água -->
            <button type="button" (click)="setUtility('agua')"
              [class]="utilityType() === 'agua' 
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md ring-2 ring-blue-400/40' 
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 font-bold'"
              class="px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer">
              <span>💧 Água</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold"
                    [class]="utilityType() === 'agua' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'">
                {{ utilityStats().agua.completed }}/{{ utilityStats().agua.total }}
              </span>
            </button>

            <!-- Gás -->
            <button type="button" (click)="setUtility('gas')"
              [class]="utilityType() === 'gas' 
                ? 'bg-gradient-to-r from-orange-500 to-rose-600 text-white font-black shadow-md ring-2 ring-rose-400/40' 
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 font-bold'"
              class="px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer">
              <span>🔥 Gás</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold"
                    [class]="utilityType() === 'gas' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'">
                {{ utilityStats().gas.completed }}/{{ utilityStats().gas.total }}
              </span>
            </button>
          </div>
          
          <!-- AUTO-SAVE & STATUS DE REDE -->
          <div class="flex items-center gap-2">
            <!-- Indicador Auto-Save -->
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border"
                [class]="saveStatus() === 'saving' 
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700' 
                  : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'">
              @if (saveStatus() === 'saving') {
                <svg class="animate-spin h-3.5 w-3.5 text-amber-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Salvando...</span>
              } @else {
                <span class="text-emerald-500 font-bold">✓</span>
                <span class="hidden sm:inline">Salvo</span>
              }
            </div>

            <!-- Pill IndexedDB Offline / Sincronização -->
            @if (!indexedDb.isOnline()) {
              <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 shadow-2xs"
                   title="Modo offline ativo: as leituras são gravadas com segurança no IndexedDB e serão sincronizadas quando houver conexão">
                <span>📡 Offline</span>
                @if (indexedDb.pendingCount() > 0) {
                  <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-mono">
                    {{ indexedDb.pendingCount() }} pend.
                  </span>
                }
              </div>
            } @else if (indexedDb.pendingCount() > 0) {
              <button type="button" 
                (click)="indexedDb.syncPendingData()"
                [disabled]="indexedDb.syncStatus() === 'syncing'"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200 border border-blue-300 dark:border-blue-700 hover:bg-blue-200 cursor-pointer transition-all shadow-xs"
                title="Clique para sincronizar agora com o sistema">
                @if (indexedDb.syncStatus() === 'syncing') {
                  <span class="animate-spin text-xs">⏳</span>
                  <span>Sincronizando...</span>
                } @else {
                  <span>🔄 Sincronizar ({{ indexedDb.pendingCount() }})</span>
                }
              </button>
            } @else {
              <div class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                   title="Banco local IndexedDB sincronizado">
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span class="text-[11px] font-mono">IndexedDB OK</span>
              </div>
            }
          </div>

        </div>

        <!-- AÇÕES EXECUTIVAS E CONTÁBEIS -->
        <div class="flex items-center gap-2 justify-between xl:justify-end flex-wrap">
          <span class="hidden md:inline text-xs text-slate-400 italic font-mono">
            {{ lastSaved() ? 'Sincronizado: ' + (lastSaved() | date:'shortTime') : '' }}
          </span>

          <!-- Botão Qualidade do OCR (apenas administrador) -->
          @if (authService.isAdmin()) {
            <button
              type="button"
              (click)="showOcrQuality.set(true)"
              class="px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Ver a taxa de acerto do OCR e onde ele mais erra">
              <span>📊</span>
              <span class="hidden sm:inline">Qualidade OCR</span>
            </button>
          }

          <!-- Botão Processar OCR em Lote -->
          @if (pendingOcrCount() > 0 || isBatchOcrRunning()) {
            <button 
              type="button"
              (click)="openBatchOcrModal()" 
              [disabled]="isLocked()"
              class="px-3 py-2 bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              [class.animate-pulse]="isBatchOcrRunning()"
              title="Processar fotos pendentes em lote por inteligência artificial">
              @if (isBatchOcrRunning()) {
                <span class="animate-spin text-xs">⏳</span>
                <span>{{ batchOcrProgress().current }}/{{ batchOcrProgress().total }}</span>
              } @else {
                <span>⚡</span>
                <span class="hidden sm:inline">Processar Fotos</span>
                <span class="bg-white/20 px-1.5 py-0.2 rounded-full font-mono text-[10px]">{{ pendingOcrCount() }}</span>
              }
            </button>
          }

          <!-- Botão Checklist de Auditoria e Fechamento (Admin) -->
          @if (authService.isAdmin()) {
            <button 
              type="button"
              (click)="openClosingChecklist()" 
              [class]="isLocked() ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800 hover:bg-amber-200' : (closingChecklist().canFreeze ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200')"
              class="px-3.5 py-2 border rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Auditoria contábil e checklist de fechamento de mês">
              <span>🛡️</span>
              <span class="hidden sm:inline">Auditoria & Fechamento</span>
              <span class="sm:hidden">Auditoria</span>
              @if (isLocked()) {
                <span class="text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-950 dark:text-amber-100 px-1.5 py-0.2 rounded font-mono font-bold">🔒 Fechado</span>
              } @else if (closingChecklist().canFreeze) {
                <span class="text-[10px] bg-emerald-800 text-white px-1.5 py-0.2 rounded font-mono font-bold">Pronto</span>
              } @else {
                <span class="text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-mono font-bold">{{ closingChecklist().readings.pendingStores + closingChecklist().anomalies.uninspectedCount + closingChecklist().continuity.pendingCount }} pend.</span>
              }
            </button>
          }

          <!-- Botão Exportar Excel no Topo -->
          <button 
            type="button"
            (click)="exportToExcel()" 
            [disabled]="isExportingExcel() || tableData().length === 0"
            class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            title="Exportar demonstrativo completo de rateio em planilha Excel (.xlsx)">
            @if (isExportingExcel()) {
              <span class="animate-spin text-xs">⏳</span>
              <span>Exportando...</span>
            } @else {
              <span>📊</span>
              <span class="hidden sm:inline">Exportar Excel</span>
              <span class="sm:hidden">Excel</span>
            }
          </button>

          <!-- Botão Exportar Pacote ZIP Completo -->
          <button 
            type="button"
            (click)="exportPackageZip()" 
            [disabled]="isExportingZip() || tableData().length === 0"
            class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap border border-slate-700"
            title="Exportar pacote completo de auditoria em arquivo ZIP contendo a planilha Excel (.xlsx) e as fotos dos medidores organizadas por Loja/LUC">
            @if (isExportingZip()) {
              <span class="animate-spin text-xs">⏳</span>
              <span>Gerando ZIP...</span>
            } @else {
              <span>📦</span>
              <span class="hidden sm:inline">Pacote ZIP</span>
              <span class="sm:hidden">ZIP</span>
            }
          </button>

          <!-- Botão Apagar Lojas deste Mês (apenas deste tipo e mês) -->
          @if (authService.canConfigureBill() && !isLocked() && activeStores().length > 0) {
            <button 
              type="button"
              (click)="confirmClearMonthStores()" 
              class="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Apagar todas as lojas de {{ utilityType() === 'luz' ? 'Energia/Luz' : (utilityType() === 'agua' ? 'Água' : 'Gás') }} deste mês ({{ selectedMonth() }})">
              <span>🗑️</span>
              <span class="hidden sm:inline">Apagar lojas</span>
            </button>
          }
        </div>
      </div>

      <!-- Locked Month Notice Banner -->
      @if (isLocked()) {
        <div class="p-3.5 bg-slate-900 text-white rounded-xl border border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md animate-fade-in">
          <div class="flex items-center gap-2.5">
            <span class="text-xl">🔒</span>
            <div>
              <div class="font-bold text-sm text-amber-400">Rateio Consolidado e Congelado</div>
              <div class="text-slate-300 text-xs">As medições e custos deste mês foram fechados para cobrança. Edições de leituras e fotos estão desabilitadas.</div>
              @if (lockedAt()) {
                <div class="text-slate-400 text-[11px] mt-0.5">Fechado em {{ lockedAt() | date:'short' }} {{ lockedBy() ? 'por ' + lockedBy() : '' }}</div>
              }
            </div>
          </div>
          @if (authService.isAdmin()) {
            <div class="flex items-center gap-2 shrink-0">
              <button type="button" (click)="openClosingChecklist()" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs cursor-pointer whitespace-nowrap transition-colors shadow-xs border border-slate-600">
                🛡️ Ver Checklist
              </button>
              <button type="button" (click)="unfreezeMonth()" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-lg text-xs cursor-pointer whitespace-nowrap transition-colors shadow-xs">
                🔓 Reabrir Mês
              </button>
            </div>
          }
        </div>
      }

      <!-- Offline Notice Banner for Field Technicians -->
      @if (!indexedDb.isOnline()) {
        <div class="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 text-xs shadow-xs animate-fade-in">
          <div class="flex items-center gap-2">
            <span class="text-base shrink-0">📡</span>
            <div>
              <strong class="font-bold">Modo Offline Ativo (IndexedDB):</strong>
              <span class="ml-1 text-amber-800 dark:text-amber-300">
                Você pode continuar preenchendo as leituras em campo normalmente sem internet. Seus dados estão 100% seguros no armazenamento local do aparelho e serão sincronizados automaticamente assim que você reconectar.
              </span>
            </div>
          </div>
          @if (indexedDb.pendingCount() > 0) {
            <span class="px-2 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 rounded-full font-mono font-bold text-[10px] whitespace-nowrap shrink-0">
              {{ indexedDb.pendingCount() }} pendente(s)
            </span>
          }
        </div>
      }

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        <!-- Left Column: Inputs (Collapsible on Mobile for Techs) -->
        <div class="xl:col-span-1 space-y-6">
          
          <!-- Utility Config Card -->
          <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
            
            <!-- Mobile Toggle Header for Config -->
            <button (click)="toggleConfigVisibility()" class="w-full md:hidden flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
               <h2 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                 <span class="p-1 rounded bg-slate-200 dark:bg-slate-700 text-xs">⚙️</span> Configuração
               </h2>
               <svg class="w-5 h-5 text-slate-500 dark:text-slate-400 transform transition-transform" [class.rotate-180]="isConfigOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
               </svg>
            </button>

            <!-- Config Content -->
            <div [class.hidden]="!isConfigOpen() && isMobile()" class="p-6 md:block space-y-6">
              
              <!-- Selector -->
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Despesa</label>
                <div class="flex rounded-md shadow-sm" role="group">
                  <button type="button" (click)="setUtility('luz')" 
                    [class]="utilityType() === 'luz' ? 'bg-teal-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
                    class="flex-1 px-2 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded-l-lg focus:z-10 focus:ring-2 focus:ring-teal-500 transition-colors">
                    ⚡ Luz
                  </button>
                  <button type="button" (click)="setUtility('agua')" 
                    [class]="utilityType() === 'agua' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
                    class="flex-1 px-2 py-2 text-sm font-medium border-t border-b border-slate-300 dark:border-slate-700 focus:z-10 focus:ring-2 focus:ring-blue-500 transition-colors">
                    💧 Água
                  </button>
                  <button type="button" (click)="setUtility('gas')" 
                    [class]="utilityType() === 'gas' ? 'bg-red-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
                    class="flex-1 px-2 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded-r-lg focus:z-10 focus:ring-2 focus:ring-red-500 transition-colors">
                    🔥 Gás
                  </button>
                </div>
              </div>

              <!-- DETAILED FORM -->
              <div class="animate-fade-in space-y-6">
                <!-- Section 1: Dynamic Costs Breakdown -->
                <div class="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div class="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2 mb-2">
                    <h3 class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Custos (R$)</h3>
                    @if (authService.canConfigureBill()) {
                      <button (click)="addCostItem()" class="text-xs flex items-center gap-1 text-accent font-medium hover:text-blue-700 transition-colors">
                        <span>+ Item</span>
                      </button>
                    } @else {
                      <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1" title="Apenas o Administrador pode alterar custos">
                        <span>🔒 Somente Admin</span>
                      </span>
                    }
                  </div>
                  
                  <div class="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    @for (item of currentCostItems(); track item.id) {
                      <div class="flex items-center gap-2 group animate-fade-in">
                        <input type="text" 
                          [ngModel]="item.name" 
                          (ngModelChange)="updateItemName(item.id, $event)"
                          [disabled]="!canConfigure()"
                          class="w-full px-2 py-1 text-xs border border-transparent bg-transparent hover:bg-white dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-700 focus:border-accent rounded transition-colors text-slate-700 dark:text-slate-200 disabled:opacity-75"
                          placeholder="Nome">
                        
                        <input type="number" 
                          step="0.01"
                          [ngModel]="item.value" 
                          (ngModelChange)="updateItemValue(item.id, $event)"
                          [disabled]="!canConfigure()"
                          class="w-24 px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 rounded text-right font-mono focus:ring-1 focus:ring-warning bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-900" 
                          placeholder="0.00">
                        
                        @if (authService.canConfigureBill()) {
                          <button (click)="removeCostItem(item.id)" 
                            class="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors md:opacity-0 group-hover:opacity-100">
                            ×
                          </button>
                        }
                      </div>
                    }
                  </div>
                  
                  <div class="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                      <span class="text-xs text-slate-500 dark:text-slate-400 mr-2">Subtotal:</span>
                      <span class="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">{{ totalBillAmount() | currency:'BRL' }}</span>
                  </div>
                </div>

                <!-- Section 2: Consumption Inputs -->
                <div class="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div class="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-1 mb-2">
                    <h3 class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      @if(utilityType() === 'luz') { Entrada (kWh) } @else { Consumo (m³) }
                    </h3>
                    @if (!authService.canConfigureBill()) {
                      <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1" title="Apenas o Administrador pode alterar o consumo da concessionária">
                        <span>🔒 Somente Admin</span>
                      </span>
                    }
                  </div>
                  
                  @if (utilityType() === 'luz') {
                    <div class="grid grid-cols-1 gap-2">
                      @for (key of ['bss1', 'bss2', 'bss3', 'bss4']; track key) {
                        <div class="flex items-center gap-2">
                           <label class="text-xs text-slate-600 dark:text-slate-300 w-1/2 uppercase">{{ key }}</label>
                           <input type="number" step="0.0001" [disabled]="!canConfigure()" 
                           [ngModel]="luzConsumption()[key]" (ngModelChange)="updateLuzCons(key, $event)" 
                           class="w-1/2 px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded text-right font-mono focus:ring-1 focus:ring-warning disabled:bg-slate-100 dark:disabled:bg-slate-900" placeholder="0">
                        </div>
                      }
                    </div>
                  } @else if (utilityType() === 'agua') {
                    <div class="flex items-center gap-2">
                      <label class="text-xs text-slate-600 dark:text-slate-300 w-1/2">Total Hidrômetro (m³)</label>
                      <input type="number" step="0.0001" [disabled]="!canConfigure()" 
                      [ngModel]="aguaTotalReading()" 
                      (ngModelChange)="aguaTotalReading.set($event)" 
                      class="w-1/2 px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded text-right font-mono focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-900" placeholder="0">
                    </div>
                  } @else {
                    <!-- Gás: Fatura Concessionária + Distribuição Automática -->
                    <div class="space-y-3">
                      <div class="flex items-center gap-2">
                        <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 w-1/2">Fatura Concessionária (m³)</label>
                        <input type="number" step="0.0001" [disabled]="!canConfigure()" 
                        [ngModel]="gasTotalReading()" 
                        (ngModelChange)="gasTotalReading.set($event)" 
                        class="w-1/2 px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded text-right font-mono font-bold focus:ring-1 focus:ring-red-500 disabled:bg-slate-100 dark:disabled:bg-slate-900" placeholder="0">
                      </div>

                      @if (gasDistributionStats(); as gStats) {
                        <div class="p-2.5 rounded-lg border text-xs transition-colors"
                             [class]="gStats.isEnabled ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'">
                          <div class="flex items-center justify-between gap-2">
                            <label class="flex items-center gap-1.5 cursor-pointer font-bold text-[11px]"
                                   [class]="gStats.isEnabled ? 'text-red-900 dark:text-red-300' : 'text-slate-600 dark:text-slate-400'">
                              <input type="checkbox" 
                                     [ngModel]="gasAutoDistribute()" 
                                     (ngModelChange)="gasAutoDistribute.set($event)"
                                     [disabled]="!canConfigure()"
                                     class="rounded text-red-600 focus:ring-red-500 cursor-pointer">
                              <span>Rateio 100% Proporcional</span>
                            </label>
                            <span class="text-[10px] px-1.5 py-0.2 rounded font-bold"
                                  [class]="gStats.isEnabled ? 'bg-red-200/80 dark:bg-red-900/80 text-red-900 dark:text-red-200' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'">
                              {{ gStats.isEnabled ? 'Ativo' : 'Desativado' }}
                            </span>
                          </div>

                          @if (gStats.concessionaria > 0 && gStats.rawTotal > 0) {
                            <div class="mt-2 pt-2 border-t border-red-200/60 dark:border-red-900/40 space-y-1 font-mono text-[10px]">
                              <div class="flex justify-between text-slate-600 dark:text-slate-400">
                                <span>Medido em Campo:</span>
                                <strong class="text-slate-800 dark:text-slate-200">{{ gStats.rawTotal | number:'1.2-2' }} m³</strong>
                              </div>
                              <div class="flex justify-between text-slate-600 dark:text-slate-400">
                                <span>Fator Rateio (F):</span>
                                <strong class="text-red-700 dark:text-red-400">{{ gStats.factor | number:'1.4-4' }}x</strong>
                              </div>
                              <div class="flex justify-between text-slate-600 dark:text-slate-400">
                                <span>Diferença:</span>
                                <span [class]="gStats.diffM3 >= 0 ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-blue-700 dark:text-blue-400 font-semibold'">
                                  {{ gStats.diffM3 > 0 ? '+' : '' }}{{ gStats.diffM3 | number:'1.2-2' }} m³ ({{ gStats.diffPct > 0 ? '+' : '' }}{{ gStats.diffPct | number:'1.1-1' }}%)
                                </span>
                              </div>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>

              <!-- Summary Box -->
              <div class="p-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl shadow-md border border-slate-700/80">
                <div class="flex items-center justify-between text-xs text-slate-400 font-medium mb-1">
                  <span>Fatura Concessionária</span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                        [class]="utilityType() === 'luz' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : (utilityType() === 'gas' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'bg-teal-500/20 text-teal-300 border border-teal-500/30')">
                    {{ utilityType() | uppercase }}
                  </span>
                </div>
                <div class="flex justify-between items-baseline mb-2">
                  <span class="text-xs text-slate-300">Custo Total:</span>
                  <span class="font-mono text-base font-black text-white tabular-nums">{{ totalBillAmount() | currency:'BRL' }}</span>
                </div>
                <div class="flex justify-between items-baseline mb-3 pb-3 border-b border-slate-700/80">
                  <span class="text-xs text-slate-300">Consumo Total:</span>
                  <span class="font-mono text-sm font-bold text-slate-200 tabular-nums">{{ totalConsumption() | number:'1.0-4' }} {{ getUnit() }}</span>
                </div>
                <div class="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                  <div class="flex flex-col">
                    <span class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Tarifa Unitária Efetiva</span>
                    <span class="text-[10px] text-slate-500 font-mono">R$ por {{ getUnit() }}</span>
                  </div>
                  <span class="font-black text-lg font-mono tabular-nums"
                        [class]="utilityType() === 'luz' ? 'text-amber-400' : (utilityType() === 'gas' ? 'text-orange-400' : 'text-teal-300')">
                    {{ calculatedUnitPrice() | currency:'BRL':'symbol':'1.4-4' }}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- Right Column: Stores Table & Final Summary -->
        <div class="xl:col-span-2 flex flex-col gap-6">
          
          <!-- Main Table/Card Container -->
          <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div class="p-3.5 md:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 dark:bg-slate-900 gap-3">
              <div>
                <h2 class="text-base md:text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span>Leituras & Coleta — {{ utilityType() | uppercase }}</span>
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                        [class]="utilityType() === 'luz' ? 'bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300' : (utilityType() === 'agua' ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300' : 'bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300')">
                    {{ getUnit() }}
                  </span>
                </h2>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  Preencha as leituras em campo ou confira o rateio mensal.
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                 <!-- Botão Exportar Excel -->
                 <button (click)="exportToExcel()" 
                    [disabled]="isExportingExcel() || tableData().length === 0"
                    class="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    title="Exportar demonstrativo completo de rateio em planilha Excel (.xlsx)">
                    @if (isExportingExcel()) {
                      <span class="animate-spin text-xs">⏳</span>
                      <span>Exportando...</span>
                    } @else {
                      <span>📊</span>
                      <span>Excel</span>
                    }
                 </button>

                 <!-- Botão Exportar Pacote ZIP -->
                 <button (click)="exportPackageZip()" 
                    [disabled]="isExportingZip() || tableData().length === 0"
                    class="text-xs px-3 py-1.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 border border-slate-700"
                    title="Exportar pacote completo em ZIP (Planilha Excel + Fotos dos Medidores)">
                    @if (isExportingZip()) {
                      <span class="animate-spin text-xs">⏳</span>
                      <span>ZIP...</span>
                    } @else {
                      <span>📦</span>
                      <span>Pacote ZIP</span>
                    }
                 </button>

                 <!-- Botão Importar (ADM) -->
                 @if (authService.canImport()) {
                    <button (click)="openExcelImportModal()" 
                       class="text-xs px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                       title="Importar leituras diretamente de planilha Excel (.xlsx, .xls, .csv ou Ctrl+V)">
                       <span>📥</span>
                       <span class="hidden sm:inline">Importar Planilha</span>
                       <span class="sm:hidden">Importar</span>
                    </button>
                  }

                  <!-- Botão Apagar Lojas deste Mês (apenas deste tipo e mês) -->
                  @if (authService.canConfigureBill() && !isLocked() && activeStores().length > 0) {
                    <button type="button" (click)="confirmClearMonthStores()" 
                       class="text-xs px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 rounded-lg font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                       title="Apagar todas as lojas de {{ utilityType() === 'luz' ? 'Energia/Luz' : (utilityType() === 'agua' ? 'Água' : 'Gás') }} deste mês ({{ selectedMonth() }})">
                       <span>🗑️</span>
                       <span class="hidden sm:inline">Apagar lojas do mês</span>
                       <span class="sm:hidden">Apagar</span>
                    </button>
                  }
                  <div class="text-xs md:text-sm text-slate-600 dark:text-slate-300 md:ml-2 whitespace-nowrap">
                     Total: <strong class="text-slate-900 dark:text-white">{{ totalDistributedCost() | currency:'BRL' }}</strong>
                  </div>
               </div>
            </div>

            <!-- GAS 100% PROPORTIONAL DISTRIBUTION BANNER -->
            @if (utilityType() === 'gas' && gasDistributionStats(); as gStats) {
              <div class="px-4 py-3.5 border-b flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs transition-colors"
                   [class]="gStats.isEnabled 
                     ? 'bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/30 border-red-200 dark:border-red-900/60' 
                     : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'">
                
                <div class="flex items-center gap-2.5">
                  <div class="p-2 rounded-xl bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 text-lg shrink-0">
                    🔥
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <strong class="font-bold text-slate-800 dark:text-white text-xs sm:text-sm">
                        Distribuição Automática de Gás (100% Rateável)
                      </strong>
                      @if (gStats.isEnabled && gStats.isBalanced) {
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          ✓ 100% Equilibrado
                        </span>
                      } @else if (!gStats.isEnabled) {
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                          Medição Pura de Campo (Desativado)
                        </span>
                      }
                    </div>
                    <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      @if (gStats.isEnabled) {
                        O volume total da concessionária é rateado proporcionalmente entre os lojistas, eliminando sobras e fechando 100% da fatura.
                      } @else {
                        Modo manual: cada loja recebe apenas o consumo bruto medido no relógio sem ajuste proporcional.
                      }
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end shrink-0 flex-wrap">
                  <!-- Quick Stats Chips -->
                  <div class="flex items-center gap-2 font-mono text-[11px]">
                    <div class="px-2.5 py-1 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 shadow-2xs">
                      <span class="text-slate-400 text-[10px] block font-sans">Concessionária</span>
                      <strong class="text-slate-800 dark:text-slate-100">{{ gStats.concessionaria | number:'1.1-2' }} m³</strong>
                    </div>
                    <div class="px-2.5 py-1 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 shadow-2xs">
                      <span class="text-slate-400 text-[10px] block font-sans">Soma Campo</span>
                      <strong class="text-slate-800 dark:text-slate-100">{{ gStats.rawTotal | number:'1.1-2' }} m³</strong>
                    </div>
                    @if (gStats.concessionaria > 0 && gStats.rawTotal > 0) {
                      <div class="px-2.5 py-1 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 shadow-2xs"
                           [title]="'Fator Proporcional: ' + gStats.factor.toFixed(4) + 'x'">
                        <span class="text-slate-400 text-[10px] block font-sans">Fator (F)</span>
                        <strong class="text-red-600 dark:text-red-400 font-bold">{{ gStats.factor | number:'1.4-4' }}x</strong>
                      </div>
                    }
                  </div>

                  <!-- Toggle Button -->
                  @if (canConfigure()) {
                    <button type="button" 
                      (click)="gasAutoDistribute.set(!gasAutoDistribute())"
                      class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      [class]="gStats.isEnabled 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-slate-800 hover:bg-slate-700 text-white'">
                      <span>{{ gStats.isEnabled ? '✓ 100% Rateável' : '⚡ Ativar 100%' }}</span>
                    </button>
                  }
                </div>

              </div>
            }

            <!-- FIELD TECHNICIAN CONTROL CENTER (Painel de Progresso, Busca e Filtros de Campo) -->
            <div class="p-3.5 md:p-4 bg-slate-50/80 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 transition-colors">
              
              <!-- CELEBRAÇÃO VISUAL DE 100% DAS LOJAS LIDAS -->
              @if (fieldStats().pending === 0 && fieldStats().total > 0) {
                <div class="p-3.5 sm:p-4 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/15 border border-emerald-400/40 rounded-2xl flex items-center justify-between gap-3 shadow-xs animate-fade-in animate-shimmer">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-xl shadow-md shrink-0">
                      🏆
                    </div>
                    <div>
                      <h4 class="font-black text-sm text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                        <span>Parabéns! Coleta 100% Finalizada</span>
                        <span class="text-[10px] bg-emerald-600 text-white px-2 py-0.2 rounded-full font-mono font-bold">✓ {{ fieldStats().total }}/{{ fieldStats().total }}</span>
                      </h4>
                      <p class="text-xs text-emerald-800 dark:text-emerald-300 font-medium">Todas as lojas deste mês já possuem leituras registradas e conferidas.</p>
                    </div>
                  </div>
                  @if (authService.isAdmin() && !isLocked()) {
                    <button type="button" 
                      (click)="openClosingChecklist()" 
                      class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0">
                      <span>🛡️</span>
                      <span class="hidden sm:inline">Revisar & Fechar Mês</span>
                      <span class="sm:hidden">Fechar Mês</span>
                    </button>
                  }
                </div>
              }
              
              <!-- Progress Bar & Mode Toggle -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div class="flex-1">
                  <div class="flex justify-between items-center text-xs mb-1.5">
                    <span class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span>👷 Coleta em Campo:</span>
                      <strong class="text-teal-700 dark:text-teal-400">{{ fieldStats().completed }} de {{ fieldStats().total }}</strong> lojas lidas
                      @if (fieldStats().pending === 0 && fieldStats().total > 0) {
                        <span class="bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 text-[10px] px-2 py-0.5 rounded-full font-bold border border-green-300 dark:border-green-800">✓ 100% Concluído</span>
                      }
                      @if (pendingOcrCount() > 0 && !isLocked()) {
                        <button type="button" 
                          (click)="openBatchOcrModal()"
                          class="bg-indigo-100 dark:bg-indigo-950/70 hover:bg-indigo-200 dark:hover:bg-indigo-900 text-indigo-800 dark:text-indigo-200 text-[10px] px-2 py-0.5 rounded-full font-bold border border-indigo-300 dark:border-indigo-800 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          title="Clique para processar fotos em lote com IA">
                          <span>⚡ {{ pendingOcrCount() }} foto(s) com OCR pendente</span>
                        </button>
                      }
                    </span>
                    <span class="font-mono font-bold text-slate-600 dark:text-slate-400">{{ fieldStats().progressPct }}%</span>
                  </div>
                  
                  <!-- Visual Progress Bar -->
                  <div class="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden shadow-inner">
                    <div class="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300"
                         [style.width.%]="fieldStats().progressPct"></div>
                  </div>

                  <!-- Auditoria de Continuidade vs Mês Anterior -->
                  @if (prevMonthAudit().hasPreviousData) {
                    <div class="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div class="flex items-center gap-2">
                        @if (prevMonthAudit().pendingCount > 0) {
                          <span class="flex h-2 w-2 relative shrink-0">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          </span>
                          <span class="text-amber-900 dark:text-amber-200 font-bold flex items-center gap-1.5 flex-wrap">
                            <span>⚠️ Mês Anterior: <span class="underline decoration-amber-500 underline-offset-2">{{ prevMonthAudit().pendingCount }} lojas</span> que tinham valor em {{ getPreviousMonth(selectedMonth()) }} ainda não foram lidas ou justificadas!</span>
                            @if (prevMonthAudit().frequentZeroPending.length > 0) {
                              <button type="button"
                                (click)="batchJustifyFrequentZero()"
                                class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-200 hover:bg-amber-300 dark:bg-amber-900 dark:hover:bg-amber-800 text-amber-950 dark:text-amber-100 border border-amber-400 dark:border-amber-700 cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                title="Preencher em lote lojas que têm histórico de consumo zero nos meses anteriores">
                                <span>⚡ Preencher {{ prevMonthAudit().frequentZeroPending.length }} com Histórico Zero</span>
                              </button>
                            }
                          </span>
                        } @else {
                          <span class="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                            <span class="text-sm">✨</span>
                            <span>100% conferido! Todas as {{ prevMonthAudit().totalCount }} lojas medidas no mês anterior já foram lidas ou justificadas.</span>
                          </span>
                        }
                      </div>

                      <div class="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                        @if (prevMonthAudit().pendingCount > 0) {
                          <button type="button" 
                            (click)="togglePrevMissingFilter()"
                            [class]="statusFilter() === 'prev_missing' ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs ring-2 ring-amber-400/50' : 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900 text-amber-950 dark:text-amber-100 border border-amber-300 dark:border-amber-700'"
                            class="px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs whitespace-nowrap">
                            <span>🔍</span>
                            <span>{{ statusFilter() === 'prev_missing' ? 'Mostrando as ' + prevMonthAudit().pendingCount + ' que faltam' : 'Filtrar as ' + prevMonthAudit().pendingCount + ' que faltam' }}</span>
                          </button>
                        } @else if (statusFilter() === 'prev_missing') {
                          <button type="button" 
                            (click)="statusFilter.set('all')"
                            class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 transition-all cursor-pointer flex items-center gap-1 shadow-2xs whitespace-nowrap">
                            <span>✕</span>
                            <span>Voltar para todas</span>
                          </button>
                        }
                        <button type="button" 
                          (click)="showPrevMonthAuditModal.set(true)"
                          class="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-all cursor-pointer flex items-center gap-1 shadow-2xs whitespace-nowrap"
                          title="Ver relatório detalhado de conferência com o mês anterior">
                          <span>📋</span>
                          <span>Ver Lista</span>
                        </button>
                      </div>
                    </div>
                  }
                </div>

                <!-- Mobile View Mode Toggle (Cards vs Step Rota) -->
                <div class="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 self-start sm:self-auto shrink-0 md:hidden">
                  <button type="button" 
                    (click)="mobileViewMode.set('cards')"
                    [class]="mobileViewMode() === 'cards' ? 'bg-slate-900 dark:bg-teal-600 text-white font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
                    class="px-2.5 py-1 text-xs rounded transition-all flex items-center gap-1 cursor-pointer">
                    <span>📱 Lista</span>
                  </button>
                  <button type="button" 
                    (click)="mobileViewMode.set('step')"
                    [class]="mobileViewMode() === 'step' ? 'bg-teal-600 dark:bg-teal-500 text-white font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
                    class="px-2.5 py-1 text-xs rounded transition-all flex items-center gap-1 cursor-pointer"
                    title="Modo focado para caminhar loja por loja">
                    <span>🎯 Modo Rota</span>
                  </button>
                </div>
              </div>

              <!-- Search Bar, Status Filter Chips & Sort Selector -->
              <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                <!-- Search Box -->
                <div class="relative flex-1 group">
                  <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-teal-500 transition-colors text-xs">🔍</span>
                  <input type="text" 
                    [ngModel]="searchQuery()" 
                    (ngModelChange)="searchQuery.set($event)"
                    placeholder="Buscar loja por Nome, LUC ou Contrato..." 
                    class="w-full pl-9 pr-8 py-2 text-xs bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all shadow-2xs font-medium">
                  @if (searchQuery()) {
                    <button (click)="searchQuery.set('')" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer transition-colors" title="Limpar busca">
                      ✕
                    </button>
                  }
                </div>

                <div class="flex items-center gap-2.5 flex-wrap shrink-0">
                  <!-- Sort Selector -->
                  <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs shadow-2xs">
                    <span class="text-[10px] uppercase font-black text-slate-400 dark:text-slate-500 px-1.5 hidden sm:inline tracking-wider">Ordem:</span>
                    <button type="button" (click)="setQuickSort('route')"
                      [class]="sortBy() === 'route' ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
                      class="px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1" title="Ordem física da rota de leitura">
                      <span>📍 Rota</span>
                      @if (sortBy() === 'route') {
                        <span class="text-[9px]">{{ sortDirection() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </button>
                    <button type="button" (click)="setQuickSort('luc')"
                      [class]="sortBy() === 'luc' ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
                      class="px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1" title="Ordem por número do LUC">
                      <span>🏢 LUC</span>
                      @if (sortBy() === 'luc') {
                        <span class="text-[9px]">{{ sortDirection() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </button>
                    <button type="button" (click)="setQuickSort('name')"
                      [class]="(sortBy() === 'name' || sortBy() === 'storeName') ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
                      class="px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1" title="Ordem alfabética pelo nome da loja">
                      <span>🔤 Nome</span>
                      @if (sortBy() === 'name' || sortBy() === 'storeName') {
                        <span class="text-[9px]">{{ sortDirection() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </button>
                  </div>

                  <!-- Filter Chips -->
                  <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    <button type="button" 
                      (click)="statusFilter.set('all')"
                      [class]="statusFilter() === 'all' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-extrabold shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'"
                      class="px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5">
                      <span>Todas</span>
                      <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono"
                            [class]="statusFilter() === 'all' ? 'bg-white/20 dark:bg-slate-900/20' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'">
                        {{ fieldStats().total }}
                      </span>
                    </button>

                    <button type="button" 
                      (click)="statusFilter.set('pending')"
                      [class]="statusFilter() === 'pending' ? 'bg-amber-600 text-white font-extrabold shadow-xs ring-2 ring-amber-400/50' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 border border-amber-200 dark:border-amber-800'"
                      class="px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer font-medium flex items-center gap-1.5">
                      <span>⚠️ Pendentes</span>
                      <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
                            [class]="statusFilter() === 'pending' ? 'bg-amber-700 text-white' : 'bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200'">
                        {{ fieldStats().pending }}
                      </span>
                    </button>

                    <button type="button" 
                      (click)="statusFilter.set('completed')"
                      [class]="statusFilter() === 'completed' ? 'bg-emerald-600 text-white font-extrabold shadow-xs ring-2 ring-emerald-400/50' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800'"
                      class="px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer font-medium flex items-center gap-1.5">
                      <span>✅ Lidas</span>
                      <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
                            [class]="statusFilter() === 'completed' ? 'bg-emerald-700 text-white' : 'bg-emerald-200/80 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200'">
                        {{ fieldStats().completed }}
                      </span>
                    </button>

                    @if (fieldStats().alerts > 0) {
                      <button type="button" 
                        (click)="statusFilter.set('alert')"
                        [class]="statusFilter() === 'alert' ? 'bg-rose-600 text-white font-extrabold shadow-xs ring-2 ring-rose-400/50' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 border border-rose-200 dark:border-rose-800'"
                        class="px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer font-medium flex items-center gap-1.5">
                        <span>🚨 Alertas</span>
                        <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
                              [class]="statusFilter() === 'alert' ? 'bg-rose-700 text-white' : 'bg-rose-200/80 dark:bg-rose-900 text-rose-900 dark:text-rose-200'">
                          {{ fieldStats().alerts }}
                        </span>
                      </button>
                    }

                    @if (prevMonthAudit().hasPreviousData) {
                      <button type="button" 
                        (click)="togglePrevMissingFilter()"
                        [class]="statusFilter() === 'prev_missing' ? 'bg-amber-600 text-white font-extrabold shadow-xs ring-2 ring-amber-400/50' : (prevMonthAudit().pendingCount > 0 ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/60 border border-amber-300 dark:border-amber-700' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800')"
                        class="px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer font-medium flex items-center gap-1.5"
                        [title]="prevMonthAudit().pendingCount > 0 ? 'Exibir apenas as ' + prevMonthAudit().pendingCount + ' lojas que tinham valor no mês anterior e ainda não foram lidas' : 'Todas as lojas que tinham valor no mês anterior já foram lidas neste mês'">
                        <span>⏮️ Do Mês Anterior</span>
                        <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
                              [class]="statusFilter() === 'prev_missing' ? 'bg-amber-700 text-white' : (prevMonthAudit().pendingCount > 0 ? 'bg-amber-400 text-slate-950 font-black' : 'bg-emerald-200/80 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200')">
                          {{ prevMonthAudit().pendingCount > 0 ? prevMonthAudit().pendingCount + ' pend.' : '✓ 100%' }}
                        </span>
                      </button>
                    }
                  </div>
                </div>
              </div>
            </div>

            <!-- Alternador de Modos de Trabalho: Lista de Lojas vs Modo Rota Guiada -->
            <div class="px-4 py-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div class="inline-flex p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl gap-1 shadow-2xs">
                <button type="button" 
                  (click)="mobileViewMode.set('cards')"
                  [class]="mobileViewMode() === 'cards' ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-200 font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
                  class="px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer">
                  <span>📋</span>
                  <span>Lista de Lojas</span>
                </button>
                <button type="button" 
                  (click)="mobileViewMode.set('step')"
                  [class]="mobileViewMode() === 'step' ? 'bg-teal-600 text-white font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
                  class="px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer">
                  <span>🚶</span>
                  <span>Modo Rota Guiada (1 por vez)</span>
                  <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono"
                        [class]="mobileViewMode() === 'step' ? 'bg-teal-800 text-teal-100' : 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200'">
                    #{{ (currentStepStore()?.routeOrder) || (stepIndex() + 1) }}
                  </span>
                </button>
              </div>

              <!-- Indicador de Progresso da Rota do Shopping -->
              <div class="flex items-center gap-3 text-xs">
                <div class="flex flex-col text-right">
                  <span class="font-bold text-slate-700 dark:text-slate-300">
                    Progresso: {{ fieldStats().completed }}/{{ fieldStats().total }} lidas ({{ fieldStats().progressPct }}%)
                  </span>
                  <span class="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                    {{ fieldStats().pending }} pendentes na rota
                  </span>
                </div>
                <div class="w-24 sm:w-32 bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                  <div class="bg-gradient-to-r from-teal-500 to-emerald-500 h-full transition-all duration-300"
                       [style.width.%]="fieldStats().progressPct"></div>
                </div>
              </div>
            </div>

            <!-- DESKTOP TABLE VIEW (Visível em telas médias/grandes quando no modo Lista) -->
            @if (mobileViewMode() === 'cards') {
              <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-left border-collapse text-sm">
                <thead class="sticky top-0 z-20 shadow-md backdrop-blur-md transition-all border-b-2"
                       [class]="utilityType() === 'luz' 
                         ? 'bg-slate-900/95 text-white border-amber-400' 
                         : (utilityType() === 'gas' 
                           ? 'bg-slate-900/95 text-white border-orange-500' 
                           : 'bg-slate-900/95 text-white border-teal-400')">
                  <tr>
                    <th (click)="toggleSort('storeName')" class="p-3 font-bold uppercase text-[11px] tracking-wider w-28 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Loja">
                      <div class="flex items-center justify-between gap-1">
                        <span>Loja</span>
                        <span class="text-[10px]" [class.opacity-100]="sortBy() === 'storeName' || sortBy() === 'name'" [class.opacity-40]="sortBy() !== 'storeName' && sortBy() !== 'name'">
                          {{ (sortBy() === 'storeName' || sortBy() === 'name') ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    <th (click)="toggleSort('prevReading')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-28 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Leitura / Consumo Anterior">
                      <div class="flex items-center justify-center gap-1">
                        <span>Leit. / Cons. Ant.</span>
                        <span class="text-[10px]" [class.opacity-100]="sortBy() === 'prevReading' || sortBy() === 'prevConsumption'" [class.opacity-40]="sortBy() !== 'prevReading' && sortBy() !== 'prevConsumption'">
                          {{ (sortBy() === 'prevReading' || sortBy() === 'prevConsumption') ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    <th (click)="toggleSort('currentReading')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-24 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Leitura Atual">
                      <div class="flex items-center justify-end gap-1">
                        <span>Leitura</span>
                        <span class="text-[10px]" [class.opacity-100]="sortBy() === 'currentReading'" [class.opacity-40]="sortBy() !== 'currentReading'">
                          {{ sortBy() === 'currentReading' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    @if (utilityType() === 'luz') {
                      <th (click)="toggleSort('constant')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-16 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Constante">
                        <div class="flex items-center justify-center gap-1">
                          <span>Const.</span>
                          <span class="text-[10px]" [class.opacity-100]="sortBy() === 'constant'" [class.opacity-40]="sortBy() !== 'constant'">
                            {{ sortBy() === 'constant' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                          </span>
                        </div>
                      </th>
                    }
                    <th (click)="toggleSort('virtual')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-20 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Virtual">
                      <div class="flex items-center justify-end gap-1">
                        <span>Virtual</span>
                        <span class="text-[10px]" [class.opacity-100]="sortBy() === 'virtual'" [class.opacity-40]="sortBy() !== 'virtual'">
                          {{ sortBy() === 'virtual' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    @if (utilityType() === 'gas') {
                       <th (click)="toggleSort('adjustment')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-16 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Ajuste Multiplicador">
                         <div class="flex items-center justify-center gap-1">
                           <span>Aj(x)</span>
                           <span class="text-[10px]" [class.opacity-100]="sortBy() === 'adjustment'" [class.opacity-40]="sortBy() !== 'adjustment'">
                             {{ sortBy() === 'adjustment' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                           </span>
                         </div>
                       </th>
                       <th (click)="toggleSort('adjustmentAdd')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-20 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ajuste Adicional em R$ (soma ao valor final a pagar)">
                         <div class="flex items-center justify-center gap-1">
                           <span>Aj(+) R$</span>
                           <span class="text-[10px]" [class.opacity-100]="sortBy() === 'adjustmentAdd'" [class.opacity-40]="sortBy() !== 'adjustmentAdd'">
                             {{ sortBy() === 'adjustmentAdd' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                           </span>
                         </div>
                       </th>
                       <th (click)="toggleSort('fcm')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-16 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por FCM">
                         <div class="flex items-center justify-center gap-1">
                           <span>FCM</span>
                           <span class="text-[10px]" [class.opacity-100]="sortBy() === 'fcm'" [class.opacity-40]="sortBy() !== 'fcm'">
                             {{ sortBy() === 'fcm' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                           </span>
                         </div>
                       </th>
                    } @else {
                       <th (click)="toggleSort('adjustment')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-16 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Ajuste">
                         <div class="flex items-center justify-center gap-1">
                           <span>Ajuste</span>
                           <span class="text-[10px]" [class.opacity-100]="sortBy() === 'adjustment'" [class.opacity-40]="sortBy() !== 'adjustment'">
                             {{ sortBy() === 'adjustment' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                           </span>
                         </div>
                       </th>
                    }
                    <th (click)="toggleSort('consumption')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-24 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Consumo">
                      <div class="flex items-center justify-end gap-1">
                        <span>{{ utilityType() === 'gas' ? 'Cons. Rateado' : 'Consumo' }}</span>
                        <span class="text-[10px]" [class.opacity-100]="sortBy() === 'consumption'" [class.opacity-40]="sortBy() !== 'consumption'">
                          {{ sortBy() === 'consumption' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    <th (click)="toggleSort('variation')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-16 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Variação">
                      <div class="flex items-center justify-end gap-1">
                        <span>Var (%)</span>
                        <span class="text-[10px]" [class.opacity-100]="sortBy() === 'variation'" [class.opacity-40]="sortBy() !== 'variation'">
                          {{ sortBy() === 'variation' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    @if (utilityType() === 'gas') {
                      <th (click)="toggleSort('fluxoCost')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-24 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Fluxo">
                        <div class="flex items-center justify-end gap-1">
                          <span>Fluxo</span>
                          <span class="text-[10px]" [class.opacity-100]="sortBy() === 'fluxoCost'" [class.opacity-40]="sortBy() !== 'fluxoCost'">
                            {{ sortBy() === 'fluxoCost' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                          </span>
                        </div>
                      </th>
                    }
                    <th (click)="toggleSort('note')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-right w-24 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Observações de Campo">
                      <div class="flex items-center justify-end gap-1">
                        <span>Obs. Campo</span>
                        <span class="text-[10px]" [class.opacity-100]="sortBy() === 'note'" [class.opacity-40]="sortBy() !== 'note'">
                          {{ sortBy() === 'note' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    <th (click)="toggleSort('hasPhoto')" class="p-3 font-bold uppercase text-[11px] tracking-wider text-center w-24 border-r border-slate-800/80 cursor-pointer select-none hover:bg-slate-800/80 transition-colors" title="Ordenar por Foto do Medidor">
                      <div class="flex items-center justify-center gap-1">
                        <span>Foto Medidor</span>
                        <span class="text-[10px]" [class.opacity-100]="sortBy() === 'hasPhoto'" [class.opacity-40]="sortBy() !== 'hasPhoto'">
                          {{ sortBy() === 'hasPhoto' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                    <th (click)="toggleSort('cost')" class="p-3 font-black uppercase text-[11px] tracking-wider text-right w-28 bg-slate-950 text-emerald-400 cursor-pointer select-none hover:bg-slate-900 transition-colors border-l border-slate-800" title="Ordenar por Custo Total">
                      <div class="flex items-center justify-end gap-1">
                        <span>Custo Total</span>
                        <span class="text-[10px]" [class.opacity-100]="sortBy() === 'cost'" [class.opacity-40]="sortBy() !== 'cost'">
                          {{ sortBy() === 'cost' ? (sortDirection() === 'asc' ? '▲' : '▼') : '↕' }}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900 transition-colors">
                  @for (item of filteredTableData(); track item.storeId) {
                    <tr [id]="'store-row-' + item.storeId" class="transition-colors group text-xs border-b border-slate-100 dark:border-slate-800/60"
                        [class.hover:bg-slate-50/90]="!item.validationAlert.hasAlert"
                        [class.dark:hover:bg-slate-800/60]="!item.validationAlert.hasAlert"
                        [class.border-l-4]="true"
                        [class.border-l-rose-500]="item.validationAlert.severity === 'critical'"
                        [class.border-l-amber-500]="item.validationAlert.severity === 'warning'"
                        [class.border-l-emerald-500]="item.isRead && !item.validationAlert.hasAlert"
                        [class.border-l-slate-200]="!item.isRead"
                        [class.dark:border-l-slate-700]="!item.isRead"
                        [class.bg-rose-50/30]="item.validationAlert.severity === 'critical'"
                        [class.dark:bg-rose-950/20]="item.validationAlert.severity === 'critical'"
                        [class.bg-amber-50/20]="item.validationAlert.severity === 'warning'"
                        [class.dark:bg-amber-950/15]="item.validationAlert.severity === 'warning'">
                      <td class="p-3 font-medium text-slate-800 dark:text-slate-100 border-r border-slate-100 dark:border-slate-800">
                          <div class="truncate max-w-[140px] font-semibold flex items-center gap-1.5" [title]="item.storeName">
                            <span>{{ item.storeName }}</span>
                            @if (item.validationAlert.hasAlert) {
                              <span class="text-[10px] px-1.5 py-0.5 rounded font-black cursor-help shrink-0 shadow-2xs"
                                [class.bg-rose-600]="item.validationAlert.severity === 'critical'"
                                [class.text-white]="item.validationAlert.severity === 'critical'"
                                [class.bg-amber-500]="item.validationAlert.severity === 'warning'"
                                [class.text-slate-950]="item.validationAlert.severity === 'warning'"
                                [title]="item.validationAlert.message">
                                {{ item.validationAlert.badgeLabel }}
                              </span>
                            }
                          </div>
                          <div class="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5 flex-wrap">
                            @if (item.routeOrder) {
                              <span class="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.2 rounded font-bold shadow-2xs" title="Posição {{ item.routeOrder }} na rota de leitura">#{{ item.routeOrder }}</span>
                            }
                            <span class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1 py-0.5 rounded font-semibold">{{ item.luc }}</span>
                            @if (item.contrato) {
                              <span class="text-slate-300 dark:text-slate-600">•</span>
                              <span class="text-slate-500 dark:text-slate-400 font-medium">Ctr: {{ item.contrato }}</span>
                            }
                            <button type="button" 
                              (click)="toggleExcludeFromBill(item.storeId)" 
                              [title]="item.excludedFromBill ? 'Esta loja NÃO entra no Valor SAP da conta (não altera a área comum). Clique para incluir no SAP.' : 'Esta loja entra no Valor SAP. Clique para retirar do Valor SAP.'" 
                              class="text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1 transition-all border shadow-2xs"
                              [class]="item.excludedFromBill 
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700' 
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-700'">
                              <span>{{ item.excludedFromBill ? '🚫 Fora do SAP' : '✓ No SAP' }}</span>
                            </button>
                            <button type="button" (click)="openStoreVoucher(item)" title="Gerar espelho do lojista" class="ml-auto text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-0.5"><span>📲</span><span>Espelho</span></button>
                          </div>
                      </td>
                      <td class="p-2.5 text-center font-mono border-r border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        <div class="font-bold text-slate-700 dark:text-slate-300 text-xs tabular-nums" [title]="'Leitura registrada no medidor no mês anterior (' + (item.prevReadingMonth || 'mês anterior') + ')'">
                          {{ item.prevReading | number:'1.0-0' }}
                        </div>
                        <div class="text-[10px] font-sans font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800/80 mt-1 inline-block" [title]="'Consumo faturado no mês anterior (' + (item.prevReadingMonth || 'mês anterior') + ')'">
                          Ant: {{ item.prevConsumption | number:'1.0-2' }} {{ getUnit() }}
                        </div>
                        @if (item.prevReadingMonth && item.prevReadingMonth !== getPreviousMonth(selectedMonth()) && item.prevReading > 0) {
                          <span class="block text-[9px] text-indigo-600 dark:text-indigo-400 font-bold font-sans mt-0.5" [title]="'Última leitura válida no histórico (' + item.prevReadingMonth + ')'">
                            Ref: {{ item.prevReadingMonth }}
                          </span>
                        }
                      </td>
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                         <div class="flex flex-col gap-1">
                            <input type="number" 
                              step="0.0001" 
                              inputmode="decimal"
                              [ngModel]="item.currentReading" 
                              (ngModelChange)="updateDetailedReading(item.storeId, 'reading', $event)" 
                              (blur)="onReadingBlur(item.storeId)"
                              (keyup.enter)="onReadingBlur(item.storeId)"
                              (paste)="onPasteCell($event, item.storeId, 'reading')" 
                              [disabled]="!canEdit()" 
                              [id]="'reading-input-' + item.storeId"
                              class="w-full text-right bg-white dark:bg-slate-950 dark:text-white border-2 rounded-lg px-2 py-1 focus:ring-2 font-mono font-black tabular-nums transition-all text-xs"
                              [class.border-rose-500]="item.validationAlert.severity === 'critical'"
                              [class.ring-2]="item.validationAlert.hasAlert && !item.anomalyConfirmed"
                              [class.ring-rose-400]="item.validationAlert.severity === 'critical' && !item.anomalyConfirmed"
                              [class.border-amber-500]="item.validationAlert.severity === 'warning' && !item.anomalyConfirmed"
                              [class.ring-amber-400]="item.validationAlert.severity === 'warning' && !item.anomalyConfirmed"
                              [class.border-emerald-400]="(item.isRead && !item.validationAlert.hasAlert) || item.anomalyConfirmed"
                              [class.border-slate-300]="!item.isRead"
                              [class.dark:border-slate-700]="!item.isRead"
                              [title]="item.validationAlert.hasAlert ? item.validationAlert.message : ''"
                              placeholder="0">

                            @if (item.validationAlert.hasAlert) {
                              <button type="button" 
                                (click)="openAnomalyModal(item)"
                                class="text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1 shadow-2xs transition-all w-fit self-end"
                                [class]="item.anomalyConfirmed 
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                  : (item.validationAlert.severity === 'critical'
                                      ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800 animate-pulse'
                                      : 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800')">
                                <span>{{ item.validationAlert.badgeLabel }}</span>
                              </button>
                            }

                            @if (item.isJustified) {
                              <div class="flex items-center justify-between gap-1 mt-0.5">
                                <span class="text-[9px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 px-1.5 py-0.2 rounded border border-amber-300 dark:border-amber-800 truncate" [title]="'Justificada: ' + (item.justificationReason || '')">
                                  ⚖️ {{ item.justificationReason || 'Justificada' }}
                                </span>
                                @if (canEdit()) {
                                  <button type="button" 
                                    (click)="openQuickJustifyModal(item)"
                                    class="text-[9px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                    title="Alterar justificativa">✏️</button>
                                }
                              </div>
                            } @else if (canEdit() && !item.isRead) {
                              <div class="flex items-center gap-1 justify-end mt-0.5">
                                @if (item.isFrequentZero) {
                                  <button type="button" 
                                    (click)="quickJustifyStore(item.storeId, item.learnedReason || 'Loja Fechada / Vaga', true)"
                                    class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 cursor-pointer shadow-2xs flex items-center gap-0.5"
                                    [title]="'Preenchimento rápido: ' + item.consecutiveZeroMonths + ' meses com consumo zero (' + item.learnedReason + ')'">
                                    <span>⚡ 0</span>
                                  </button>
                                }
                                <button type="button"
                                  (click)="openQuickJustifyModal(item)"
                                  class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 cursor-pointer"
                                  title="Justificar loja não lida (ex: fechada/em reforma)">
                                  <span>⚖️ Justificar</span>
                                </button>
                              </div>
                            }
                         </div>
                      </td>
                      
                      @if (utilityType() === 'luz') {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.0001" [ngModel]="item.constant" (ngModelChange)="updateDetailedReading(item.storeId, 'constant', $event)" (paste)="onPasteCell($event, item.storeId, 'constant')" [disabled]="!canConfigure()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-600 dark:text-slate-300 disabled:opacity-50" placeholder="1">
                          </td>
                      }
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                          <input type="number" step="0.0001" [ngModel]="item.virtual" (ngModelChange)="updateDetailedReading(item.storeId, 'virtual', $event)" (paste)="onPasteCell($event, item.storeId, 'virtual')" [disabled]="!canConfigure()" class="w-full text-right bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 focus:border-teal-500 text-blue-600 dark:text-blue-400 placeholder-slate-300 disabled:border-none disabled:text-slate-400 font-semibold" placeholder="—" title="Consumo Virtual (override manual - deixe vazio para usar medição normal)">
                      </td>

                      @if (utilityType() === 'gas') {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.000001" [ngModel]="item.adjustment" (ngModelChange)="updateDetailedReading(item.storeId, 'adjustment', $event)" (paste)="onPasteCell($event, item.storeId, 'adjustment')" [disabled]="!canConfigure()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-500 dark:text-slate-400 disabled:opacity-50" placeholder="1.347">
                          </td>
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.01" [ngModel]="item.adjustmentAdd" (ngModelChange)="updateDetailedReading(item.storeId, 'adjustmentAdd', $event)" (paste)="onPasteCell($event, item.storeId, 'adjustmentAdd')" [disabled]="!canConfigure()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-600 dark:text-slate-300 disabled:opacity-50 font-mono" placeholder="0.00" title="Ajuste Adicional em R$ (soma ao valor final a pagar)">
                          </td>
                           <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.000001" [ngModel]="item.fcm" (ngModelChange)="updateDetailedReading(item.storeId, 'fcm', $event)" (paste)="onPasteCell($event, item.storeId, 'fcm')" [disabled]="!canConfigure()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-500 dark:text-slate-400 disabled:opacity-50" placeholder="1.0727">
                          </td>
                      } @else {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                            <input type="number" step="0.000001" [ngModel]="item.adjustment" (ngModelChange)="updateDetailedReading(item.storeId, 'adjustment', $event)" (paste)="onPasteCell($event, item.storeId, 'adjustment')" [disabled]="!canConfigure()" class="w-full text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-500 dark:text-slate-400 disabled:opacity-50" placeholder="1">
                          </td>
                      }
                      <td class="p-3 text-right font-mono border-r border-slate-100 dark:border-slate-800">
                        <div class="font-black text-slate-800 dark:text-slate-100 text-sm tabular-nums" [title]="'Consumo atual faturado: ' + (item.consumption | number:'1.0-4') + ' ' + getUnit() + (item.prevConsumption ? ' (Mês anterior: ' + (item.prevConsumption | number:'1.0-2') + ' ' + getUnit() + ')' : '')">
                          {{ item.consumption | number:'1.0-4' }}
                        </div>
                        <div class="text-[10px] text-slate-400 dark:text-slate-500 font-sans font-medium mt-0.5" title="Consumo registrado no mês anterior">
                          ant: {{ item.prevConsumption | number:'1.0-2' }}
                        </div>
                        @if (item.isGasDistributed) {
                          <div class="text-[10px] text-orange-600 dark:text-orange-400 font-sans font-bold" [title]="'Medição bruta em campo: ' + (item.rawConsumption | number:'1.0-4') + ' m³ (ajustado pelo fator ' + (item.gasFactor | number:'1.4-4') + 'x)'">
                            bruto: {{ item.rawConsumption | number:'1.0-2' }}
                          </div>
                        }
                      </td>
                      <td class="p-3 text-right font-mono text-[10px] border-r border-slate-100 dark:border-slate-800">
                        @if (item.variation !== 0) {
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded-md font-bold tabular-nums shadow-2xs" 
                                [class]="item.variation > 0 ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'">
                            {{ item.variation > 0 ? '+' : '' }}{{ item.variation | number:'1.1-1' }}%
                          </span>
                        } @else {
                          <span class="text-slate-400 dark:text-slate-500 font-mono text-[10px]">0,0%</span>
                        }
                      </td>
                      @if (utilityType() === 'gas') {
                          <td class="p-3 border-r border-slate-100 dark:border-slate-800">
                              <input type="number" step="0.01" [ngModel]="item.fluxoCost" (ngModelChange)="updateDetailedReading(item.storeId, 'fluxoCost', $event)" (paste)="onPasteCell($event, item.storeId, 'fluxoCost')" [disabled]="!canConfigure()" class="w-full text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-500 text-slate-600 dark:text-slate-300 disabled:opacity-50" placeholder="0.00">
                          </td>
                      }
                      <!-- Observação de Campo Desktop -->
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800 text-right">
                        @if (item.note) {
                          <span class="inline-block max-w-[100px] truncate bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded text-[10px] shadow-2xs font-medium" [title]="item.note">
                            {{ item.note }}
                          </span>
                        } @else {
                          <button (click)="openNoteEditor(item.storeId)" class="text-[10px] text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer">
                            + nota
                          </button>
                        }
                      </td>
                      <!-- Foto do Medidor Desktop -->
                      <td class="p-3 border-r border-slate-100 dark:border-slate-800 text-center">
                        @if (isReadingOcr() === item.storeId) {
                          <span class="inline-flex items-center gap-1 text-[10px] text-indigo-700 dark:text-indigo-300 font-bold animate-pulse">
                            <span class="animate-spin text-xs">⚡</span>
                            <span>Lendo IA...</span>
                          </span>
                        } @else if (meterPhotos()[item.storeId]) {
                          <div class="inline-flex items-center gap-1">
                            <button type="button" 
                              (click)="openPhotoViewer(item.storeId)" 
                              class="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded text-[10px] font-bold transition-all cursor-pointer shadow-2xs">
                              <span>📷 Foto</span>
                              @if (meterPhotos()[item.storeId].synced) {
                                <span class="text-[9px] text-teal-600 dark:text-teal-400" title="Foto sincronizada na nuvem com Supabase">☁️</span>
                              } @else {
                                <span class="text-[9px] text-amber-500" title="Salva localmente no IndexedDB, pendente envio para nuvem">⏳</span>
                              }
                            </button>
                            <button type="button" 
                              (click)="runOcrOnPhoto(item.storeId)" 
                              class="inline-flex items-center px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded text-[9px] font-bold transition-all cursor-pointer shadow-2xs"
                              title="Ler visor com IA (Groq Qwen ou Gemini)">
                              <span>⚡</span>
                            </button>
                            <button type="button" 
                              (click)="confirmDeletePhoto(item.storeId, item.storeName)" 
                              class="p-0.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer text-[10px]"
                              title="Excluir foto do medidor">
                              <span>🗑️</span>
                            </button>
                          </div>
                        } @else {
                          <label class="cursor-pointer text-[10px] text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 inline-flex items-center gap-0.5 transition-colors">
                            <span>+ foto</span>
                            <input type="file" 
                              accept="image/*" 
                              capture="environment" 
                              (change)="onPhotoCaptured($event, item.storeId, item.storeName, item.luc, item.currentReading)" 
                              class="hidden">
                          </label>
                        }
                      </td>
                      <td class="p-3 text-right font-mono font-black tabular-nums text-sm bg-slate-50/70 dark:bg-slate-950/50 border-l border-slate-100 dark:border-slate-800"
                          [class.text-amber-500]="utilityType() === 'luz'"
                          [class.text-orange-500]="utilityType() === 'gas'"
                          [class.text-teal-700]="utilityType() === 'agua'"
                          [class.dark:text-teal-400]="utilityType() === 'agua'">
                        @if (item.excludedFromBill) {
                          <span class="text-amber-600 dark:text-amber-400 block line-through opacity-60 text-[10px]">
                            {{ item.originalCost | currency:'BRL' }}
                          </span>
                          <span class="text-amber-700 dark:text-amber-300 font-extrabold text-xs block">
                            R$ 0,00
                          </span>
                          <span class="text-[9px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider block">
                            Fora do SAP
                          </span>
                        } @else {
                          {{ item.cost | currency:'BRL' }}
                        }
                        @if (item.prevCost) {
                          <div class="text-[10px] text-slate-400 dark:text-slate-500 font-sans font-medium mt-0.5 tracking-tight" [title]="'Valor faturado no mês anterior (' + (item.prevReadingMonth || 'mês anterior') + ')'">
                            ant: {{ item.prevCost | currency:'BRL' }}
                          </div>
                        }
                      </td>
                    </tr>
                  }
                  @if (filteredTableData().length === 0) {
                    <tr>
                      <td colspan="15" class="p-10 text-center text-slate-400 text-xs">
                        @if (statusFilter() === 'prev_missing') {
                          <div class="py-6 space-y-2 max-w-md mx-auto">
                            <div class="text-4xl">✨</div>
                            <p class="font-black text-emerald-600 dark:text-emerald-400 text-sm">Todas as lojas do mês anterior já foram lidas!</p>
                            <p class="text-slate-500 dark:text-slate-400 text-xs">
                              Parabéns! Nenhuma loja que tinha medição em <strong>{{ getPreviousMonth(selectedMonth()) }}</strong> ficou para trás neste mês.
                            </p>
                            <button type="button" (click)="statusFilter.set('all')" class="mt-2 px-3.5 py-1.5 bg-slate-900 dark:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs">
                              Ver Todas as Lojas
                            </button>
                          </div>
                        } @else if (searchQuery()) {
                          Nenhuma loja encontrada para o termo pesquisado.
                        } @else if (!hasMonthlyListForSelectedMonth()) {
                          <div class="py-4 space-y-2 max-w-md mx-auto">
                            <div class="text-3xl">📋</div>
                            <p class="font-bold text-slate-700 dark:text-slate-200 text-sm">Mês {{ selectedMonth() }} em branco</p>
                            <p class="text-slate-400 text-xs">
                              Nenhuma lista de lojas foi importada para <strong>{{ selectedMonth() }}</strong>.
                              Os meses sem importação permanecem em branco.
                            </p>
                            <a href="#stores" class="inline-block mt-2 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-bold transition-colors">
                              Ir para a aba Lojas e Subir Lista Mensal
                            </a>
                          </div>
                        } @else {
                          Nenhuma loja encontrada para os filtros selecionados.
                        }
                      </td>
                    </tr>
                  }
                </tbody>
                <!-- Rodapé Contábil da Tabela Desktop -->
                <tfoot class="sticky bottom-0 z-10 bg-slate-900 text-white border-t-2 border-slate-700 font-mono text-xs shadow-lg">
                  <tr>
                    <td class="p-3 font-bold border-r border-slate-800" colspan="2">
                      <div class="flex items-center justify-between">
                        <span class="text-[11px] uppercase tracking-wider text-slate-400 font-sans">Totais:</span>
                        <span class="text-xs text-slate-200 font-sans font-bold">
                          {{ filteredTableData().length }} lojas ({{ fieldStats().completed }} lidas)
                        </span>
                      </div>
                    </td>
                    <td class="p-3 text-right border-r border-slate-800 text-slate-400 text-[11px]">—</td>
                    @if (utilityType() === 'luz') {
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    }
                    <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    @if (utilityType() === 'gas') {
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    } @else {
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    }
                    <td class="p-3 text-right font-black border-r border-slate-800 text-slate-100 tabular-nums">
                      {{ totalConsumption() | number:'1.0-4' }}
                    </td>
                    <td class="p-3 text-right border-r border-slate-800 text-slate-500 text-[10px]">—</td>
                    @if (utilityType() === 'gas') {
                      <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    }
                    <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    <td class="p-3 border-r border-slate-800 text-center text-slate-500 text-[10px]">—</td>
                    <td class="p-3 text-right font-black tabular-nums text-sm border-l border-slate-800"
                        [class.text-amber-400]="utilityType() === 'luz'"
                        [class.text-orange-400]="utilityType() === 'gas'"
                        [class.text-teal-300]="utilityType() === 'agua'">
                      {{ totalDistributedCost() | currency:'BRL' }}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }

            <!-- MOBILE INTERFACE (Visível apenas em dispositivos móveis / telas menores) -->
            <div class="md:hidden">

              <!-- MODO 1: LISTA DE CARDS OTIMIZADA PARA O TÉCNICO -->
              @if (mobileViewMode() === 'cards') {
                <div class="flex flex-col divide-y divide-slate-200 dark:divide-slate-800 bg-slate-100 dark:bg-slate-950">
                  @for (item of filteredTableData(); track item.storeId) {
                     <div [id]="'store-card-' + item.storeId" class="p-4 bg-white dark:bg-slate-900 transition-colors"
                          [class.border-l-4]="true"
                          [class.border-l-rose-500]="item.validationAlert.severity === 'critical'"
                          [class.border-l-amber-500]="item.validationAlert.severity === 'warning'"
                          [class.border-l-emerald-500]="item.isRead && !item.validationAlert.hasAlert"
                          [class.border-l-slate-300]="!item.isRead"
                          [class.dark:border-l-slate-700]="!item.isRead">
                        
                        <!-- Header do Card: LUC, Nome e Status -->
                        <div class="flex justify-between items-start mb-2.5">
                           <div class="flex-1 pr-2">
                             <div class="flex items-center gap-1.5 flex-wrap">
                               @if (item.routeOrder) {
                                <span class="text-xs font-mono font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md shadow-xs border border-indigo-200 dark:border-indigo-800" title="Ordem da Rota">
                                  #{{ item.routeOrder }}
                                </span>
                              }
                              <span class="text-xs font-mono font-extrabold text-white bg-slate-900 dark:bg-slate-800 px-2 py-0.5 rounded-md shadow-xs border border-transparent dark:border-slate-700">
                                 {{ item.luc }}
                               </span>
                                @if (item.contrato) {
                                  <span class="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                    Ctr: {{ item.contrato }}
                                  </span>
                                }
                                <button type="button" 
                                  (click)="toggleExcludeFromBill(item.storeId)" 
                                  class="text-[10px] font-bold px-2 py-0.5 rounded-md cursor-pointer flex items-center gap-1 transition-all border shadow-2xs"
                                  [class]="item.excludedFromBill 
                                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700' 
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'">
                                  <span>{{ item.excludedFromBill ? '🚫 Fora do SAP' : '✓ No SAP' }}</span>
                                </button>
                             </div>
                             <div class="font-bold text-slate-900 dark:text-white text-base mt-1 leading-tight">
                               {{ item.storeName }}
                             </div>
                           </div>

                           <div class="text-right shrink-0">
                              @if (item.validationAlert.hasAlert) {
                                <span class="text-[10px] font-black px-2 py-0.5 rounded-full border block shadow-2xs"
                                  [class.bg-rose-100]="item.validationAlert.severity === 'critical'"
                                  [class.text-rose-800]="item.validationAlert.severity === 'critical'"
                                  [class.border-rose-300]="item.validationAlert.severity === 'critical'"
                                  [class.dark:bg-rose-950/80]="item.validationAlert.severity === 'critical'"
                                  [class.dark:text-rose-200]="item.validationAlert.severity === 'critical'"
                                  [class.dark:border-rose-800]="item.validationAlert.severity === 'critical'"
                                  [class.bg-amber-100]="item.validationAlert.severity === 'warning'"
                                  [class.text-amber-900]="item.validationAlert.severity === 'warning'"
                                  [class.border-amber-300]="item.validationAlert.severity === 'warning'"
                                  [class.dark:bg-amber-950/80]="item.validationAlert.severity === 'warning'"
                                  [class.dark:text-amber-200]="item.validationAlert.severity === 'warning'"
                                  [class.dark:border-amber-800]="item.validationAlert.severity === 'warning'">
                                  {{ item.validationAlert.badgeLabel }}
                                </span>
                              } @else if (item.isJustified) {
                                <span class="bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-700 block" [title]="item.justificationReason">
                                  ⚖️ {{ item.justificationReason || 'Justificada' }}
                                </span>
                              } @else if (item.isRead) {
                                <span class="bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800 block">
                                  ✓ Lida
                                </span>
                              } @else {
                                <span class="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-medium px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 block">
                                  ⏳ Pendente
                                </span>
                              }
                           </div>
                        </div>
                        
                        <!-- Área de Leituras: Leitura Anterior (fixa) vs Leitura Atual (teclado numérico grande) -->
                        <div class="grid grid-cols-2 gap-3 items-center my-3">
                           <!-- Leitura Anterior -->
                           <div class="flex flex-col bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                              <label class="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-400 tracking-wider">Leitura Anterior</label>
                              <div class="text-slate-700 dark:text-slate-200 font-mono text-lg font-bold mt-0.5">
                                 {{ item.prevReading | number:'1.0-0' }} <span class="text-xs font-normal text-slate-400">{{ getUnit() }}</span>
                                 @if (item.prevReadingMonth && item.prevReadingMonth !== getPreviousMonth(selectedMonth()) && item.prevReading > 0) {
                                   <span class="text-[10px] text-teal-600 dark:text-teal-400 font-bold ml-1">({{ item.prevReadingMonth }})</span>
                                 }
                              </div>
                           </div>
                           
                           <!-- Leitura Atual (Foco de Digitação em Campo) -->
                           <div class="flex flex-col">
                              <div class="flex items-center justify-between">
                                <label class="text-[10px] uppercase font-bold text-teal-700 dark:text-teal-400 tracking-wider">Leitura Atual</label>
                                @if (isReadingOcr() === item.storeId) {
                                  <span class="text-[9px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 px-1.5 py-0.2 rounded-full font-bold flex items-center gap-1 animate-pulse">
                                    <span class="animate-spin text-[10px]">⚡</span>
                                    <span>Lendo...</span>
                                  </span>
                                }
                              </div>

                              <!-- Indicador OCR Ativo no Card -->
                              @if (isReadingOcr() === item.storeId) {
                                <div class="mt-1 p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-[11px] font-bold flex items-center justify-between gap-1.5 animate-pulse">
                                  <span class="flex items-center gap-1">
                                    <span>⚡</span>
                                    <span>{{ ocrCurrentModelLabel() }} lendo foto...</span>
                                  </span>
                                  <span class="text-[9px] bg-indigo-200 dark:bg-indigo-800 px-1 rounded">OCR</span>
                                </div>
                              }

                              <!-- Feedback OCR no Card -->
                              @if (ocrFeedback()[item.storeId]; as fb) {
                                <div class="mt-1 p-1.5 rounded-lg text-[11px] flex items-center justify-between gap-1 transition-all"
                                     [class]="fb.success ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100' : 'bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'">
                                  <div class="flex items-center gap-1 truncate">
                                    <span>{{ fb.success ? '🤖✓' : '🤖⚠️' }}</span>
                                    <span class="font-bold truncate">{{ fb.message }}</span>
                                  </div>
                                  <button (click)="dismissOcrFeedback(item.storeId)" class="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold cursor-pointer shrink-0">✕</button>
                                </div>
                              }

                              <!-- Conferência da leitura sugerida pela IA -->
                              @if (ocrPending()[item.storeId]; as pend) {
                                <div class="mt-1 p-2 rounded-lg border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 text-[11px] space-y-1.5">
                                  <p class="font-bold text-indigo-900 dark:text-indigo-100">
                                    🤖 IA leu <span class="font-mono text-sm">{{ pend.ocrValue }}</span> — confere com a foto?
                                  </p>
                                  @if (pend.confidence !== 'high') {
                                    <p class="text-amber-700 dark:text-amber-300 font-semibold">⚠️ Confiança {{ pend.confidence === 'medium' ? 'média' : 'baixa' }}: confira com atenção.</p>
                                  }
                                  <p class="text-slate-600 dark:text-slate-400">Se estiver errado, corrija o número no campo abaixo e confirme.</p>

                                  <!-- Seleção Rápida de Divergência entre Motores de IA -->
                                  @if (pend.dualCheck && !pend.dualCheck.agreement && pend.dualCheck.qwenValue !== null && pend.dualCheck.geminiValue !== null) {
                                    <div class="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 space-y-1">
                                      <p class="font-bold text-[10px] flex items-center gap-1">
                                        <span>⚠️</span>
                                        <span>Motores de IA divergiram: toque no valor correto:</span>
                                      </p>
                                      <div class="grid grid-cols-2 gap-1.5">
                                        <button type="button" (click)="updateDetailedReading(item.storeId, 'reading', pend.dualCheck.qwenValue); confirmOcrReading(item.storeId, pend.dualCheck.qwenValue)"
                                          class="py-1 px-1.5 rounded-md bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 font-mono font-bold text-xs hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer text-indigo-700 dark:text-indigo-300">
                                          ⚡ Qwen: {{ pend.dualCheck.qwenValue }}
                                        </button>
                                        <button type="button" (click)="updateDetailedReading(item.storeId, 'reading', pend.dualCheck.geminiValue); confirmOcrReading(item.storeId, pend.dualCheck.geminiValue)"
                                          class="py-1 px-1.5 rounded-md bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 font-mono font-bold text-xs hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer text-teal-700 dark:text-teal-300">
                                          🤖 Gemini: {{ pend.dualCheck.geminiValue }}
                                        </button>
                                      </div>
                                    </div>
                                  }
                                  @if (item.validationAlert.hasAlert) {
                                    <div class="p-1.5 rounded-md bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 font-semibold">
                                      <p>{{ item.validationAlert.title }}</p>
                                      <p class="font-normal mt-0.5">{{ item.validationAlert.message }}</p>
                                      <button type="button" (click)="retryOcrWithOtherEngine(item.storeId)"
                                        [disabled]="isReadingOcr() === item.storeId"
                                        class="mt-1 w-full py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold cursor-pointer">
                                        🔄 Reler com {{ pend.provider === 'qwen' ? 'Gemini' : 'Qwen' }}
                                      </button>
                                    </div>
                                  }
                                  <button type="button" (click)="confirmOcrReading(item.storeId, item.currentReading)"
                                    [disabled]="!canEdit()"
                                    class="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold cursor-pointer">
                                    ✓ Confirmar leitura
                                  </button>
                                </div>
                              }

                              <div class="relative mt-0.5">
                                <input type="number" 
                                   inputmode="decimal"
                                   step="0.0001"
                                   [ngModel]="item.currentReading" 
                                   (ngModelChange)="updateDetailedReading(item.storeId, 'reading', $event)"
                                   (blur)="onReadingBlur(item.storeId)"
                                   (keyup.enter)="onReadingBlur(item.storeId)"
                                   [disabled]="!canEdit()"
                                   [id]="'reading-card-input-' + item.storeId"
                                   class="w-full text-right text-xl font-mono p-2.5 border-2 rounded-xl focus:ring-2 font-bold bg-white dark:bg-slate-950 text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800 transition-colors"
                                   [class.border-rose-500]="item.validationAlert.severity === 'critical'"
                                   [class.ring-2]="item.validationAlert.hasAlert"
                                   [class.ring-rose-400]="item.validationAlert.severity === 'critical'"
                                   [class.bg-rose-50/20]="item.validationAlert.severity === 'critical'"
                                   [class.border-amber-500]="item.validationAlert.severity === 'warning'"
                                   [class.ring-amber-400]="item.validationAlert.severity === 'warning'"
                                   [class.bg-amber-50/20]="item.validationAlert.severity === 'warning'"
                                   [class.border-emerald-500]="item.isRead && !item.validationAlert.hasAlert"
                                   [class.border-slate-300]="!item.isRead"
                                   [class.dark:border-slate-700]="!item.isRead"
                                   placeholder="0">
                              </div>
                           </div>
                        </div>

                        @if (item.isJustified) {
                          <div class="mb-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between text-xs">
                            <div class="flex items-center gap-2">
                              <span class="text-base">⚖️</span>
                              <div>
                                <span class="font-bold text-amber-900 dark:text-amber-200 block">Loja Justificada (Sem Consumo)</span>
                                <span class="text-[11px] text-amber-700 dark:text-amber-300 font-medium">{{ item.justificationReason || 'Sem consumo no mês' }}</span>
                              </div>
                            </div>
                            @if (canEdit()) {
                              <button type="button" 
                                (click)="openQuickJustifyModal(item)"
                                class="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 dark:bg-amber-900 dark:hover:bg-amber-800 text-amber-950 dark:text-amber-100 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs">
                                Alterar
                              </button>
                            }
                          </div>
                        } @else if (canEdit() && !item.isRead) {
                          <div class="mb-3 flex items-center gap-2 flex-wrap">
                            @if (item.isFrequentZero) {
                              <button type="button"
                                (click)="quickJustifyStore(item.storeId, item.learnedReason || 'Loja Fechada / Vaga', true)"
                                class="flex-1 py-2 px-3 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                                [title]="item.consecutiveZeroMonths + ' meses com consumo zero'">
                                <span>⚡ 0 {{ getUnit() }} (Histórico Zero: {{ item.consecutiveZeroMonths }}m)</span>
                              </button>
                            }
                            <button type="button"
                              (click)="openQuickJustifyModal(item)"
                              class="py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors">
                              <span>⚖️ Justificar Loja</span>
                            </button>
                          </div>
                        }

                        <!-- ALERTA INSTANTÂNEO DE LEITURA SUSPEITA / ERRO DE DIGITAÇÃO -->
                        @if (item.validationAlert.hasAlert) {
                          <div class="mb-3 p-3 rounded-xl border flex items-start gap-2.5 text-xs shadow-xs"
                               [class.bg-rose-50]="item.validationAlert.severity === 'critical'"
                               [class.border-rose-300]="item.validationAlert.severity === 'critical'"
                               [class.text-rose-950]="item.validationAlert.severity === 'critical'"
                               [class.dark:bg-rose-950/40]="item.validationAlert.severity === 'critical'"
                               [class.dark:border-rose-800]="item.validationAlert.severity === 'critical'"
                               [class.dark:text-rose-200]="item.validationAlert.severity === 'critical'"
                               [class.bg-amber-50]="item.validationAlert.severity === 'warning'"
                               [class.border-amber-300]="item.validationAlert.severity === 'warning'"
                               [class.text-amber-950]="item.validationAlert.severity === 'warning'"
                               [class.dark:bg-amber-950/40]="item.validationAlert.severity === 'warning'"
                               [class.dark:border-amber-800]="item.validationAlert.severity === 'warning'"
                               [class.dark:text-amber-200]="item.validationAlert.severity === 'warning'">
                            <span class="text-xl shrink-0 leading-none">
                              {{ item.validationAlert.severity === 'critical' ? '🚨' : '⚠️' }}
                            </span>
                            <div class="flex-1 space-y-1">
                              <div class="font-extrabold flex items-center justify-between">
                                <span class="text-xs">{{ item.validationAlert.title }}</span>
                                <span class="px-2 py-0.2 rounded text-[9px] uppercase font-black tracking-wide"
                                  [class.bg-rose-600]="item.validationAlert.severity === 'critical'"
                                  [class.text-white]="item.validationAlert.severity === 'critical'"
                                  [class.bg-amber-500]="item.validationAlert.severity === 'warning'"
                                  [class.text-slate-950]="item.validationAlert.severity === 'warning'">
                                  {{ item.validationAlert.badgeLabel }}
                                </span>
                              </div>
                              <p class="leading-relaxed text-[11px] text-slate-700 dark:text-slate-300">
                                {{ item.validationAlert.message }}
                              </p>
                              <!-- Metadados de Comparação em Tempo Real -->
                              <div class="pt-1.5 mt-1 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                                <span>Anterior: <strong>{{ item.prevReading | number:'1.0-0' }}</strong></span>
                                <span>Digitada: <strong>{{ item.currentReading | number:'1.0-2' }}</strong></span>
                                @if (item.validationAlert.avgConsumption > 0) {
                                  <span>Média Histórica: <strong>{{ item.validationAlert.avgConsumption | number:'1.0-1' }} {{ getUnit() }}</strong></span>
                                }
                              </div>
                              <div class="text-[10px] font-semibold text-rose-800 dark:text-rose-300 bg-white/70 dark:bg-slate-900/80 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800 mt-1 inline-block">
                                🔍 Confira no visor do relógio antes de sair da loja
                              </div>

                              <!-- Ações Imediatas de Auditoria no Card -->
                              <div class="flex items-center gap-2 mt-2 pt-1.5 border-t border-black/10 dark:border-white/10 flex-wrap">
                                @if (!item.anomalyConfirmed) {
                                  <button type="button" 
                                          (click)="confirmAnomaly(item.storeId)"
                                          class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer shadow-xs">
                                    <span>✓ Confirmar como Correto</span>
                                  </button>
                                  @if (item.validationAlert.type === 'negative') {
                                    <button type="button" 
                                            (click)="markRollover(item.storeId)"
                                            class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer shadow-xs">
                                      <span>🔄 Virada de Relógio</span>
                                    </button>
                                  }
                                } @else {
                                  <span class="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                    <span>✓ Auditado e confirmado pelo técnico</span>
                                  </span>
                                }
                              </div>
                            </div>
                          </div>
                        }

                        <!-- Resultados Calculados em Tempo Real -->
                        @if (item.isRead) {
                          <div class="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs mb-2">
                             <div>
                                <span class="text-[10px] text-slate-400 block">Diferença</span>
                                <strong class="font-mono text-slate-700 dark:text-slate-200">+{{ item.readingDiff | number:'1.0-2' }} {{ getUnit() }}</strong>
                             </div>
                             <div>
                                <span class="text-[10px] text-slate-400 block">Consumo</span>
                                <strong class="font-mono text-slate-900 dark:text-white">{{ item.consumption | number:'1.0-2' }} {{ getUnit() }}</strong>
                                @if (item.isGasDistributed) {
                                  <span class="text-[9px] text-red-600 dark:text-red-400 block font-sans">campo: {{ item.rawConsumption | number:'1.0-1' }}</span>
                                }
                             </div>
                             <div class="text-right">
                                <span class="text-[10px] text-slate-400 block">Custo Est.</span>
                                @if (item.excludedFromBill) {
                                  <span class="text-[10px] text-amber-600 dark:text-amber-400 line-through opacity-70 block font-mono">
                                    {{ item.originalCost | currency:'BRL' }}
                                  </span>
                                  <strong class="font-mono text-amber-700 dark:text-amber-300">R$ 0,00</strong>
                                  <span class="text-[9px] text-amber-600 dark:text-amber-400 font-bold block uppercase">Fora do SAP</span>
                                } @else {
                                  <strong class="font-mono text-teal-700 dark:text-teal-400">{{ item.cost | currency:'BRL' }}</strong>
                                }
                             </div>
                          </div>
                        }

                        <!-- Observações de Campo Rápidas (Chips de 1 toque) -->
                        <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                           <div class="flex items-center gap-1 flex-wrap">
                             @if (item.note) {
                               <div class="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full text-xs border border-amber-200 dark:border-amber-800 font-medium">
                                 <span>📝 {{ item.note }}</span>
                                 <button (click)="clearNote(item.storeId)" class="hover:text-red-600 font-bold ml-1 cursor-pointer" title="Remover observação">✕</button>
                               </div>
                             } @else {
                               <span class="text-[10px] text-slate-400">Etiqueta:</span>
                               <button type="button" (click)="applyQuickTag(item.storeId, 'Porta Fechada')" class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                                 🔒 Fechada
                               </button>
                               <button type="button" (click)="applyQuickTag(item.storeId, 'Visor Embaçado')" class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                                 👁️ Embaçado
                               </button>
                               <button type="button" (click)="applyQuickTag(item.storeId, 'Relógio Trocado')" class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                                 🔄 Novo
                               </button>
                             }
                           </div>

                           <button type="button" (click)="openNoteEditor(item.storeId, item.note)" class="text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 text-xs font-semibold underline cursor-pointer">
                             {{ item.note ? 'Editar nota' : '+ Observação' }}
                           </button>
                        </div>

                        <!-- Foto de Evidência do Medidor (Offline no IndexedDB) -->
                        <div class="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div class="flex items-center gap-2">
                            @if (meterPhotos()[item.storeId]) {
                              <div class="relative cursor-pointer group shrink-0" (click)="openPhotoViewer(item.storeId)" title="Visualizar comprovante fotográfico">
                                <img [src]="meterPhotos()[item.storeId].photoDataUrl" 
                                     alt="Foto do Medidor" 
                                     class="w-10 h-10 object-cover rounded-xl border-2 border-teal-500 shadow-xs">
                                <span class="absolute -bottom-1 -right-1 bg-teal-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold shadow-xs">
                                  ✓
                                </span>
                              </div>
                              <div class="flex flex-col">
                                <button type="button" 
                                        (click)="openPhotoViewer(item.storeId)"
                                        class="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1 cursor-pointer text-left">
                                  <span>📷 Ver Foto Medidor</span>
                                </button>
                                <span class="text-[9px] font-mono flex items-center gap-1">
                                  <span class="text-slate-400">{{ meterPhotos()[item.storeId].capturedAt | date:'dd/MM HH:mm' }}</span>
                                  @if (meterPhotos()[item.storeId].synced) {
                                    <span class="text-teal-600 dark:text-teal-400" title="Foto sincronizada na nuvem">☁️ Nuvem</span>
                                  } @else {
                                    <span class="text-amber-500" title="Salva localmente, pendente envio para nuvem">💾 Local</span>
                                  }
                                </span>
                                <button type="button" 
                                        (click)="runOcrOnPhoto(item.storeId)"
                                        [disabled]="isReadingOcr() === item.storeId"
                                        class="mt-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-white bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer w-fit shadow-xs">
                                  @if (isReadingOcr() === item.storeId) {
                                    <span class="animate-spin text-[10px]">⏳</span>
                                    <span>Lendo...</span>
                                  } @else {
                                    <span>⚡ Ler com IA</span>
                                  }
                                </button>
                              </div>
                            } @else {
                              <label class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition-all shadow-xs active:scale-95">
                                @if (isCapturingPhoto() === item.storeId) {
                                  <span class="animate-spin text-xs">⏳</span>
                                  <span>Compactando...</span>
                                } @else {
                                  <span>📷</span>
                                  <span>Foto do Medidor</span>
                                }
                                <input type="file" 
                                       accept="image/*" 
                                       capture="environment" 
                                       (change)="onPhotoCaptured($event, item.storeId, item.storeName, item.luc, item.currentReading)" 
                                       class="hidden"
                                       [disabled]="isCapturingPhoto() === item.storeId">
                              </label>
                            }
                          </div>

                          @if (meterPhotos()[item.storeId]) {
                            <div class="flex items-center gap-2.5 shrink-0">
                              <label class="cursor-pointer text-[10px] font-semibold text-teal-700 dark:text-teal-400 hover:underline">
                                <span>Substituir</span>
                                <input type="file" 
                                       accept="image/*" 
                                       capture="environment" 
                                       (change)="onPhotoCaptured($event, item.storeId, item.storeName, item.luc, item.currentReading)" 
                                       class="hidden">
                              </label>
                              <button type="button" 
                                (click)="confirmDeletePhoto(item.storeId, item.storeName)" 
                                class="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer">
                                🗑️ Excluir
                              </button>
                            </div>
                          }
                        </div>
                     </div>
                  }

                  @if (filteredTableData().length === 0) {
                    <div class="p-8 text-center bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-xl my-3">
                      <div class="text-3xl mb-2">📋</div>
                      @if (statusFilter() === 'prev_missing') {
                        <div class="py-4 space-y-2">
                          <div class="text-4xl">✨</div>
                          <p class="font-black text-emerald-600 dark:text-emerald-400 text-sm">100% do mês anterior conferido!</p>
                          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Todas as lojas que tinham valor em <strong>{{ getPreviousMonth(selectedMonth()) }}</strong> já foram lidas neste mês.
                          </p>
                          <button type="button" (click)="statusFilter.set('all')" class="mt-2 px-3.5 py-1.5 bg-slate-900 dark:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs">
                            Ver Todas as Lojas
                          </button>
                        </div>
                      } @else if (searchQuery()) {
                        <p class="font-bold text-slate-700 dark:text-slate-300 text-sm">Nenhuma loja encontrada</p>
                        <p class="text-xs text-slate-400 mt-1">Ajuste o termo da busca ou o filtro.</p>
                      } @else if (!hasMonthlyListForSelectedMonth()) {
                        <p class="font-bold text-slate-700 dark:text-slate-200 text-sm">Mês {{ selectedMonth() }} em branco</p>
                        <p class="text-xs text-slate-400 mt-1">Nenhuma lista mensal importada para este mês.</p>
                        <a href="#stores" class="inline-block mt-3 px-3.5 py-1.5 bg-teal-600 text-white rounded text-xs font-bold">
                          Ir para Lojas e Subir Lista
                        </a>
                      } @else {
                        <p class="font-bold text-slate-700 dark:text-slate-300 text-sm">Nenhuma loja encontrada</p>
                        <button (click)="statusFilter.set('all'); searchQuery.set('')" class="mt-3 px-3 py-1.5 bg-teal-600 text-white rounded text-xs font-bold cursor-pointer">
                          Ver Todas as Lojas
                        </button>
                      }
                    </div>
                  }
                </div>
              }

              <!-- MODO 2: MODO ROTA GUIADA (FOCO TOTAL PARA O TÉCNICO CAMINHANDO NO SHOPPING) -->
              @if (mobileViewMode() === 'step') {
                <div class="p-2 sm:p-5 bg-slate-100 dark:bg-slate-950 min-h-[480px] flex flex-col justify-between transition-colors">
                  @if (currentStepStore(); as stepStore) {
                    <div class="max-w-2xl mx-auto w-full bg-white dark:bg-slate-900 rounded-3xl shadow-md border border-slate-200/90 dark:border-slate-800 p-4 sm:p-6 space-y-4 transition-all">
                      
                      <!-- Barra Superior de Gamificação & Progresso da Rota -->
                      <div class="space-y-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div class="flex items-center justify-between text-xs">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs font-black px-2.5 py-1 bg-indigo-100 dark:bg-indigo-950/90 text-indigo-900 dark:text-indigo-200 rounded-full font-mono border border-indigo-200 dark:border-indigo-800">
                              📍 Rota #{{ stepStore.routeOrder || (stepIndex() + 1) }}
                            </span>
                            <span class="text-xs font-bold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full font-mono">
                              Loja {{ stepIndex() + 1 }} de {{ tableData().length }}
                            </span>
                            @if (stepStore.isRead) {
                              <span class="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-1 rounded-full border border-emerald-300 dark:border-emerald-800 shadow-2xs">
                                ✓ Lida ({{ stepStore.currentReading }})
                              </span>
                            } @else {
                              <span class="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/70 px-2.5 py-1 rounded-full border border-amber-300 dark:border-amber-800 animate-pulse">
                                ⏳ Pendente
                              </span>
                            }
                          </div>

                          <div class="flex items-center gap-2">
                            <button type="button" 
                              (click)="jumpToNextPending()" 
                              class="px-2.5 py-1.5 bg-amber-400 dark:bg-amber-500 hover:bg-amber-500 text-slate-950 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs flex items-center gap-1 shrink-0"
                              title="Pula direto para a próxima loja que ainda não foi lida">
                              <span>⚡</span>
                              <span class="hidden xs:inline">Próx. Pendente</span>
                            </button>
                          </div>
                        </div>

                        <!-- Barra de Progresso Visual da Meta de Coleta -->
                        <div class="space-y-1">
                          <div class="flex justify-between items-center text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            <span>Progresso da Rota: {{ stepReadCount() }} de {{ tableData().length }} lojas</span>
                            <span class="font-mono text-teal-600 dark:text-teal-400">{{ stepProgressPercent() }}%</span>
                          </div>
                          <div class="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200/50 dark:border-slate-700/50">
                            <div class="h-full rounded-full transition-all duration-300"
                                 [style.width.%]="stepProgressPercent()"
                                 [class]="utilityType() === 'electricity' 
                                   ? 'bg-gradient-to-r from-amber-400 to-yellow-500' 
                                   : (utilityType() === 'gas' ? 'bg-gradient-to-r from-orange-500 to-rose-500' : 'bg-gradient-to-r from-teal-500 to-emerald-500')">
                            </div>
                          </div>
                        </div>

                        <!-- Seletor Dropdown Rápido de Lojas na Rota -->
                        <div class="pt-1">
                          <select 
                            [ngModel]="stepIndex()" 
                            (ngModelChange)="setStepIndex($event)"
                            class="w-full text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2 font-mono text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500">
                            @for (st of tableData(); track st.storeId; let sIdx = $index) {
                              <option [value]="sIdx">
                                {{ st.routeOrder ? '#' + st.routeOrder + ' ' : '' }}{{ st.luc }} - {{ st.storeName }} {{ st.isRead ? '✓ (' + st.currentReading + ')' : '⏳' }}
                              </option>
                            }
                          </select>
                        </div>
                      </div>

                      <!-- Identificação da Loja e Relógio Físico -->
                      <div class="bg-gradient-to-br from-slate-50 to-slate-100/70 dark:from-slate-800/80 dark:to-slate-900/90 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-2xs">
                        <div class="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-mono font-black text-white bg-slate-950 dark:bg-slate-800 px-3 py-1 rounded-xl shadow-xs border border-transparent dark:border-slate-700 tracking-wider">
                              {{ stepStore.luc }}
                            </span>
                            @if (stepStore.contrato) {
                              <span class="text-xs font-mono text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                Ctr: {{ stepStore.contrato }}
                              </span>
                            }
                            <button type="button" 
                              (click)="toggleExcludeFromBill(stepStore.storeId)" 
                              class="text-xs font-bold px-2.5 py-1 rounded-lg cursor-pointer flex items-center gap-1.5 transition-all border shadow-2xs"
                              [class]="stepStore.excludedFromBill 
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700' 
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'">
                              <span>{{ stepStore.excludedFromBill ? '🚫 Fora do SAP' : '✓ No SAP' }}</span>
                            </button>
                          </div>

                          <span class="text-xs font-mono font-bold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/70 px-2.5 py-1 rounded-lg border border-teal-200 dark:border-teal-800 flex items-center gap-1">
                            <span>🏷️ Relógio:</span>
                            <strong>{{ stepStore.meterNumber || ('M-' + stepStore.luc) }}</strong>
                          </span>
                        </div>

                        <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1 leading-tight tracking-tight">
                          {{ stepStore.storeName }}
                        </h2>
                      </div>

                      <!-- COMPARATIVO FOTOGRÁFICO & EVIDÊNCIA (MÊS ANTERIOR vs ESTE MÊS) -->
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        
                        <!-- LADO 1: Foto do Mês Anterior (Referência do Técnico) -->
                        <div class="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/90 dark:border-slate-700 flex flex-col justify-between shadow-2xs">
                          <div>
                            <div class="flex items-center justify-between mb-2">
                              <span class="text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1">
                                <span>📷</span>
                                <span>Mês Anterior (Gabarito)</span>
                              </span>
                              @if (prevMonthPhotos()[stepStore.storeId]) {
                                <span class="text-[9px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold">
                                  Foto Salva
                                </span>
                              }
                            </div>

                            @if (prevMonthPhotos()[stepStore.storeId]; as prevPhoto) {
                              <div class="flex items-center gap-3">
                                <div class="relative cursor-pointer shrink-0 group" 
                                     (click)="openPhotoViewer(stepStore.storeId, prevPhoto)"
                                     title="Clique para ampliar a foto do mês anterior">
                                  <img [src]="prevPhoto.photoDataUrl" 
                                       alt="Foto Mês Anterior" 
                                       class="w-16 h-16 object-cover rounded-xl border-2 border-indigo-400 dark:border-indigo-600 shadow-sm group-hover:scale-105 transition-transform">
                                  <span class="absolute -bottom-1 -right-1 bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-xs">
                                    🔍
                                  </span>
                                </div>
                                <div class="flex flex-col text-xs space-y-0.5">
                                  <span class="text-slate-500 dark:text-slate-400 text-[10px]">
                                    {{ prevPhoto.capturedAt | date:'dd/MM/yy' }}
                                  </span>
                                  <span class="text-slate-900 dark:text-slate-100 font-mono font-black text-base">
                                    {{ stepStore.prevReading | number:'1.0-0' }} <span class="text-xs font-normal text-slate-400">{{ getUnit() }}</span>
                                    @if (stepStore.prevReadingMonth && stepStore.prevReadingMonth !== getPreviousMonth(selectedMonth()) && stepStore.prevReading > 0) {
                                      <span class="text-[10px] text-teal-600 dark:text-teal-400 font-bold ml-1">({{ stepStore.prevReadingMonth }})</span>
                                    }
                                  </span>
                                  <span class="text-[11px] text-teal-700 dark:text-teal-400 font-sans font-semibold">
                                    Consumo Ant: <strong>{{ stepStore.prevConsumption | number:'1.0-2' }} {{ getUnit() }}</strong>
                                  </span>
                                  @if (stepStore.prevCost) {
                                    <span class="text-[11px] text-slate-600 dark:text-slate-300 font-sans font-semibold">
                                      Valor Pago Ant: <strong>{{ stepStore.prevCost | currency:'BRL' }}</strong>
                                    </span>
                                  }
                                  <button type="button" 
                                    (click)="openPhotoViewer(stepStore.storeId, prevPhoto)"
                                    class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold text-left cursor-pointer">
                                    Ampliar foto anterior ↗
                                  </button>
                                </div>
                              </div>
                            } @else {
                              <div class="py-1">
                                <span class="text-xs font-mono font-black text-slate-800 dark:text-slate-200 block text-sm">
                                  Leitura Anterior: {{ stepStore.prevReading | number:'1.0-0' }} {{ getUnit() }}
                                  @if (stepStore.prevReadingMonth && stepStore.prevReadingMonth !== getPreviousMonth(selectedMonth()) && stepStore.prevReading > 0) {
                                    <span class="text-[10px] text-teal-600 dark:text-teal-400 font-bold ml-1">({{ stepStore.prevReadingMonth }})</span>
                                  }
                                </span>
                                <span class="text-xs text-teal-700 dark:text-teal-400 font-sans font-semibold block mt-0.5">
                                  Consumo Anterior: <strong>{{ stepStore.prevConsumption | number:'1.0-2' }} {{ getUnit() }}</strong>
                                </span>
                                @if (stepStore.prevCost) {
                                  <span class="text-xs text-slate-600 dark:text-slate-300 font-sans font-semibold block mt-0.5">
                                    Valor Pago Anterior: <strong>{{ stepStore.prevCost | currency:'BRL' }}</strong>
                                  </span>
                                }
                                @if (stepStore.validationAlert.avgConsumption > 0) {
                                  <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                    Média Histórica: {{ stepStore.validationAlert.avgConsumption | number:'1.0-1' }} {{ getUnit() }}
                                  </span>
                                }
                              </div>
                            }
                          </div>
                        </div>

                        <!-- LADO 2: Foto Deste Mês & Leitura por Câmera / OCR -->
                        <div class="p-3.5 bg-teal-50/60 dark:bg-teal-950/40 rounded-2xl border border-teal-200 dark:border-teal-800/80 flex flex-col justify-between shadow-2xs">
                          <div>
                            <div class="flex items-center justify-between mb-2">
                              <span class="text-[10px] uppercase font-black text-teal-800 dark:text-teal-300 tracking-wider flex items-center gap-1">
                                <span>📸</span>
                                <span>Foto Atual (Evidência)</span>
                              </span>
                              @if (meterPhotos()[stepStore.storeId]) {
                                <span class="text-[9px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                                  ✓ Registrada
                                </span>
                              }
                            </div>

                            @if (meterPhotos()[stepStore.storeId]; as curPhoto) {
                              <div class="flex items-center gap-3">
                                <div class="relative cursor-pointer shrink-0 group" 
                                     (click)="openPhotoViewer(stepStore.storeId)"
                                     title="Clique para ver a foto tirada">
                                  <img [src]="curPhoto.photoDataUrl" 
                                       alt="Foto Medidor Atual" 
                                       class="w-16 h-16 object-cover rounded-xl border-2 border-emerald-500 shadow-sm group-hover:scale-105 transition-transform">
                                  <span class="absolute -bottom-1 -right-1 bg-emerald-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-xs">
                                    ✓
                                  </span>
                                </div>
                                <div class="flex flex-col text-xs space-y-1">
                                  <div class="flex items-center gap-1.5 text-[10px]">
                                    <span class="text-slate-500 dark:text-slate-400">{{ curPhoto.capturedAt | date:'dd/MM HH:mm' }}</span>
                                    @if (curPhoto.synced) {
                                      <span class="text-teal-600 dark:text-teal-400 font-bold" title="Salva na nuvem">☁️ Nuvem</span>
                                    } @else {
                                      <span class="text-amber-500 font-bold" title="Salva localmente">💾 Local</span>
                                    }
                                  </div>
                                  <div class="flex items-center gap-2">
                                    <button type="button" 
                                      (click)="runOcrOnPhoto(stepStore.storeId)"
                                      [disabled]="isReadingOcr() === stepStore.storeId"
                                      class="text-[11px] font-bold text-indigo-600 dark:text-indigo-300 hover:underline cursor-pointer flex items-center gap-1">
                                      <span>⚡ Reler com IA</span>
                                    </button>
                                    <label class="text-[11px] text-slate-500 dark:text-slate-400 hover:underline cursor-pointer">
                                      <span>Trocar</span>
                                      <input type="file" accept="image/*" capture="environment" (change)="onPhotoCaptured($event, stepStore.storeId, stepStore.storeName, stepStore.luc, stepStore.currentReading)" class="hidden">
                                    </label>
                                    <button type="button" 
                                      (click)="confirmDeletePhoto(stepStore.storeId, stepStore.storeName)" 
                                      class="text-[11px] text-rose-500 dark:text-rose-400 hover:underline cursor-pointer">
                                      <span>Excluir</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            } @else {
                              <label class="cursor-pointer flex flex-col items-center justify-center p-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm">
                                @if (isCapturingPhoto() === stepStore.storeId) {
                                  <span class="animate-spin text-lg mb-1">⏳</span>
                                  <span>Compactando foto...</span>
                                } @else {
                                  <span class="text-xl mb-1">📸</span>
                                  <span>Tirar Foto / Leitura com IA</span>
                                }
                                <input type="file" 
                                       accept="image/*" 
                                       capture="environment" 
                                       (change)="onPhotoCaptured($event, stepStore.storeId, stepStore.storeName, stepStore.luc, stepStore.currentReading)" 
                                       class="hidden"
                                       [disabled]="isCapturingPhoto() === stepStore.storeId">
                              </label>
                            }
                          </div>
                        </div>

                      </div>

                      <!-- CAMPO GIGANTE PARA LEITURA ATUAL COM STEPPERS ERGONÔMICOS -->
                      <div class="space-y-2">
                        <div class="flex items-center justify-between">
                          <label class="text-xs uppercase font-black text-slate-700 dark:text-slate-200 tracking-wider flex items-center gap-1">
                            <span>DIGITAR LEITURA ATUAL ({{ getUnit() }}):</span>
                          </label>
                          @if (isReadingOcr() === stepStore.storeId) {
                            <span class="text-[11px] bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse">
                              <span class="animate-spin">⚡</span>
                              <span>{{ ocrCurrentModelLabel() }} lendo visor...</span>
                            </span>
                          }
                        </div>

                        <!-- Feedback de Leitura Automática OCR -->
                        @if (ocrFeedback()[stepStore.storeId]; as fb) {
                          <div class="p-3 rounded-2xl text-xs flex items-center justify-between gap-2 shadow-xs transition-all"
                               [class]="fb.success ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100' : 'bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'">
                            <div class="flex items-center gap-2 truncate">
                              <span class="text-base shrink-0">{{ fb.success ? (fb.provider === 'qwen' ? '⚡' : '🤖') : '⚠️' }}</span>
                              <div class="truncate">
                                <p class="font-bold leading-tight truncate">{{ fb.message }}</p>
                                @if (fb.explanation) {
                                  <p class="text-[10px] opacity-85 mt-0.5 truncate">{{ fb.explanation }}</p>
                                }
                              </div>
                            </div>
                            <button (click)="dismissOcrFeedback(stepStore.storeId)" class="p-1 text-slate-400 hover:text-slate-800 font-bold cursor-pointer">✕</button>
                          </div>
                        }

                        <!-- Conferência da leitura sugerida pela IA -->
                        @if (ocrPending()[stepStore.storeId]; as pend) {
                          <div class="p-3.5 rounded-2xl border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 text-xs space-y-2">
                            <p class="font-bold text-indigo-900 dark:text-indigo-100 text-sm">
                              🤖 A IA leu <span class="font-mono text-lg font-black">{{ pend.ocrValue }}</span> — confere com a foto?
                            </p>
                            @if (pend.confidence !== 'high') {
                              <p class="text-amber-700 dark:text-amber-300 font-semibold">⚠️ Confiança {{ pend.confidence === 'medium' ? 'média' : 'baixa' }}: confira com atenção.</p>
                            }
                            <p class="text-slate-600 dark:text-slate-400">Se estiver errado, corrija o número no campo abaixo e confirme.</p>

                            <!-- Seleção Rápida de Divergência entre Motores de IA no Passo a Passo -->
                            @if (pend.dualCheck && !pend.dualCheck.agreement && pend.dualCheck.qwenValue !== null && pend.dualCheck.geminiValue !== null) {
                              <div class="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 space-y-1.5">
                                <p class="font-bold text-xs flex items-center gap-1">
                                  <span>⚠️</span>
                                  <span>Motores de IA divergiram: toque no valor correto da foto:</span>
                                </p>
                                <div class="grid grid-cols-2 gap-2">
                                  <button type="button" (click)="updateDetailedReading(stepStore.storeId, 'reading', pend.dualCheck.qwenValue); confirmOcrReading(stepStore.storeId, pend.dualCheck.qwenValue)"
                                    class="py-2 px-2 rounded-lg bg-white dark:bg-slate-900 border-2 border-indigo-300 dark:border-indigo-700 font-mono font-bold text-sm hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer text-indigo-700 dark:text-indigo-300">
                                    ⚡ Qwen: {{ pend.dualCheck.qwenValue }}
                                  </button>
                                  <button type="button" (click)="updateDetailedReading(stepStore.storeId, 'reading', pend.dualCheck.geminiValue); confirmOcrReading(stepStore.storeId, pend.dualCheck.geminiValue)"
                                    class="py-2 px-2 rounded-lg bg-white dark:bg-slate-900 border-2 border-teal-300 dark:border-teal-700 font-mono font-bold text-sm hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer text-teal-700 dark:text-teal-300">
                                    🤖 Gemini: {{ pend.dualCheck.geminiValue }}
                                  </button>
                                </div>
                              </div>
                            }
                            @if (stepStore.validationAlert.hasAlert) {
                              <div class="p-2 rounded-lg bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 font-semibold">
                                <p>{{ stepStore.validationAlert.title }}</p>
                                <p class="font-normal mt-0.5">{{ stepStore.validationAlert.message }}</p>
                                <button type="button" (click)="retryOcrWithOtherEngine(stepStore.storeId)"
                                  [disabled]="isReadingOcr() === stepStore.storeId"
                                  class="mt-1.5 w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold cursor-pointer">
                                  🔄 Reler com {{ pend.provider === 'qwen' ? 'Gemini' : 'Qwen' }}
                                </button>
                              </div>
                            }
                            <button type="button" (click)="confirmOcrReading(stepStore.storeId, stepStore.currentReading)"
                              [disabled]="!canEdit()"
                              class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold cursor-pointer">
                              ✓ Confirmar leitura
                            </button>
                          </div>
                        }

                        <!-- Input Numérico Principal -->
                        <div class="relative">
                          <input type="number" 
                            inputmode="decimal"
                            step="0.0001"
                            [ngModel]="stepStore.currentReading" 
                            (ngModelChange)="updateDetailedReading(stepStore.storeId, 'reading', $event)"
                            (blur)="onReadingBlur(stepStore.storeId)"
                            (keyup.enter)="saveAndNextStep(stepStore)"
                            [disabled]="!canEdit()"
                            class="w-full text-center text-4xl sm:text-5xl font-mono font-black p-4 border-2 rounded-2xl focus:ring-4 transition-all bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-inner"
                            [class.border-rose-500]="stepStore.validationAlert.severity === 'critical'"
                            [class.ring-4]="stepStore.validationAlert.hasAlert"
                            [class.ring-rose-300]="stepStore.validationAlert.severity === 'critical'"
                            [class.bg-rose-50/20]="stepStore.validationAlert.severity === 'critical'"
                            [class.border-amber-500]="stepStore.validationAlert.severity === 'warning'"
                            [class.ring-amber-300]="stepStore.validationAlert.severity === 'warning'"
                            [class.bg-amber-50/20]="stepStore.validationAlert.severity === 'warning'"
                            [class.border-emerald-500]="stepStore.isRead && !stepStore.validationAlert.hasAlert"
                            [class.border-slate-300]="!stepStore.isRead"
                            [class.dark:border-slate-700]="!stepStore.isRead"
                            placeholder="0">
                        </div>

                        <!-- BARRA DE STEPPERS TÁTEIS & REPETIÇÃO DE LEITURA (1 TOQUE) -->
                        <div class="flex items-center gap-1.5 flex-wrap pt-1">
                          <!-- Botão Inteligente: Repetir Leitura Anterior (Consumo 0) -->
                          <button type="button"
                            (click)="copyPreviousReading(stepStore)"
                            [disabled]="!canEdit()"
                            class="flex-1 min-w-[170px] py-2 px-3 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-2xs"
                            title="Preenche a leitura atual exatamente com a anterior (Consumo 0)">
                            <span>🔁</span>
                            <span>Mesma Leitura (Consumo 0)</span>
                          </button>

                          <!-- Steppers Rápidos de Incremento / Decremento -->
                          <div class="flex items-center gap-1 shrink-0">
                            <button type="button"
                              (click)="quickAdjustReading(stepStore, -1)"
                              [disabled]="!canEdit()"
                              class="w-10 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-mono font-black text-xs transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700">
                              -1
                            </button>
                            <button type="button"
                              (click)="quickAdjustReading(stepStore, 1)"
                              [disabled]="!canEdit()"
                              class="w-10 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-mono font-black text-xs transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700">
                              +1
                            </button>
                            <button type="button"
                              (click)="quickAdjustReading(stepStore, 5)"
                              [disabled]="!canEdit()"
                              class="w-10 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-mono font-black text-xs transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700">
                              +5
                            </button>
                            <button type="button"
                              (click)="quickAdjustReading(stepStore, 10)"
                              [disabled]="!canEdit()"
                              class="w-10 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-mono font-black text-xs transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700">
                              +10
                            </button>
                          </div>
                        </div>
                      </div>

                      <!-- ALERTA INSTANTÂNEO DE CONSISTÊNCIA / AUDITORIA -->
                      @if (stepStore.validationAlert.hasAlert) {
                        <div class="p-4 rounded-2xl border text-xs flex items-start gap-3 shadow-sm transition-all"
                             [class.bg-rose-50]="stepStore.validationAlert.severity === 'critical'"
                             [class.border-rose-300]="stepStore.validationAlert.severity === 'critical'"
                             [class.text-rose-950]="stepStore.validationAlert.severity === 'critical'"
                             [class.dark:bg-rose-950/40]="stepStore.validationAlert.severity === 'critical'"
                             [class.dark:border-rose-800]="stepStore.validationAlert.severity === 'critical'"
                             [class.dark:text-rose-200]="stepStore.validationAlert.severity === 'critical'"
                             [class.bg-amber-50]="stepStore.validationAlert.severity === 'warning'"
                             [class.border-amber-300]="stepStore.validationAlert.severity === 'warning'"
                             [class.text-amber-950]="stepStore.validationAlert.severity === 'warning'"
                             [class.dark:bg-amber-950/40]="stepStore.validationAlert.severity === 'warning'"
                             [class.dark:border-amber-800]="stepStore.validationAlert.severity === 'warning'"
                             [class.dark:text-amber-200]="stepStore.validationAlert.severity === 'warning'">
                          <span class="text-2xl shrink-0 leading-none">
                            {{ stepStore.validationAlert.severity === 'critical' ? '🚨' : '⚠️' }}
                          </span>
                          <div class="flex-1 space-y-1.5">
                            <div class="flex items-center justify-between">
                              <strong class="text-sm font-black">{{ stepStore.validationAlert.title }}</strong>
                              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide"
                                [class.bg-rose-600]="stepStore.validationAlert.severity === 'critical'"
                                [class.text-white]="stepStore.validationAlert.severity === 'critical'"
                                [class.bg-amber-500]="stepStore.validationAlert.severity === 'warning'"
                                [class.text-slate-950]="stepStore.validationAlert.severity === 'warning'">
                                {{ stepStore.validationAlert.badgeLabel }}
                              </span>
                            </div>
                            <p class="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                              {{ stepStore.validationAlert.message }}
                            </p>
                            <div class="pt-1 flex flex-wrap items-center gap-2">
                              <button type="button" 
                                (click)="confirmAnomaly(stepStore.storeId)"
                                class="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-lg text-xs hover:bg-slate-50 cursor-pointer shadow-2xs">
                                ✓ Confirmar como Correto
                              </button>
                              @if (stepStore.validationAlert.type === 'negative') {
                                <button type="button" 
                                  (click)="markRollover(stepStore.storeId)"
                                  class="px-3 py-1 bg-indigo-600 text-white font-bold rounded-lg text-xs hover:bg-indigo-700 cursor-pointer shadow-2xs">
                                  🔄 Virada de Relógio
                                </button>
                              }
                            </div>
                          </div>
                        </div>
                      }

                      <!-- Consumo e Custo Estimado em Tempo Real -->
                      @if (stepStore.isRead) {
                        <div class="bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/40 dark:to-emerald-950/30 p-3.5 rounded-2xl border border-teal-200 dark:border-teal-800/80 grid grid-cols-2 gap-3 text-xs shadow-2xs">
                          <div>
                            <span class="text-[10px] uppercase font-black text-teal-800 dark:text-teal-300 block tracking-wider">Consumo Calculado</span>
                            <strong class="font-mono text-xl font-black text-teal-950 dark:text-teal-100">{{ stepStore.consumption | number:'1.0-2' }} {{ getUnit() }}</strong>
                            @if (stepStore.consumption === 0) {
                              <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold block mt-0.5">🟡 Sem Consumo (0)</span>
                            } @else if (stepStore.validationAlert.avgConsumption > 0) {
                              <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                Ref. Média: {{ stepStore.validationAlert.avgConsumption | number:'1.0-1' }} {{ getUnit() }}
                              </span>
                            }
                          </div>
                          <div class="text-right">
                            <span class="text-[10px] uppercase font-black text-teal-800 dark:text-teal-300 block tracking-wider">Custo Estimado</span>
                            <strong class="font-mono text-xl font-black text-teal-950 dark:text-teal-100">{{ stepStore.cost | currency:'BRL' }}</strong>
                            <span class="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">Rateio em Tempo Real</span>
                          </div>
                        </div>
                      }

                      <!-- Observação de Campo e Ocorrências Rápidas -->
                      <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                        <div class="flex items-center justify-between text-xs">
                          <span class="font-bold text-slate-600 dark:text-slate-300">Ocorrência de Campo:</span>
                          <button (click)="openNoteEditor(stepStore.storeId, stepStore.note)" class="text-teal-700 dark:text-teal-400 font-bold hover:underline cursor-pointer">
                            {{ stepStore.note ? 'Editar Nota ✎' : '+ Escrever Nota' }}
                          </button>
                        </div>
                        @if (stepStore.note) {
                          <div class="bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 p-2.5 rounded-xl text-xs flex justify-between items-center shadow-2xs">
                            <span class="font-medium">📝 {{ stepStore.note }}</span>
                            <button (click)="clearNote(stepStore.storeId)" class="text-red-500 hover:text-red-700 font-bold ml-2 cursor-pointer p-1">✕</button>
                          </div>
                        } @else {
                          <div class="flex gap-1.5 flex-wrap">
                            <button (click)="applyQuickTag(stepStore.storeId, 'Porta Fechada')" class="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 transition-all cursor-pointer font-medium active:scale-95 border border-slate-200 dark:border-slate-700">
                              🔒 Porta Fechada
                            </button>
                            <button (click)="applyQuickTag(stepStore.storeId, 'Visor Embaçado')" class="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 transition-all cursor-pointer font-medium active:scale-95 border border-slate-200 dark:border-slate-700">
                              👁️ Visor Embaçado
                            </button>
                            <button (click)="applyQuickTag(stepStore.storeId, 'Relógio Trocado')" class="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 transition-all cursor-pointer font-medium active:scale-95 border border-slate-200 dark:border-slate-700">
                              🔄 Relógio Trocado
                            </button>
                          </div>
                        }
                      </div>

                      <!-- BOTÃO PRINCIPAL DE AÇÃO: SALVAR E PRÓXIMA LOJA (POLEGAR ERGONÔMICO) -->
                      <div class="pt-3 border-t border-slate-200/90 dark:border-slate-800 space-y-2.5">
                        <button type="button" 
                          (click)="saveAndNextStep(stepStore)"
                          class="w-full py-4 px-6 bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 hover:from-teal-700 hover:to-emerald-800 active:scale-98 text-white font-black text-base rounded-2xl shadow-lg shadow-teal-700/25 transition-all flex flex-col items-center justify-center cursor-pointer">
                          <div class="flex items-center gap-2">
                            <span class="text-xl">💾</span>
                            <span>Salvar e Próxima Loja ▶</span>
                          </div>
                          @if (nextStepStore(); as nxt) {
                            <span class="text-[11px] font-normal text-teal-100 opacity-90 mt-0.5">
                              Próxima: #{{ nxt.routeOrder || (stepIndex() + 2) }} {{ nxt.luc }} - {{ nxt.storeName }}
                            </span>
                          } @else {
                            <span class="text-[11px] font-normal text-teal-100 opacity-90 mt-0.5">
                              🏁 Última loja da rota!
                            </span>
                          }
                        </button>

                        <div class="flex items-center gap-2">
                          <button type="button" 
                            (click)="prevStep()" 
                            [disabled]="stepIndex() === 0"
                            class="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer border border-slate-200 dark:border-slate-700 active:scale-95">
                            <span>◀ Anterior</span>
                          </button>

                          <button type="button" 
                            (click)="jumpToNextPending()" 
                            class="flex-1 py-3 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black rounded-xl text-xs transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95">
                            <span>⚡ Pendente</span>
                          </button>

                          <button type="button" 
                            (click)="nextStep()" 
                            [disabled]="stepIndex() >= tableData().length - 1"
                            class="flex-1 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-30 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer border border-slate-300 dark:border-slate-600 active:scale-95">
                            <span>Pular ▶</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  } @else {
                    <div class="max-w-md mx-auto p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div class="text-4xl mb-3">📋</div>
                      <p class="text-base font-bold text-slate-800 dark:text-slate-200">Nenhuma loja cadastrada para este insumo.</p>
                      <p class="text-xs text-slate-400 mt-1">Selecione outro mês ou cadastre as lojas na aba Gerenciar Lojas.</p>
                    </div>
                  }
                </div>
              }

            </div>
          </div>

          <!-- Footer Summary (ALL TYPES) -->
          <div class="rounded-xl overflow-hidden border border-orange-200 dark:border-orange-900/60 shadow-sm font-sans animate-fade-in">
             <!-- Compact Mobile Summary -->
             <div class="md:hidden p-4 bg-orange-50 dark:bg-orange-950/60 space-y-2.5">
                <div class="flex justify-between items-center text-sm">
                   <div class="flex flex-col">
                     <span class="font-bold text-orange-900 dark:text-orange-200">Áreas Comuns</span>
                     <span class="text-[10px] text-orange-700 dark:text-orange-400 font-mono">{{ commonAreaConsumption() | number:'1.0-4' }} {{ getUnit() }} ({{ getPercentage(commonAreaCost()) }}%)</span>
                   </div>
                   <span class="font-mono font-bold text-orange-800 dark:text-orange-300">{{ commonAreaCost() | currency:'BRL' }}</span>
                </div>
                @if(utilityType() !== 'gas') {
                  <div class="flex justify-between items-center text-sm pt-2 border-t border-orange-200/60 dark:border-orange-900/40">
                     <div class="flex flex-col">
                       <span class="font-bold text-orange-900 dark:text-orange-200">Ar Condicionado</span>
                       <span class="text-[10px] text-orange-700 dark:text-orange-400 font-mono">{{ airConditioningConsumption() | number:'1.0-4' }} {{ getUnit() }} ({{ getPercentage(airConditioningCost()) }}%)</span>
                     </div>
                     <span class="font-mono font-bold text-orange-800 dark:text-orange-300">{{ airConditioningCost() | currency:'BRL' }}</span>
                  </div>
                }
                <div class="flex justify-between items-center text-sm pt-2 border-t border-orange-200/60 dark:border-orange-900/40">
                   <div>
                     <span class="font-bold text-orange-900 dark:text-orange-200">Valor SAP (Lojas)</span>
                     @if (excludedSapCost() > 0) {
                       <span class="text-[10px] text-amber-700 dark:text-amber-400 block font-semibold">
                         ({{ excludedSapCount() }} loja(s) fora do SAP: -{{ excludedSapCost() | currency:'BRL' }})
                       </span>
                     }
                   </div>
                   <span class="font-mono font-bold text-orange-800 dark:text-orange-300">{{ totalDistributedCost() | currency:'BRL' }}</span>
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
                      <div class="font-mono font-bold text-lg leading-tight">{{ commonAreaCost() | currency:'BRL' }}</div>
                      <div class="text-xs opacity-80">{{ getPercentage(commonAreaCost()) }}%</div>
                    </div>
                    <div class="md:col-span-3 text-right font-mono text-sm pl-4 border-l border-orange-500">
                      {{ commonAreaConsumption() | number:'1.0-4' }} {{ getUnit() }}
                    </div>
                </div>

                <!-- 2. Ar Condicionado Row -->
                @if(utilityType() !== 'gas') {
                  <div class="bg-orange-200 dark:bg-orange-950/70 text-orange-900 dark:text-orange-100 grid grid-cols-1 md:grid-cols-12 items-center p-3 border-b border-orange-300 dark:border-orange-900">
                      <div class="md:col-span-6 font-bold text-right pr-4 text-sm uppercase tracking-wide">
                        Ar Condicionado
                      </div>
                      <div class="md:col-span-3 text-right pr-4">
                        <div class="font-mono font-bold text-lg leading-tight">{{ airConditioningCost() | currency:'BRL' }}</div>
                        <div class="text-xs opacity-70">{{ getPercentage(airConditioningCost()) }}%</div>
                      </div>
                      <div class="md:col-span-3 text-right pl-4 border-l border-orange-300 dark:border-orange-900">
                        <div class="flex items-center justify-end gap-2">
                          <label class="text-[10px] uppercase font-bold opacity-60">Consumo:</label>
                          <input type="number" 
                              step="0.0001"
                              [ngModel]="currentACConsumption()" 
                              (ngModelChange)="setAirConditioning($event)"
                              [disabled]="!canConfigure()"
                              class="w-24 px-2 py-1 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-orange-300 dark:border-orange-800 rounded text-right font-mono focus:ring-1 focus:ring-orange-500 disabled:bg-transparent disabled:border-transparent"
                              placeholder="0">
                            <span class="text-xs font-mono">{{ getUnit() }}</span>
                        </div>
                      </div>
                  </div>
                }

                <!-- 3. Valor SAP Row -->
                <div class="bg-orange-700 text-white grid grid-cols-1 md:grid-cols-12 items-center p-3 border-b border-orange-800">
                    <div class="md:col-span-6 text-right pr-4">
                      <div class="font-bold text-sm uppercase tracking-wide">Valor SAP</div>
                      @if (excludedSapCost() > 0) {
                        <div class="text-[11px] text-orange-200">
                          {{ excludedSapCount() }} loja(s) fora do SAP (-{{ excludedSapCost() | currency:'BRL' }})
                        </div>
                      }
                    </div>
                    <div class="md:col-span-3 text-right pr-4">
                      <div class="font-mono font-bold text-xl leading-tight text-white">{{ totalDistributedCost() | currency:'BRL' }}</div>
                    </div>
                    <div class="md:col-span-3 bg-orange-800/20 h-full"></div>
                </div>
             </div>
          </div>
        </div>
      </div>

      <!-- NOTE EDITOR MODAL FOR FIELD TECHNICIAN -->
      @if (activeNoteStoreId()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in" (click)="closeNoteEditor()"></div>
          
          <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-5 w-full max-w-sm relative z-10 space-y-4 border border-slate-200 dark:border-slate-800 transition-colors animate-scale-in">
            <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
              <h3 class="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-1.5">
                <span>📝 Observação de Campo</span>
              </h3>
              <button (click)="closeNoteEditor()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold cursor-pointer">✕</button>
            </div>

            <!-- Quick tag suggestions -->
            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Etiquetas Rápidas</label>
              <div class="flex flex-wrap gap-1.5">
                <button type="button" (click)="activeNoteText.set('Porta Trancada / Sem Acesso')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs cursor-pointer">
                  🔒 Sem Acesso
                </button>
                <button type="button" (click)="activeNoteText.set('Visor Embaçado / Difícil Leitura')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs cursor-pointer">
                  👁️ Embaçado
                </button>
                <button type="button" (click)="activeNoteText.set('Relógio Reiniciado / Trocado')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs cursor-pointer">
                  🔄 Relógio Trocado
                </button>
                <button type="button" (click)="activeNoteText.set('Suspeita de Vazamento / Salto')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs cursor-pointer">
                  💧 Vazamento
                </button>
                <button type="button" (click)="activeNoteText.set('Loja em Reforma')" class="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs cursor-pointer">
                  🔨 Em Reforma
                </button>
              </div>
            </div>

            <div>
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Texto da Observação</label>
              <textarea 
                [ngModel]="activeNoteText()" 
                (ngModelChange)="activeNoteText.set($event)"
                placeholder="Ex: Medidor com visor quebrado, leitura estimada com o lojista..."
                class="w-full h-20 p-2.5 text-xs border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 resize-none"></textarea>
            </div>

            <div class="flex gap-2 pt-1">
              <button type="button" (click)="closeNoteEditor()" class="flex-1 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
                Cancelar
              </button>
              <button type="button" (click)="saveNote(activeNoteStoreId()!)" class="flex-1 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm cursor-pointer">
                Salvar Nota
              </button>
            </div>
          </div>
        </div>
      }

      <!-- PHOTO EVIDENCE VIEWER & AUDIT MODAL (Comprovante Incontestável no IndexedDB) -->
      <app-meter-photo-modal
        [isOpen]="showPhotoModal()"
        [photo]="activePhotoRecord()"
        [isOnline]="indexedDb.isOnline()"
        [enableOcr]="true"
        [enableVoucher]="true"
        [enableReplace]="true"
        [enableDelete]="true"
        [isReplacing]="isCapturingPhoto() === activePhotoRecord()?.storeId"
        [isReadingOcr]="isReadingOcr()"
        [ocrModelLabel]="ocrCurrentModelLabel()"
        [ocrFeedback]="ocrFeedback()"
        (close)="closePhotoViewer()"
        (download)="downloadActivePhoto()"
        (syncPhoto)="syncSinglePhoto($event)"
        (runOcr)="runOcrOnPhoto($event.storeId, $event.provider)"
        (openVoucher)="openStoreVoucherByStoreId($event)"
        (replacePhoto)="onPhotoCaptured($event.event, $event.photo.storeId, $event.photo.storeName, $event.photo.luc, $event.photo.readingValue)"
        (deletePhoto)="removePhoto($event.storeId)"
        (dismissFeedback)="dismissOcrFeedback($event)"
      />

      <app-ocr-quality-panel [isOpen]="showOcrQuality()" (close)="showOcrQuality.set(false)" />

      <!-- Modal de Configuração de Chaves de IA (Groq & Gemini) -->
      @if (showAiKeyModal()) {
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
              <button (click)="closeAiKeyModal()" class="text-slate-400 hover:text-slate-600 text-lg p-1">✕</button>
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
                  [ngModel]="groqInputKey()" 
                  (ngModelChange)="groqInputKey.set($event)"
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
                  [ngModel]="geminiInputKey()" 
                  (ngModelChange)="geminiInputKey.set($event)"
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
                (click)="closeAiKeyModal()" 
                class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 cursor-pointer">
                Cancelar
              </button>
              <button 
                type="button" 
                (click)="saveAiKeysAndProceed()" 
                class="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm cursor-pointer">
                Salvar Chaves
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Modal de Processamento em Lote com IA (Batch OCR) -->
      @if (showBatchOcrModal() || isBatchOcrRunning()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2.5">
                <span class="text-2xl">⚡</span>
                <div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Processamento de Fotos em Lote</span>
                    @if (isBatchOcrRunning()) {
                      <span class="animate-pulse bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        Em execução
                      </span>
                    }
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Extração automática de leituras por IA (Qwen 3.8 / Gemini)</p>
                </div>
              </div>
              @if (!isBatchOcrRunning()) {
                <button (click)="closeBatchOcrModal()" class="text-slate-400 hover:text-slate-600 text-lg p-1">✕</button>
              }
            </div>

            <!-- Progresso Geral -->
            <div class="space-y-3">
              <div class="flex justify-between items-center text-xs">
                <span class="font-bold text-slate-700 dark:text-slate-300">
                  Progresso: {{ batchOcrProgress().current }} de {{ batchOcrProgress().total }} fotos
                </span>
                <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {{ batchOcrProgress().progressPct }}%
                </span>
              </div>

              <!-- Barra de Progresso -->
              <div class="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden shadow-inner border border-slate-200 dark:border-slate-700">
                <div class="h-full bg-gradient-to-r from-indigo-500 via-teal-500 to-emerald-500 rounded-full transition-all duration-300"
                     [style.width.%]="batchOcrProgress().progressPct"></div>
              </div>

              <!-- Loja Atual em Processamento -->
              @if (isBatchOcrRunning() && batchOcrProgress().currentStoreName) {
                <div class="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3 text-xs animate-pulse">
                  <div class="flex items-center gap-2">
                    <span class="animate-spin text-base">⏳</span>
                    <div>
                      <div class="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span class="font-mono bg-white dark:bg-slate-800 px-1.5 py-0.2 rounded border border-indigo-200 dark:border-indigo-800 font-bold text-indigo-700 dark:text-indigo-300">{{ batchOcrProgress().currentLuc }}</span>
                        <span>{{ batchOcrProgress().currentStoreName }}</span>
                      </div>
                      <span class="text-[11px] text-slate-500 dark:text-slate-400">Consultando {{ batchOcrProgress().currentModel }}...</span>
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
                    <strong class="text-base font-mono font-bold text-emerald-700 dark:text-emerald-300">{{ batchOcrProgress().successCount }}</strong>
                  </div>
                </div>

                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                  <span class="text-xl">⚠️</span>
                  <div>
                    <span class="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block">Falhas / Ilegíveis</span>
                    <strong class="text-base font-mono font-bold text-slate-700 dark:text-slate-300">{{ batchOcrProgress().failCount }}</strong>
                  </div>
                </div>
              </div>
            </div>

            <!-- Rodapé / Ações -->
            <div class="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              @if (isBatchOcrRunning()) {
                <span class="text-[11px] text-slate-400 italic">Processando em segundo plano...</span>
                <button 
                  type="button" 
                  (click)="cancelBatchOcr()" 
                  class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs">
                  ⏹️ Cancelar Fila
                </button>
              } @else {
                <button 
                  type="button" 
                  (click)="closeBatchOcrModal()" 
                  class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                  Fechar
                </button>
                <div class="flex gap-2">
                  <button 
                    type="button" 
                    (click)="executeBatchOcr(true)" 
                    class="px-3.5 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer"
                    title="Reprocessar todas as fotos deste mês mesmo as que já possuem leitura">
                    🔄 Reprocessar Todas
                  </button>
                  <button 
                    type="button" 
                    (click)="executeBatchOcr(false)" 
                    class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer">
                    ⚡ Processar Pendentes ({{ pendingOcrCount() }})
                  </button>
                </div>
              }
            </div>

          </div>
        </div>
      }

      
      <!-- Modal: Espelho Individual do Lojista (Comprovante com Foto / WhatsApp / PDF) -->
      <app-store-voucher-modal
        [isOpen]="showVoucherModal()"
        [voucher]="selectedVoucherData()"
        (close)="closeStoreVoucher()"
      />

      <!-- ANOMALY AUDIT MODAL (ETAPA 1: ALERTA INTELIGENTE E ANTI-ERRO) -->
      <app-anomaly-modal
        [isOpen]="!!activeAnomalyModal()"
        [data]="activeAnomalyModal()"
        (close)="closeAnomalyModal()"
        (confirm)="confirmAnomaly($event)"
        (rollover)="markRollover($event)"
      />

      <!-- MODAL DE IMPORTAÇÃO INTELIGENTE DE PLANILHA EXCEL -->
      <app-excel-import-modal
        [isOpen]="showExcelImportModal()"
        [utilityType]="utilityType()"
        [selectedMonth]="selectedMonth()"
        [activeStores]="activeStores()"
        [previousReadings]="previousReadings()"
        [unit]="getUnit()"
        (close)="closeExcelImportModal()"
        (importSuccess)="onExcelImportApplied($event)"
      />

      <!-- MODAL CHECKLIST DE AUDITORIA E FECHAMENTO MENSAL (PASSO 3: GESTÃO & CONTABILIDADE) -->
      @if (showClosingChecklistModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div class="absolute inset-0 bg-black/75 backdrop-blur-md animate-fade-in" (click)="closeClosingChecklist()"></div>

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
                    @if (isLocked()) {
                      <span class="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-black uppercase font-mono tracking-wider">
                        🔒 Mês Congelado
                      </span>
                    }
                  </h3>
                  <p class="text-xs text-slate-300 mt-0.5 font-medium flex items-center gap-2">
                    <span>Insumo: <strong class="text-teal-300 uppercase">{{ utilityType() }}</strong></span>
                    <span>•</span>
                    <span>Mês: <strong class="text-white font-mono">{{ selectedMonth() }}</strong></span>
                  </p>
                </div>
              </div>
              <button (click)="closeClosingChecklist()" class="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer">✕</button>
            </div>

            <!-- Corpo com os 4 Pilares de Segurança -->
            <div class="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
              
              <!-- Resumo Executivo Superior -->
              <div class="p-3.5 rounded-2xl border flex items-center justify-between gap-3 flex-wrap"
                   [class]="closingChecklist().canFreeze 
                     ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200' 
                     : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200'">
                <div class="flex items-center gap-2.5">
                  <span class="text-2xl">{{ closingChecklist().canFreeze ? '✅' : '⚠️' }}</span>
                  <div>
                    <h4 class="font-bold text-sm">
                      {{ closingChecklist().canFreeze ? 'Rateio Pronto para Fechamento!' : 'Atenção: Existem pendências de conferência' }}
                    </h4>
                    <p class="text-xs opacity-85">
                      {{ closingChecklist().canFreeze 
                        ? 'Todas as lojas foram lidas e as medições estão auditadas sem inconformidades críticas.' 
                        : 'Resolva as pendências abaixo antes de emitir os relatórios definitivos aos lojistas.' }}
                    </p>
                  </div>
                </div>
                <div class="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-white/70 dark:bg-slate-900/70 border border-black/10 dark:border-white/10 shrink-0">
                  {{ closingChecklist().readings.readStores }}/{{ closingChecklist().readings.totalStores }} Lojas Lidas
                </div>
              </div>

              <!-- PILAR 1: 100% DAS LOJAS ATIVAS LIDAS -->
              <div class="p-4 rounded-2xl border transition-all"
                   [class]="closingChecklist().readings.passed 
                     ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800/70' 
                     : 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-800/70'">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">{{ closingChecklist().readings.passed ? '✅' : '⏳' }}</span>
                    <div>
                      <strong class="text-sm font-bold text-slate-900 dark:text-white">1. Medição das Lojas (100% Lidas)</strong>
                      <p class="text-xs text-slate-500 dark:text-slate-400">Nenhuma loja ativa pode ficar sem leitura no fechamento.</p>
                    </div>
                  </div>
                  <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase font-mono"
                        [class]="closingChecklist().readings.passed 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                          : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'">
                    {{ closingChecklist().readings.passed ? '✓ 100% Concluído' : closingChecklist().readings.pendingStores + ' Pendente(s)' }}
                  </span>
                </div>

                @if (!closingChecklist().readings.passed) {
                  <div class="mt-3 p-3 bg-amber-50/80 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 space-y-2">
                    <span class="text-[11px] font-bold text-amber-900 dark:text-amber-200 block uppercase">
                      Lojas que ainda faltam ser lidas:
                    </span>
                    <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      @for (p of closingChecklist().readings.pendingList; track p.id) {
                        <button type="button" 
                          (click)="statusFilter.set('pending'); mobileViewMode.set('cards'); closeClosingChecklist()"
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
                   [class]="closingChecklist().anomalies.passed 
                     ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800/70' 
                     : 'bg-white dark:bg-slate-900 border-rose-300 dark:border-rose-800/70'">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">{{ closingChecklist().anomalies.passed ? '✅' : '🚨' }}</span>
                    <div>
                      <strong class="text-sm font-bold text-slate-900 dark:text-white">2. Inconsistências & Alertas Auditados</strong>
                      <p class="text-xs text-slate-500 dark:text-slate-400">Suspeitas de vazamento, leitura menor ou zero a mais devem ser auditadas.</p>
                    </div>
                  </div>
                  <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase font-mono"
                        [class]="closingChecklist().anomalies.passed 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'">
                    {{ closingChecklist().anomalies.passed ? '✓ Zero Pendências' : closingChecklist().anomalies.uninspectedCount + ' Alerta(s)' }}
                  </span>
                </div>

                @if (!closingChecklist().anomalies.passed) {
                  <div class="mt-3 p-3 bg-rose-50/80 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800/60 space-y-2">
                    <span class="text-[11px] font-bold text-rose-900 dark:text-rose-200 block uppercase">
                      Lojas com anomalia sem confirmação em campo:
                    </span>
                    <div class="space-y-1.5 max-h-32 overflow-y-auto">
                      @for (a of closingChecklist().anomalies.uninspectedList; track a.id) {
                        <div class="p-2 bg-white dark:bg-slate-800 rounded-lg border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-2 text-xs">
                          <div>
                            <span class="font-mono font-bold">{{ a.luc }}</span> • <strong>{{ a.name }}</strong>: 
                            <span class="text-rose-700 dark:text-rose-300 font-semibold ml-1">{{ a.badge }}</span>
                          </div>
                          <button type="button" 
                            (click)="confirmAnomaly(a.id)"
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
                   [class]="closingChecklist().continuity.passed 
                     ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800/70' 
                     : 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-800/70'">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">{{ closingChecklist().continuity.passed ? '✅' : '⚠️' }}</span>
                    <div>
                      <strong class="text-sm font-bold text-slate-900 dark:text-white">3. Continuidade vs Mês Anterior</strong>
                      <p class="text-xs text-slate-500 dark:text-slate-400">Garante que nenhuma loja medida no mês anterior seja esquecida sem leitura ou justificativa.</p>
                    </div>
                  </div>
                  <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase font-mono"
                        [class]="closingChecklist().continuity.passed 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                          : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'">
                    {{ closingChecklist().continuity.passed ? '✓ 100% Conferido' : closingChecklist().continuity.pendingCount + ' Pendente(s)' }}
                  </span>
                </div>

                @if (!closingChecklist().continuity.passed) {
                  <div class="mt-3 p-3 bg-amber-50/80 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 space-y-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] font-bold text-amber-900 dark:text-amber-200 block uppercase">
                        Lojas medidas no mês anterior sem leitura nem justificativa:
                      </span>
                      <button type="button" 
                        (click)="closeClosingChecklist(); showPrevMonthAuditModal.set(true)"
                        class="text-xs font-bold text-amber-700 dark:text-amber-300 underline cursor-pointer">
                        Abrir Painel de Continuidade
                      </button>
                    </div>
                    <div class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                      @for (p of closingChecklist().continuity.pendingStores; track p.storeId) {
                        <div class="p-2 bg-white dark:bg-slate-800 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2 text-xs w-full sm:w-auto">
                          <div>
                            <span class="font-mono font-bold">{{ p.luc }}</span> • <strong>{{ p.storeName }}</strong>
                            <span class="text-[10px] text-slate-500 dark:text-slate-400 ml-1">
                              (Ant: {{ p.prevReading | number:'1.0-2' }})
                            </span>
                          </div>
                          <div class="flex items-center gap-1 shrink-0">
                            <button type="button" 
                              (click)="quickJustifyStore(p.storeId, p.learnedReason || 'Loja Fechada / Vaga', true)"
                              class="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold cursor-pointer"
                              title="Justificar rapidamente com consumo zero">
                              ⚡ Fechada
                            </button>
                            <button type="button" 
                              (click)="closeClosingChecklist(); jumpToStoreFromAudit(p.storeId)"
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
                   [class]="closingChecklist().reconciliation.passed 
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
                        [class]="closingChecklist().reconciliation.passed 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                          : 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300'">
                    {{ closingChecklist().reconciliation.passed ? '✓ 100% Conciliado' : 'Conferir Balanço' }}
                  </span>
                </div>

                <div class="mt-2.5 p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Fatura Concessionária</span>
                    <strong class="font-mono text-sm text-slate-900 dark:text-white">
                      {{ closingChecklist().reconciliation.billAmount | currency:'BRL' }}
                    </strong>
                  </div>
                  <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Total Rateado (Lojas + AC + Comum)</span>
                    <strong class="font-mono text-sm text-teal-700 dark:text-teal-300">
                      {{ closingChecklist().reconciliation.totalReconciled | currency:'BRL' }}
                    </strong>
                  </div>
                  <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Diferença de Balanço</span>
                    <strong class="font-mono text-sm"
                            [class.text-emerald-600]="closingChecklist().reconciliation.diffFinancial <= 0.50"
                            [class.text-rose-600]="closingChecklist().reconciliation.diffFinancial > 0.50">
                      {{ closingChecklist().reconciliation.diffFinancial | currency:'BRL' }}
                    </strong>
                  </div>
                </div>

                @if (utilityType() === 'gas') {
                  <div class="mt-2 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                    🔥 <strong>Gás 100% Rateável:</strong> 
                    Fatura: {{ closingChecklist().reconciliation.gasConcessionaria }} m³ • 
                    Medição Bruta Campo: {{ closingChecklist().reconciliation.totalRawGas | number:'1.0-1' }} m³ • 
                    Distribuição automática: {{ closingChecklist().reconciliation.isGasAuto ? 'Ativa (100% rateado)' : 'Manual' }}.
                  </div>
                }
              </div>

              <!-- PILAR 4: CONGELAMENTO & SNAPSHOT DE AUDITORIA -->
              <div class="p-4 rounded-2xl border transition-all"
                   [class]="isLocked() 
                     ? 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800' 
                     : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">{{ isLocked() ? '🔒' : '🔓' }}</span>
                    <div>
                      <strong class="text-sm font-bold text-slate-900 dark:text-white">5. Congelamento Contábil (Snapshot)</strong>
                      <p class="text-xs text-slate-500 dark:text-slate-400">Trava todas as medições e custos contra alterações posteriores.</p>
                    </div>
                  </div>
                  <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase font-mono"
                        [class]="isLocked() 
                          ? 'bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-200' 
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'">
                    {{ isLocked() ? '🔒 Travado' : 'Aberto para Edição' }}
                  </span>
                </div>

                @if (isLocked()) {
                  <div class="mt-2 text-xs text-amber-900 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/50 p-3 rounded-xl border border-amber-200 dark:border-amber-800/80">
                    <div>✓ Congelado em: <strong>{{ lockedAt() | date:'dd/MM/yyyy HH:mm' }}</strong></div>
                    <div>✓ Responsável: <strong>{{ lockedBy() || 'Administrador' }}</strong></div>
                    <div class="mt-1 text-[11px] opacity-80">Os relatórios e comprovantes deste mês foram carimbados e selados com garantia de integridade.</div>
                  </div>
                }
              </div>

            </div>

            <!-- Rodapé com Botões de Ação Executiva -->
            <div class="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div class="flex items-center gap-2 w-full sm:w-auto">
                <button type="button" 
                  (click)="exportToExcel()" 
                  [disabled]="isExportingExcel()"
                  class="flex-1 sm:flex-none px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer">
                  <span>📊</span>
                  <span>Baixar Excel</span>
                </button>
                <button type="button" 
                  (click)="exportPackageZip()" 
                  [disabled]="isExportingZip()"
                  class="flex-1 sm:flex-none px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer">
                  <span>📦</span>
                  <span>Pacote ZIP</span>
                </button>
              </div>

              <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                @if (!isLocked()) {
                  <button type="button" 
                    (click)="freezeMonthWithChecklist()"
                    class="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-98 text-white font-black rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer">
                    <span>🔒</span>
                    <span>Fechar e Congelar Mês (1 Clique)</span>
                  </button>
                } @else {
                  <button type="button" 
                    (click)="unfreezeMonth()"
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

      <!-- Mobile Floating Quick Route Bar -->
      <div class="md:hidden fixed bottom-16 left-3 right-3 z-30 pointer-events-none flex justify-center">
        <div class="pointer-events-auto bg-slate-900/90 text-white backdrop-blur-md px-3.5 py-2 rounded-full shadow-xl border border-slate-700 flex items-center gap-3 text-xs">
          <span class="flex items-center gap-1.5 font-medium">
            <span class="w-2 h-2 rounded-full" [class.bg-green-400]="fieldStats().pending === 0" [class.bg-amber-400]="fieldStats().pending > 0"></span>
            <span>{{ fieldStats().completed }}/{{ fieldStats().total }}</span>
            <span class="text-slate-400">({{ fieldStats().progressPct }}%)</span>
          </span>

          @if (prevMonthAudit().hasPreviousData && prevMonthAudit().pendingCount > 0) {
            <button type="button" 
              (click)="togglePrevMissingFilter()"
              class="px-2.5 py-0.5 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] flex items-center gap-1 shadow-xs cursor-pointer animate-pulse"
              title="Filtrar lojas que faltam do mês anterior">
              <span>⏮️</span>
              <span>{{ prevMonthAudit().pendingCount }} do mês ant.</span>
            </button>
          }

          @if (fieldStats().alerts > 0) {
            <button type="button" 
              (click)="statusFilter.set('alert'); mobileViewMode.set('cards')"
              class="px-2 py-0.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-xs cursor-pointer animate-pulse"
              title="Filtrar leituras com alerta de validação">
              <span>🚨</span>
              <span>{{ fieldStats().alerts }} alerta(s)</span>
            </button>
          }

          @if (fieldStats().pending > 0) {
            <button type="button" 
              (click)="mobileViewMode.set('step'); jumpToNextPending()"
              class="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-full text-[11px] transition-colors flex items-center gap-1 shadow-xs cursor-pointer">
              <span>⚡ Próx. Pendente</span>
            </button>
          } @else {
            <span class="text-[11px] text-green-300 font-bold">✓ Concluído</span>
          }
        </div>
      </div>

      <!-- PREV MONTH CONTINUITY AUDIT MODAL -->
      @if (showPrevMonthAuditModal()) {
        <div class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
             (click)="showPrevMonthAuditModal.set(false)">
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
                          [class]="prevMonthAudit().pendingCount > 0 ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700'">
                      {{ selectedMonth() }} vs {{ getPreviousMonth(selectedMonth()) }}
                    </span>
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Lojas de <strong>{{ utilityType() === 'luz' ? 'Energia/Luz' : (utilityType() === 'agua' ? 'Água' : 'Gás') }}</strong> que tiveram consumo/leitura em {{ getPreviousMonth(selectedMonth()) }}.
                  </p>
                </div>
              </div>
              <button (click)="showPrevMonthAuditModal.set(false)" 
                class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-base font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <!-- Stats Bar -->
            <div class="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-center py-3 text-xs">
              <div>
                <div class="text-[10px] uppercase font-bold text-slate-400">Medidas Mês Anterior</div>
                <div class="text-lg font-black font-mono text-slate-800 dark:text-slate-100 mt-0.5">{{ prevMonthAudit().totalCount }}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Já Lidas Neste Mês</div>
                <div class="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">{{ prevMonthAudit().completedCount }}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Faltam Ler</div>
                <div class="text-lg font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5">{{ prevMonthAudit().pendingCount }}</div>
              </div>
            </div>

            <!-- Tabs: Pendentes vs Já Lidas -->
            <div class="px-5 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button type="button"
                  (click)="prevMonthAuditModalTab.set('pending')"
                  [class]="prevMonthAuditModalTab() === 'pending' ? 'bg-amber-600 text-white font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
                  class="px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5">
                  <span>⚠️ Faltam Ler</span>
                  <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
                        [class]="prevMonthAuditModalTab() === 'pending' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'">
                    {{ prevMonthAudit().pendingCount }}
                  </span>
                </button>
                <button type="button"
                  (click)="prevMonthAuditModalTab.set('completed')"
                  [class]="prevMonthAuditModalTab() === 'completed' ? 'bg-emerald-600 text-white font-extrabold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
                  class="px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5">
                  <span>✅ Já Lidas</span>
                  <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
                        [class]="prevMonthAuditModalTab() === 'completed' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'">
                    {{ prevMonthAudit().completedCount }}
                  </span>
                </button>
              </div>

              @if (prevMonthAudit().pendingCount > 0) {
                <button type="button"
                  (click)="filterByPrevMissingAndClose()"
                  class="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900 text-amber-950 dark:text-amber-100 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs">
                  <span>🔍 Filtrar na Tabela</span>
                </button>
              }
            </div>

            <!-- List Content -->
            <div class="overflow-y-auto p-4 sm:p-5 flex-1 divide-y divide-slate-100 dark:divide-slate-800 space-y-2">
              @if (prevMonthAuditModalTab() === 'pending') {
                @if (prevMonthAudit().pendingCount === 0) {
                  <div class="py-12 text-center">
                    <div class="text-5xl mb-3">🎉</div>
                    <h4 class="font-black text-slate-800 dark:text-white text-base">Nenhuma loja esquecida!</h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                      Todas as lojas que foram medidas em <strong>{{ getPreviousMonth(selectedMonth()) }}</strong> já possuem leitura registrada ou justificativa neste mês.
                    </p>
                  </div>
                } @else {
                  <!-- Card Inteligente de Aprendizado de Consumo Zero em Lote -->
                  @if (prevMonthAudit().frequentZeroPending.length > 0) {
                    <div class="mb-3 p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 rounded-2xl border border-amber-300 dark:border-amber-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                      <div class="flex items-start gap-2.5">
                        <span class="text-2xl shrink-0">💡</span>
                        <div>
                          <strong class="text-xs font-bold text-amber-950 dark:text-amber-100 block">
                            Aprendizado de Consumo Zero: {{ prevMonthAudit().frequentZeroPending.length }} lojas com histórico recorrente sem consumo
                          </strong>
                          <p class="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-snug">
                            Lojas fechadas, desocupadas ou sem medição frequente nos meses anteriores. Deseja justificar e preencher todas com 1 clique?
                          </p>
                        </div>
                      </div>
                      <button type="button"
                        (click)="batchJustifyFrequentZero()"
                        class="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-black rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-transform active:scale-95">
                        <span>⚡ Preencher {{ prevMonthAudit().frequentZeroPending.length }} Lojas em 1 Toque</span>
                      </button>
                    </div>
                  }

                  @for (store of prevMonthAudit().pendingStores; track store.storeId) {
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
                            <span>Consumo Anterior: <strong class="text-teal-700 dark:text-teal-400">{{ store.prevConsumption | number:'1.0-2' }} {{ getUnit() }}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div class="flex items-center gap-1.5 self-end sm:self-auto shrink-0 flex-wrap">
                        @if (store.isFrequentZero) {
                          <button type="button"
                            (click)="quickJustifyStore(store.storeId, store.learnedReason, true)"
                            class="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/70 hover:bg-amber-100 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1 shadow-2xs whitespace-nowrap"
                            title="Histórico de consumo zero: preencher rapidamente com 0 m³">
                            <span>⚡ 0 {{ getUnit() }}</span>
                          </button>
                        }
                        <button type="button"
                          (click)="openQuickJustifyModal(store)"
                          class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1 shadow-2xs whitespace-nowrap"
                          title="Justificar loja (fechada, vaga, reforma)">
                          <span>⚖️ Justificar</span>
                        </button>
                        <button type="button"
                          (click)="jumpToStoreFromAudit(store.storeId)"
                          class="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap transition-transform active:scale-95">
                          <span>✏️ Preencher</span>
                        </button>
                      </div>
                    </div>
                  }
                }
              } @else {
                <!-- Tab: Lojas Já Lidas -->
                @for (store of prevMonthAudit().completedStores; track store.storeId) {
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
                          <span>Consumo: <strong class="text-slate-700 dark:text-slate-200">{{ store.consumption | number:'1.0-2' }} {{ getUnit() }}</strong></span>
                        </div>
                      </div>
                    </div>

                    <button type="button"
                      (click)="jumpToStoreFromAudit(store.storeId)"
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
                @if (prevMonthAudit().pendingCount > 0) {
                  Ainda restam <strong class="text-amber-600 dark:text-amber-400">{{ prevMonthAudit().pendingCount }} lojas</strong> para completar a conferência.
                } @else {
                  <span class="text-emerald-600 dark:text-emerald-400 font-bold">✓ Conferência concluída com sucesso!</span>
                }
              </span>
              <div class="flex items-center gap-2">
                @if (prevMonthAudit().pendingCount > 0) {
                  <button type="button"
                    (click)="filterByPrevMissingAndClose()"
                    class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer transition-all">
                    Filtrar as {{ prevMonthAudit().pendingCount }} na Tela
                  </button>
                }
                <button type="button"
                  (click)="showPrevMonthAuditModal.set(false)"
                  class="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-colors">
                  Fechar
                </button>
              </div>
            </div>

          </div>
        </div>
      }

      <!-- MODAL DE JUSTIFICATIVA RÁPIDA DE MEDIÇÃO EM CAMPO -->
      @if (showQuickJustifyModal() && activeJustifyStore()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div class="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                    LUC {{ activeJustifyStore().luc }}
                  </span>
                  @if (activeJustifyStore().routeOrder) {
                    <span class="text-xs font-mono font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                      #{{ activeJustifyStore().routeOrder }}
                    </span>
                  }
                </div>
                <h3 class="font-bold text-slate-900 dark:text-white text-base mt-1.5">{{ activeJustifyStore().storeName }}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Selecione o motivo da justificativa para registro em campo e no Excel:</p>
              </div>
              <button (click)="closeQuickJustifyModal()" class="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg font-bold cursor-pointer">✕</button>
            </div>

            <!-- Opções de Justificativa em 1 Toque -->
            <div class="grid grid-cols-1 gap-2.5">
              <button type="button"
                (click)="quickJustifyStore(activeJustifyStore().storeId, 'Loja Fechada / Vaga', true)"
                class="p-3 text-left rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all cursor-pointer flex items-center gap-3 group">
                <span class="text-2xl shrink-0 group-hover:scale-110 transition-transform">🏢</span>
                <div>
                  <strong class="text-xs font-bold text-slate-900 dark:text-white block">Loja Fechada / Vaga</strong>
                  <span class="text-[11px] text-slate-500 dark:text-slate-400">Replicar leitura anterior (0 {{ getUnit() }}). Exporta no Excel com observação.</span>
                </div>
              </button>

              <button type="button"
                (click)="quickJustifyStore(activeJustifyStore().storeId, 'Em Reforma / Obra', true)"
                class="p-3 text-left rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all cursor-pointer flex items-center gap-3 group">
                <span class="text-2xl shrink-0 group-hover:scale-110 transition-transform">🔨</span>
                <div>
                  <strong class="text-xs font-bold text-slate-900 dark:text-white block">Em Reforma / Obra</strong>
                  <span class="text-[11px] text-slate-500 dark:text-slate-400">Loja em obras sem consumo de hidrômetro/medidor ativo no período.</span>
                </div>
              </button>

              <button type="button"
                (click)="quickJustifyStore(activeJustifyStore().storeId, 'Sem Consumo no Mês', true)"
                class="p-3 text-left rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all cursor-pointer flex items-center gap-3 group">
                <span class="text-2xl shrink-0 group-hover:scale-110 transition-transform">⏸️</span>
                <div>
                  <strong class="text-xs font-bold text-slate-900 dark:text-white block">Sem Consumo no Mês (0 {{ getUnit() }})</strong>
                  <span class="text-[11px] text-slate-500 dark:text-slate-400">Medidor verificado em campo: ponteiro inalterado, consumo zero confirmado.</span>
                </div>
              </button>

              <button type="button"
                (click)="quickJustifyStore(activeJustifyStore().storeId, 'Medidor Inacessível / Trancado', true)"
                class="p-3 text-left rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all cursor-pointer flex items-center gap-3 group">
                <span class="text-2xl shrink-0 group-hover:scale-110 transition-transform">🔒</span>
                <div>
                  <strong class="text-xs font-bold text-slate-900 dark:text-white block">Medidor Inacessível / Trancado</strong>
                  <span class="text-[11px] text-slate-500 dark:text-slate-400">Porta trancada sem acesso pelo técnico. Justificativa registrada para fechamento.</span>
                </div>
              </button>

              <button type="button"
                (click)="quickJustifyStore(activeJustifyStore().storeId, 'Sem Ponto / Inativo', true)"
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
                (click)="closeQuickJustifyModal()" 
                class="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class BillCalculatorComponent implements OnDestroy {
  private photoSubscriptionUnsubscribe: (() => void) | null = null;
  storeService = inject(StoreService);
  historyService = inject(HistoryService);
  authService = inject(AuthService); // Inject Auth
  exportService = inject(ReportExportService);
  indexedDb = inject(IndexedDbService);
  geminiService = inject(GeminiService);
  ocrFeedbackService = inject(OcrFeedbackService);
  supabaseService = inject(SupabaseService);
  apportionmentEngine = inject(ApportionmentEngineService);

  utilityType = signal<'luz' | 'agua' | 'gas'>('luz');

  // Date State
  selectedMonth = signal<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
  
  selectedMonthFormatted = computed(() => {
    const m = this.selectedMonth();
    if (!m || !m.includes('-')) return m;
    const [yearStr, monthStr] = m.split('-');
    const monthNum = parseInt(monthStr, 10);
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const name = months[monthNum - 1] || monthStr;
    return `${name} de ${yearStr}`;
  });

  isCurrentMonth = computed(() => {
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.selectedMonth() === current;
  });

  dataLoaded = signal(false);
  lastSaved = signal<string | null>(null);

  // Auto-Save Status
  saveStatus = signal<'saved' | 'saving' | 'error'>('saved');
  isProgrammaticLoading = true;
  isSaving = false;
  autoSaveTimer: any = null;

  flushAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (!this.isProgrammaticLoading && this.authService.canEditReadings()) {
      this.internalSave();
    }
  }

  @HostListener('window:beforeunload')
  @HostListener('window:pagehide')
  onPageUnload() {
    this.flushAutoSave();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.flushAutoSave();
    }
  }

  // Export State
  isExportingExcel = signal(false);
  isExportingZip = signal(false);

  // UI State for Mobile
  isConfigOpen = signal(false); // Default collapsed on mobile/tech, open on desktop

  // --- FIELD / MOBILE ENHANCED STATE ---
  searchQuery = signal<string>('');
  statusFilter = signal<'all' | 'pending' | 'completed' | 'alert' | 'prev_missing'>('all');
  sortBy = signal<string>('route');
  sortDirection = signal<'asc' | 'desc'>('asc');
  mobileViewMode = signal<'cards' | 'step'>('cards');
  stepIndex = signal<number>(0);
  activeNoteStoreId = signal<string | null>(null);
  activeNoteText = signal<string>('');

  // --- PREVIOUS MONTH CONTINUITY AUDIT STATE ---
  showPrevMonthAuditModal = signal<boolean>(false);
  prevMonthAuditModalTab = signal<'pending' | 'completed'>('pending');
  showQuickJustifyModal = signal<boolean>(false);
  activeJustifyStore = signal<any | null>(null);

  // --- METER PHOTO EVIDENCE (EVIDÊNCIA FOTOGRÁFICA DO MEDIDOR) ---
  meterPhotos = signal<Record<string, MeterPhotoRecord>>({});
  prevMonthPhotos = signal<Record<string, MeterPhotoRecord>>({});
  activePhotoRecord = signal<MeterPhotoRecord | null>(null);
  showPhotoModal = signal<boolean>(false);
  isCapturingPhoto = signal<string | null>(null);
  isConfirmingPhotoDelete = signal<boolean>(false);

  // --- LOCK / MONTH CONSOLIDATION STATE ---
  isLocked = signal<boolean>(false);
  lockedAt = signal<string | null>(null);
  lockedBy = signal<string | null>(null);
  canEdit = computed(() => !this.isLocked() && this.authService.canEditReadings());
  canConfigure = computed(() => !this.isLocked() && this.authService.canConfigureBill());

  // --- AI API KEY CONFIGURATION MODAL ---
  showAiKeyModal = signal<boolean>(false);
  groqInputKey = signal<string>('');
  geminiInputKey = signal<string>('');
  pendingOcrStoreId = signal<string | null>(null);

  // --- STORE VOUCHER / ESPELHO DO LOJISTA STATE ---
  showVoucherModal = signal<boolean>(false);
  selectedVoucherData = signal<StoreVoucherData | null>(null);

  // --- ANOMALY AUDIT MODAL (ETAPA 1: ALERTA INTELIGENTE E ANTI-ERRO) ---
  activeAnomalyModal = signal<AnomalyModalData | null>(null);

  // --- MONTH CLOSING & AUDIT CHECKLIST (ETAPA 3: FECHAMENTO CONTÁBIL E CONGELAMENTO) ---
  showClosingChecklistModal = signal<boolean>(false);

  // --- BATCH OCR QUEUE STATE ---
  showBatchOcrModal = signal<boolean>(false);
  isBatchOcrRunning = signal<boolean>(false);
  cancelBatchOcrRequested = signal<boolean>(false);
  batchOcrProgress = signal<{
    current: number;
    total: number;
    progressPct: number;
    currentStoreName: string;
    currentLuc: string;
    successCount: number;
    failCount: number;
    currentModel: string;
  }>({
    current: 0,
    total: 0,
    progressPct: 0,
    currentStoreName: '',
    currentLuc: '',
    successCount: 0,
    failCount: 0,
    currentModel: ''
  });

  pendingOcrCount = computed(() => {
    return this.tableData().filter(s => s.hasPhoto && (!s.isRead || s.currentReading === 0)).length;
  });

  totalPhotosCount = computed(() => {
    return this.tableData().filter(s => s.hasPhoto).length;
  });

  // --- OCR DUAL-ENGINE STATE (QWEN 3.8 27B GROQ + GEMINI 3.8 FLASH FALLBACK) ---
  isReadingOcr = signal<string | null>(null); // storeId sendo analisado
  ocrCurrentModelLabel = signal<string>('Qwen 3.8 27B (Groq)');
  ocrFeedback = signal<Record<string, {
    success: boolean;
    message: string;
    reading?: number | null;
    confidence?: string;
    explanation?: string;
    provider?: 'qwen' | 'gemini' | 'none';
    modelName?: string;
    fallbackUsed?: boolean;
  }>>({});
  // Leituras sugeridas pela IA aguardando conferência do técnico (por storeId)
  ocrPending = signal<Record<string, OcrPendingConfirmation>>({});
  showOcrQuality = signal(false);

  // Utility counts for header badges:
  utilityStats = computed(() => {
    const all = this.storeService.stores();
    const reads = this.readings();

    const countUtil = (type: 'luz' | 'agua' | 'gas') => {
      const stores = all.filter(s => {
        const uses = type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
        return uses && s.active !== false;
      });
      const map = reads[type];
      const completed = stores.filter(s => {
        const r = map?.get(s.id);
        return r && r.reading > 0;
      }).length;
      return { total: stores.length, completed };
    };

    return {
      luz: countUtil('luz'),
      agua: countUtil('agua'),
      gas: countUtil('gas'),
    };
  });

  // -- Detailed Mode State (Luz) --
  luzCostItems = signal<CostItem[]>([
    { id: '1', name: 'Conta CEEE BSS-1 (UC 72207914)', value: 0 },
    { id: '2', name: 'Valor conta CEMIG BSS-1', value: 0 },
    { id: '3', name: 'Valor ENEVA', value: 0 },
    { id: '4', name: 'Contribuição-1 associativa CCEE', value: 0 },
    { id: '5', name: 'Contabilização energia reserva - RES005', value: 0 },
    { id: '6', name: 'Tarifa bancária Bradesco', value: 0 },
    { id: '7', name: 'Diferenças convertidas no rateio (ajustes)', value: 0 },
    { id: '8', name: 'Sumário (liq. Financeira) - SUM001', value: 0 },
    { id: '9', name: 'Automação CAG - Microblau', value: 0 },
    { id: '10', name: 'Valor conta CEEE BSS-2 (UC 68203772)', value: 0 },
    { id: '11', name: 'Valor conta CEMIG BSS-2', value: 0 },
    { id: '12', name: 'Valor conta CEEE BSS-3 (UC 64550214)', value: 0 },
    { id: '13', name: 'Valor conta CEEE BSS-4 (UC 54031443)', value: 0 },
    { id: '14', name: 'Valor Siclo - Consultoria', value: 0 },
    { id: '15', name: 'Valor Agroenergia - Consultoria', value: 0 },
    { id: '16', name: 'Gestão Mercado Livre (Versa)', value: 0 },
    { id: '17', name: 'Fluxo de caixa', value: 0 },
    { id: '18', name: 'Guia judicial', value: 0 }
  ]);

  luzConsumption = signal({
    bss1: 0,
    bss2: 0,
    bss3: 0,
    bss4: 0
  });

  luzAC = signal<number>(0);

  // -- Detailed Mode State (Agua) --
  aguaCostItems = signal<CostItem[]>([
    { id: 'w1', name: 'Valor conta', value: 0 },
    { id: 'w2', name: 'Enviro Tools', value: 0 },
    { id: 'w3', name: 'Fluxo de caixa', value: 0 },
  ]);

  aguaTotalReading = signal<number>(0); // Total from Bill
  aguaAC = signal<number>(0);

  // -- Detailed Mode State (Gas) --
  gasCostItems = signal<CostItem[]>([
    { id: 'g1', name: 'Valor conta', value: 0 },
    { id: 'g2', name: 'Enviro Tools', value: 0 },
    { id: 'g3', name: 'Fluxo de caixa', value: 0 },
  ]);
  gasTotalReading = signal<number>(0);
  gasAutoDistribute = signal<boolean>(true); // Rateio 100% Proporcional Automático (Concessionária vs Campo)

  // -- COMPLEX CONSUMPTION STORAGE --
  readings = signal<{
    luz: Map<string, StoreReading>;
    agua: Map<string, StoreReading>;
    gas: Map<string, StoreReading>;
  }>({
    luz: new Map(),
    agua: new Map(),
    gas: new Map()
  });

  // Stores Previous Month Data for Calculations (Reativo e automático via HistoryService)
  previousReadings = computed(() => {
    const type = this.utilityType();
    const month = this.selectedMonth();
    this.historyService.bills();
    this.storeService.stores();
    this.storeService.monthlyStoreLists();
    return this.historyService.getLastValidReadings(type, month);
  });

  // Excel Import State
  showExcelImportModal = signal<boolean>(false);

  // AI State
  isAnalyzing = signal(false);
  aiAnalysis = signal('');

  // FILTERED STORES (Isolação Mensal: apenas lojas vigentes no mês selecionado)
  hasMonthlyListForSelectedMonth = computed(() => {
    return this.storeService.hasMonthlyList(this.utilityType(), this.selectedMonth());
  });

  activeStores = computed(() => {
    const type = this.utilityType();
    const month = this.selectedMonth();
    const readingsMap = this.readings()[type];

    // Obtém as lojas pertencentes a este mês específico (ou vazio se o mês não tem lista importada)
    const monthStores = [...this.storeService.getStoresForMonth(type, month, false)];

    // Se houver leituras salvas para lojas (ex.: lojas que estavam no rateio antes de serem inativadas),
    // inclui-as para manter a integridade dos cálculos e histórico
    if (readingsMap && readingsMap.size > 0) {
      const allStoresMap = new Map(this.storeService.stores().map(s => [s.id, s]));
      const monthStoreIds = new Set(monthStores.map(s => s.id));
      for (const storeId of readingsMap.keys()) {
        if (!monthStoreIds.has(storeId)) {
          const s = allStoresMap.get(storeId);
          if (s) {
            const usesUtil = type === 'luz' ? s.usesLuz : (type === 'agua' ? s.usesAgua : s.usesGas);
            if (usesUtil) {
              monthStores.push(s);
            }
          }
        }
      }
    }

    return monthStores;
  });

  constructor() {
    // Sincronização inteligente de chaves de IA (Desktop <-> Celular)
    const localGroq = this.geminiService.getSavedGroqKey();
    const localGemini = this.geminiService.getSavedGeminiKey();
    if (localGroq || localGemini) {
      this.supabaseService.syncSystemAiKeys(localGroq, localGemini).catch(() => { });
    } else {
      this.supabaseService.fetchSystemAiKeys().then(cloudKeys => {
        if (cloudKeys) {
          this.geminiService.setCloudApiKeys(cloudKeys.groqKey, cloudKeys.geminiKey);
        }
      }).catch(() => { });
    }

    // 1. Data Loader Effect (dispara quando o usuário altera aba ou mês)
    effect(() => {
      const type = this.utilityType();
      const month = this.selectedMonth();

      untracked(() => {
        this.loadDataForCurrentSelection();
      });
    }, { allowSignalWrites: true });

    // 2. Mobile Config Optimization: Collapse config if Tech user on Mobile
    effect(() => {
      const isTech = this.authService.isTech();
      if (isTech && this.isMobile()) {
        this.isConfigOpen.set(false);
      }
    }, { allowSignalWrites: true });

    // 3. Sincronização de alterações remotas da nuvem
    effect(() => {
      const bills = this.historyService.bills();
      const currentKey = `${this.utilityType()}_${this.selectedMonth()}`;
      const remote = bills[currentKey];

      untracked(() => {
        if (!remote || this.isSaving || this.isProgrammaticLoading) return;
        if (remote.lastUpdated && remote.lastUpdated !== this.lastSaved()) {
          this.loadDataForCurrentSelection();
        }
      });
    }, { allowSignalWrites: true });

    // 4. Auto-Save Effect (executa apenas quando o usuário edita leituras ou custos)
    effect((onCleanup) => {
      const _costs = this.currentCostItems();
      const _luzCons = this.luzConsumption();
      const _aguaCons = this.aguaTotalReading();
      const _gasCons = this.gasTotalReading();
      const _ac = this.currentACConsumption();
      const _reads = this.readings();

      untracked(() => {
        // NUNCA salvar durante o carregamento de outra aba ou mês
        if (this.isProgrammaticLoading) return;
        if (!this.authService.canEditReadings()) return;

        this.saveStatus.set('saving');
        if (this.autoSaveTimer) {
          clearTimeout(this.autoSaveTimer);
        }
        this.autoSaveTimer = setTimeout(() => {
          this.autoSaveTimer = null;
          if (!this.isProgrammaticLoading) {
            this.internalSave();
          }
        }, 800);

        onCleanup(() => {
          if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
            this.autoSaveTimer = null;
          }
        });
      });
    });

    // 5. Inscrição em tempo real para fotos de medidores do Supabase (inserção, edição e exclusão)
    this.photoSubscriptionUnsubscribe = this.supabaseService.subscribeToPhotos(async (payload) => {
      const type = this.utilityType();
      const month = this.selectedMonth();

      // Se foi um evento DELETE direto no Supabase emitido por outro dispositivo (PC ou Mobile)
      if (payload?.eventType === 'DELETE' && payload.old) {
        const deletedId = String(payload.old.id || '');
        const deletedStoreId = payload.old.store_id || (deletedId ? deletedId.split('_')[2] : null);
        if (deletedStoreId) {
          this.meterPhotos.update(prev => {
            const copy = { ...prev };
            delete copy[deletedStoreId];
            return copy;
          });
          await this.indexedDb.deleteMeterPhoto(type, month, deletedStoreId);
          this.updateDetailedReading(deletedStoreId, 'hasPhoto', false);
          this.updateDetailedReading(deletedStoreId, 'photoTimestamp', undefined);
        }
      }

      // Re-sincroniza fotos da nuvem mantendo apenas fotos locais ainda não sincronizadas
      const cloudPhotos = await this.supabaseService.fetchMeterPhotos(type, month);
      if (cloudPhotos !== null) {
        const currentLocal = this.meterPhotos();
        const nextPhotos: Record<string, MeterPhotoRecord> = { ...cloudPhotos };

        for (const [storeId, p] of Object.entries(currentLocal)) {
          if (!p.synced && !cloudPhotos[storeId]) {
            nextPhotos[storeId] = p;
          } else if (p.synced && !cloudPhotos[storeId]) {
            // Foi excluída na nuvem por outro dispositivo! Exclui do IndexedDB local também:
            await this.indexedDb.deleteMeterPhoto(type, month, storeId);
            this.updateDetailedReading(storeId, 'hasPhoto', false);
            this.updateDetailedReading(storeId, 'photoTimestamp', undefined);
          }
        }

        this.meterPhotos.set(nextPhotos);
      }
    });
  }

  ngOnDestroy() {
    if (this.photoSubscriptionUnsubscribe) {
      try {
        this.photoSubscriptionUnsubscribe();
      } catch { }
      this.photoSubscriptionUnsubscribe = null;
    }
  }

  isMobile() {
    // Simple check, can be improved with ResizeObserver
    return typeof window !== 'undefined' ? window.innerWidth < 1280 : false;
  }

  toggleConfigVisibility() {
    this.isConfigOpen.update(v => !v);
  }

  setUtility(type: 'luz' | 'agua' | 'gas') {
    if (this.utilityType() === type) return;
    this.isProgrammaticLoading = true;
    this.saveStatus.set('saved');
    this.utilityType.set(type);
    this.showExcelImportModal.set(false);
  }

  onMonthChange(newMonth: string) {
    if (this.selectedMonth() === newMonth) return;
    this.isProgrammaticLoading = true;
    this.saveStatus.set('saved');
    this.selectedMonth.set(newMonth);
  }

  goToPreviousMonth() {
    const current = this.selectedMonth();
    const [year, month] = current.split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    const prevStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.onMonthChange(prevStr);
  }

  goToNextMonth() {
    const current = this.selectedMonth();
    const [year, month] = current.split('-').map(Number);
    const d = new Date(year, month, 1);
    const nextStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.onMonthChange(nextStr);
  }

  goToCurrentMonth() {
    const now = new Date();
    const currentStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.onMonthChange(currentStr);
  }

  createDefaultReading(): StoreReading {
    return { reading: 0, constant: 1, virtual: undefined, adjustment: 1, calculatedConsumption: 0, excludedFromBill: false };
  }

  // --- IMPORTAÇÃO INTELIGENTE DE PLANILHA EXCEL ---

  openExcelImportModal() {
    if (!this.authService.canImport()) {
      alert('Apenas administradores podem importar dados em lote.');
      return;
    }
    this.showExcelImportModal.set(true);
  }

  closeExcelImportModal() {
    this.showExcelImportModal.set(false);
  }

  onExcelImportApplied(event: ExcelImportSuccessEvent) {
    const type = this.utilityType();
    const currentReadingsMap = new Map(this.readings()[type] as Map<string, StoreReading>);
    let updatedCount = 0;

    event.updatedReadings.forEach(item => {
      const current = currentReadingsMap.get(item.storeId) || this.createDefaultReading();
      const updated: StoreReading = {
        ...current,
        reading: item.reading,
        calculatedConsumption: item.calculatedConsumption,
      };

      if (item.constant !== undefined) updated.constant = item.constant;
      if (item.adjustment !== undefined) updated.adjustment = item.adjustment;
      if (item.virtual !== undefined) updated.virtual = item.virtual;
      if (item.adjustmentAdd !== undefined) updated.adjustmentAdd = item.adjustmentAdd;
      if (item.fcm !== undefined) updated.fcm = item.fcm;
      if (item.fluxoCost !== undefined) updated.fluxoCost = item.fluxoCost;
      if (item.note) updated.note = item.note;

      currentReadingsMap.set(item.storeId, updated);
      updatedCount++;
    });

    this.readings.update(curr => ({ ...curr, [type]: currentReadingsMap }));
    this.closeExcelImportModal();
    this.internalSave();
    this.indexedDb.showToast(`🎉 ${updatedCount} lojas importadas e atualizadas com sucesso do Excel!`);
  }

  // --- HISTORY & PERSISTENCE ---

  internalSave() {
    if (!this.authService.canEditReadings()) return;
    if (this.isProgrammaticLoading) return;
    this.isSaving = true;
    this.dataLoaded.set(true);

    const type = this.utilityType();
    const month = this.selectedMonth();

    const currentTableData = this.tableData();
    const readingsMap = this.readings()[type] as Map<string, StoreReading>;
    const readingsToSave: Record<string, StoreReading> = {};

    readingsMap.forEach((val, storeId) => {
      readingsToSave[storeId] = { ...val };
    });

    currentTableData.forEach(row => {
      const original = readingsMap.get(row.storeId) || this.createDefaultReading();

      readingsToSave[row.storeId] = {
        ...original,
        luc: row.luc,
        contrato: row.contrato,
        storeName: row.storeName,
        rawConsumption: row.rawConsumption,
        gasFactor: row.gasFactor,
        calculatedConsumption: row.consumption,
        cost: row.cost
      };
    });

    const dataToSave: BillData = {
      costItems: this.currentCostItems(),
      consumptionInput: type === 'luz' ? this.luzConsumption() :
        type === 'agua' ? this.aguaTotalReading() : this.gasTotalReading(),
      acInput: this.currentACConsumption(),
      readings: readingsToSave,
      lastUpdated: new Date().toISOString(),
      isLocked: this.isLocked(),
      lockedAt: this.lockedAt() || undefined,
      lockedBy: this.lockedBy() || undefined,
      gasAutoDistribute: type === 'gas' ? this.gasAutoDistribute() : undefined
    };

    this.historyService.saveBill(type, month, dataToSave);
    this.lastSaved.set(dataToSave.lastUpdated);
    this.saveStatus.set('saved');

    setTimeout(() => {
      this.isSaving = false;
    }, 400);
  }

  toggleLockBill() {
    if (!this.authService.isAdmin()) {
      alert('Apenas administradores podem fechar ou reabrir um mês de rateio.');
      return;
    }

    const currentLock = this.isLocked();
    const typeLabel = this.utilityType().toUpperCase();
    const month = this.selectedMonth();

    if (!currentLock) {
      const confirmLock = confirm(`Deseja realmente FECHAR e CONGELAR o rateio de ${typeLabel} (${month})?\n\nIsso bloqueará alterações em medições e custos para fechamento financeiro.`);
      if (!confirmLock) return;
      this.isLocked.set(true);
      this.lockedAt.set(new Date().toISOString());
      this.lockedBy.set(this.authService.user()?.email || 'Administrador');
      this.internalSave();
      this.indexedDb.showToast(`🔒 Rateio de ${typeLabel} (${month}) fechado e congelado com sucesso!`);
    } else {
      const confirmUnlock = confirm(`Deseja REABRIR o rateio de ${typeLabel} (${month}) para novas alterações?`);
      if (!confirmUnlock) return;
      this.isLocked.set(false);
      this.lockedAt.set(null);
      this.lockedBy.set(null);
      this.internalSave();
      this.indexedDb.showToast(`🔓 Rateio de ${typeLabel} (${month}) reaberto para edições.`);
    }
  }

  confirmClearMonthStores() {
    const type = this.utilityType();
    const month = this.selectedMonth();
    const typeLabel = type === 'luz' ? 'Energia/Luz' : (type === 'agua' ? 'Água' : 'Gás');
    const count = this.activeStores().length;

    const confirmed = confirm(
      `ATENÇÃO: Deseja apagar todas as lojas de ${typeLabel} do mês de referência ${month}?\n\n` +
      `• Serão apagadas todas as ${count} lojas deste mês específico (${typeLabel} - ${month}).\n` +
      `• Os outros meses e as outras utilidades (Água, Gás, Luz) NÃO serão afetados.\n` +
      `• As lojas continuam salvas no Catálogo Geral.`
    );

    if (!confirmed) return;

    // 1. Limpa a lista mensal específica desta utilidade e mês
    this.storeService.clearMonthlyStoreList(type, month);

    // 2. Limpa as leituras na calculadora para esta utilidade e mês
    this.readings.update(prev => ({
      ...prev,
      [type]: new Map()
    }));

    // 3. Limpa o histórico de faturas salvas para este mês/tipo
    this.historyService.clearBillForMonth(type, month);

    // 4. Recarrega os dados do mês atual para refletir o estado limpo
    this.loadDataForCurrentSelection();

    this.indexedDb.showToast(`🗑️ Lojas de ${typeLabel} do mês ${month} foram apagadas com sucesso!`);
  }

  loadDataForCurrentSelection() {
    this.isProgrammaticLoading = true;
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    const type = this.utilityType();
    const month = this.selectedMonth();

    // 1. Load Current Month Data
    const existingData = this.historyService.getBill(type, month);

    if (existingData) {
      this.isLocked.set(!!existingData.isLocked);
      this.lockedAt.set(existingData.lockedAt || null);
      this.lockedBy.set(existingData.lockedBy || null);

      if (type === 'luz') this.luzCostItems.set(existingData.costItems);
      else if (type === 'agua') this.aguaCostItems.set(existingData.costItems);
      else if (type === 'gas') {
        this.gasCostItems.set(existingData.costItems);
        this.gasAutoDistribute.set(existingData.gasAutoDistribute !== undefined ? existingData.gasAutoDistribute : true);
      }

      if (type === 'luz') this.luzConsumption.set(existingData.consumptionInput);
      else if (type === 'agua') this.aguaTotalReading.set(existingData.consumptionInput);
      else if (type === 'gas') this.gasTotalReading.set(existingData.consumptionInput);

      if (type === 'luz') this.luzAC.set(existingData.acInput);
      else if (type === 'agua') this.aguaAC.set(existingData.acInput);

      // Load Readings
      const map = new Map<string, StoreReading>();
      if (existingData.readings) {
        Object.entries(existingData.readings).forEach(([k, v]) => {
          if (typeof v === 'number') {
            map.set(k, { reading: v, constant: 1, virtual: undefined, adjustment: 1, calculatedConsumption: 0 });
          } else {
            const readingObj = { ...(v as StoreReading) };
            if (readingObj.virtual === 0 && readingObj.calculatedConsumption && readingObj.calculatedConsumption > 0) {
              readingObj.virtual = undefined;
            }
            map.set(k, readingObj);
          }
        });
      }
      this.readings.update(curr => ({ ...curr, [type]: map }));

      this.lastSaved.set(existingData.lastUpdated);
      this.dataLoaded.set(true);

    } else {
      this.resetFormValues(type);
      this.lastSaved.set(null);
      this.dataLoaded.set(false); // New month, empty data
      this.isLocked.set(false);
      this.lockedAt.set(null);
      this.lockedBy.set(null);
    }

    // 2. Load Previous Month Data
    const prevMonth = this.getPreviousMonth(month);

    // 3. Load Meter Photos from IndexedDB (com merge e detecção de exclusões da nuvem)
    this.indexedDb.getMeterPhotosForMonth(type, month).then(async photos => {
      let combined = { ...photos };
      if (this.indexedDb.isOnline()) {
        try {
          const cloudPhotos = await this.supabaseService.fetchMeterPhotos(type, month);
          if (cloudPhotos !== null) {
            combined = { ...cloudPhotos };
            // Preserva apenas fotos locais que ainda estão pendentes de sincronização (!synced)
            for (const [sId, p] of Object.entries(photos)) {
              if (!p.synced && !cloudPhotos[sId]) {
                combined[sId] = p;
              } else if (p.synced && !cloudPhotos[sId]) {
                // A foto foi excluída na nuvem! Limpa do IndexedDB local para não ressuscitar a foto
                await this.indexedDb.deleteMeterPhoto(type, month, sId);
                this.updateDetailedReading(sId, 'hasPhoto', false);
                this.updateDetailedReading(sId, 'photoTimestamp', undefined);
              }
            }
            // Salva em cache local do IndexedDB as fotos válidas da nuvem
            for (const cp of Object.values(cloudPhotos)) {
              if (!photos[cp.storeId]) {
                await this.indexedDb.saveMeterPhoto({ ...cp, synced: true });
              }
            }
          }
        } catch (e) {
          console.warn('Erro ao carregar fotos da nuvem:', e);
        }
      }
      this.meterPhotos.set(combined);

      // Reconcilia apenas metadados visuais de evidência (hasPhoto e photoTimestamp) sem sobrescrever valores numéricos de leitura
      const currentReadings = this.readings()[type] as Map<string, StoreReading>;
      let metaUpdated = false;
      const updatedMap = new Map(currentReadings);

      for (const [sId, p] of Object.entries(combined)) {
        const curReading = updatedMap.get(sId);
        if (curReading && (!curReading.hasPhoto || curReading.photoTimestamp !== p.capturedAt)) {
          updatedMap.set(sId, {
            ...curReading,
            hasPhoto: true,
            photoTimestamp: p.capturedAt
          });
          metaUpdated = true;
        }
      }

      if (metaUpdated) {
        this.readings.update(curr => ({ ...curr, [type]: updatedMap }));
      }
    }).catch(() => {
      this.meterPhotos.set({});
    });

    // 2. Leituras Anteriores são computadas reativamente via computed signal previousReadings
    const prevMap = this.previousReadings();

    // Carrega fotos do mês anterior (e fotos dos meses retroativos das lojas desativadas) para comparação visual
    this.indexedDb.getMeterPhotosForMonth(type, prevMonth).then(async prevPhotos => {
      let combinedPrev: Record<string, MeterPhotoRecord> = { ...prevPhotos };
      if (this.indexedDb.isOnline()) {
        try {
          const cloudPrev = await this.supabaseService.fetchMeterPhotos(type, prevMonth);
          if (cloudPrev) {
            combinedPrev = { ...cloudPrev, ...combinedPrev };
          }
        } catch { }
      }

      // Se alguma loja teve a última medição em mês mais antigo, tenta buscar a foto daquele mês também
      for (const [storeId, prevInfo] of prevMap.entries()) {
        if (prevInfo.month && prevInfo.month !== prevMonth && !combinedPrev[storeId]) {
          try {
            const olderPhoto = await this.indexedDb.getMeterPhoto(type, prevInfo.month, storeId);
            if (olderPhoto) {
              combinedPrev[storeId] = olderPhoto;
            } else if (this.indexedDb.isOnline()) {
              const cloudPhotosOlder = await this.supabaseService.fetchMeterPhotos(type, prevInfo.month);
              if (cloudPhotosOlder && cloudPhotosOlder[storeId]) {
                combinedPrev[storeId] = cloudPhotosOlder[storeId];
              }
            }
          } catch { }
        }
      }

      this.prevMonthPhotos.set(combinedPrev);
    }).catch(() => {
      this.prevMonthPhotos.set({});
    });

    this.saveStatus.set('saved');

    setTimeout(() => {
      this.isProgrammaticLoading = false;
      this.saveStatus.set('saved');
    }, 300);
  }

  getPreviousMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1 - 1, 1);
    return date.toISOString().substring(0, 7);
  }

  resetFormValues(type: 'luz' | 'agua' | 'gas') {
    if (type === 'luz') {
      this.luzCostItems.update(items => items.map(i => ({ ...i, value: 0 })));
      this.luzConsumption.set({ bss1: 0, bss2: 0, bss3: 0, bss4: 0 });
      this.luzAC.set(0);
      this.readings.update(curr => ({ ...curr, luz: new Map() }));
    } else if (type === 'agua') {
      this.aguaCostItems.update(items => items.map(i => ({ ...i, value: 0 })));
      this.aguaTotalReading.set(0);
      this.aguaAC.set(0);
      this.readings.update(curr => ({ ...curr, agua: new Map() }));
    } else if (type === 'gas') {
      this.gasCostItems.update(items => items.map(i => ({ ...i, value: 0 })));
      this.gasTotalReading.set(0);
      this.readings.update(curr => ({ ...curr, gas: new Map() }));
    }
  }

  // ---

  currentCostItems = computed(() => {
    switch (this.utilityType()) {
      case 'luz': return this.luzCostItems();
      case 'agua': return this.aguaCostItems();
      case 'gas': return this.gasCostItems();
    }
  });

  currentACConsumption = computed(() => {
    if (this.utilityType() === 'luz') return this.luzAC();
    if (this.utilityType() === 'agua') return this.aguaAC();
    return 0; // Gas has no AC
  });

  addCostItem() {
    if (!this.authService.canConfigureBill()) return;
    const newId = crypto.randomUUID();
    const newItem = { id: newId, name: 'Novo Item de Custo', value: 0 };

    if (this.utilityType() === 'luz') this.luzCostItems.update(items => [...items, newItem]);
    else if (this.utilityType() === 'agua') this.aguaCostItems.update(items => [...items, newItem]);
    else if (this.utilityType() === 'gas') this.gasCostItems.update(items => [...items, newItem]);
  }

  removeCostItem(id: string) {
    if (!this.authService.canConfigureBill()) return;
    if (this.utilityType() === 'luz') this.luzCostItems.update(items => items.filter(i => i.id !== id));
    else if (this.utilityType() === 'agua') this.aguaCostItems.update(items => items.filter(i => i.id !== id));
    else if (this.utilityType() === 'gas') this.gasCostItems.update(items => items.filter(i => i.id !== id));
  }

  updateItemValue(id: string, newValue: number) {
    if (!this.authService.canConfigureBill()) return;
    const type = this.utilityType();
    const updater = (items: CostItem[]) => items.map(item => item.id === id ? { ...item, value: newValue } : item);
    if (type === 'luz') this.luzCostItems.update(updater);
    else if (type === 'agua') this.aguaCostItems.update(updater);
    else if (type === 'gas') this.gasCostItems.update(updater);
  }

  updateItemName(id: string, newName: string) {
    if (!this.authService.canConfigureBill()) return;
    const type = this.utilityType();
    const updater = (items: CostItem[]) => items.map(item => item.id === id ? { ...item, name: newName } : item);
    if (type === 'luz') this.luzCostItems.update(updater);
    else if (type === 'agua') this.aguaCostItems.update(updater);
    else if (type === 'gas') this.gasCostItems.update(updater);
  }

  updateLuzCons(field: keyof ReturnType<typeof this.luzConsumption>, value: number) {
    if (!this.authService.canConfigureBill()) return;
    this.luzConsumption.update(current => ({ ...current, [field]: value }));
  }

  getUnit() {
    switch (this.utilityType()) {
      case 'luz': return 'kWh';
      case 'agua': return 'm³';
      case 'gas': return 'm³';
    }
  }

  totalBillAmount = computed(() => {
    return this.currentCostItems().reduce((acc, item) => acc + (item.value || 0), 0);
  });

  totalConsumption = computed(() => {
    if (this.utilityType() === 'luz') {
      const c = this.luzConsumption();
      return (c.bss1 || 0) + (c.bss2 || 0) + (c.bss3 || 0) + (c.bss4 || 0);
    }
    if (this.utilityType() === 'agua') return this.aguaTotalReading();
    if (this.utilityType() === 'gas') return this.gasTotalReading();
    return 0;
  });

  calculatedUnitPrice = computed(() => {
    return this.apportionmentEngine.calculateUnitPrice(this.totalBillAmount(), this.totalConsumption());
  });

  // Histórico de consumo e baseline de anomalias (inclui média histórica e conferência de meses zerados)
  historicalStats = computed<Map<string, { avgConsumption: number; count: number; prevMonthZero: boolean }>>(() => {
    const allData = this.historyService.getAllData();
    const type = this.utilityType();
    const currentMonth = this.selectedMonth();
    const prevMonth = this.getPreviousMonth(currentMonth);

    const prevBill = allData[`${type}_${prevMonth}`];
    const map = new Map<string, { total: number; count: number }>();

    Object.entries(allData).forEach(([key, bill]) => {
      const parts = key.split('_');
      if (parts.length === 2) {
        const [bType, bMonth] = parts;
        if (bType === type && bMonth && bMonth !== currentMonth && bill.readings) {
          Object.entries(bill.readings).forEach(([storeId, r]) => {
            let cons = 0;
            if (typeof r === 'object' && r !== null) {
              cons = (r as any).calculatedConsumption ?? (r as any).consumption ?? 0;
            } else if (typeof r === 'number') {
              cons = r;
            }
            if (cons > 0) {
              const curr = map.get(storeId) || { total: 0, count: 0 };
              curr.total += cons;
              curr.count += 1;
              map.set(storeId, curr);
            }
          });
        }
      }
    });

    const result = new Map<string, { avgConsumption: number; count: number; prevMonthZero: boolean }>();
    this.activeStores().forEach(store => {
      const hist = map.get(store.id);
      let isPrevZero = false;

      let r: any = undefined;
      if (prevBill && prevBill.readings) {
        if (prevBill.readings[store.id] !== undefined) {
          r = prevBill.readings[store.id];
        } else if (store.luc) {
          const normLuc = normalizeLuc(store.luc);
          const normContrato = store.contrato ? normalizeContract(store.contrato) : '';
          const allStores = this.storeService.stores();
          const matchStore = allStores.find(s => s.id !== store.id && (
            (s.luc && normalizeLuc(s.luc) === normLuc) ||
            (normContrato && s.contrato && normalizeContract(s.contrato) === normContrato)
          ));
          if (matchStore && prevBill.readings[matchStore.id] !== undefined) {
            r = prevBill.readings[matchStore.id];
          }
        }
      }
      if (r !== undefined) {
        const pCons = typeof r === 'object' && r !== null ? ((r as any).calculatedConsumption ?? (r as any).consumption ?? 0) : (typeof r === 'number' ? r : 0);
        isPrevZero = pCons === 0;
      }

      result.set(store.id, {
        avgConsumption: hist && hist.count > 0 ? hist.total / hist.count : 0,
        count: hist ? hist.count : 0,
        prevMonthZero: isPrevZero
      });
    });

    return result;
  });

  historicalAverages = computed(() => this.historicalStats());

  // --- MOTOR DE APRENDIZADO DE CONSUMO ZERO RECORRENTE (FACILITADOR DO TÉCNICO) ---
  zeroConsumptionLearning = computed(() => {
    const allData = this.historyService.getAllData();
    const type = this.utilityType();
    const currentMonth = this.selectedMonth();
    
    // Identifica todos os meses passados que possuem faturas salvas desta utilidade e que sejam anteriores a currentMonth
    const pastMonths: string[] = [];
    const prefix = `${type}_`;
    for (const key of Object.keys(allData)) {
      if (key.startsWith(prefix)) {
        const m = key.substring(prefix.length);
        if (m && /^\d{4}-\d{2}$/.test(m) && m < currentMonth) {
          pastMonths.push(m);
        }
      }
    }
    // Garante que o mês imediatamente anterior cronológico esteja incluído se possível
    const prevMonth = this.getPreviousMonth(currentMonth);
    if (!pastMonths.includes(prevMonth)) {
      pastMonths.push(prevMonth);
    }
    // Ordena do mais recente para o mais antigo: ex: ['2026-10', '2026-09', '2026-08', ...]
    pastMonths.sort().reverse();

    const allStores = this.storeService.stores();
    const map = new Map<string, {
      isFrequentZero: boolean;
      consecutiveZeroMonths: number;
      totalZeroMonths: number;
      lastNote: string;
      learnedReason: string;
      pastZeroMonthsList: string[];
    }>();

    for (const store of this.activeStores()) {
      const normLuc = store.luc ? normalizeLuc(store.luc) : '';
      const normContrato = store.contrato ? normalizeContract(store.contrato) : '';
      const normName = store.name ? normalizeStoreName(store.name) : '';

      let consecutiveZero = 0;
      let totalZero = 0;
      let streakBroken = false;
      let lastNote = '';
      const pastZeroMonthsList: string[] = [];

      for (const m of pastMonths) {
        const bill = allData[`${prefix}${m}`];
        if (!bill || !bill.readings) continue;

        // Procura leitura da loja pelo storeId ou fallback por LUC / Contrato / Nome
        let r: any = bill.readings[store.id];
        if (r === undefined && (normLuc || normContrato || normName)) {
          const matchStore = allStores.find(s => s.id !== store.id && (
            (normLuc && s.luc && normalizeLuc(s.luc) === normLuc) ||
            (normContrato && s.contrato && normalizeContract(s.contrato) === normContrato) ||
            (normName && s.name && normalizeStoreName(s.name) === normName)
          ));
          if (matchStore && bill.readings[matchStore.id] !== undefined) {
            r = bill.readings[matchStore.id];
          }
        }

        if (r !== undefined) {
          let cons = 0;
          let note = '';
          if (typeof r === 'object' && r !== null) {
            cons = (r as any).calculatedConsumption ?? (r as any).consumption ?? 0;
            note = (r as any).note || '';
          } else if (typeof r === 'number') {
            cons = r;
          }

          const hasZeroConsumption = (cons === 0);
          const hasZeroKeyword = !!note && (
            note.toLowerCase().includes('fechad') ||
            note.toLowerCase().includes('vaga') ||
            note.toLowerCase().includes('reforma') ||
            note.toLowerCase().includes('sem consumo') ||
            note.toLowerCase().includes('inativ') ||
            note.toLowerCase().includes('desocupad')
          );

          if (hasZeroConsumption || hasZeroKeyword) {
            totalZero++;
            pastZeroMonthsList.push(m);
            if (!streakBroken) {
              consecutiveZero++;
            }
            if (!lastNote && note) {
              lastNote = note;
            }
          } else {
            streakBroken = true;
          }
        }
      }

      // Determina motivo sugerido com base no histórico aprendido
      let learnedReason = 'Loja Fechada / Vaga';
      const lowerNote = lastNote.toLowerCase();
      if (lowerNote.includes('reforma') || lowerNote.includes('obra')) {
        learnedReason = 'Em Reforma / Obra';
      } else if (lowerNote.includes('inacess') || lowerNote.includes('trancad')) {
        learnedReason = 'Medidor Inacessível';
      } else if (lowerNote.includes('sem hidr') || lowerNote.includes('sem ponto') || lowerNote.includes('inativ')) {
        learnedReason = 'Sem Ponto / Inativo';
      } else if (consecutiveZero >= 2) {
        learnedReason = 'Loja Fechada / Vaga';
      } else {
        learnedReason = 'Sem Consumo no Mês';
      }

      const isFrequentZero = (consecutiveZero >= 2) || (totalZero >= 2 && consecutiveZero >= 1);

      map.set(store.id, {
        isFrequentZero,
        consecutiveZeroMonths: consecutiveZero,
        totalZeroMonths: totalZero,
        lastNote,
        learnedReason,
        pastZeroMonthsList
      });
    }

    return map;
  });

  // --- TABLE DATA CALCULATION ---
  tableData = computed(() => {
    const stores = this.activeStores();
    const price = this.calculatedUnitPrice();
    const type = this.utilityType();
    const unit = type === 'luz' ? 'kWh' : 'm³';

    const readingsStore = this.readings();
    const prevReadings = this.previousReadings();
    const histAvgMap = this.historicalStats();
    const zeroLearningMap = this.zeroConsumptionLearning();

    // Se for Gás, pré-calculamos a soma bruta do consumo medido em campo para todas as lojas
    let totalRawGas = 0;
    if (type === 'gas') {
      const storeMap = readingsStore[type] as Map<string, StoreReading>;
      stores.forEach(s => {
        const d = storeMap.get(s.id) || this.createDefaultReading();
        const p = prevReadings.get(s.id) || { reading: 0, consumption: 0 };
        const hasVirtual = d.virtual !== undefined && d.virtual !== null && !isNaN(Number(d.virtual));
        if (hasVirtual) {
          totalRawGas += Number(d.virtual);
        } else {
          let diff = (d.reading || 0) - (p.reading || 0);
          if (d.isRollover && (d.reading || 0) < (p.reading || 0) && (p.reading || 0) > 0) {
            const digitsBase = (p.reading || 0) > 10000 ? 100000 : ((p.reading || 0) > 1000 ? 10000 : 1000);
            diff = (digitsBase - (p.reading || 0)) + (d.reading || 0);
          } else if (diff < 0) {
            diff = 0;
          }
          const adjNum = Number(d.adjustment);
          const adj = (!isNaN(adjNum) && adjNum > 0) ? adjNum : 1.347;
          const fcmNum = Number(d.fcm);
          const mfcm = (!isNaN(fcmNum) && fcmNum > 0) ? fcmNum : 1.0727;
          totalRawGas += (diff * adj) * mfcm;
        }
      });
    }

    const gasConcessionaria = this.gasTotalReading() || 0;
    const isGasAuto = this.gasAutoDistribute();
    const gasFactor = (type === 'gas' && isGasAuto && gasConcessionaria > 0 && totalRawGas > 0)
      ? (gasConcessionaria / totalRawGas)
      : 1.0;

    return stores.map(store => {
      let consumption = 0;
      let rawConsumption = 0;
      let cost = 0;

      let prevReading = 0;
      let currentReading = 0;
      let constant = 1;
      let virtual: number | undefined = undefined;
      let adjustment = 1;
      let variation = 0;
      let adjustmentAdd = 0;
      let fcm = 1;
      let fluxoCost = 0;

      const storeMap = readingsStore[type] as Map<string, StoreReading>;
      const data = storeMap.get(store.id) || this.createDefaultReading();
      const normLuc = store.luc ? normalizeLuc(store.luc) : '';
      const normContrato = store.contrato ? normalizeContract(store.contrato) : '';
      const normName = store.name ? normalizeStoreName(store.name) : '';
      const prevData = prevReadings.get(store.id) 
        || (normLuc && normContrato ? prevReadings.get(`luc_contrato:${normLuc}_${normContrato}`) : undefined)
        || (normLuc && normName ? prevReadings.get(`luc_name:${normLuc}_${normName}`) : undefined)
        || (normLuc ? prevReadings.get(`luc:${normLuc}`) : undefined) 
        || (normContrato ? prevReadings.get(`contrato:${normContrato}`) : undefined)
        || (normName ? prevReadings.get(`name:${normName}`) : undefined)
        || { reading: 0, consumption: 0 };

      currentReading = data.reading;
      prevReading = prevData.reading;
      const prevConsumption = prevData.consumption || 0;
      const prevCost = (prevData as any).cost || 0;
      const prevReadingMonth = (prevData as any).month || null;
      const constNum = Number(data.constant);
      constant = (!isNaN(constNum) && constNum > 0) ? constNum : 1;
      if (data.virtual !== undefined && data.virtual !== null && !isNaN(Number(data.virtual))) {
        virtual = Number(data.virtual);
      }
      const isConfirmed = !!data.anomalyConfirmed;
      const isRollover = !!data.isRollover;

      if (type === 'gas') {
        const adjNum = Number(data.adjustment);
        adjustment = (!isNaN(adjNum) && adjNum > 0) ? adjNum : 1.347;
        adjustmentAdd = Number(data.adjustmentAdd) || 0;
        const fcmNum = Number(data.fcm);
        fcm = (!isNaN(fcmNum) && fcmNum > 0) ? fcmNum : 1.0727;
        fluxoCost = Number(data.fluxoCost) || 0;
      } else {
        const adjNum = Number(data.adjustment);
        adjustment = (!isNaN(adjNum) && adjNum > 0) ? adjNum : 1;
      }

      // CALCULATION LOGIC: Medição bruta de campo (com suporte a virada de relógio)
      // Se virtual estiver preenchido (inclusive 0), usa como override. Caso vazio, calcula pela leitura normal.
      if (virtual !== undefined) {
        rawConsumption = virtual;
      } else {
        let diff = currentReading - prevReading;
        if (isRollover && currentReading < prevReading && prevReading > 0) {
          const digitsBase = prevReading > 10000 ? 100000 : (prevReading > 1000 ? 10000 : 1000);
          diff = (digitsBase - prevReading) + currentReading;
        } else if (diff < 0) {
          diff = 0;
        }

        if (type === 'gas') {
          const initial = diff * adjustment;
          rawConsumption = initial * fcm;
        } else {
          rawConsumption = diff * constant * adjustment;
        }
      }

      // Distribuição Proporcional Automática no Gás (100% Rateável)
      if (type === 'gas' && isGasAuto && gasConcessionaria > 0 && totalRawGas > 0) {
        consumption = rawConsumption * gasFactor;
      } else {
        consumption = rawConsumption;
      }

      if (prevData.consumption > 0) {
        variation = ((consumption - prevData.consumption) / prevData.consumption) * 100;
      }

      let rawCost = consumption * price;

      if (type === 'gas') {
        rawCost += fluxoCost + adjustmentAdd;
      }

      const excludedFromBill = !!data.excludedFromBill;
      cost = excludedFromBill ? 0 : rawCost;

      const note = data.note || '';
      const photoRec = this.meterPhotos()[store.id];
      const hasPhoto = !!data.hasPhoto || !!photoRec;
      const photoTimestamp = data.photoTimestamp || photoRec?.capturedAt || '';
      const isRead = currentReading > 0;
      const readingDiff = isRead ? (currentReading - prevReading) : 0;

      const isJustified = !!data.isJustified || (!!note && note.includes('[JUSTIFICADO]'));
      const justificationReason = data.justificationReason || (note && note.includes('[JUSTIFICADO]') ? note.replace('[JUSTIFICADO]', '').trim() : '');
      const learnedZero = zeroLearningMap.get(store.id);
      const isFrequentZero = !!learnedZero?.isFrequentZero;
      const consecutiveZeroMonths = learnedZero?.consecutiveZeroMonths || 0;
      const learnedReason = learnedZero?.learnedReason || 'Loja Fechada / Vaga';

      // --- MOTOR DE AUDITORIA INTELIGENTE & ANTI-ERRO (ETAPA 1) ---
      const histData = histAvgMap.get(store.id);
      const avgCons = histData && histData.avgConsumption > 0 ? histData.avgConsumption : (prevData.consumption > 0 ? prevData.consumption : 0);

      // 1. Alerta Crítico: Leitura menor que a anterior (sem marcação de virada de medidor)
      const isNegative = isRead && prevReading > 0 && currentReading < prevReading && !isRollover;

      // 2. Alerta de Suspeita de Vazamento / Salto Abrupto (>= 3x a média histórica da loja)
      const is3xJump = isRead && !isNegative && (
        (avgCons > 0 && consumption >= avgCons * 3 && consumption >= 12) ||
        (prevData.consumption > 0 && consumption >= prevData.consumption * 3 && consumption >= 12)
      );

      // 3. Alerta de Suspeita de Zero a Mais / Salto Extremo (>= 5x da média)
      const isExtremeJump = isRead && !isNegative && (
        (avgCons > 0 && consumption >= avgCons * 5 && consumption >= 25) ||
        (prevData.consumption > 0 && consumption >= prevData.consumption * 5 && consumption >= 25)
      );

      // 4. Alerta de Relógio Parado por 2 meses seguidos (loja ativa com 0 no mês anterior E agora)
      const is2MonthsZero = isRead && store.active !== false && prevReading > 0 && (currentReading === prevReading || consumption === 0) && (histData?.prevMonthZero === true);

      // 5. Alerta de Consumo Zero no mês atual (loja ativa)
      const isZeroThisMonth = isRead && store.active !== false && prevReading > 0 && (currentReading === prevReading || consumption === 0) && !is2MonthsZero;

      // 6. Alerta de Dígitos a Mais: leitura com mais dígitos que a anterior sem ser uma virada natural
      // (ex.: 1510 -> 15100). Cobre lojas sem histórico, onde o alerta de salto não dispara.
      const intDigits = (n: number) => Math.floor(Math.abs(n)).toString().length;
      const isDigitsMismatch = isRead && !isNegative && !isRollover && virtual === undefined &&
        prevReading >= 100 && intDigits(currentReading) > intDigits(prevReading) &&
        currentReading > prevReading * 2 && !isExtremeJump;

      const hasSuspiciousAlert = isNegative || is3xJump || isExtremeJump || isDigitsMismatch || is2MonthsZero || isZeroThisMonth;

      const alertSeverity: 'none' | 'warning' | 'critical' =
        isConfirmed ? 'none' : ((isNegative || isExtremeJump) ? 'critical' : ((is3xJump || isDigitsMismatch || is2MonthsZero || isZeroThisMonth) ? 'warning' : 'none'));

      let alertType: 'none' | 'negative' | 'leak_suspect' | 'typo_extreme' | 'digits_mismatch' | 'zero_2months' | 'zero_month' = 'none';
      let alertBadge = '';
      let alertTitle = '';
      let alertMessage = '';

      if (isNegative) {
        alertType = 'negative';
        alertBadge = isConfirmed ? '✓ Leitura Menor Auditada' : '🚨 Leitura Menor';
        alertTitle = '🚨 Leitura Menor que a Anterior';
        const diffVal = Math.abs(currentReading - prevReading);
        alertMessage = `A leitura digitada (${currentReading}) é menor que a anterior (${prevReading}). Diferença: -${diffVal.toFixed(1)} ${unit}. Verifique se houve virada física de medidor ou erro na digitação dos dígitos.`;
      } else if (isExtremeJump) {
        alertType = 'typo_extreme';
        alertBadge = isConfirmed ? '✓ Salto Auditado' : '🚨 Zero a Mais?';
        alertTitle = '🚨 Suspeita de Zero a Mais (Salto Extremo)';
        const mult = avgCons > 0 ? (consumption / avgCons).toFixed(1) : (consumption / prevData.consumption).toFixed(1);
        alertMessage = `Atenção: Consumo desta loja deu ${consumption.toFixed(1)} ${unit} (a média é ${avgCons.toFixed(1)} ${unit}, salto de ${mult}x). Confira no visor do relógio se não digitou um zero extra no final!`;
      } else if (is3xJump) {
        alertType = 'leak_suspect';
        alertBadge = isConfirmed ? '✓ Salto Auditado' : '⚠️ Salto >3x (Vazamento?)';
        alertTitle = '⚠️ Suspeita de Vazamento / Salto Abrupto (>3x Média)';
        alertMessage = `Atenção: Consumo desta loja deu ${consumption.toFixed(1)} ${unit} (a média histórica é ${avgCons.toFixed(1)} ${unit}). Deseja confirmar ou conferir o relógio no local?`;
      } else if (isDigitsMismatch) {
        alertType = 'digits_mismatch';
        alertBadge = isConfirmed ? '✓ Dígitos Auditados' : '🔢 Dígito a Mais?';
        alertTitle = '🔢 Leitura com Mais Dígitos que a Anterior';
        alertMessage = `A leitura (${currentReading}) tem ${intDigits(currentReading)} dígitos e a anterior (${prevReading}) tinha ${intDigits(prevReading)}. Confira no visor se não foi lido um dígito a mais (ex.: casa decimal ou roleta vermelha).`;
      } else if (is2MonthsZero) {
        alertType = 'zero_2months';
        alertBadge = isConfirmed ? '✓ Relógio Checado' : '⏱️ Relógio Parado (2m Zerado)';
        alertTitle = '⏱️ Suspeita de Relógio Parado (2 Meses Seguidos Zerado)';
        alertMessage = `Atenção: Esta loja ativa está com consumo 0 pelo segundo mês consecutivo (Leitura anterior: ${prevReading}, Leitura atual: ${currentReading}). Verifique no local se o hidrômetro/relógio está travado ou desligado.`;
      } else if (isZeroThisMonth) {
        alertType = 'zero_month';
        alertBadge = isConfirmed ? '✓ Consumo 0 Auditado' : '⚠️ Consumo Zero';
        alertTitle = '⚠️ Consumo Zero em Loja Ativa';
        alertMessage = `A loja está ativa, mas a leitura digitada (${currentReading}) é idêntica à anterior (${prevReading}), gerando consumo 0 ${unit}. Verifique se o medidor operou no período.`;
      } else if (isConfirmed) {
        alertBadge = '✅ Auditado em Campo';
      }

      const validationAlert = {
        hasAlert: hasSuspiciousAlert,
        type: alertType,
        severity: alertSeverity,
        badgeLabel: alertBadge,
        title: alertTitle,
        message: alertMessage,
        avgConsumption: avgCons,
        prevConsumption: prevData.consumption,
        prevReading,
        currentReading,
        consumption,
        diffPct: avgCons > 0 ? Math.round(((consumption - avgCons) / avgCons) * 100) : null
      };

      return {
        storeId: store.id,
        luc: store.luc,
        contrato: store.contrato || '',
        storeName: store.name,
        routeOrder: store.routeOrder,
        meterNumber: store.meterNumber || '',
        active: store.active !== false,
        consumption,
        rawConsumption,
        gasFactor,
        isGasDistributed: type === 'gas' && isGasAuto && gasConcessionaria > 0 && totalRawGas > 0 && Math.abs(gasFactor - 1) > 0.0001,
        cost,
        originalCost: rawCost,
        excludedFromBill,
        prevReading,
        prevConsumption,
        prevCost,
        prevReadingMonth,
        currentReading,
        constant,
        virtual,
        adjustment,
        adjustmentAdd,
        fcm,
        fluxoCost,
        variation,
        note,
        hasPhoto,
        photoTimestamp,
        isRead,
        isJustified,
        justificationReason,
        isFrequentZero,
        consecutiveZeroMonths,
        learnedReason,
        isNegative,
        isZeroActive: isZeroThisMonth || is2MonthsZero,
        isHugeTypoJump: isExtremeJump,
        isAtypicalJump: is3xJump,
        hasSuspiciousAlert: hasSuspiciousAlert && !isConfirmed,
        anomalyConfirmed: isConfirmed,
        isRollover,
        alertSeverity,
        validationAlert,
        readingDiff
      };
    }).sort((a, b) => {
      const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
      const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.luc.localeCompare(b.luc, undefined, { numeric: true });
    });
  });

  // --- GAS DISTRIBUTION SUMMARY & BALANCING STATS ---
  gasDistributionStats = computed(() => {
    if (this.utilityType() !== 'gas') return null;
    const concessionaria = this.gasTotalReading() || 0;
    const table = this.tableData();
    const rawTotal = table.reduce((acc, item) => acc + (item.rawConsumption !== undefined ? item.rawConsumption : item.consumption), 0);
    const distributedTotal = table.reduce((acc, item) => acc + item.consumption, 0);
    const diffM3 = concessionaria - rawTotal;
    const diffPct = rawTotal > 0 ? ((concessionaria - rawTotal) / rawTotal) * 100 : 0;
    const factor = (concessionaria > 0 && rawTotal > 0) ? (concessionaria / rawTotal) : 1.0;
    const isEnabled = this.gasAutoDistribute();
    const totalBill = this.totalBillAmount();
    const totalDistributedCost = this.totalDistributedCost();
    const costDiff = totalBill - totalDistributedCost;

    return {
      concessionaria,
      rawTotal,
      distributedTotal,
      diffM3,
      diffPct,
      factor,
      isEnabled,
      isBalanced: Math.abs(concessionaria - distributedTotal) < 0.01 && concessionaria > 0,
      totalBill,
      totalDistributedCost,
      costDiff
    };
  });

  // --- FIELD COMPUTED FILTERS & STATS ---
  fieldStats = computed(() => {
    const list = this.tableData();
    const total = list.length;
    const completed = list.filter(item => item.isRead).length;
    const pending = total - completed;
    const alerts = list.filter(item => item.hasSuspiciousAlert).length;
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, alerts, progressPct };
  });

  // --- PREVIOUS MONTH CONTINUITY AUDIT COMPUTED (CONFERÊNCIA DE LEITURAS HISTÓRICAS) ---
  prevMonthAudit = computed(() => {
    const list = this.tableData();
    // Lojas presentes na tabela deste mês que tinham leitura ou consumo no mês anterior
    const measuredLastMonth = list.filter(item => 
      (item.prevReading > 0 || item.prevConsumption > 0 || (item.prevCost && item.prevCost > 0)) &&
      !item.excludedFromBill
    );
    
    // Uma loja é considerada pendente se não foi lida e NÃO foi justificada pelo técnico
    const pendingStores = measuredLastMonth.filter(item => !item.isRead && !item.isJustified);
    const completedStores = measuredLastMonth.filter(item => item.isRead || item.isJustified);

    // Ordenação estrita pela rota física de caminhada do shopping (routeOrder)
    const sortByRoute = (a: any, b: any) => {
      const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
      const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.luc || '').localeCompare(b.luc || '', undefined, { numeric: true });
    };
    pendingStores.sort(sortByRoute);
    completedStores.sort(sortByRoute);

    // Lojas pendentes que têm histórico de consumo zero aprendido
    const frequentZeroPending = pendingStores.filter(item => item.isFrequentZero);

    const totalCount = measuredLastMonth.length;
    const pendingCount = pendingStores.length;
    const completedCount = completedStores.length;
    const isAllDone = totalCount > 0 && pendingCount === 0;

    return {
      totalCount,
      pendingCount,
      completedCount,
      pendingStores,
      completedStores,
      frequentZeroPending,
      isAllDone,
      hasPreviousData: totalCount > 0
    };
  });

  // --- MONTH CLOSING & AUDIT CHECKLIST COMPUTED (PASSO 3) ---
  closingChecklist = computed(() => {
    const list = this.tableData();
    const totalStores = list.length;
    const readStores = list.filter(item => item.isRead || item.isJustified).length;
    const pendingStores = totalStores - readStores;
    const isComplete = totalStores > 0 && pendingStores === 0;

    // 2. Inconsistências / Alertas não auditados
    const uninspectedAnomalies = list.filter(item => item.validationAlert.hasAlert && !item.anomalyConfirmed && item.isRead);
    const hasZeroAnomalies = uninspectedAnomalies.length === 0;

    // 3. Auditoria de Continuidade vs Mês Anterior (Conferência de Lojas Esquecidas)
    const prevAudit = this.prevMonthAudit();
    const prevMonthPending = prevAudit.pendingCount;
    const isContinuityComplete = prevAudit.hasPreviousData ? (prevMonthPending === 0) : true;

    // 4. Conciliação com Concessionária & Balanço Financeiro
    const type = this.utilityType();
    const billAmount = this.totalBillAmount() || 0;
    const distributed = this.totalDistributedCost() || 0;
    const excludedCost = this.excludedSapCost() || 0;
    const acCost = this.airConditioningCost() || 0;
    const commonArea = this.commonAreaCost() || 0;
    const totalReconciled = distributed + excludedCost + acCost + commonArea;
    const diffFinancial = Math.abs(totalReconciled - billAmount);
    // Tolerância de até R$ 0.50 para centavos de arredondamento fiscal
    const isReconciled = billAmount > 0 ? (diffFinancial <= 0.50) : true;

    // Dados específicos para gás
    const gasConcessionaria = this.gasTotalReading() || 0;
    const isGasAuto = this.gasAutoDistribute();
    const totalRawGas = list.reduce((acc, row) => acc + (row.rawConsumption || 0), 0);
    const gasDiff = Math.abs(gasConcessionaria - totalRawGas);

    const isLocked = this.isLocked();
    const canFreeze = isComplete && hasZeroAnomalies && isContinuityComplete;
    const allPassed = isComplete && hasZeroAnomalies && isContinuityComplete && isReconciled && isLocked;

    return {
      readings: {
        passed: isComplete,
        totalStores,
        readStores,
        pendingStores,
        pendingList: list.filter(i => !i.isRead && !i.isJustified).map(i => ({ id: i.storeId, luc: i.luc, name: i.storeName, routeOrder: i.routeOrder }))
      },
      continuity: {
        passed: isContinuityComplete,
        totalCount: prevAudit.totalCount,
        completedCount: prevAudit.completedCount,
        pendingCount: prevMonthPending,
        hasPreviousData: prevAudit.hasPreviousData,
        pendingStores: prevAudit.pendingStores,
        frequentZeroPending: prevAudit.frequentZeroPending
      },
      anomalies: {
        passed: hasZeroAnomalies,
        uninspectedCount: uninspectedAnomalies.length,
        uninspectedList: uninspectedAnomalies.map(i => ({
          id: i.storeId,
          luc: i.luc,
          name: i.storeName,
          type: i.validationAlert.type,
          badge: i.validationAlert.badgeLabel,
          currentReading: i.currentReading,
          prevReading: i.prevReading,
          consumption: i.consumption,
          avgConsumption: i.validationAlert.avgConsumption
        }))
      },
      reconciliation: {
        passed: isReconciled,
        billAmount,
        totalReconciled,
        diffFinancial,
        isGasAuto,
        gasConcessionaria,
        totalRawGas,
        gasDiff
      },
      lock: {
        passed: isLocked,
        lockedAt: this.lockedAt(),
        lockedBy: this.lockedBy()
      },
      canFreeze,
      allPassed
    };
  });

  filteredTableData = computed(() => {
    let list = this.tableData();
    const filter = this.statusFilter();
    const q = this.searchQuery().trim().toLowerCase();
    const sortCol = this.sortBy();
    const sortDir = this.sortDirection();

    if (filter === 'pending') {
      list = list.filter(item => !item.isRead && !item.isJustified);
    } else if (filter === 'completed') {
      list = list.filter(item => item.isRead || item.isJustified);
    } else if (filter === 'alert') {
      list = list.filter(item => item.hasSuspiciousAlert);
    } else if (filter === 'prev_missing') {
      list = list.filter(item => 
        (item.prevReading > 0 || item.prevConsumption > 0 || (item.prevCost && item.prevCost > 0)) &&
        !item.isRead &&
        !item.isJustified &&
        !item.excludedFromBill
      );
    }

    if (q) {
      list = list.filter(item =>
        item.storeName.toLowerCase().includes(q) ||
        item.luc.toLowerCase().includes(q) ||
        (item.contrato && item.contrato.toLowerCase().includes(q))
      );
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      let diff = 0;
      switch (sortCol) {
        case 'route': {
          const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
          const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
          diff = orderA - orderB;
          break;
        }
        case 'luc':
          diff = a.luc.localeCompare(b.luc, undefined, { numeric: true });
          break;
        case 'name':
        case 'storeName':
          diff = a.storeName.localeCompare(b.storeName);
          break;
        case 'prevReading':
          diff = (a.prevReading || 0) - (b.prevReading || 0);
          break;
        case 'prevConsumption':
          diff = (a.prevConsumption || 0) - (b.prevConsumption || 0);
          break;
        case 'prevCost':
          diff = (a.prevCost || 0) - (b.prevCost || 0);
          break;
        case 'currentReading':
        case 'reading':
          diff = (a.currentReading || 0) - (b.currentReading || 0);
          break;
        case 'constant':
          diff = (a.constant || 1) - (b.constant || 1);
          break;
        case 'virtual':
          diff = (a.virtual ?? 0) - (b.virtual ?? 0);
          break;
        case 'adjustment':
          diff = (a.adjustment ?? 0) - (b.adjustment ?? 0);
          break;
        case 'adjustmentAdd':
          diff = (a.adjustmentAdd ?? 0) - (b.adjustmentAdd ?? 0);
          break;
        case 'fcm':
          diff = (a.fcm ?? 0) - (b.fcm ?? 0);
          break;
        case 'consumption':
          diff = (a.consumption || 0) - (b.consumption || 0);
          break;
        case 'variation':
          diff = (a.variation || 0) - (b.variation || 0);
          break;
        case 'fluxoCost':
          diff = (a.fluxoCost || 0) - (b.fluxoCost || 0);
          break;
        case 'note':
          diff = (a.note || '').localeCompare(b.note || '');
          break;
        case 'hasPhoto':
        case 'photo':
          diff = (a.hasPhoto ? 1 : 0) - (b.hasPhoto ? 1 : 0);
          break;
        case 'cost':
          diff = (a.cost || 0) - (b.cost || 0);
          break;
        default: {
          const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
          const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
          diff = orderA - orderB;
          break;
        }
      }

      if (diff !== 0) {
        return sortDir === 'asc' ? diff : -diff;
      }

      // Tiebreaker determinístico para evitar instabilidade na visualização
      const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
      const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.luc.localeCompare(b.luc, undefined, { numeric: true });
    });

    return sorted;
  });

  toggleSort(col: string) {
    const isCurrent = this.sortBy() === col || (col === 'storeName' && this.sortBy() === 'name');
    if (isCurrent) {
      this.sortDirection.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortBy.set(col);
      // Colunas numéricas e de custos começam em ordem decrescente (maior para o menor)
      const descFirstCols = [
        'consumption', 'cost', 'prevCost', 'currentReading', 'prevReading', 'prevConsumption',
        'variation', 'fluxoCost', 'adjustmentAdd', 'virtual', 'hasPhoto'
      ];
      if (descFirstCols.includes(col)) {
        this.sortDirection.set('desc');
      } else {
        this.sortDirection.set('asc');
      }
    }
  }

  setQuickSort(col: 'route' | 'luc' | 'name') {
    if (this.sortBy() === col || (col === 'name' && this.sortBy() === 'storeName')) {
      this.sortDirection.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortBy.set(col);
      this.sortDirection.set('asc');
    }
  }

  currentStepStore = computed(() => {
    const list = this.tableData();
    if (list.length === 0) return null;
    const idx = Math.min(Math.max(0, this.stepIndex()), list.length - 1);
    return list[idx];
  });

  nextStepStore = computed(() => {
    const list = this.tableData();
    const curr = this.stepIndex();
    if (curr < list.length - 1) {
      return list[curr + 1];
    }
    return null;
  });

  stepReadCount = computed(() => {
    return this.tableData().filter(s => s.isRead).length;
  });

  stepProgressPercent = computed(() => {
    const total = this.tableData().length;
    if (total === 0) return 0;
    return Math.round((this.stepReadCount() / total) * 100);
  });

  quickAdjustReading(stepStore: any, delta: number) {
    if (!this.canEdit() || !stepStore) return;
    const current = Number(stepStore.currentReading) || 0;
    const nextVal = Math.max(0, parseFloat((current + delta).toFixed(4)));
    this.updateDetailedReading(stepStore.storeId, 'reading', nextVal);
    this.onReadingBlur(stepStore.storeId);
  }

  copyPreviousReading(stepStore: any) {
    if (!this.canEdit() || !stepStore) return;
    const prev = Number(stepStore.prevReading) || 0;
    this.updateDetailedReading(stepStore.storeId, 'reading', prev);
    this.onReadingBlur(stepStore.storeId);
    this.indexedDb.showToast(`🔁 Leitura anterior replicada (${prev}): Consumo 0`);
  }

  // Step Navigation Helpers (Modo Foco em Campo)
  nextStep() {
    const total = this.tableData().length;
    if (this.stepIndex() < total - 1) {
      this.stepIndex.update(i => i + 1);
    }
  }

  saveAndNextStep(stepStore: any) {
    if (!stepStore) return;

    // Se houver anomalia crítica não auditada pelo técnico na leitura digitada,
    // aciona o modal de auditoria para confirmação antes de avançar para a próxima loja
    if (stepStore.validationAlert.hasAlert && !stepStore.anomalyConfirmed && stepStore.isRead) {
      this.openAnomalyModal(stepStore);
      return;
    }

    // Salva a medição no banco/offline
    this.internalSave();
    this.indexedDb.showToast(`✓ Salvo: ${stepStore.luc} - ${stepStore.storeName}`);

    const list = this.tableData();
    const curr = this.stepIndex();
    if (curr < list.length - 1) {
      this.stepIndex.set(curr + 1);
    } else {
      // Chegou ao fim da rota: verifica se há alguma loja pendente para trás
      const pendingIdx = list.findIndex(item => !item.isRead);
      if (pendingIdx !== -1) {
        this.stepIndex.set(pendingIdx);
        this.indexedDb.showToast(`🏁 Fim da rota! Saltando para pendente: ${list[pendingIdx].luc}`);
      } else {
        this.indexedDb.showToast('🎉 Parabéns! Todas as lojas da rota foram lidas!');
      }
    }
  }

  prevStep() {
    if (this.stepIndex() > 0) {
      this.stepIndex.update(i => i - 1);
    }
  }

  jumpToNextPending() {
    const list = this.tableData();
    const current = this.stepIndex();
    // Search ahead
    const nextIdx = list.findIndex((item, idx) => idx > current && !item.isRead);
    if (nextIdx !== -1) {
      this.stepIndex.set(nextIdx);
      return;
    }
    // Search from start
    const wrapIdx = list.findIndex(item => !item.isRead);
    if (wrapIdx !== -1) {
      this.stepIndex.set(wrapIdx);
    }
  }

  setStepIndex(idx: number) {
    this.stepIndex.set(idx);
  }

  // --- PREVIOUS MONTH CONTINUITY AUDIT HELPERS ---
  togglePrevMissingFilter() {
    if (this.statusFilter() === 'prev_missing') {
      this.statusFilter.set('all');
    } else {
      this.statusFilter.set('prev_missing');
      this.sortBy.set('route');
      this.sortDirection.set('asc');
      this.mobileViewMode.set('cards');
    }
  }

  filterByPrevMissingAndClose() {
    this.statusFilter.set('prev_missing');
    this.sortBy.set('route');
    this.sortDirection.set('asc');
    this.mobileViewMode.set('cards');
    this.showPrevMonthAuditModal.set(false);
  }

  jumpToStoreFromAudit(storeId: string) {
    this.showPrevMonthAuditModal.set(false);
    this.mobileViewMode.set('cards');
    if (this.statusFilter() === 'completed') {
      this.statusFilter.set('all');
    }
    setTimeout(() => {
      const el = document.getElementById('store-row-' + storeId) || document.getElementById('store-card-' + storeId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = (document.getElementById('reading-input-' + storeId) || 
                       document.getElementById('reading-card-input-' + storeId) || 
                       el.querySelector('input[type="number"]')) as HTMLInputElement | null;
        if (input) {
          input.focus();
          input.select();
        }
      }
    }, 150);
  }

  // --- QUICK JUSTIFICATION & ZERO-CONSUMPTION LEARNING METHODS ---
  openQuickJustifyModal(store: any) {
    this.activeJustifyStore.set(store);
    this.showQuickJustifyModal.set(true);
  }

  closeQuickJustifyModal() {
    this.showQuickJustifyModal.set(false);
    this.activeJustifyStore.set(null);
  }

  quickJustifyStore(storeId: string, reason: string, replicatePrevReading: boolean = true) {
    if (!this.authService.canEditReadings()) return;
    const item = this.tableData().find(t => t.storeId === storeId);
    const type = this.utilityType();
    const prevReading = item?.prevReading || 0;
    const newReading = replicatePrevReading ? prevReading : (item?.currentReading || 0);

    this.readings.update(curr => {
      const map = new Map(curr[type] as Map<string, StoreReading>);
      const currentData = map.get(storeId) || this.createDefaultReading();
      
      const updated: StoreReading = {
        ...currentData,
        reading: newReading,
        anomalyConfirmed: true, // confirmação automática de anomalia pois foi justificado intencionalmente
        isJustified: true,
        justificationReason: reason,
        note: `[JUSTIFICADO] ${reason}`
      };
      
      map.set(storeId, updated);
      return { ...curr, [type]: map };
    });

    this.dataLoaded.set(true);
    this.triggerQuickAutoSave();
    this.closeQuickJustifyModal();
  }

  batchJustifyFrequentZero() {
    if (!this.authService.canEditReadings()) return;
    const pendingFrequent = this.prevMonthAudit().frequentZeroPending;
    if (pendingFrequent.length === 0) return;

    const type = this.utilityType();
    this.readings.update(curr => {
      const map = new Map(curr[type] as Map<string, StoreReading>);
      
      for (const item of pendingFrequent) {
        const currentData = map.get(item.storeId) || this.createDefaultReading();
        const reason = item.learnedReason || 'Loja Fechada / Sem Consumo Recorrente';
        const updated: StoreReading = {
          ...currentData,
          reading: item.prevReading || 0,
          anomalyConfirmed: true,
          isJustified: true,
          justificationReason: reason,
          note: `[JUSTIFICADO] ${reason}`
        };
        map.set(item.storeId, updated);
      }

      return { ...curr, [type]: map };
    });

    this.dataLoaded.set(true);
    this.triggerQuickAutoSave();
  }

  triggerQuickAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      if (!this.isProgrammaticLoading) {
        this.internalSave();
      }
    }, 200);
  }

  // Field Notes Helpers
  openNoteEditor(storeId: string, currentNote?: string) {
    this.activeNoteStoreId.set(storeId);
    this.activeNoteText.set(currentNote || '');
  }

  closeNoteEditor() {
    this.activeNoteStoreId.set(null);
    this.activeNoteText.set('');
  }

  saveNote(storeId: string) {
    this.updateStoreNote(storeId, this.activeNoteText().trim());
    this.closeNoteEditor();
  }

  applyQuickTag(storeId: string, tag: string) {
    const item = this.tableData().find(t => t.storeId === storeId);
    const existing = item?.note || '';
    const updated = existing ? `${existing} | ${tag}` : tag;
    this.updateStoreNote(storeId, updated);
  }

  clearNote(storeId: string) {
    this.updateStoreNote(storeId, '');
  }

  updateStoreNote(storeId: string, noteText: string) {
    if (!this.authService.canEditReadings()) return;
    const type = this.utilityType();
    this.readings.update(curr => {
      const map = new Map(curr[type] as Map<string, StoreReading>);
      const currentData = map.get(storeId) || this.createDefaultReading();
      map.set(storeId, { ...currentData, note: noteText });
      return { ...curr, [type]: map };
    });
  }

  // --- UPDATERS ---

  updateDetailedReading(storeId: string, field: keyof StoreReading, value: any) {
    if (!this.authService.canEditReadings()) return;
    // Tech can edit 'reading', 'note', 'hasPhoto', 'photoTimestamp', 'anomalyConfirmed', 'isRollover', 'isJustified', 'justificationReason'
    if (this.authService.isTech() &&
      field !== 'reading' &&
      field !== 'note' &&
      field !== 'hasPhoto' &&
      field !== 'photoTimestamp' &&
      field !== 'anomalyConfirmed' &&
      field !== 'isRollover' &&
      field !== 'isJustified' &&
      field !== 'justificationReason') return;

    this.dataLoaded.set(true);

    let cleanValue = value;
    if (field === 'reading') {
      if (typeof value === 'string') {
        const str = value.trim();
        if (/^\d{1,3}\.\d{3}$/.test(str)) {
          cleanValue = parseInt(str.replace('.', ''), 10);
        } else if (str.includes('.') && str.includes(',')) {
          cleanValue = parseFloat(str.replace(/\./g, '').replace(',', '.'));
        } else if (str.includes(',')) {
          cleanValue = parseFloat(str.replace(',', '.'));
        } else {
          cleanValue = parseFloat(str);
        }
      }
      if (cleanValue === null || cleanValue === undefined || isNaN(cleanValue)) {
        cleanValue = 0;
      }
    }

    if (field === 'virtual') {
      if (value === null || value === undefined || value === '') {
        cleanValue = undefined;
      } else {
        const str = String(value).trim();
        if (str === '' || str === '-' || str === '—') {
          cleanValue = undefined;
        } else {
          const parsed = typeof value === 'number' ? value : parseFloat(str.replace(',', '.'));
          cleanValue = isNaN(parsed) ? undefined : parsed;
        }
      }
    }

    if (field === 'adjustment') {
      if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
        cleanValue = this.utilityType() === 'gas' ? 1.347 : 1;
      } else {
        const num = Number(value);
        cleanValue = num <= 0 ? (this.utilityType() === 'gas' ? 1.347 : 1) : num;
      }
    }

    if (field === 'fcm') {
      if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
        cleanValue = 1.0727;
      } else {
        const num = Number(value);
        cleanValue = num <= 0 ? 1.0727 : num;
      }
    }

    if (field === 'constant') {
      if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
        cleanValue = 1;
      } else {
        const num = Number(value);
        cleanValue = num <= 0 ? 1 : num;
      }
    }

    if (field === 'adjustmentAdd' || field === 'fluxoCost') {
      if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
        cleanValue = 0;
      } else {
        cleanValue = Number(value);
      }
    }

    const type = this.utilityType();

    this.readings.update(curr => {
      const map = new Map(curr[type] as Map<string, StoreReading>);
      const currentData = map.get(storeId) || this.createDefaultReading();

      const safeData: StoreReading = currentData;
      const newData: StoreReading = { ...safeData, [field]: cleanValue };
      if (field === 'reading') {
        newData.anomalyConfirmed = false;
        newData.isRollover = false;
        // Mantém a foto associada sincronizada com o valor editado ou apagado pelo usuário
        const photo = this.meterPhotos()[storeId];
        if (photo && photo.readingValue !== cleanValue) {
          photo.readingValue = cleanValue;
          this.meterPhotos.update(prev => ({
            ...prev,
            [storeId]: { ...photo, readingValue: cleanValue }
          }));
          this.indexedDb.saveMeterPhoto(photo).catch(() => {});
          if (this.indexedDb.isOnline()) {
            this.supabaseService.syncMeterPhoto(photo).catch(() => {});
          }
        }
      }

      map.set(storeId, newData);

      return { ...curr, [type]: map };
    });

    if (field === 'reading' && cleanValue === 0) {
      // Quando o usuário apaga o campo (valor 0), dispara salvamento prioritário rápido (100ms)
      // para garantir persistência mesmo se o usuário der refresh na página logo em seguida
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
      }
      this.autoSaveTimer = setTimeout(() => {
        this.autoSaveTimer = null;
        if (!this.isProgrammaticLoading) {
          this.internalSave();
        }
      }, 100);
    }
  }

  // --- ANOMALY AUDIT MODAL METHODS (ETAPA 1) ---
  onReadingBlur(storeId: string) {
    // Salva imediatamente qualquer alteração pendente ao sair do campo
    this.flushAutoSave();

    const row = this.tableData().find(r => r.storeId === storeId);
    if (!row) return;

    if (row.validationAlert.hasAlert && !row.anomalyConfirmed && row.isRead) {
      this.activeAnomalyModal.set({
        storeId: row.storeId,
        storeName: row.storeName,
        luc: row.luc,
        type: row.validationAlert.type,
        title: row.validationAlert.title,
        message: row.validationAlert.message,
        severity: row.validationAlert.severity,
        currentReading: row.currentReading,
        prevReading: row.prevReading,
        consumption: row.consumption,
        avgConsumption: row.validationAlert.avgConsumption,
        unit: this.getUnit(),
        isConfirmed: false,
        isRollover: !!row.isRollover,
        diffPct: row.validationAlert.diffPct
      });
    }
  }

  openAnomalyModal(item: any) {
    this.activeAnomalyModal.set({
      storeId: item.storeId,
      storeName: item.storeName,
      luc: item.luc,
      type: item.validationAlert.type,
      title: item.validationAlert.title,
      message: item.validationAlert.message,
      severity: item.validationAlert.severity,
      currentReading: item.currentReading,
      prevReading: item.prevReading,
      consumption: item.consumption,
      avgConsumption: item.validationAlert.avgConsumption,
      unit: this.getUnit(),
      isConfirmed: !!item.anomalyConfirmed,
      isRollover: !!item.isRollover,
      diffPct: item.validationAlert.diffPct
    });
  }

  confirmAnomaly(storeId: string) {
    this.updateDetailedReading(storeId, 'anomalyConfirmed', true);
    this.activeAnomalyModal.set(null);
  }

  markRollover(storeId: string) {
    this.updateDetailedReading(storeId, 'isRollover', true);
    this.updateDetailedReading(storeId, 'anomalyConfirmed', true);
    this.activeAnomalyModal.set(null);
  }

  closeAnomalyModal() {
    this.activeAnomalyModal.set(null);
  }

  toggleExcludeFromBill(storeId: string) {
    if (!this.canEdit()) return;
    const type = this.utilityType();
    this.readings.update(curr => {
      const map = new Map(curr[type] as Map<string, StoreReading>);
      const currentData = map.get(storeId) || this.createDefaultReading();
      const updated: StoreReading = {
        ...currentData,
        excludedFromBill: !currentData.excludedFromBill
      };
      map.set(storeId, updated);
      return { ...curr, [type]: map };
    });
  }

  // --- MONTH CLOSING & AUDIT CHECKLIST METHODS (ETAPA 3) ---
  openClosingChecklist() {
    this.showClosingChecklistModal.set(true);
  }

  closeClosingChecklist() {
    this.showClosingChecklistModal.set(false);
  }

  freezeMonthWithChecklist() {
    if (!this.authService.isAdmin()) {
      alert('Apenas administradores podem fechar e congelar o rateio mensal.');
      return;
    }

    const chk = this.closingChecklist();
    if (!chk.canFreeze) {
      const parts: string[] = [];
      if (!chk.readings.passed) parts.push(`${chk.readings.pendingStores} loja(s) pendente(s)`);
      if (!chk.anomalies.passed) parts.push(`${chk.anomalies.uninspectedCount} inconsistência(s) não auditada(s)`);
      const proceed = confirm(`Atenção: O checklist detectou pendências em aberto (${parts.join(', ')}).\n\nDeseja realmente congelar o rateio deste mês mesmo assim?`);
      if (!proceed) return;
    }

    this.isLocked.set(true);
    this.lockedAt.set(new Date().toISOString());
    this.lockedBy.set(this.authService.user()?.email || 'Administrador');
    this.internalSave();
    this.indexedDb.showToast(`🔒 Rateio de ${this.utilityType().toUpperCase()} (${this.selectedMonth()}) congelado com sucesso!`);
  }

  unfreezeMonth() {
    if (!this.authService.isAdmin()) return;
    const confirmUnlock = confirm(`Deseja REABRIR o rateio de ${this.utilityType().toUpperCase()} (${this.selectedMonth()}) para novas edições?`);
    if (!confirmUnlock) return;
    this.isLocked.set(false);
    this.lockedAt.set(null);
    this.lockedBy.set(null);
    this.internalSave();
    this.indexedDb.showToast(`🔓 Rateio reaberto para edições.`);
  }

  // --- PHOTO EVIDENCE METHODS (FOTO DO MEDIDOR OFFLINE NO INDEXEDDB + NUVEM) ---
  async onPhotoCaptured(event: Event, storeId: string, storeName: string, luc: string, currentReading: number) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    input.value = '';

    this.isCapturingPhoto.set(storeId);

    try {
      const type = this.utilityType();
      const month = this.selectedMonth();
      const utilLabel = type === 'luz' ? 'Luz' : type === 'agua' ? 'Água' : 'Gás';
      const watermark = `${luc} • ${storeName} • ${utilLabel} • Leitura: ${currentReading || 0}`;

      const compressedBase64 = await this.indexedDb.compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.72,
        watermarkText: watermark
      });

      // 🔍 Análise de Qualidade da Foto (iluminação / reflexo) & Realce de Contraste para OCR
      const { enhancedDataUrl, quality } = await analyzeAndEnhanceBase64Image(compressedBase64);
      if (quality.warningMessage) {
        this.indexedDb.showToast(quality.warningMessage);
      }

      const record: MeterPhotoRecord = {
        id: `${type}_${month}_${storeId}`,
        type,
        month,
        storeId,
        storeName,
        luc,
        readingValue: currentReading || 0,
        photoDataUrl: compressedBase64,
        capturedAt: new Date().toISOString(),
        synced: false
      };

      // 1. Salva sempre no IndexedDB local primeiro (garantia offline)
      await this.indexedDb.saveMeterPhoto(record);

      // 2. Se online, tenta enviar imediatamente para o Supabase
      if (this.indexedDb.isOnline()) {
        try {
          const ok = await this.supabaseService.syncMeterPhoto(record);
          if (ok) {
            record.synced = true;
            await this.indexedDb.saveMeterPhoto(record);
          }
        } catch (syncErr) {
          console.warn('Envio imediato ao Supabase pendente (será enviado na reconexão):', syncErr);
        }
      }

      await this.indexedDb.refreshPendingCount();

      this.meterPhotos.update(prev => ({
        ...prev,
        [storeId]: { ...record }
      }));

      if (this.activePhotoRecord()?.storeId === storeId) {
        this.activePhotoRecord.set({ ...record });
      }

      this.updateDetailedReading(storeId, 'hasPhoto', true);
      this.updateDetailedReading(storeId, 'photoTimestamp', record.capturedAt);

      // --- 🤖 LEITURA AUTOMÁTICA DO MEDIDOR POR FOTO COM SELEÇÃO INTELIGENTE E DUPLA CHECAGEM ---
      const isOnline = (typeof navigator !== 'undefined' && navigator.onLine) || this.indexedDb.isOnline();
      if (isOnline) {
        // Se ainda não tiver chaves no dispositivo atual (comum em celular), busca as chaves compartilhadas na nuvem
        if (!this.geminiService.hasConfiguredApiKey()) {
          try {
            const cloudKeys = await this.supabaseService.fetchSystemAiKeys();
            if (cloudKeys) {
              this.geminiService.setCloudApiKeys(cloudKeys.groqKey, cloudKeys.geminiKey);
            }
          } catch { }
        }

        if (!this.geminiService.hasConfiguredApiKey()) {
          this.pendingOcrStoreId.set(storeId);
          this.openAiKeyModal();
          this.indexedDb.showToast('⚙️ Configure a chave Groq ou Gemini no ícone 🤖 para ativar a IA no celular.');
          this.ocrFeedback.update(prev => ({
            ...prev,
            [storeId]: {
              success: false,
              message: 'Chave de IA não configurada. Configure a chave no ícone 🤖 no topo para ativar a leitura automática.',
              confidence: 'low',
              provider: 'none',
              modelName: 'Sem chave configurada'
            }
          }));
          return;
        }

        this.indexedDb.showToast('🤖 Lendo visor do medidor com IA...');
        this.isReadingOcr.set(storeId);
        const ocrCtx = this.buildOcrContext(storeId);
        const smartProvider = getRecommendedProvider(this.ocrFeedbackService.entries(), type, ocrCtx?.meterType);
        const initialLabel = smartProvider === 'gemini'
          ? 'Gemini 3.8 Flash (Recomendado pelo Histórico)'
          : smartProvider === 'qwen'
            ? 'Qwen 3.8 27B (Groq)'
            : 'Qwen 3.8 27B + Gemini Fallback';
        this.ocrCurrentModelLabel.set(initialLabel);

        try {
          const ocrResult = await this.geminiService.extractWithDualCheck(
            enhancedDataUrl,
            type,
            ocrCtx
          );
          if (ocrResult.success && ocrResult.reading !== null) {
            // Preenche automaticamente o campo de leitura com o valor extraído pela IA
            this.updateDetailedReading(storeId, 'reading', ocrResult.reading);
            this.registerOcrPending(storeId, ocrResult);

            // Atualiza também o registro fotográfico com a nova leitura
            record.readingValue = ocrResult.reading;
            await this.indexedDb.saveMeterPhoto(record);
            if (this.indexedDb.isOnline()) {
              this.supabaseService.syncMeterPhoto(record).catch(() => { });
            }
            if (this.activePhotoRecord()?.storeId === storeId) {
              this.activePhotoRecord.set({ ...record });
            }
            this.meterPhotos.update(prev => ({ ...prev, [storeId]: { ...record } }));

            // Salva a fatura imediatamente no banco e no navegador
            this.internalSave();

            const modelDesc = ocrResult.fallbackUsed
              ? '🤖 Gemini 3.8 Flash (Fallback)'
              : ocrResult.provider === 'qwen'
                ? '⚡ Qwen 3.8 27B (Groq)'
                : '🤖 Gemini 3.8 Flash';

            this.ocrFeedback.update(prev => ({
              ...prev,
              [storeId]: {
                success: true,
                message: `${modelDesc}: Leitura ${ocrResult.reading} preenchida automaticamente!`,
                reading: ocrResult.reading,
                confidence: ocrResult.confidence,
                explanation: ocrResult.explanation,
                provider: ocrResult.provider,
                modelName: ocrResult.modelName,
                fallbackUsed: ocrResult.fallbackUsed
              }
            }));
          } else {
            this.ocrFeedback.update(prev => ({
              ...prev,
              [storeId]: {
                success: false,
                message: ocrResult.explanation || ocrResult.error || 'A IA não identificou com nitidez os números do visor. Você pode digitar manualmente.',
                confidence: ocrResult.confidence,
                provider: ocrResult.provider,
                modelName: ocrResult.modelName
              }
            }));
          }
        } catch (ocrErr: any) {
          console.error('Falha no pipeline de OCR do medidor:', ocrErr);
        } finally {
          this.isReadingOcr.set(null);
        }
      } else {
        this.ocrFeedback.update(prev => ({
          ...prev,
          [storeId]: {
            success: true,
            message: 'Foto salva no IndexedDB! Em modo offline, digite a leitura manualmente.',
            confidence: 'medium',
            provider: 'none',
            modelName: 'Offline IndexedDB'
          }
        }));
      }

    } catch (err) {
      console.error('Erro ao processar foto:', err);
    } finally {
      this.isCapturingPhoto.set(null);
      input.value = '';
    }
  }

  async openAiKeyModal() {
    let groq = this.geminiService.getSavedGroqKey();
    let gemini = this.geminiService.getSavedGeminiKey();
    if (!groq && !gemini) {
      try {
        const cloud = await this.supabaseService.fetchSystemAiKeys();
        if (cloud) {
          groq = cloud.groqKey || '';
          gemini = cloud.geminiKey || '';
          this.geminiService.setCloudApiKeys(groq, gemini);
        }
      } catch { }
    }
    this.groqInputKey.set(groq);
    this.geminiInputKey.set(gemini);
    this.showAiKeyModal.set(true);
  }

  closeAiKeyModal() {
    this.showAiKeyModal.set(false);
    this.pendingOcrStoreId.set(null);
  }

  saveAiKeysAndProceed() {
    try {
      this.geminiService.saveApiKeys(this.groqInputKey(), this.geminiInputKey());
      this.supabaseService.syncSystemAiKeys(this.groqInputKey(), this.geminiInputKey()).catch(() => { });
      this.showAiKeyModal.set(false);
      this.indexedDb.showToast('✓ Chaves de IA salvas com segurança e sincronizadas na nuvem!');
      const pendingId = this.pendingOcrStoreId();
      if (pendingId) {
        this.pendingOcrStoreId.set(null);
        this.runOcrOnPhoto(pendingId);
      }
    } catch (err: any) {
      this.indexedDb.showToast(`⚠️ ${err.message || 'Erro ao validar formato de chaves'}`);
    }
  }

  async runOcrOnPhoto(storeId: string, forceProvider?: 'qwen' | 'gemini') {
    const photo = this.meterPhotos()[storeId];
    if (!photo) return;

    if (!this.geminiService.hasConfiguredApiKey()) {
      try {
        const cloudKeys = await this.supabaseService.fetchSystemAiKeys();
        if (cloudKeys) {
          this.geminiService.setCloudApiKeys(cloudKeys.groqKey, cloudKeys.geminiKey);
        }
      } catch { }
    }

    if (!this.geminiService.hasConfiguredApiKey()) {
      this.pendingOcrStoreId.set(storeId);
      this.openAiKeyModal();
      this.indexedDb.showToast('⚙️ Configure sua chave Groq ou Gemini para ativar a leitura por IA.');
      return;
    }

    const ocrCtx = this.buildOcrContext(storeId);
    const smartProvider = forceProvider || getRecommendedProvider(this.ocrFeedbackService.entries(), this.utilityType(), ocrCtx?.meterType);

    this.isReadingOcr.set(storeId);
    this.ocrCurrentModelLabel.set(
      forceProvider === 'gemini'
        ? 'Gemini 3.8 Flash'
        : forceProvider === 'qwen'
          ? 'Qwen 3.8 27B (Groq)'
          : smartProvider === 'gemini'
            ? 'Gemini 3.8 Flash (Recomendado)'
            : 'Qwen 3.8 27B (Groq) + Gemini Fallback'
    );

    try {
      // Se não forçar provedor estrito, executa com dupla checagem (consenso)
      const ocrResult = forceProvider
        ? await this.geminiService.extractMeterReading(
            photo.photoDataUrl,
            this.utilityType(),
            forceProvider,
            ocrCtx
          )
        : await this.geminiService.extractWithDualCheck(
            photo.photoDataUrl,
            this.utilityType(),
            ocrCtx
          );

      if (ocrResult.success && ocrResult.reading !== null) {
        this.updateDetailedReading(storeId, 'reading', ocrResult.reading);
        this.registerOcrPending(storeId, ocrResult);
        photo.readingValue = ocrResult.reading;
        await this.indexedDb.saveMeterPhoto(photo);
        if (this.indexedDb.isOnline()) {
          this.supabaseService.syncMeterPhoto(photo).catch(() => { });
        }
        if (this.activePhotoRecord()?.storeId === storeId) {
          this.activePhotoRecord.set({ ...photo });
        }
        this.meterPhotos.update(prev => ({ ...prev, [storeId]: { ...photo } }));

        // Salva a fatura imediatamente no banco e no navegador
        this.internalSave();

        const modelLabel = ocrResult.fallbackUsed
          ? '🤖 Gemini 3.8 Flash (Fallback)'
          : ocrResult.provider === 'qwen'
            ? '⚡ Qwen 3.8 27B (Groq)'
            : '🤖 Gemini 3.8 Flash';

        this.ocrFeedback.update(prev => ({
          ...prev,
          [storeId]: {
            success: true,
            message: `${modelLabel}: Leitura ${ocrResult.reading} detectada (${ocrResult.confidence === 'high' ? 'Alta Confiança' : 'Média'})!`,
            reading: ocrResult.reading,
            confidence: ocrResult.confidence,
            explanation: ocrResult.explanation,
            provider: ocrResult.provider,
            modelName: ocrResult.modelName,
            fallbackUsed: ocrResult.fallbackUsed
          }
        }));
      } else {
        this.ocrFeedback.update(prev => ({
          ...prev,
          [storeId]: {
            success: false,
            message: ocrResult.explanation || ocrResult.error || 'Não foi possível detectar os dígitos do mostrador nesta foto.',
            confidence: ocrResult.confidence,
            provider: ocrResult.provider,
            modelName: ocrResult.modelName
          }
        }));
      }
    } catch (err: any) {
      this.ocrFeedback.update(prev => ({
        ...prev,
        [storeId]: {
          success: false,
          message: 'Erro na comunicação com o serviço de IA para leitura.',
          provider: 'none',
          modelName: 'Error'
        }
      }));
    } finally {
      this.isReadingOcr.set(null);
    }
  }

  /** Guarda a leitura da IA para o técnico conferir (passo 1 do aprendizado do OCR). */
  private registerOcrPending(storeId: string, ocrResult: MeterOcrResult) {
    if (ocrResult.reading === null) return;
    this.ocrPending.update(prev => ({
      ...prev,
      [storeId]: {
        ocrValue: ocrResult.reading as number,
        detectedDigits: ocrResult.detectedDigits ?? null,
        meterType: ocrResult.meterType,
        confidence: ocrResult.confidence,
        provider: ocrResult.provider,
        modelName: ocrResult.modelName,
        fallbackUsed: ocrResult.fallbackUsed,
        dualCheck: ocrResult.dualCheck
      }
    }));
  }

  /** Contexto do medidor (leitura anterior + correções passadas) para melhorar a precisão do OCR. */
  private buildOcrContext(storeId: string) {
    const item = this.tableData().find(s => s.storeId === storeId);
    return buildReadingContext(this.ocrFeedbackService.entries(), {
      storeId,
      utilityType: this.utilityType(),
      previousReading: item?.prevReading ?? null
    });
  }

  /** Relê a foto com o motor diferente do usado antes (útil quando a leitura falha na validação). */
  retryOcrWithOtherEngine(storeId: string) {
    const pending = this.ocrPending()[storeId];
    const next: 'qwen' | 'gemini' = pending?.provider === 'qwen' ? 'gemini' : 'qwen';
    return this.runOcrOnPhoto(storeId, next);
  }

  /** Técnico confirma (ou corrige no campo) a leitura sugerida pela IA e a correção é registrada. */
  confirmOcrReading(storeId: string, currentValue: number | string | null | undefined) {
    const pending = this.ocrPending()[storeId];
    if (!pending) return;

    const finalValue = Number(currentValue);
    if (currentValue === null || currentValue === undefined || currentValue === '' || !Number.isFinite(finalValue)) {
      this.indexedDb.showToast('⚠️ Informe a leitura antes de confirmar.');
      return;
    }

    const store = this.storeService.stores().find(s => s.id === storeId);
    const entry = this.ocrFeedbackService.record({
      storeId,
      storeName: store?.name || this.meterPhotos()[storeId]?.storeName || storeId,
      utilityType: this.utilityType(),
      month: this.selectedMonth(),
      finalValue,
      pending
    });

    // Mantém o registro fotográfico alinhado com o valor conferido
    const photo = this.meterPhotos()[storeId];
    if (photo && photo.readingValue !== finalValue) {
      const updated = { ...photo, readingValue: finalValue };
      this.indexedDb.saveMeterPhoto(updated).then(() => {
        if (this.indexedDb.isOnline()) {
          this.supabaseService.syncMeterPhoto(updated).catch(() => { });
        }
      });
      this.meterPhotos.update(prev => ({ ...prev, [storeId]: updated }));
      if (this.activePhotoRecord()?.storeId === storeId) {
        this.activePhotoRecord.set(updated);
      }
    }

    this.ocrPending.update(prev => {
      const next = { ...prev };
      delete next[storeId];
      return next;
    });
    this.dismissOcrFeedback(storeId);
    this.internalSave();
    this.indexedDb.showToast(entry.wasCorrected
      ? `✏️ Correção registrada: IA ${entry.ocrValue} → ${entry.finalValue}`
      : '✓ Leitura confirmada!');
  }

  dismissOcrFeedback(storeId: string) {
    this.ocrFeedback.update(prev => {
      const next = { ...prev };
      delete next[storeId];
      return next;
    });
  }

  // --- BATCH OCR QUEUE EXECUTION ---
  async openBatchOcrModal() {
    if (!this.geminiService.hasConfiguredApiKey()) {
      try {
        const cloudKeys = await this.supabaseService.fetchSystemAiKeys();
        if (cloudKeys) {
          this.geminiService.setCloudApiKeys(cloudKeys.groqKey, cloudKeys.geminiKey);
        }
      } catch { }
    }
    if (!this.geminiService.hasConfiguredApiKey()) {
      this.openAiKeyModal();
      this.indexedDb.showToast('⚙️ Configure sua chave Groq ou Gemini para ativar a leitura por IA.');
      return;
    }
    const pending = this.pendingOcrCount();
    const totalWithPhotos = this.totalPhotosCount();
    if (totalWithPhotos === 0) {
      this.indexedDb.showToast('Nenhuma foto capturada neste mês para processar.');
      return;
    }
    this.batchOcrProgress.set({
      current: 0,
      total: pending > 0 ? pending : totalWithPhotos,
      progressPct: 0,
      currentStoreName: '',
      currentLuc: '',
      successCount: 0,
      failCount: 0,
      currentModel: 'Qwen 3.8 27B (Groq) + Gemini'
    });
    this.showBatchOcrModal.set(true);
  }

  closeBatchOcrModal() {
    if (this.isBatchOcrRunning()) return;
    this.showBatchOcrModal.set(false);
  }

  cancelBatchOcr() {
    this.cancelBatchOcrRequested.set(true);
  }

  async executeBatchOcr(reprocessAll: boolean = false) {
    if (!this.geminiService.hasConfiguredApiKey()) {
      try {
        const cloudKeys = await this.supabaseService.fetchSystemAiKeys();
        if (cloudKeys) {
          this.geminiService.setCloudApiKeys(cloudKeys.groqKey, cloudKeys.geminiKey);
        }
      } catch { }
    }
    if (!this.geminiService.hasConfiguredApiKey()) {
      this.openAiKeyModal();
      this.indexedDb.showToast('⚙️ Configure sua chave Groq ou Gemini para ativar a leitura por IA.');
      return;
    }

    if (this.isLocked()) {
      this.indexedDb.showToast('🔒 Mês bloqueado para edições.');
      return;
    }

    const candidates = this.tableData().filter(s => {
      if (!s.hasPhoto) return false;
      if (reprocessAll) return true;
      return !s.isRead || s.currentReading === 0;
    });

    if (candidates.length === 0) {
      this.indexedDb.showToast('Nenhuma foto pendente encontrada para processamento.');
      return;
    }

    this.isBatchOcrRunning.set(true);
    this.cancelBatchOcrRequested.set(false);
    this.showBatchOcrModal.set(true);

    let success = 0;
    let fail = 0;
    const total = candidates.length;

    this.batchOcrProgress.set({
      current: 0,
      total,
      progressPct: 0,
      currentStoreName: candidates[0]?.storeName || '',
      currentLuc: candidates[0]?.luc || '',
      successCount: 0,
      failCount: 0,
      currentModel: 'Qwen 3.8 27B / Gemini 3.8'
    });

    for (let i = 0; i < candidates.length; i++) {
      if (this.cancelBatchOcrRequested()) {
        this.indexedDb.showToast(`⏹️ Fila cancelada pelo usuário. (${success} leitura(s) salvas)`);
        break;
      }

      const storeItem = candidates[i];
      let photo = this.meterPhotos()[storeItem.storeId];

      if (!photo) {
        const type = this.utilityType();
        const month = this.selectedMonth();
        const diskRec = await this.indexedDb.getMeterPhoto(type, month, storeItem.storeId);
        if (diskRec) {
          photo = diskRec;
          this.meterPhotos.update(prev => ({ ...prev, [storeItem.storeId]: diskRec }));
        }
      }

      const pct = Math.round(((i + 1) / total) * 100);
      this.batchOcrProgress.set({
        current: i + 1,
        total,
        progressPct: pct,
        currentStoreName: storeItem.storeName,
        currentLuc: storeItem.luc,
        successCount: success,
        failCount: fail,
        currentModel: 'Qwen 3.8 27B (Groq) + Gemini'
      });

      if (photo && photo.photoDataUrl) {
        try {
          const ocrResult = await this.geminiService.extractMeterReading(
            photo.photoDataUrl,
            this.utilityType(),
            undefined,
            this.buildOcrContext(storeItem.storeId)
          );

          if (ocrResult.success && ocrResult.reading !== null) {
            this.updateDetailedReading(storeItem.storeId, 'reading', ocrResult.reading);
            this.registerOcrPending(storeItem.storeId, ocrResult);
            photo.readingValue = ocrResult.reading;
            await this.indexedDb.saveMeterPhoto(photo);
            if (this.indexedDb.isOnline()) {
              this.supabaseService.syncMeterPhoto(photo).catch(() => { });
            }
            this.meterPhotos.update(prev => ({ ...prev, [storeItem.storeId]: { ...photo } }));
            success++;
          } else {
            fail++;
          }
        } catch (e) {
          fail++;
        }
      } else {
        fail++;
      }

      this.batchOcrProgress.update(p => ({
        ...p,
        successCount: success,
        failCount: fail
      }));

      // Pequeno intervalo para proteger contra limites de requisições de API (rate limit)
      if (i < candidates.length - 1) {
        await new Promise(r => setTimeout(r, 350));
      }
    }

    this.isBatchOcrRunning.set(false);
    this.internalSave();
    this.indexedDb.showToast(`⚡ Fila finalizada: ${success} leitura(s) extraídas com sucesso, ${fail} não detectadas.`);
  }

  openPhotoViewer(storeId: string, customRecord?: MeterPhotoRecord) {
    if (customRecord) {
      this.activePhotoRecord.set(customRecord);
      this.showPhotoModal.set(true);
      return;
    }
    const photo = this.meterPhotos()[storeId];
    if (photo) {
      this.activePhotoRecord.set(photo);
      this.showPhotoModal.set(true);
    } else {
      const type = this.utilityType();
      const month = this.selectedMonth();
      this.indexedDb.getMeterPhoto(type, month, storeId).then(async rec => {
        if (rec) {
          this.meterPhotos.update(prev => ({ ...prev, [storeId]: rec }));
          this.activePhotoRecord.set(rec);
          this.showPhotoModal.set(true);
        } else if (this.indexedDb.isOnline()) {
          const cloudPhotos = await this.supabaseService.fetchMeterPhotos(type, month);
          if (cloudPhotos && cloudPhotos[storeId]) {
            const cloudPhoto = cloudPhotos[storeId];
            this.meterPhotos.update(prev => ({ ...prev, [storeId]: cloudPhoto }));
            this.activePhotoRecord.set(cloudPhoto);
            this.showPhotoModal.set(true);
            await this.indexedDb.saveMeterPhoto(cloudPhoto);
          }
        }
      });
    }
  }

  async syncSinglePhoto(photo: MeterPhotoRecord) {
    if (!this.indexedDb.isOnline()) {
      this.indexedDb.showToast('⚠️ Sem conexão com a internet no momento.');
      return;
    }
    const ok = await this.supabaseService.syncMeterPhoto(photo);
    if (ok) {
      photo.synced = true;
      await this.indexedDb.saveMeterPhoto(photo);
      this.meterPhotos.update(prev => ({ ...prev, [photo.storeId]: { ...photo } }));
      if (this.activePhotoRecord()?.storeId === photo.storeId) {
        this.activePhotoRecord.set({ ...photo });
      }
      await this.indexedDb.refreshPendingCount();
      this.indexedDb.showToast(`☁️ Foto de ${photo.luc} enviada ao Supabase com sucesso!`);
    } else {
      this.indexedDb.showToast(`⚠️ Falha ao sincronizar foto de ${photo.luc} com Supabase.`);
    }
  }

  closePhotoViewer() {
    this.showPhotoModal.set(false);
    this.activePhotoRecord.set(null);
    this.isConfirmingPhotoDelete.set(false);
  }

  confirmDeletePhoto(storeId: string, storeName?: string) {
    const name = storeName || 'desta loja';
    if (confirm(`Tem certeza que deseja excluir a foto do medidor de ${name}?`)) {
      this.removePhoto(storeId);
    }
  }

  async removePhoto(storeId: string) {
    const type = this.utilityType();
    const month = this.selectedMonth();

    // 1. Fecha o visualizador de foto instantaneamente
    this.closePhotoViewer();

    // 2. Atualiza estado reativo local imediatamente
    this.meterPhotos.update(prev => {
      const copy = { ...prev };
      delete copy[storeId];
      return copy;
    });

    // 3. Limpa referências de foto na leitura da loja
    this.updateDetailedReading(storeId, 'hasPhoto', false);
    this.updateDetailedReading(storeId, 'photoTimestamp', undefined);

    // 4. Salva a fatura no histórico e na nuvem
    this.internalSave();

    // 5. Exclui do IndexedDB local (que gerencia fila offline se sem internet) e do Supabase
    await this.indexedDb.deleteMeterPhoto(type, month, storeId);
    if (this.indexedDb.isOnline()) {
      await this.supabaseService.deleteMeterPhoto(type, month, storeId).catch(() => { });
    }

    // 6. Notificação de confirmação imediata
    this.indexedDb.showToast('🗑️ Foto excluída com sucesso do dispositivo e da nuvem!');
  }

  downloadActivePhoto() {
    const photo = this.activePhotoRecord();
    if (!photo || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = photo.photoDataUrl;
    a.download = `Evidencia_Medidor_${photo.type.toUpperCase()}_${photo.month}_${photo.luc}.jpg`;
    a.click();
  }

  onPasteCell(event: ClipboardEvent, startStoreId: string, field: keyof StoreReading) {
    if (!this.authService.canEditReadings()) return;
    if (this.authService.isTech() && field !== 'reading') return;

    const text = event.clipboardData?.getData('text') || '';

    // If the text contains newlines, or multiple lines, it's a list from Excel/Sheets
    if (text.includes('\n') || text.includes('\r')) {
      event.preventDefault(); // Prevent pasting all rows into a single cell

      // Convert into string array
      const rawLines = text.split(/\r?\n/).map(line => line.trim());
      // Filter out last line if it's empty, common on copy-paste
      const valList = rawLines.filter((l, i) => l !== '' || i < rawLines.length - 1);
      if (valList.length === 0) return;

      const dataList = this.tableData();
      const startIndex = dataList.findIndex(item => item.storeId === startStoreId);
      if (startIndex === -1) return;

      const type = this.utilityType();

      this.readings.update(curr => {
        const map = new Map(curr[type] as Map<string, StoreReading>);

        valList.forEach((line, i) => {
          const targetIndex = startIndex + i;
          if (targetIndex >= dataList.length) return;

          const targetStoreId = dataList[targetIndex].storeId;
          const currentData = map.get(targetStoreId) || this.createDefaultReading();

          // In case they copied a table, take the first column value
          const cellStr = line.split('\t')[0]?.trim() || '';
          if (field === 'virtual' && (cellStr === '' || cellStr === '-' || cellStr === '—')) {
            const newData: StoreReading = { ...currentData, virtual: undefined };
            map.set(targetStoreId, newData);
            return;
          }
          if (cellStr === '') return;

          // Parse Brazilian/international numbers correctly:
          // Handles thousand separators "." and decimal commas ","
          let cleanVal = cellStr;
          if (cellStr.includes(',') && cellStr.includes('.')) {
            // e.g., "1.234,56" -> "1234.56"
            cleanVal = cellStr.replace(/\./g, '').replace(',', '.');
          } else if (/^\d{1,3}\.\d{3}$/.test(cellStr)) {
            // e.g., "1.510" (milhar brasileiro sem decimais) -> "1510"
            cleanVal = cellStr.replace(/\./g, '');
          } else if (cellStr.includes(',')) {
            // e.g., "1234,56" -> "1234.56"
            cleanVal = cellStr.replace(',', '.');
          }

          const numVal = parseFloat(cleanVal);
          if (!isNaN(numVal)) {
            const newData: StoreReading = { ...currentData, [field]: numVal };
            map.set(targetStoreId, newData);
          }
        });

        return { ...curr, [type]: map };
      });
    }
  }

  // ---

  // Consumo e Custo Físico Total de Todas as Lojas (usado para calcular Área Comum sem distorção)
  totalStoresPhysicalConsumption = computed(() => {
    return this.tableData().reduce((acc, item) => acc + item.consumption, 0);
  });

  totalStoresPhysicalCost = computed(() => {
    return this.tableData().reduce((acc, item) => acc + (item.originalCost !== undefined ? item.originalCost : item.cost), 0);
  });

  // Total a Faturar no SAP (deduzindo lojas marcadas como fora do SAP)
  totalDistributedConsumption = computed(() => {
    return this.tableData().reduce((acc, item) => acc + (item.excludedFromBill ? 0 : item.consumption), 0);
  });

  totalDistributedCost = computed(() => {
    return this.tableData().reduce((acc, item) => acc + (item.excludedFromBill ? 0 : item.cost), 0);
  });

  excludedSapCost = computed(() => {
    return this.tableData().reduce((acc, item) => acc + (item.excludedFromBill ? (item.originalCost !== undefined ? item.originalCost : item.cost) : 0), 0);
  });

  excludedSapCount = computed(() => {
    return this.tableData().filter(item => item.excludedFromBill).length;
  });

  setAirConditioning(val: any) {
    if (!this.authService.canConfigureBill()) return;
    const num = Number(val);
    const safeVal = isNaN(num) ? 0 : num;
    if (this.utilityType() === 'luz') this.luzAC.set(safeVal);
    else if (this.utilityType() === 'agua') this.aguaAC.set(safeVal);
  }

  airConditioningConsumption = computed(() => this.currentACConsumption());

  airConditioningCost = computed(() => {
    return this.airConditioningConsumption() * this.calculatedUnitPrice();
  });

  commonArea = computed(() => {
    return this.apportionmentEngine.calculateCommonArea(
      this.totalConsumption(),
      this.totalBillAmount(),
      this.totalStoresPhysicalConsumption(),
      this.totalStoresPhysicalCost(),
      this.airConditioningConsumption(),
      this.airConditioningCost(),
      this.utilityType() === 'gas' && this.gasAutoDistribute()
    );
  });

  commonAreaConsumption = computed(() => this.commonArea().consumption);
  commonAreaCost = computed(() => this.commonArea().cost);

  getPercentage(cost: number) {
    if (this.totalBillAmount() === 0) return '0.0';
    return ((cost / this.totalBillAmount()) * 100).toFixed(2);
  }

  canAnalyze() {
    return this.totalBillAmount() > 0 && this.totalDistributedConsumption() > 0;
  }

  // --- EXCEL EXPORT (RATEIO COMPLETO PARA HISTÓRICO) ---
  exportToExcel() {
    this.isExportingExcel.set(true);
    try {
      const type = this.utilityType();
      const label = type === 'luz' ? 'Luz' : type === 'agua' ? 'Agua' : 'Gas';
      const inputCons = type === 'luz'
        ? this.luzConsumption()
        : (type === 'agua' ? this.aguaTotalReading() : this.gasTotalReading());

      this.exportService.exportCalculatorToExcel({
        utilityType: type,
        utilityLabel: label,
        unit: this.getUnit(),
        month: this.selectedMonth(),
        unitPrice: this.calculatedUnitPrice(),
        totalBill: this.totalBillAmount(),
        totalConsumption: this.totalConsumption(),
        totalDistributedCost: this.totalDistributedCost(),
        totalStoreConsumption: this.totalDistributedConsumption(),
        airConditioningConsumption: this.airConditioningConsumption(),
        airConditioningCost: this.airConditioningCost(),
        commonAreaConsumption: this.commonAreaConsumption(),
        commonAreaCost: this.commonAreaCost(),
        costItems: this.currentCostItems(),
        consumptionInput: inputCons,
        tableData: this.tableData()
      });
    } catch (err) {
      console.error('Erro ao exportar rateio para Excel:', err);
    } finally {
      this.isExportingExcel.set(false);
    }
  }

  // --- COMPLETE ZIP PACKAGE EXPORT (PLANILHA EXCEL + FOTOS + MANIFESTO) ---
  async exportPackageZip() {
    if (this.isExportingZip() || this.tableData().length === 0) return;
    this.isExportingZip.set(true);

    try {
      const type = this.utilityType();
      const label = type === 'luz' ? 'Luz' : type === 'agua' ? 'Agua' : 'Gas';
      const month = this.selectedMonth();
      const inputCons = type === 'luz'
        ? this.luzConsumption()
        : (type === 'agua' ? this.aguaTotalReading() : this.gasTotalReading());

      // Coleta fotos do signal + mescla com fotos do IndexedDB caso alguma esteja salva localmente
      const photosMap: Record<string, any> = { ...this.meterPhotos() };
      try {
        const localDbPhotos = await this.indexedDb.getMeterPhotosForMonth(type, month);
        if (localDbPhotos) {
          Object.entries(localDbPhotos).forEach(([storeId, p]) => {
            if (!photosMap[storeId] && p?.photoDataUrl) {
              photosMap[storeId] = p;
            }
          });
        }
      } catch (e) {
        console.warn('Erro ao consultar fotos do IndexedDB para compor pacote ZIP:', e);
      }

      await this.exportService.exportCompletePackageZip({
        utilityType: type,
        utilityLabel: label,
        unit: this.getUnit(),
        month: month,
        unitPrice: this.calculatedUnitPrice(),
        totalBill: this.totalBillAmount(),
        totalConsumption: this.totalConsumption(),
        totalDistributedCost: this.totalDistributedCost(),
        totalStoreConsumption: this.totalDistributedConsumption(),
        airConditioningConsumption: this.airConditioningConsumption(),
        airConditioningCost: this.airConditioningCost(),
        commonAreaConsumption: this.commonAreaConsumption(),
        commonAreaCost: this.commonAreaCost(),
        costItems: this.currentCostItems(),
        consumptionInput: inputCons,
        tableData: this.tableData(),
        photos: photosMap
      });
    } catch (err) {
      console.error('Erro ao gerar pacote ZIP de rateio:', err);
      alert('Houve um erro ao gerar o pacote ZIP de auditoria. Verifique o console.');
    } finally {
      this.isExportingZip.set(false);
    }
  }
  // --- STORE VOUCHER / ESPELHO DO LOJISTA METHODS ---
  getUtilityLabel() {
    switch (this.utilityType()) {
      case 'luz': return 'Energia Elétrica';
      case 'agua': return 'Água & Esgoto';
      case 'gas': return 'Gás GLP';
    }
  }

  selectedMonthLabel(): string {
    const m = this.selectedMonth();
    if (!m) return '';
    const [year, month] = m.split('-');
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const idx = parseInt(month, 10) - 1;
    return (months[idx] || month) + '/' + year;
  }

  openStoreVoucher(item: any) {
    if (!item) return;
    const type = this.utilityType();
    const month = this.selectedMonth();
    const photo = this.meterPhotos()[item.storeId];

    const data: StoreVoucherData = {
      storeName: item.storeName,
      luc: item.luc,
      contrato: item.contrato,
      utilityType: type,
      utilityLabel: this.getUtilityLabel(),
      unit: this.getUnit(),
      month: month,
      monthLabel: this.selectedMonthLabel(),
      prevReading: item.prevReading || 0,
      prevConsumption: item.prevConsumption || 0,
      prevCost: item.prevCost || 0,
      currentReading: item.currentReading || 0,
      readingDiff: item.readingDiff !== undefined ? item.readingDiff : ((item.currentReading || 0) - (item.prevReading || 0)),
      constant: item.constant || 1,
      adjustment: item.adjustment || 1,
      adjustmentAdd: item.adjustmentAdd,
      fluxoCost: item.fluxoCost,
      consumption: item.consumption || 0,
      rawConsumption: item.rawConsumption,
      gasFactor: item.gasFactor,
      unitPrice: this.calculatedUnitPrice() || 0,
      totalCost: item.cost || 0,
      variationPct: item.variation,
      note: item.note,
      photoDataUrl: photo?.photoDataUrl,
      photoCapturedAt: photo?.capturedAt || item.photoTimestamp,
      issueDate: new Date().toLocaleString('pt-BR')
    };

    this.selectedVoucherData.set(data);
    this.showVoucherModal.set(true);
  }

  openStoreVoucherByStoreId(storeId?: string | null) {
    if (!storeId) return;
    const item = this.tableData().find(s => s.storeId === storeId);
    if (item) {
      this.openStoreVoucher(item);
    }
  }

  closeStoreVoucher() {
    this.showVoucherModal.set(false);
  }


}
