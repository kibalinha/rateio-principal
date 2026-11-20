import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { StoreService, isStoreActiveInMonth } from '../services/store.service';
import { AuthService } from '../services/auth.service';
import { IndexedDbService } from '../services/indexed-db.service';
import { HistoryService } from '../services/history.service';
import { parseMonthlyStoreListText, SkippedImportLine } from '../services/store-import.helpers';
import {
  ParsedSheetGrid,
  extractSheetsFromWorkbook,
  chooseBestSheetIndex,
  parseTextToGrid,
  extractMonthlyStoreRowsFromGrid
} from '../services/spreadsheet-smart-parser';

import { 
  Store,
  MonthlyImportPreview,
  UtilityType as TabType, 
  StoreStatusFilter as StatusFilter, 
  ParsedStoreRow 
} from '../models';

@Component({
  selector: 'app-store-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      
      <!-- Utility Tabs & Action Bar -->
      <div class="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 transition-colors">
        <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-full md:w-auto">
          <button (click)="setTab('luz')" 
            [class]="activeTab() === 'luz' ? 'bg-white dark:bg-slate-700 text-warning shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            class="flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap">
            <span>⚡</span> Lojas de Luz
          </button>
          <button (click)="setTab('agua')" 
            [class]="activeTab() === 'agua' ? 'bg-white dark:bg-slate-700 text-accent shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            class="flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap">
            <span>💧</span> Lojas de Água
          </button>
          <button (click)="setTab('gas')" 
            [class]="activeTab() === 'gas' ? 'bg-white dark:bg-slate-700 text-danger shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            class="flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap">
            <span>🔥</span> Lojas de Gás
          </button>
        </div>

        @if (authService.canManageStores()) {
          <div class="flex gap-2 w-full md:w-auto">
            <!-- Botão Importar Planilha Mensal -->
            <button (click)="toggleImport()" 
              [class]="showImport() ? 'bg-teal-700 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-400 border border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-slate-700'"
              class="flex-1 md:flex-none px-4 py-2 rounded-lg transition-colors font-semibold text-sm flex items-center justify-center gap-2 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Subir Lista Mensal (LUC / Contrato)</span>
            </button>

            <!-- Botão Atualizar Dados -->
            <button (click)="refreshStores()" 
              title="Recarregar e sincronizar lista de lojas"
              class="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
              <span>🔄</span>
              <span class="hidden sm:inline">Atualizar</span>
            </button>


            <!-- Botão Nova Loja -->
            <button (click)="toggleForm()" 
              [class]="showForm() ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200' : 'bg-slate-800 dark:bg-teal-600 text-white hover:bg-slate-700 dark:hover:bg-teal-500'"
              class="flex-1 md:flex-none px-4 py-2 rounded-lg transition-colors font-medium text-sm flex items-center justify-center gap-2">
              @if (showForm()) { Cancelar } @else { + Adicionar Loja }
            </button>
          </div>
        }
      </div>

      <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 transition-colors">
        
        <!-- Header & Quick Filters -->
        <div class="mb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
           <div>
             <h2 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 flex-wrap">
                <span class="w-2.5 h-6 rounded" [class]="getTabColor()"></span>
                <span>Lojas de {{ getTabName() }}</span>
                @if (viewMode() === 'month') {
                  <span class="text-xs bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800 px-2 py-0.5 rounded font-mono font-bold">
                    📅 {{ consultationMonth() }}
                  </span>
                } @else {
                  <span class="text-xs bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 px-2 py-0.5 rounded font-bold">
                    🌐 Catálogo Geral
                  </span>
                }
                <span class="text-xs bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-bold ml-1">
                  {{ activeCount() }} ativas
                </span>
                @if (inactiveCount() > 0) {
                  <span class="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full font-semibold">
                    {{ inactiveCount() }} inativas
                  </span>
                }
             </h2>
             <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                @if (viewMode() === 'month') {
                  Mostrando apenas as lojas vigentes no mês <strong>{{ consultationMonth() }}</strong>. Meses sem importação ficam em branco.
                } @else {
                  Mostrando o catálogo geral de todas as lojas cadastradas no sistema.
                }
             </p>
           </div>

           <div class="flex flex-col sm:flex-row items-center gap-3">
             <!-- Status Filter Pills -->
             <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold w-full sm:w-auto">
               <button (click)="statusFilter.set('active')"
                 [class]="statusFilter() === 'active' ? 'bg-white dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
                 class="flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-all">
                 Ativas ({{ activeCount() }})
               </button>
               <button (click)="statusFilter.set('inactive')"
                 [class]="statusFilter() === 'inactive' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
                 class="flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-all">
                 Inativas ({{ inactiveCount() }})
               </button>
               <button (click)="statusFilter.set('all')"
                 [class]="statusFilter() === 'all' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
                 class="flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-all">
                 Todas ({{ totalUtilityCount() }})
               </button>
               <button (click)="statusFilter.set('hidden_tech')"
                 [class]="statusFilter() === 'hidden_tech' ? 'bg-purple-600 text-white shadow-xs' : 'text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/50'"
                 class="flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-all"
                 title="Lojas ocultas para o Técnico em Campo (permanecem ativas para ADM / SAP)">
                 🙈 Só ADM ({{ hiddenFromTechCount() }})
               </button>
             </div>

             <!-- Busca Rápida -->
             <div class="w-full sm:w-64 relative">
               <input 
                 type="text" 
                 [ngModel]="searchTerm()" 
                 (ngModelChange)="searchTerm.set($event)"
                 placeholder="Buscar LUC, Contrato, Nome..."
                 class="w-full pl-8 pr-4 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-slate-400 outline-none bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:bg-white dark:focus:bg-slate-750 transition-all">
               <svg class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
               </svg>
               @if (searchTerm()) {
                 <button (click)="searchTerm.set('')" class="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs">✕</button>
               }
             </div>
           </div>
        </div>

        <!-- Ação em Lote: Ocultar/Exibir lojas filtradas do Técnico em Campo -->
        @if (authService.canManageStores() && searchTerm().trim() && filteredStores().length > 0) {
          <div class="mb-4 p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/70 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs animate-fade-in">
            <span class="text-purple-900 dark:text-purple-200 font-medium">
              <strong>{{ filteredStores().length }}</strong> loja(s) encontrada(s) para "{{ searchTerm() }}". Deseja ocultar do Técnico em Campo (mantendo no SAP/ADM)?
            </span>
            <div class="flex items-center gap-2">
              <button type="button" (click)="setFilteredHiddenFromTech(true)"
                class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold transition-colors cursor-pointer shadow-xs">
                🙈 Ocultar {{ filteredStores().length }} do Técnico
              </button>
              <button type="button" (click)="setFilteredHiddenFromTech(false)"
                class="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-700 font-bold transition-colors cursor-pointer">
                👁️ Mostrar para o Técnico
              </button>
            </div>
          </div>
        }

        <!-- SELETOR DE MÊS PARA CONSULTA MENSAL DE LOJAS -->
        <div class="mb-5 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-2.5 flex-wrap">
            <span class="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <span>📅</span>
              <span>Consultar Mês:</span>
            </span>

            <div class="flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg shadow-2xs overflow-hidden">
              <button type="button" (click)="prevMonth()" title="Mês anterior"
                class="px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition-colors cursor-pointer border-r border-slate-200 dark:border-slate-700">
                ◀
              </button>
              <input 
                type="month" 
                [ngModel]="consultationMonth()" 
                (ngModelChange)="onConsultationMonthChange($event)"
                class="px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 bg-transparent outline-none cursor-pointer">
              <button type="button" (click)="nextMonth()" title="Próximo mês"
                class="px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition-colors cursor-pointer border-l border-slate-200 dark:border-slate-700">
                ▶
              </button>
            </div>

            @if (viewMode() === 'month') {
              @if (hasListForSelectedMonth()) {
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <span>✓</span> {{ activeCount() }} ativas @if (inactiveCount() > 0) { ({{ inactiveCount() }} inativas) } · {{ totalUtilityCount() }} no total
                </span>
                @if (authService.canManageStores() && totalUtilityCount() > 0) {
                  <button type="button" (click)="confirmClearMonthStores()"
                    class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Apagar todas as lojas de {{ getTabName() }} deste mês ({{ consultationMonth() }})">
                    <span>🗑️</span>
                    <span>Apagar lojas de {{ consultationMonth() }} ({{ getTabName() }})</span>
                  </button>
                }
              } @else {
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  <span>⚠️</span> Mês em branco (sem lista)
                </span>
              }
            }
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            @if (availableMonths().length > 0) {
              <span class="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 hidden sm:inline">Meses disponíveis:</span>
              <div class="flex items-center gap-1 overflow-x-auto max-w-[280px]">
                @for (m of availableMonths().slice(0, 4); track m) {
                  <button type="button" 
                    (click)="onConsultationMonthChange(m); viewMode.set('month')"
                    [class]="viewMode() === 'month' && consultationMonth() === m ? 'bg-teal-700 text-white font-bold shadow-2xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'"
                    class="px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap">
                    {{ m }}
                  </button>
                }
              </div>
            }

            <button type="button" 
              (click)="toggleViewMode()"
              [class]="viewMode() === 'all' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-slate-800'"
              class="px-2.5 py-1 rounded-lg text-xs transition-colors font-medium cursor-pointer ml-1"
              title="Alternar entre ver mês selecionado ou ver cadastro geral de todas as lojas">
              {{ viewMode() === 'all' ? '📅 Ver por Mês' : '🌐 Todas (Geral)' }}
            </button>
          </div>
        </div>

        <!-- FORMULÁRIO MANUAL -->
        @if (showForm()) {
          <div class="mb-8 p-5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 animate-fade-in shadow-sm transition-colors">
            <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              <h3 class="font-bold text-slate-700 dark:text-slate-200 text-sm flex items-center gap-2">
                @if (editingId()) { ✏️ Editar Dados da Loja } @else { ➕ Cadastrar Nova Loja }
              </h3>
              @if (editingId()) {
                <button (click)="resetForm(); showForm.set(false)" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Fechar</button>
              }
            </div>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  LUC (Espaço da Loja) <span class="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  [(ngModel)]="newLuc" 
                  class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" 
                  placeholder="Ex: 1020 ou L-101">
              </div>
              
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nº do Contrato
                </label>
                <input 
                  type="text" 
                  [(ngModel)]="newContrato" 
                  class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" 
                  placeholder="Ex: 333 ou 444">
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nome da Loja / Lojista <span class="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  [(ngModel)]="newStoreName" 
                  class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" 
                  placeholder="Ex: Burger King ou Madero">
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>📍 Ordem na Rota</span>
                  <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-normal lowercase">(caminho)</span>
                </label>
                <input 
                  type="number" 
                  min="1"
                  [(ngModel)]="newRouteOrder" 
                  class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" 
                  placeholder="Ex: 1, 2, 3...">
              </div>
            </div>
            
            <div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div>
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Serviços Utilizados:</label>
                <div class="flex flex-wrap gap-2">
                    <label class="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-warning hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors shadow-xs">
                      <input type="checkbox" [(ngModel)]="newUsesLuz" class="rounded text-warning focus:ring-warning">
                      <span class="text-xs font-bold text-slate-700 dark:text-slate-300">⚡ Luz</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-accent hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors shadow-xs">
                      <input type="checkbox" [(ngModel)]="newUsesAgua" class="rounded text-accent focus:ring-accent">
                      <span class="text-xs font-bold text-slate-700 dark:text-slate-300">💧 Água</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-danger hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shadow-xs">
                      <input type="checkbox" [(ngModel)]="newUsesGas" class="rounded text-danger focus:ring-danger">
                      <span class="text-xs font-bold text-slate-700 dark:text-slate-300">🔥 Gás</span>
                    </label>
                </div>
              </div>

              <!-- Status Ativo Toggle -->
              <div>
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Situação no Rateio:</label>
                <label class="flex items-center gap-2 cursor-pointer bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 w-fit">
                  <input type="checkbox" [(ngModel)]="newIsActive" class="rounded text-emerald-600 focus:ring-emerald-500">
                  <span class="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {{ newIsActive ? '● Loja Ativa no rateio' : '○ Loja Inativa (não receberá novos lançamentos)' }}
                  </span>
                </label>
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
              <button (click)="showForm.set(false)" class="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 text-sm font-semibold transition-colors">
                Cancelar
              </button>
              <button (click)="saveStore()" [disabled]="!isValid()" 
                class="px-6 py-2 bg-slate-900 dark:bg-teal-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold shadow-sm transition-all">
                @if (editingId()) { Salvar Alterações } @else { Cadastrar Loja }
              </button>
            </div>
          </div>
        }

        <!-- ÁREA DE IMPORTAÇÃO MENSAL INTELIGENTE -->
        @if (showImport()) {
          <div class="mb-8 p-5 bg-teal-50/70 rounded-xl border border-teal-200 animate-fade-in shadow-xs">
            <div class="flex justify-between items-start mb-3">
              <div>
                <h3 class="font-bold text-teal-900 text-base flex items-center gap-2 flex-wrap">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span>Importação Mensal com Detecção Automática de Mudança de Lojas</span>
                  <span class="px-2 py-0.5 rounded-full text-xs font-extrabold bg-white border border-teal-300 text-teal-800">
                    @if (activeTab() === 'luz') { ⚡ Luz } @else if (activeTab() === 'agua') { 💧 Água } @else { 🔥 Gás }
                  </span>
                </h3>
                <p class="text-xs text-teal-700 mt-1">
                  Cole a lista mensal completa das lojas cadastradas (<strong>LUC</strong>, <strong>CONTRATO</strong> e <strong>NOME</strong>).
                  O sistema compara automaticamente com o shopping: se um mesmo LUC estiver com contrato ou lojista diferente, <strong>a loja antiga será inativada e a nova assumirá a partir deste mês</strong>, preservando todo o histórico anterior!
                </p>
              </div>
              <button (click)="showImport.set(false)" class="text-teal-400 hover:text-teal-600 font-bold text-lg p-1">✕</button>
            </div>

            <!-- Controles do Mês de Referência e Regra de Ausentes -->
            <div class="bg-white p-3.5 rounded-lg border border-teal-200 mb-4 flex flex-col gap-2 text-xs">
              <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <label class="font-bold text-teal-900 whitespace-nowrap">📅 Mês de Vigência desta Lista:</label>
                  <input 
                    type="month" 
                    [ngModel]="importReferenceMonth()" 
                    (ngModelChange)="importReferenceMonth.set($event)"
                    class="px-2.5 py-1.5 border border-teal-300 rounded font-bold text-teal-900 bg-teal-50/50 outline-none">
                </div>

                <label class="flex items-center gap-2 cursor-pointer font-medium text-teal-800">
                  <input type="checkbox" [ngModel]="inactivateMissing()" (ngModelChange)="inactivateMissing.set($event)" class="rounded text-teal-600">
                  <span>Inativar lojas ativas de {{ getTabName() }} que <strong>não constam</strong> nesta lista mensal</span>
                </label>
              </div>
              @if (inactivateMissing() && hasFutureMonthsAfterImport()) {
                <div class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  ℹ️ Já existem listas cadastradas em meses posteriores a <strong>{{ importReferenceMonth() }}</strong>. Lojas presentes em meses futuros serão protegidas contra inativação global automática.
                </div>
              }
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <!-- Área de Upload ou Colagem -->
              <div class="flex flex-col gap-2.5">
                <!-- Upload direto de Planilha (.xlsx, .xls, .csv) -->
                <div
                  (dragover)="$event.preventDefault(); isDraggingStoreFile.set(true)"
                  (dragleave)="isDraggingStoreFile.set(false)"
                  (drop)="onStoreFileDrop($event)"
                  [class]="isDraggingStoreFile() ? 'border-teal-600 bg-teal-100/70' : 'border-teal-300 bg-white/90 hover:border-teal-500'"
                  class="relative border-2 border-dashed rounded-xl px-3.5 py-2.5 transition-colors cursor-pointer flex items-center justify-between gap-2">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    (change)="onStoreFileSelected($event)"
                    class="absolute inset-0 opacity-0 cursor-pointer w-full h-full">
                  <div class="flex items-center gap-2.5 pointer-events-none min-w-0">
                    <span class="text-xl shrink-0">📊</span>
                    <div class="text-xs min-w-0">
                      <div class="font-bold text-teal-900 truncate">
                        {{ importFileName() ? ('Arquivo: ' + importFileName()) : 'Subir planilha Excel (.xlsx, .xls, .csv) — mesmo desorganizada' }}
                      </div>
                      <div class="text-[11px] text-teal-700">
                        Arraste ou clique aqui · detecta automaticamente cabeçalho, abas e colunas LUC/Contrato/Nome
                      </div>
                    </div>
                  </div>
                  <span class="px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-bold shrink-0 pointer-events-none">
                    Selecionar
                  </span>
                </div>

                <!-- Seletor de Aba (quando o Excel possui múltiplas abas) -->
                @if (importWorkbookSheets().length > 1) {
                  <div class="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-teal-200 text-xs">
                    <span class="font-bold text-teal-900 whitespace-nowrap">📑 Aba do Excel:</span>
                    <select
                      [ngModel]="selectedImportSheetIndex()"
                      (ngModelChange)="onSelectImportSheet($event)"
                      class="flex-1 bg-teal-50/50 border border-teal-200 rounded px-2 py-1 text-xs font-bold text-teal-900">
                      @for (sheet of importWorkbookSheets(); track sheet.name; let i = $index) {
                        <option [ngValue]="i">{{ sheet.name }}</option>
                      }
                    </select>
                  </div>
                }

                @if (importSmartInfo()) {
                  <div class="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium flex items-center gap-1.5">
                    <span>✨</span>
                    <span>{{ importSmartInfo() }}</span>
                  </div>
                }

                @if (importDetectedUtility() && importDetectedUtility() !== activeTab()) {
                  <div class="text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 font-semibold">
                    ⚠️ Atenção: esta planilha parece ser de <strong>{{ importDetectedUtility() === 'luz' ? 'Energia/Luz' : (importDetectedUtility() === 'agua' ? 'Água' : 'Gás') }}</strong>, mas você está na aba <strong>{{ getTabName() }}</strong>. Confirme se está na aba correta!
                  </div>
                }

                @if (importIsMultiMonthMatrix() && importMatrixActiveRows().length > 0 && importMatrixActiveRows().length < importMatrixAllRows().length) {
                  <label class="text-[11px] px-2.5 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      [ngModel]="filterMatrixActiveOnly()"
                      (ngModelChange)="toggleFilterMatrixActiveOnly($event)"
                      class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
                    <span>
                      Importar apenas lojas com medição/consumo nesta planilha
                      (<strong>{{ importMatrixActiveRows().length }}</strong> de {{ importMatrixAllRows().length }})
                      <span class="block text-[10px] font-normal text-indigo-700 mt-0.5">
                        Ideal para planilhas como Gás que listam todo o shopping mas só possuem medidor nas operações ativas.
                      </span>
                    </span>
                  </label>
                }

                <div class="flex justify-between items-center">
                  <span class="text-xs font-bold text-teal-800 uppercase tracking-wide">Ou cole os dados da planilha (Ctrl+V)</span>
                  <span class="text-[11px] text-teal-600">Aceita planilha inteira ou LUC / CONTRATO / NOME</span>
                </div>
                <textarea 
                  [ngModel]="importText()" 
                  (ngModelChange)="updateImportPreview($event)"
                  class="w-full h-44 p-3 border border-teal-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono text-xs bg-white shadow-inner resize-none" 
                  placeholder="1020	444	Madero&#10;1021	550	Renner&#10;1022	612	McDonalds"></textarea>
                
                <div class="flex items-center justify-between text-xs text-teal-700">
                  <span>
                    {{ parsedImportData().length }} lojas detectadas
                    @if (skippedImportLines().length > 0) {
                      <span class="text-amber-700 font-semibold ml-1">({{ skippedImportLines().length }} linha(s) ignorada(s))</span>
                    }
                  </span>
                  @if (importText() || importFileName()) {
                    <button (click)="clearImport()" class="text-teal-600 hover:text-teal-800 underline">Limpar importação</button>
                  }
                </div>
              </div>

              <!-- Pré-visualização e Análise Inteligente -->
              <div class="bg-white rounded-xl border border-teal-200 overflow-hidden flex flex-col h-80 shadow-xs">
                <div class="bg-teal-100/90 px-4 py-2.5 text-xs font-bold text-teal-900 flex justify-between items-center border-b border-teal-200">
                  <span>Diagnóstico da Importação Mensal</span>
                  @if (parsedImportData().length > 0) {
                    <button (click)="confirmMonthlyImport()" [disabled]="isImporting()" class="px-3.5 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-wait transition-colors shadow-sm font-bold text-xs uppercase tracking-wide">
                      {{ isImporting() ? 'Salvando...' : 'Confirmar Atualização' }}
                    </button>
                  }
                </div>
                
                <div class="overflow-y-auto flex-1 p-3 space-y-3 custom-scrollbar text-xs">
                  @if (parsedImportData().length === 0) {
                    <div class="p-8 text-center text-slate-400 italic">
                      Cole a planilha acima para ver o diagnóstico automático de substituições...
                    </div>
                  } @else {
                    <!-- Summary Cards -->
                    <div class="grid grid-cols-3 gap-2 text-center">
                      <div class="p-2 rounded bg-emerald-50 border border-emerald-200">
                        <div class="text-[10px] uppercase font-bold text-emerald-700">Mantidas</div>
                        <div class="text-lg font-extrabold text-emerald-800">{{ importAnalysis().maintained.length + importAnalysis().reactivated.length }}</div>
                        @if (importAnalysis().reactivated.length > 0) {
                          <div class="text-[10px] text-emerald-700">({{ importAnalysis().reactivated.length }} reativ.)</div>
                        }
                      </div>
                      <div class="p-2 rounded bg-amber-50 border border-amber-200">
                        <div class="text-[10px] uppercase font-bold text-amber-700">Substituições</div>
                        <div class="text-lg font-extrabold text-amber-800">{{ importAnalysis().replacements.length }}</div>
                      </div>
                      <div class="p-2 rounded bg-blue-50 border border-blue-200">
                        <div class="text-[10px] uppercase font-bold text-blue-700">Novas Lojas</div>
                        <div class="text-lg font-extrabold text-blue-800">{{ importAnalysis().brandNew.length }}</div>
                      </div>
                    </div>

                    @if (importAnalysis().duplicateRows.length > 0) {
                      <div class="p-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-[11px]">
                        ℹ️ <strong>{{ importAnalysis().duplicateRows.length }} linha(s) duplicada(s)</strong> na planilha serão ignoradas automaticamente.
                      </div>
                    }

                    @if (skippedImportLines().length > 0) {
                      <div class="p-2.5 bg-rose-50 rounded-lg border border-rose-200 text-rose-800 text-[11px] space-y-1">
                        <div class="font-bold">⚠️ {{ skippedImportLines().length }} linha(s) do texto não puderam ser lidas:</div>
                        @for (sk of skippedImportLines().slice(0, 3); track sk.lineNumber) {
                          <div class="font-mono text-[10px] truncate">Linha {{ sk.lineNumber }}: {{ sk.reason }} — "{{ sk.content }}"</div>
                        }
                      </div>
                    }

                    <!-- Highlight Substituições Detectadas -->
                    @if (importAnalysis().replacements.length > 0) {
                      <div class="p-3 bg-amber-50/90 rounded-lg border border-amber-300">
                        <div class="font-bold text-amber-900 flex items-center gap-1.5 mb-1.5">
                          <span>🔄</span>
                          <span>{{ importAnalysis().replacements.length }} Substituição(ões) no mesmo espaço (LUC):</span>
                        </div>
                        <div class="space-y-1.5">
                          @for (rep of importAnalysis().replacements; track $index) {
                            <div class="bg-white p-2 rounded border border-amber-200 text-[11px] flex flex-col gap-0.5">
                              <div class="flex items-center justify-between font-mono">
                                <span class="font-bold text-slate-800">LUC: {{ rep.luc }}</span>
                                <span class="text-amber-700 font-semibold text-[10px] bg-amber-100 px-1.5 py-0.2 rounded">
                                  {{ rep.reactivatedStore ? 'Retorno / Troca de Contrato' : 'Mudança de Contrato' }}
                                </span>
                              </div>
                              <div class="flex items-center gap-1.5 text-slate-600">
                                <span class="text-red-600 line-through">Antiga: <strong>{{ rep.oldStore.name }}</strong> (Ctr: {{ rep.oldStore.contrato || '-' }})</span>
                                <span>➔</span>
                                <span class="text-emerald-700 font-bold">Nova: {{ rep.newName }} (Ctr: {{ rep.newContrato || '-' }})</span>
                              </div>
                              <span class="text-[10px] text-slate-400 italic">
                                * Em {{ getTabName() }}, {{ rep.oldStore.name }} será substituída a partir de {{ importReferenceMonth() }} mantendo todo o histórico e sem afetar as demais utilidades.
                              </span>
                            </div>
                          }
                        </div>
                      </div>
                    }

                    <!-- Lojas Ausentes a Inativar -->
                    @if (inactivateMissing() && importAnalysis().missingStores.length > 0) {
                      <div class="p-2.5 bg-slate-100 rounded-lg border border-slate-200 text-slate-700 text-[11px]">
                        <span class="font-bold text-slate-800">⚠️ {{ importAnalysis().missingStores.length }} loja(s) ativas de {{ getTabName() }} não constam nesta lista</span> e serão removidas da lista de {{ importReferenceMonth() }} (histórico preservado).
                      </div>
                    }

                    <!-- Table Preview -->
                    <div class="rounded border border-slate-200 overflow-hidden">
                      <table class="w-full text-left border-collapse text-xs">
                        <thead class="bg-slate-50 sticky top-0 border-b border-slate-200">
                          <tr>
                            <th class="p-2 font-bold text-slate-700 w-20">LUC</th>
                            <th class="p-2 font-bold text-slate-700 w-24">Contrato</th>
                            <th class="p-2 font-bold text-slate-700">Nome da Loja</th>
                            <th class="p-2 font-bold text-slate-700 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                          @for (item of parsedImportData(); track $index) {
                            @let action = importAnalysis().rowActions[$index];
                            <tr class="hover:bg-slate-50" [class.bg-amber-50]="action === 'replacement'">
                              <td class="p-2 font-mono font-bold text-slate-700">{{ item.luc }}</td>
                              <td class="p-2 font-mono text-slate-600">{{ item.contrato || '-' }}</td>
                              <td class="p-2 text-slate-800 font-medium">{{ item.name }}</td>
                              <td class="p-2 text-right">
                                @if (action === 'replacement') {
                                  <span class="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Substitui</span>
                                } @else if (action === 'reactivated') {
                                  <span class="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded font-bold">Reativar</span>
                                } @else if (action === 'new') {
                                  <span class="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">Nova</span>
                                } @else if (action === 'duplicate') {
                                  <span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">Duplicada</span>
                                } @else {
                                  <span class="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Mantida</span>
                                }
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </div>

                @if (parsedImportData().length > 0) {
                  <div class="p-2.5 bg-teal-50 border-t border-teal-100 text-[11px] text-teal-800 flex justify-between items-center px-4">
                    <span>Vigência: <strong>{{ importReferenceMonth() }}</strong> em <strong>{{ getTabName() }}</strong></span>
                    <button (click)="confirmMonthlyImport()" [disabled]="isImporting()" class="font-bold text-teal-800 hover:text-teal-900 disabled:opacity-50 underline">
                      {{ isImporting() ? 'Sincronizando...' : 'Aplicar Atualizações Agora →' }}
                    </button>
                  </div>
                }
              </div>
            </div>
          </div>
        }

        <!-- TABELA DE LOJAS -->
        <div class="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wider font-semibold">
                <th class="p-3.5 pl-4 w-20 text-center" title="Sequência física de leitura no shopping">Rota</th>
                <th class="p-3.5 w-28">LUC</th>
                <th class="p-3.5 w-32">Contrato</th>
                <th class="p-3.5">Nome da Loja</th>
                <th class="p-3.5 text-center w-36">Situação</th>
                <th class="p-3.5 text-center w-36">Serviços</th>
                
                @if (authService.canManageStores()) {
                  <th class="p-3.5 pr-4 text-right w-44">Ações</th>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              @for (store of filteredStores(); track store.id) {
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group" [class.bg-slate-50/50]="!isStoreActiveInSelectedMonth(store)" [class.dark:bg-slate-800/30]="!isStoreActiveInSelectedMonth(store)">
                  <td class="p-3.5 pl-4 text-center">
                    @if (store.routeOrder) {
                      <span class="inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-2xs" title="Posição {{ store.routeOrder }} na rota de leitura">
                        #{{ store.routeOrder }}
                      </span>
                    } @else {
                      <span class="text-slate-300 dark:text-slate-600 text-xs">-</span>
                    }
                  </td>
                  <td class="p-3.5 font-mono font-bold text-slate-700 dark:text-slate-200">
                    <span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      {{ store.luc }}
                    </span>
                  </td>
                  <td class="p-3.5 font-mono text-slate-600 dark:text-slate-400">
                    @if (store.contrato) {
                      <span class="text-xs bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                        {{ store.contrato }}
                      </span>
                    } @else {
                      <span class="text-slate-300 dark:text-slate-600 text-xs italic">Não inf.</span>
                    }
                  </td>
                  <td class="p-3.5">
                    <div class="font-medium flex items-center gap-2 flex-wrap" [class.text-slate-800]="isStoreActiveInSelectedMonth(store)" [class.dark:text-slate-100]="isStoreActiveInSelectedMonth(store)" [class.text-slate-400]="!isStoreActiveInSelectedMonth(store)" [class.dark:text-slate-500]="!isStoreActiveInSelectedMonth(store)">
                      <span>{{ store.name }}</span>
                      @if (store.hiddenFromTech) {
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800" title="Oculta para o Técnico em Campo — mantida no rateio e SAP para ADM">
                          🙈 Só ADM
                        </span>
                      }
                    </div>
                    @if (!isStoreActiveInSelectedMonth(store) && store.deactivationReason) {
                      <div class="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        ↳ {{ store.deactivationReason }}
                      </div>
                    }
                  </td>
                  
                  <!-- Situação (Ativa / Inativa) -->
                  <td class="p-3.5 text-center">
                    @if (isStoreActiveInSelectedMonth(store)) {
                      <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Ativa
                      </span>
                    } @else {
                      <div class="inline-flex flex-col items-center">
                        <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold border border-slate-300 dark:border-slate-700 inline-flex items-center gap-1.5">
                          <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          Inativa
                        </span>
                        @if (store.deactivatedAt) {
                          <span class="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">Desde {{ store.deactivatedAt }}</span>
                        }
                      </div>
                    }
                  </td>

                  <!-- Serviços Habilitados -->
                  <td class="p-3.5 text-center">
                    <div class="flex justify-center gap-1 text-[11px] font-bold">
                      <span class="px-1.5 py-0.5 rounded" [class]="store.usesLuz ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'">⚡</span>
                      <span class="px-1.5 py-0.5 rounded" [class]="store.usesAgua ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'">💧</span>
                      <span class="px-1.5 py-0.5 rounded" [class]="store.usesGas ? 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'">🔥</span>
                    </div>
                  </td>
                  
                  @if (authService.canManageStores()) {
                    <td class="p-3.5 pr-4 text-right">
                      <div class="flex justify-end items-center gap-1.5 flex-wrap">
                        <button (click)="toggleHideFromTech(store)"
                          [title]="store.hiddenFromTech ? 'Oculta para o Técnico em Campo (ativa no SAP/ADM). Clique para mostrar novamente ao técnico.' : 'Visível para o Técnico em Campo. Clique para ocultar do técnico sem excluir do rateio/SAP.'"
                          class="px-2 py-1 rounded-md transition-colors text-xs font-semibold border cursor-pointer"
                          [class]="store.hiddenFromTech
                            ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700 hover:bg-purple-200 dark:hover:bg-purple-900/70'
                            : 'text-slate-600 dark:text-slate-300 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/30 border-slate-200 dark:border-slate-700'">
                          {{ store.hiddenFromTech ? '🙈 Só ADM' : '👁️ Téc.' }}
                        </button>

                        <button (click)="editStore(store)" class="px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:text-accent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors text-xs font-semibold border border-slate-200 dark:border-slate-700">
                          Editar
                        </button>
                        
                        @if (isStoreActiveInSelectedMonth(store)) {
                          <button (click)="inactivateStore(store)" title="Inativar loja preservando histórico" class="px-2.5 py-1 text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-md transition-colors text-xs font-semibold border border-amber-200 dark:border-amber-800">
                            Inativar
                          </button>
                        } @else {
                          <button (click)="reactivateStore(store)" title="Reativar loja no rateio" class="px-2.5 py-1 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-md transition-colors text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                            Reativar
                          </button>
                        }

                        <button (click)="confirmRemoveStore(store)" title="Excluir permanentemente" class="p-1 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors text-xs">
                          ✕
                        </button>
                      </div>
                    </td>
                  }
                </tr>
              } @empty {
                <tr>
                  <td [attr.colspan]="authService.canManageStores() ? 7 : 6" class="p-10 text-center">
                    <div class="max-w-md mx-auto space-y-3">
                      <div class="text-3xl">🏬</div>
                      <p class="font-bold text-slate-700 dark:text-slate-200 text-sm">
                        @if (searchTerm()) {
                          Nenhuma loja encontrada para o termo "{{ searchTerm() }}".
                        } @else if (statusFilter() === 'inactive') {
                          Nenhuma loja inativa cadastrada para {{ getTabName() }}.
                        } @else if (viewMode() === 'month' && !hasListForSelectedMonth()) {
                          Mês {{ consultationMonth() }} em branco
                        } @else {
                          0 lojas cadastradas no banco de dados para {{ getTabName() }}.
                        }
                      </p>
                      <p class="text-xs text-slate-500 dark:text-slate-400">
                        @if (viewMode() === 'month' && !hasListForSelectedMonth() && !searchTerm()) {
                          Nenhuma lista mensal foi importada para {{ getTabName() }} em {{ consultationMonth() }}. Os meses sem importação permanecem em branco.
                        } @else {
                          O banco de dados está sincronizado em tempo real. Você pode cadastrar uma nova loja, importar a lista mensal ou carregar lojas de demonstração para testes.
                        }
                      </p>
                      @if (!searchTerm() && statusFilter() === 'active') {
                        <div class="flex flex-wrap items-center justify-center gap-2 pt-2">
                          @if (viewMode() === 'month' && !hasListForSelectedMonth()) {
                            <button (click)="openImportForSelectedMonth()" class="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer">
                              + Subir Lista Mensal para {{ consultationMonth() }}
                            </button>
                          }
                          <button (click)="toggleForm()" class="px-3.5 py-2 bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer">
                            + Adicionar Loja Manual
                          </button>
                          <button (click)="loadDemoStores()" class="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-700 cursor-pointer">
                            ⚡ Carregar Lojas de Exemplo
                          </button>
                          <button (click)="refreshStores()" class="px-3 py-2 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 rounded-lg text-xs font-bold border border-teal-300 dark:border-teal-800 cursor-pointer">
                            🔄 Recarregar Lista
                          </button>
                        </div>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE LOJA -->
      @if (storeToDelete(); as st) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <!-- Backdrop -->
          <div class="fixed inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" (click)="cancelRemoveStore()"></div>

          <!-- Dialog -->
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl shadow-2xl p-6 w-full max-w-md relative z-10 animate-fade-in space-y-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 flex items-center justify-center text-2xl text-rose-600 shrink-0">
                ⚠️
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-white">Excluir Loja Definitivamente?</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">Esta ação removerá permanentemente o cadastro da loja do sistema.</p>
              </div>
            </div>

            <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div><strong>Loja:</strong> <span class="font-bold text-slate-800 dark:text-slate-200">{{ st.name }}</span></div>
              <div><strong>LUC:</strong> <span class="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">{{ st.luc }}</span></div>
              @if (st.contrato) {
                <div><strong>Contrato:</strong> <span class="font-mono">{{ st.contrato }}</span></div>
              }
            </div>

            <p class="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800">
              💡 <strong>Dica:</strong> Se o lojista apenas desocupou a loja, recomendamos <strong>"Inativar"</strong> para preservar o histórico de faturas passadas.
            </p>

            @if (getOtherUtilityNames(st).length > 0) {
              <div class="text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg border border-rose-200 dark:border-rose-800 space-y-2">
                <div>
                  🔒 <strong>Independência entre utilidades:</strong> esta loja também está vinculada a <strong>{{ getOtherUtilityNames(st).join(' e ') }}</strong>.
                  "Excluir de Tudo" apagará a loja de todas as utilidades.
                </div>
                <button type="button" (click)="unlinkFromCurrentUtility(st)"
                  class="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer">
                  Remover apenas de {{ getTabName() }}@if (viewMode() === 'month') { ({{ consultationMonth() }}) } (manter em {{ getOtherUtilityNames(st).join(' / ') }})
                </button>
              </div>
            }

            <div class="flex flex-col sm:flex-row gap-2 pt-2">
              <button type="button" (click)="cancelRemoveStore()" 
                class="flex-1 py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer text-center">
                Cancelar
              </button>
              
              <button type="button" (click)="inactivateStore(st); cancelRemoveStore()" 
                class="flex-1 py-2.5 px-3 bg-amber-100 dark:bg-amber-950/80 hover:bg-amber-200 text-amber-900 dark:text-amber-200 font-bold text-xs rounded-xl transition-colors cursor-pointer text-center">
                Apenas Inativar
              </button>

              <button type="button" (click)="executeRemoveStore()" 
                class="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-sm text-center">
                {{ getOtherUtilityNames(st).length > 0 ? 'Excluir de Tudo' : 'Sim, Excluir' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fadeIn 0.25s ease-out;
    }
  `]
})
export class StoreManagerComponent {
  storeService = inject(StoreService);
  historyService = inject(HistoryService);
  authService = inject(AuthService);
  indexedDb = inject(IndexedDbService);
  
  activeTab = signal<TabType>('luz');
  statusFilter = signal<StatusFilter | 'hidden_tech'>('active');
  searchTerm = signal('');

  // Manual Form State
  showForm = signal(false);
  editingId = signal<string | null>(null);
  
  newLuc = '';
  newContrato = '';
  newStoreName = '';
  newRouteOrder: number | null = null;
  newIsActive = true;
  newUsesLuz = true;
  newUsesAgua = true;
  newUsesGas = false;

  // Monthly Import State
  showImport = signal(false);
  importText = signal('');
  importFileName = signal('');
  importWorkbookSheets = signal<ParsedSheetGrid[]>([]);
  selectedImportSheetIndex = signal<number>(0);
  importSmartInfo = signal<string>('');
  importDetectedUtility = signal<TabType | null>(null);
  importMatrixAllRows = signal<ParsedStoreRow[]>([]);
  importMatrixActiveRows = signal<ParsedStoreRow[]>([]);
  importIsMultiMonthMatrix = signal<boolean>(false);
  filterMatrixActiveOnly = signal<boolean>(false);
  isDraggingStoreFile = signal(false);
  parsedImportData = signal<ParsedStoreRow[]>([]);
  skippedImportLines = signal<SkippedImportLine[]>([]);
  detectedImportOrder = signal<string>('auto');
  isImporting = signal(false);
  importReferenceMonth = signal<string>(new Date().toISOString().substring(0, 7));
  inactivateMissing = signal<boolean>(true);

  // Monthly Consultation & Isolation State
  consultationMonth = signal<string>(new Date().toISOString().substring(0, 7));
  viewMode = signal<'month' | 'all'>('month');

  hasListForSelectedMonth = computed(() => {
    return this.storeService.hasMonthlyList(this.activeTab(), this.consultationMonth());
  });

  availableMonths = computed(() => {
    return this.storeService.getAvailableMonths(this.activeTab());
  });

  // Stores in active tab (respeitando o mês selecionado ou o catálogo geral)
  allTabStores = computed(() => {
     const type = this.activeTab();
     if (this.viewMode() === 'all') {
       return this.storeService.storesByType(type, true)();
     }
     return this.storeService.getStoresForMonth(type, this.consultationMonth(), true);
  });

  prevMonth() {
    const [year, month] = this.consultationMonth().split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.onConsultationMonthChange(ym);
  }

  nextMonth() {
    const [year, month] = this.consultationMonth().split('-').map(Number);
    const d = new Date(year, month, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.onConsultationMonthChange(ym);
  }

  onConsultationMonthChange(month: string) {
    if (!month) return;
    this.consultationMonth.set(month);
    this.importReferenceMonth.set(month);
  }

  toggleViewMode() {
    this.viewMode.update(m => m === 'month' ? 'all' : 'month');
  }

  openImportForSelectedMonth() {
    if (!this.authService.canManageStores()) return;
    this.showForm.set(false);
    this.importReferenceMonth.set(this.consultationMonth());
    this.clearImport();
    this.showImport.set(true);
  }

  confirmClearMonthStores() {
    const tabName = this.getTabName();
    const month = this.consultationMonth();
    const type = this.activeTab();
    const count = this.totalUtilityCount();

    const confirmed = confirm(
      `ATENÇÃO: Deseja apagar todas as lojas de ${tabName} do mês de referência ${month}?\n\n` +
      `• Serão apagadas todas as ${count} lojas deste mês específico (${tabName} - ${month}).\n` +
      `• Os outros meses e as outras utilidades (Água, Gás, Luz) NÃO serão afetados.\n` +
      `• As lojas continuam salvas no Catálogo Geral.`
    );

    if (!confirmed) return;

    this.storeService.clearMonthlyStoreList(type, month);
    this.historyService.clearBillForMonth(type, month);
    this.indexedDb.showToast(`🗑️ Lojas de ${tabName} do mês ${month} foram apagadas com sucesso!`);
  }

  isStoreActiveInSelectedMonth(store: Store): boolean {
    if (this.viewMode() === 'month') {
      return isStoreActiveInMonth(store, this.consultationMonth(), false);
    }
    return store.active !== false;
  }

  activeCount = computed(() => {
    const isMonthView = this.viewMode() === 'month';
    const m = this.consultationMonth();
    return this.allTabStores().filter(s => {
      if (isMonthView) {
        return isStoreActiveInMonth(s, m, false);
      }
      return s.active !== false;
    }).length;
  });

  inactiveCount = computed(() => {
    const isMonthView = this.viewMode() === 'month';
    const m = this.consultationMonth();
    return this.allTabStores().filter(s => {
      if (isMonthView) {
        return !isStoreActiveInMonth(s, m, false);
      }
      return s.active === false;
    }).length;
  });

  totalUtilityCount = computed(() => {
    return this.allTabStores().length;
  });

  hiddenFromTechCount = computed(() => {
    return this.allTabStores().filter(s => s.hiddenFromTech === true).length;
  });

  toggleHideFromTech(store: Store) {
    if (!this.authService.canManageStores()) return;
    const willHide = !store.hiddenFromTech;
    this.storeService.toggleHiddenFromTech(store.id);
    this.indexedDb.showToast(
      willHide
        ? `🙈 ${store.luc} - ${store.name} ocultada para o Técnico (mantida no SAP/ADM)`
        : `👁️ ${store.luc} - ${store.name} visível novamente para o Técnico`
    );
  }

  setFilteredHiddenFromTech(hidden: boolean) {
    if (!this.authService.canManageStores()) return;
    const targets = this.filteredStores();
    if (targets.length === 0) return;
    this.storeService.setHiddenFromTechBatch(targets.map(s => s.id), hidden);
    this.indexedDb.showToast(
      hidden
        ? `🙈 ${targets.length} loja(s) ocultada(s) para o Técnico em Campo (mantidas no SAP/ADM)`
        : `👁️ ${targets.length} loja(s) exibida(s) novamente para o Técnico em Campo`
    );
  }

  filteredStores = computed(() => {
     let list = this.allTabStores();
     const filter = this.statusFilter();
     const isMonthView = this.viewMode() === 'month';
     const m = this.consultationMonth();

     if (filter === 'active') {
       list = list.filter(s => isMonthView ? isStoreActiveInMonth(s, m, false) : s.active !== false);
     } else if (filter === 'inactive') {
       list = list.filter(s => isMonthView ? !isStoreActiveInMonth(s, m, false) : s.active === false);
     } else if (filter === 'hidden_tech') {
       list = list.filter(s => s.hiddenFromTech === true);
     }

     const query = this.searchTerm().trim().toLowerCase();
     let result = list;
     if (query) {
       result = list.filter(s => 
         s.luc.toLowerCase().includes(query) ||
         (s.contrato && s.contrato.toLowerCase().includes(query)) ||
         s.name.toLowerCase().includes(query)
       );
     }

     return [...result].sort((a, b) => {
       const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
       const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
       if (orderA !== orderB) return orderA - orderB;
       return a.luc.localeCompare(b.luc, undefined, { numeric: true });
     });
  });

  hasFutureMonthsAfterImport = computed(() => {
    const refMonth = this.importReferenceMonth();
    return this.availableMonths().some(m => m > refMonth);
  });

  // Pré-visualização 100% fiel ao motor de importação do StoreService
  importAnalysis = computed<MonthlyImportPreview>(() => {
    return this.storeService.previewMonthlyStoreImport(
      this.parsedImportData(),
      this.activeTab(),
      this.importReferenceMonth(),
      this.inactivateMissing()
    );
  });

  constructor() {
     // Reset form defaults when tab changes
     effect(() => {
         const tab = this.activeTab();
         this.newUsesLuz = tab === 'luz';
         this.newUsesAgua = tab === 'agua';
         this.newUsesGas = tab === 'gas';
     }, { allowSignalWrites: true });
  }

  setTab(tab: TabType) {
    this.activeTab.set(tab);
    this.showImport.set(false);
    this.showForm.set(false);
  }

  getTabName() {
    switch(this.activeTab()) {
      case 'luz': return 'Luz';
      case 'agua': return 'Água';
      case 'gas': return 'Gás';
    }
  }

  getTabColor() {
    switch(this.activeTab()) {
      case 'luz': return 'bg-warning';
      case 'agua': return 'bg-accent';
      case 'gas': return 'bg-danger';
    }
  }

  toggleForm() {
    if (!this.authService.canManageStores()) return;

    this.showImport.set(false);
    if (this.showForm()) {
        this.showForm.set(false);
        this.resetForm();
    } else {
        this.resetForm();
        this.showForm.set(true);
    }
  }

  toggleImport() {
    if (!this.authService.canManageStores()) return;

    this.showForm.set(false);
    this.showImport.update(v => !v);
    if (this.showImport()) {
      this.importReferenceMonth.set(this.consultationMonth());
      this.clearImport();
    }
  }

  clearImport() {
    this.importText.set('');
    this.importFileName.set('');
    this.importWorkbookSheets.set([]);
    this.selectedImportSheetIndex.set(0);
    this.importSmartInfo.set('');
    this.importDetectedUtility.set(null);
    this.importMatrixAllRows.set([]);
    this.importMatrixActiveRows.set([]);
    this.importIsMultiMonthMatrix.set(false);
    this.filterMatrixActiveOnly.set(false);
    this.parsedImportData.set([]);
    this.skippedImportLines.set([]);
    this.detectedImportOrder.set('auto');
  }

  toggleFilterMatrixActiveOnly(enabled: boolean) {
    this.filterMatrixActiveOnly.set(enabled);
    if (!this.importIsMultiMonthMatrix()) return;
    const rows = enabled ? this.importMatrixActiveRows() : this.importMatrixAllRows();
    this.parsedImportData.set(rows);
  }

  resetForm() {
    this.newLuc = '';
    this.newContrato = '';
    this.newStoreName = '';
    this.newRouteOrder = null;
    this.newIsActive = true;
    
    const tab = this.activeTab();
    this.newUsesLuz = tab === 'luz';
    this.newUsesAgua = tab === 'agua';
    this.newUsesGas = tab === 'gas';
    
    this.editingId.set(null);
  }

  editStore(store: Store) {
    if (!this.authService.canManageStores()) return;

    this.showImport.set(false);
    this.newLuc = store.luc;
    this.newContrato = store.contrato || '';
    this.newStoreName = store.name;
    this.newRouteOrder = store.routeOrder !== undefined && store.routeOrder !== null ? store.routeOrder : null;
    this.newIsActive = store.active !== false;
    this.newUsesLuz = store.usesLuz;
    this.newUsesAgua = store.usesAgua;
    this.newUsesGas = store.usesGas;
    this.editingId.set(store.id);
    this.showForm.set(true);
  }

  isValid() {
    return this.newLuc.trim() && this.newStoreName.trim();
  }

  saveStore() {
    if (this.isValid()) {
      const storePayload = {
        luc: this.newLuc.trim(),
        contrato: this.newContrato.trim(),
        name: this.newStoreName.trim(),
        routeOrder: this.newRouteOrder !== null && this.newRouteOrder !== undefined && (this.newRouteOrder as any) !== '' 
          ? Number(this.newRouteOrder) 
          : undefined,
        active: this.newIsActive,
        usesLuz: this.newUsesLuz,
        usesAgua: this.newUsesAgua,
        usesGas: this.newUsesGas
      };

      if (this.editingId()) {
        const id = this.editingId()!;
        const existing = this.storeService.stores().find(s => s.id === id);
        const deactivatedAt = storePayload.active
          ? undefined
          : (existing?.deactivatedAt || this.consultationMonth());
        const deactivationReason = storePayload.active
          ? undefined
          : (existing?.deactivationReason || 'Inativada manualmente');

        this.storeService.updateStore({
          ...(existing || {}),
          id,
          ...storePayload,
          deactivatedAt,
          deactivationReason
        });
      } else {
        this.storeService.addStore(storePayload, this.consultationMonth());
      }
      this.toggleForm();
    }
  }

  storeToDelete = signal<Store | null>(null);

  inactivateStore(store: Store) {
    const util = this.viewMode() === 'month' ? this.activeTab() : undefined;
    this.storeService.toggleStoreActive(store.id, this.consultationMonth(), 'Inativada manualmente', util);
  }

  reactivateStore(store: Store) {
    const util = this.viewMode() === 'month' ? this.activeTab() : undefined;
    this.storeService.toggleStoreActive(store.id, this.consultationMonth(), undefined, util);
  }

  confirmRemoveStore(store: Store) {
    this.storeToDelete.set(store);
  }

  cancelRemoveStore() {
    this.storeToDelete.set(null);
  }

  getOtherUtilityNames(store: Store): string[] {
    const tab = this.activeTab();
    const others: string[] = [];
    if (tab !== 'luz' && store.usesLuz) others.push('Luz');
    if (tab !== 'agua' && store.usesAgua) others.push('Água');
    if (tab !== 'gas' && store.usesGas) others.push('Gás');
    return others;
  }

  unlinkFromCurrentUtility(store: Store) {
    const tab = this.activeTab();
    const month = this.viewMode() === 'month' ? this.consultationMonth() : undefined;
    this.storeToDelete.set(null);
    this.storeService.unlinkStoreFromUtility(store.id, tab, month);
    this.indexedDb.showToast(
      `✂️ Loja "${store.name}" (${store.luc}) removida apenas de ${this.getTabName()}${month ? ` (${month})` : ''} — demais utilidades preservadas.`
    );
  }

  async executeRemoveStore() {
    const store = this.storeToDelete();
    if (!store) return;
    this.storeToDelete.set(null);
    await this.storeService.removeStore(store.id);
    this.indexedDb.showToast(`🗑️ Loja "${store.name}" (${store.luc}) excluída com sucesso do banco de dados.`);
  }

  async refreshStores() {
    await this.storeService.refreshStoresFromSupabase();
  }


  async loadDemoStores() {
    await this.storeService.loadDemoStores();
  }

  // --- PARSE DA IMPORTAÇÃO (LUC, CONTRATO, NOME) ---

  onStoreFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.parseStoreSpreadsheetFile(input.files[0]);
    input.value = '';
  }

  onStoreFileDrop(event: DragEvent) {
    event.preventDefault();
    this.isDraggingStoreFile.set(false);
    if (!event.dataTransfer?.files || event.dataTransfer.files.length === 0) return;
    this.parseStoreSpreadsheetFile(event.dataTransfer.files[0]);
  }

  parseStoreSpreadsheetFile(file: File) {
    this.importFileName.set(file.name);
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const reader = new FileReader();

    reader.onload = (e: any) => {
      try {
        if (isCsv) {
          const text = String(e.target?.result || '');
          const grid = parseTextToGrid(text);
          this.importWorkbookSheets.set([{ name: file.name, grid }]);
          this.selectedImportSheetIndex.set(0);
          this.applyStoreSheetGrid(grid, file.name);
        } else {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const sheets = extractSheetsFromWorkbook(wb);
          if (sheets.length === 0) {
            alert('A planilha selecionada está vazia.');
            return;
          }
          const bestIdx = chooseBestSheetIndex(sheets, this.activeTab(), this.importReferenceMonth());
          this.importWorkbookSheets.set(sheets);
          this.selectedImportSheetIndex.set(bestIdx);
          this.applyStoreSheetGrid(sheets[bestIdx].grid, sheets[bestIdx].name);
        }
      } catch (err) {
        console.error('Erro ao ler planilha de lojas:', err);
        alert('Não foi possível ler o arquivo. Certifique-se de que é um arquivo .xlsx, .xls ou .csv válido.');
      }
    };

    if (isCsv) {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
  }

  onSelectImportSheet(idx: number) {
    const sheets = this.importWorkbookSheets();
    const safeIdx = Number(idx);
    if (!sheets[safeIdx]) return;
    this.selectedImportSheetIndex.set(safeIdx);
    this.applyStoreSheetGrid(sheets[safeIdx].grid, sheets[safeIdx].name);
  }

  private applyStoreSheetGrid(grid: any[][], sourceLabel: string) {
    const extracted = extractMonthlyStoreRowsFromGrid(grid);
    const canFilterActive =
      extracted.isMultiMonthMatrix &&
      extracted.activeOnlyRows.length > 0 &&
      extracted.activeOnlyRows.length < extracted.rows.length;
    const defaultFilterActive = canFilterActive && this.activeTab() === 'gas';

    this.importMatrixAllRows.set(extracted.rows);
    this.importMatrixActiveRows.set(extracted.activeOnlyRows);
    this.importIsMultiMonthMatrix.set(extracted.isMultiMonthMatrix);
    this.filterMatrixActiveOnly.set(defaultFilterActive);

    const chosenRows = defaultFilterActive ? extracted.activeOnlyRows : extracted.rows;
    this.parsedImportData.set(chosenRows);
    this.skippedImportLines.set(extracted.skippedLines);
    this.detectedImportOrder.set(extracted.usedSmartMatrixParser ? 'smart-header' : 'auto');
    this.importDetectedUtility.set(extracted.detectedUtility);

    if (extracted.usedSmartMatrixParser && extracted.detectedHeaderRow >= 0) {
      const filterNote = defaultFilterActive
        ? ` (${extracted.activeOnlyRows.length} com medição de ${extracted.rows.length} no total)`
        : '';
      this.importSmartInfo.set(
        `Planilha inteligente (${sourceLabel}): cabeçalho encontrado na linha ${extracted.detectedHeaderRow + 1} · ${chosenRows.length} lojas extraídas automaticamente${filterNote}.`
      );
    } else {
      this.importSmartInfo.set(
        `Arquivo lido (${sourceLabel}): ${chosenRows.length} lojas detectadas.`
      );
    }
  }

  updateImportPreview(text: string) {
    this.importText.set(text);
    this.importFileName.set('');
    this.importWorkbookSheets.set([]);
    this.importSmartInfo.set('');
    this.importDetectedUtility.set(null);
    this.importMatrixAllRows.set([]);
    this.importMatrixActiveRows.set([]);
    this.importIsMultiMonthMatrix.set(false);
    this.filterMatrixActiveOnly.set(false);

    if (!text.trim()) {
      this.parsedImportData.set([]);
      this.skippedImportLines.set([]);
      this.detectedImportOrder.set('auto');
      return;
    }

    // Tenta detecção inteligente primeiro (suporta colar planilha mestre com linhas de resumo no topo e dezenas de colunas)
    const grid = parseTextToGrid(text);
    const smart = extractMonthlyStoreRowsFromGrid(grid);
    if (smart.usedSmartMatrixParser && smart.rows.length > 0) {
      const canFilterActive =
        smart.isMultiMonthMatrix &&
        smart.activeOnlyRows.length > 0 &&
        smart.activeOnlyRows.length < smart.rows.length;
      const defaultFilterActive = canFilterActive && this.activeTab() === 'gas';

      this.importMatrixAllRows.set(smart.rows);
      this.importMatrixActiveRows.set(smart.activeOnlyRows);
      this.importIsMultiMonthMatrix.set(smart.isMultiMonthMatrix);
      this.filterMatrixActiveOnly.set(defaultFilterActive);

      const chosenRows = defaultFilterActive ? smart.activeOnlyRows : smart.rows;
      this.parsedImportData.set(chosenRows);
      this.skippedImportLines.set(smart.skippedLines);
      this.detectedImportOrder.set('smart-header');
      this.importDetectedUtility.set(smart.detectedUtility);
      this.importSmartInfo.set(
        `Cabeçalho detectado automaticamente na linha ${smart.detectedHeaderRow + 1} · ${chosenRows.length} lojas extraídas (linhas de resumo e colunas extras ignoradas).`
      );
      return;
    }

    const parsedResult = parseMonthlyStoreListText(text);
    this.parsedImportData.set(parsedResult.rows);
    this.skippedImportLines.set(parsedResult.skippedLines);
    this.detectedImportOrder.set(parsedResult.detectedOrder);
  }

  async confirmMonthlyImport() {
    if (this.isImporting()) return;
    const data = this.parsedImportData();
    const type = this.activeTab();
    const refMonth = this.importReferenceMonth();
    const inactivate = this.inactivateMissing();

    if (data.length === 0) return;

    this.isImporting.set(true);
    try {
      const result = this.storeService.processMonthlyStoreImport(data, type, refMonth, inactivate, true);
      const syncRes = await this.storeService.flushSyncToSupabase();
      this.consultationMonth.set(refMonth);

      this.clearImport();
      this.showImport.set(false);

      const syncedFull = syncRes.storesOk && syncRes.listsOk;
      let msg = syncedFull
        ? `✅ Importação de ${this.getTabName()} concluída e sincronizada com a nuvem para ${refMonth}!\n\n`
        : `⚠️ Importação de ${this.getTabName()} salva localmente para ${refMonth}, mas houve falha ao sincronizar com a nuvem (verifique sua conexão e clique em Atualizar).\n\n`;
      msg += `• Lojas mantidas ativas: ${result.maintainedCount}\n`;
      if (result.reactivatedCount && result.reactivatedCount > 0) {
        msg += `  (incluindo ${result.reactivatedCount} reativada(s) preservando histórico)\n`;
      }
      msg += `• Lojas novas criadas: ${result.newCount}\n`;
      if (result.duplicateRowsIgnored && result.duplicateRowsIgnored > 0) {
        msg += `• Linhas duplicadas na planilha ignoradas: ${result.duplicateRowsIgnored}\n`;
      }

      if (result.replacements.length > 0) {
        msg += `\n🔄 ${result.replacements.length} Substituição(ões) efetuadas (lojas anteriores inativadas com histórico preservado):\n`;
        result.replacements.forEach(r => {
          msg += `  - LUC ${r.luc}: ${r.oldName} (Ctr: ${r.oldContrato || '-'}) ➔ Inativada | ${r.newName} (Ctr: ${r.newContrato || '-'}) ➔ Nova Ativa\n`;
        });
      }

      if (result.inactivatedMissing.length > 0) {
        msg += `\n⚠️ ${result.inactivatedMissing.length} loja(s) ausentes desvinculada(s)/inativada(s):\n`;
        result.inactivatedMissing.forEach(m => {
          msg += `  - ${m.name} (${m.luc})\n`;
        });
      }

      alert(msg);
    } finally {
      this.isImporting.set(false);
    }
  }
}