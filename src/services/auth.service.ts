import { Injectable, signal, computed, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type UserRole = 'ADM' | 'TEC' | 'VIS';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase = inject(SupabaseService);

  readonly user = signal<any | null>(null);
  readonly firebaseUser = computed(() => this.user());
  readonly isAuthLoading = signal<boolean>(false);

  // Estado do papel atual (Padrão: TEC ou ADM para administrador do app)
  currentUserRole = signal<UserRole>('TEC');

  // Computed helpers para usar nos templates
  isAdmin = computed(() => this.currentUserRole() === 'ADM');
  isTech = computed(() => this.currentUserRole() === 'TEC');
  isViewer = computed(() => this.currentUserRole() === 'VIS');

  // Regras de Negócio
  canEditReadings = computed(() => this.isAdmin() || this.isTech());
  canManageStores = computed(() => this.isAdmin());
  canConfigureBill = computed(() => this.isAdmin());
  canImport = computed(() => this.isAdmin());

  constructor() {
    this.initAuthListener();
  }

  private initAuthListener() {
    try {
      const client = this.supabase.getClient();
      client.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          this.user.set(session.user);
          if (session.user.email === 'herrypotterluizfelipe95@gmail.com' || session.user.email?.includes('admin')) {
            this.currentUserRole.set('ADM');
          }
        }
      }).catch(() => {});

      client.auth.onAuthStateChange((_event, session) => {
        const u = session?.user || null;
        this.user.set(u);
        if (u && (u.email === 'herrypotterluizfelipe95@gmail.com' || u.email?.includes('admin'))) {
          this.currentUserRole.set('ADM');
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
      this.currentUserRole.set('TEC');
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
  }

  setRole(role: UserRole) {
    this.currentUserRole.set(role);
  }

  validateAdminPassword(password: string): boolean {
    return password === 'admin123';
  }

  getRoleLabel(role: UserRole) {
    switch(role) {
      case 'ADM': return 'Administrador';
      case 'TEC': return 'Técnico';
      case 'VIS': return 'Visualizador';
    }
  }
}
