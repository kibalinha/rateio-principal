import { Injectable, signal } from '@angular/core';

import { AppView } from '../models';

export type { AppView };

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  currentView = signal<AppView>(this.getInitialView());
  queryParams = signal<Record<string, string>>(this.getInitialParams());
  isLocked = signal<boolean>(false);
  
  private lockTimer: any = null;
  private lastLockTimestamp = 0;

  constructor() {
    this.setupWindowListeners();
  }

  private parseHash(rawHash: string): { view: AppView | null; params: Record<string, string> } {
    const clean = (rawHash || '').replace(/^#\/?/, '');
    const [viewPart, queryPart] = clean.split('?');
    const params: Record<string, string> = {};
    if (queryPart) {
      try {
        const usp = new URLSearchParams(queryPart);
        usp.forEach((val, key) => { params[key] = val; });
      } catch (e) {}
    }
    const validViews: AppView[] = ['dashboard', 'calculator', 'stores', 'report'];
    const view = validViews.includes(viewPart as AppView) ? (viewPart as AppView) : null;
    return { view, params };
  }

  private getInitialParams(): Record<string, string> {
    if (typeof window !== 'undefined') {
      return this.parseHash(window.location.hash).params;
    }
    return {};
  }

  private getInitialView(): AppView {
    if (typeof window !== 'undefined') {
      try {
        const parsed = this.parseHash(window.location.hash);
        if (parsed.view) {
          return parsed.view;
        }
        const saved = localStorage.getItem('shop_rateio_current_view') as AppView;
        if (saved && ['dashboard', 'calculator', 'stores', 'report'].includes(saved)) {
          return saved;
        }
      } catch (e) {}
    }
    // Default: 'calculator' for field technicians
    return 'calculator';
  }

  /**
   * Trava a navegação temporariamente. Usado ao abrir a câmera ou voltar dela,
   * para evitar que o clique no botão "OK / Salvar" do app nativo de câmera
   * vaze (ghost click / tap-through) para a barra de navegação inferior (botão Dashboard).
   */
  lockNavigation(durationMs = 2500) {
    this.isLocked.set(true);
    this.lastLockTimestamp = Date.now();
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
    }
    this.lockTimer = setTimeout(() => {
      this.isLocked.set(false);
      this.lockTimer = null;
    }, durationMs);
  }

  unlockNavigation() {
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
    this.isLocked.set(false);
  }

  isRecentlyLocked(): boolean {
    return this.isLocked() || (Date.now() - this.lastLockTimestamp < 1800);
  }

  setView(view: AppView, params?: Record<string, string>, force = false): boolean {
    // Se a navegação estiver temporariamente bloqueada (ex: retorno da câmera do celular),
    // ignora qualquer clique fantasma que atinja a barra inferior
    if (!force && this.isRecentlyLocked()) {
      console.warn(`[NavigationService] Navegação para "${view}" ignorada para bloquear tap-through da câmera.`);
      return false;
    }

    this.currentView.set(view);
    if (params) {
      this.queryParams.set(params);
    } else {
      this.queryParams.set({});
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('shop_rateio_current_view', view);
        let hashUrl = `#${view}`;
        if (params && Object.keys(params).length > 0) {
          const usp = new URLSearchParams(params);
          hashUrl += `?${usp.toString()}`;
        }
        window.history.replaceState(null, '', hashUrl);
      } catch (e) {}
    }
    return true;
  }

  private setupWindowListeners() {
    if (typeof window === 'undefined') return;

    // Escuta mudanças de hash na URL, mas protege contra popstate/back involuntário do Android ao fechar a câmera
    window.addEventListener('hashchange', () => {
      const parsed = this.parseHash(window.location.hash);
      if (parsed.view) {
        if (this.isRecentlyLocked() && this.currentView() === 'calculator' && parsed.view !== 'calculator') {
          console.warn('[NavigationService] Hashchange para', parsed.view, 'bloqueado devido à atividade recente de câmera. Mantendo calculadora.');
          try {
            window.history.replaceState(null, '', '#calculator');
          } catch (e) {}
          return;
        }

        this.queryParams.set(parsed.params);
        if (this.currentView() !== parsed.view) {
          this.currentView.set(parsed.view);
          try {
            localStorage.setItem('shop_rateio_current_view', parsed.view);
          } catch (e) {}
        }
      }
    });

    // Quando a janela do navegador recupera o foco (ex: técnico bateu a foto e o app de câmera fechou)
    window.addEventListener('focus', () => {
      if (this.currentView() === 'calculator' || this.isRecentlyLocked()) {
        this.lockNavigation(1800);
      }
    });

    // Caso de tab restore por restrição de memória no mobile
    window.addEventListener('pageshow', () => {
      if (this.currentView() === 'calculator' || this.isRecentlyLocked()) {
        this.lockNavigation(1800);
      }
    });
  }
}
