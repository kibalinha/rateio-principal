import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService - ADMIN_PASSWORD e Proteção Contra Força Bruta', () => {
  let service: AuthService;
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));
    (globalThis as any).window = {};
    service = new AuthService();
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).window = originalWindow;
  });

  it('deve usar fallback "admin123" quando window.__env.ADMIN_PASSWORD não estiver definido', () => {
    expect(service.validateAdminPassword('admin123')).toBe(true);
    expect(service.validateAdminPassword('errada')).toBe(false);
  });

  it('deve priorizar window.__env.ADMIN_PASSWORD quando configurado', () => {
    (globalThis as any).window = {
      __env: {
        ADMIN_PASSWORD: 'super-secret-password'
      }
    };

    expect(service.validateAdminPassword('admin123')).toBe(false);
    expect(service.validateAdminPassword('super-secret-password')).toBe(true);
  });

  it('deve bloquear temporariamente após 5 tentativas inválidas seguidas e rejeitar até a senha correta durante o bloqueio', () => {
    for (let i = 0; i < 4; i++) {
      expect(service.validateAdminPassword('wrong')).toBe(false);
      expect(service.isAdminLoginLocked()).toBe(false);
    }

    // 5ª tentativa inválida ativa o bloqueio
    expect(service.validateAdminPassword('wrong')).toBe(false);
    expect(service.isAdminLoginLocked()).toBe(true);
    expect(service.getAdminLockRemainingSeconds()).toBeGreaterThan(0);

    // Durante o bloqueio, mesmo a senha correta deve ser rejeitada
    expect(service.validateAdminPassword('admin123')).toBe(false);

    // Após expirar o tempo de bloqueio (5 minutos), deve aceitar a senha correta novamente
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(service.isAdminLoginLocked()).toBe(false);
    expect(service.validateAdminPassword('admin123')).toBe(true);
  });

  it('deve zerar o contador de falhas se uma tentativa válida ocorrer antes da 5ª falha', () => {
    for (let i = 0; i < 4; i++) {
      expect(service.validateAdminPassword('wrong')).toBe(false);
    }
    expect(service.validateAdminPassword('admin123')).toBe(true);
    expect(service.isAdminLoginLocked()).toBe(false);

    // Precisa de 5 novas tentativas inválidas seguidas para bloquear
    for (let i = 0; i < 4; i++) {
      expect(service.validateAdminPassword('wrong')).toBe(false);
      expect(service.isAdminLoginLocked()).toBe(false);
    }
  });
});
