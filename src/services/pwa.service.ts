import { Injectable, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  readonly isInstallable = signal<boolean>(false);
  readonly isInstalled = signal<boolean>(false);
  readonly isIOS = signal<boolean>(false);
  readonly isMobile = signal<boolean>(false);
  readonly showInstallBanner = signal<boolean>(false);
  readonly showIOSInstructions = signal<boolean>(false);

  constructor() {
    this.initPWA();
  }

  private initPWA() {
    if (typeof window === 'undefined') return;

    // Detecta se já está instalado e rodando em modo standalone (PWA instalado)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    this.isInstalled.set(isStandalone);

    // Detecta se é dispositivo iOS (iPhone / iPad)
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    this.isIOS.set(isIOSDevice);

    // Detecta se é dispositivo Mobile
    const isMobileDevice = /android|iphone|ipad|ipod|mobile/.test(ua) || window.innerWidth < 768;
    this.isMobile.set(isMobileDevice);

    // Escuta evento nativo de instalação do Chromium (Android / Chrome / Edge)
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.isInstallable.set(true);

      // Se for mobile e não estiver instalado, exibe automaticamente a pergunta de instalação
      if (!this.isInstalled() && !this.wasRecentlyDismissed()) {
        setTimeout(() => {
          this.showInstallBanner.set(true);
        }, 1200);
      }
    });

    // Para usuários de iPhone (Safari não dispara beforeinstallprompt nativo)
    if (isIOSDevice && !isStandalone && !this.wasRecentlyDismissed()) {
      setTimeout(() => {
        this.showInstallBanner.set(true);
      }, 1500);
    }

    // Quando o app for instalado com sucesso
    window.addEventListener('appinstalled', () => {
      this.isInstalled.set(true);
      this.isInstallable.set(false);
      this.showInstallBanner.set(false);
      this.deferredPrompt = null;
    });
  }

  private wasRecentlyDismissed(): boolean {
    try {
      const dismissed = localStorage.getItem('shoprateio_pwa_dismissed');
      if (!dismissed) return false;
      const time = parseInt(dismissed, 10);
      // Não incomoda novamente nas próximas 12 horas
      return Date.now() - time < 12 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }

  dismissBanner() {
    this.showInstallBanner.set(false);
    this.showIOSInstructions.set(false);
    try {
      localStorage.setItem('shoprateio_pwa_dismissed', Date.now().toString());
    } catch {}
  }

  openInstallPrompt() {
    if (this.isIOS()) {
      this.showIOSInstructions.set(true);
      return;
    }

    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          this.isInstalled.set(true);
          this.showInstallBanner.set(false);
        }
        this.deferredPrompt = null;
      });
    } else {
      // Se chamado manualmente e o prompt não estiver pronto
      this.showInstallBanner.set(true);
    }
  }
}
