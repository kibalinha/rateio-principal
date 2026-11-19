import { Injectable, signal, computed, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

import { UserRole } from '../models';

export type { UserRole };

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseService = (() => {
    try {
      return inject(SupabaseService);
    } catch {
      return {} as any;
    }
  })();

  private readonly MAX_FAILED_ADMIN_ATTEMPTS = 5;
  private readonly ADMIN_LOCKOUT_MS = 5 * 60 * 1000;
  private failedAdminAttempts = 0;
  private adminLockedUntilMs = 0;
  readonly adminLockoutUntil = signal<number>(0);

  readonly user = signal<any | null>(null);
  readonly firebaseUser = computed(() => this.user());
  readonly isAuthLoading = signal<boolean>(false);

  // O sistema sempre inicia no modo Técnico ('TEC') ao abrir/recarregar
  private getInitialRole(): UserRole {
    return 'TEC';
  }

  // Estado do papel atual (sempre inicia como 'TEC')
  currentUserRole = signal<UserRole>(this.getInitialRole());

  // Computed helpers para usar nos templates
  isAdmin = computed(() => this.currentUserRole() === 'ADM');
  isTech = computed(() => this.currentUserRole() === 'TEC');
  isViewer = computed(() => this.currentUserRole() === 'VIS');

  // Regras de Negócio:
  // Administradores: podem configurar despesas, faturas, consumo da concessionária e gerenciar lojas
  // Técnicos: preenchem apenas as leituras dos hidrômetros/medidores em campo
  // Visualizadores (VIS): modo apenas visualização
  canEditReadings = computed(() => this.isAdmin() || this.isTech());
  canManageStores = computed(() => this.isAdmin());
  canConfigureBill = computed(() => this.isAdmin());
  canImport = computed(() => this.isAdmin());

  constructor() {
    this.initAuthListener();
  }

  private initAuthListener() {
    if (typeof this.supabase?.getClient !== 'function') return;
    try {
      const client = this.supabase.getClient();
      client.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          this.user.set(session.user);
        }
      }).catch(() => { });

      client.auth.onAuthStateChange((event, session) => {
        const u = session?.user || null;
        this.user.set(u);
        if (event === 'SIGNED_IN' && u && (u.email === 'herrypotterluizfelipe95@gmail.com' || u.email?.includes('admin'))) {
          this.setRole('ADM');
        }
      });
    } catch (err) {
      console.warn('Erro ao inicializar listener de autenticação:', err);
    }
  }

  async loginWithGoogle(): Promise<void> {
    try {
      const client = this.supabase.getClient();
      await client.auth.signInWithOAuth({ provider: 'google' });
    } catch (error: any) {
      console.error('Erro no login com Google:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      const client = this.supabase.getClient();
      await client.auth.signOut();
      this.user.set(null);
      this.setRole('TEC');
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
  }

  setRole(role: UserRole) {
    this.currentUserRole.set(role);
  }

  private getAdminPassword(): string {
    if (typeof window !== 'undefined') {
      const envPassword = (window as any).__env?.ADMIN_PASSWORD;
      if (typeof envPassword === 'string' && envPassword.length > 0) {
        return envPassword;
      }
    }
    return 'admin123';
  }

  isAdminLoginLocked(): boolean {
    const now = Date.now();
    if (this.adminLockedUntilMs > now) {
      return true;
    }
    if (this.adminLockedUntilMs > 0 && now >= this.adminLockedUntilMs) {
      this.adminLockedUntilMs = 0;
      this.failedAdminAttempts = 0;
      this.adminLockoutUntil.set(0);
    }
    return false;
  }

  getAdminLockRemainingSeconds(): number {
    if (!this.isAdminLoginLocked()) return 0;
    return Math.max(0, Math.ceil((this.adminLockedUntilMs - Date.now()) / 1000));
  }

  validateAdminPassword(password: string): boolean {
    const now = Date.now();
    if (this.isAdminLoginLocked()) {
      return false;
    }

    const isValid = password === this.getAdminPassword();
    if (isValid) {
      this.failedAdminAttempts = 0;
      this.adminLockedUntilMs = 0;
      this.adminLockoutUntil.set(0);
      return true;
    }

    this.failedAdminAttempts += 1;
    if (this.failedAdminAttempts >= this.MAX_FAILED_ADMIN_ATTEMPTS) {
      this.adminLockedUntilMs = now + this.ADMIN_LOCKOUT_MS;
      this.adminLockoutUntil.set(this.adminLockedUntilMs);
    }
    return false;
  }

  getRoleLabel(role: UserRole) {
    switch (role) {
      case 'ADM': return 'Administrador';
      case 'TEC': return 'Técnico';
      case 'VIS': return 'Visualizador';
    }
  }
}
