import { Injectable } from '@angular/core';

/**
 * Utilitários puros de segurança e higienização de credenciais
 */
export function maskApiKey(key: string | null | undefined, visiblePrefix = 4, visibleSuffix = 4): string {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= visiblePrefix + visibleSuffix) {
    return '••••••••';
  }
  const prefix = trimmed.slice(0, visiblePrefix);
  const suffix = trimmed.slice(-visibleSuffix);
  return `${prefix}••••••••${suffix}`;
}

export function sanitizeSecurityString(input: string): string {
  if (!input || typeof input !== 'string') return '';

  return input
    // Mascara chaves Google AI / Gemini (AIzaSy...)
    .replace(/AIza[0-9A-Za-z-_]{30,50}/g, (match) => maskApiKey(match))
    // Mascara chaves Groq (gsk_...)
    .replace(/gsk_[0-9A-Za-z]{20,}/g, (match) => maskApiKey(match))
    // Mascara Bearer tokens
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1••••••••[TOKEN]')
    // Mascara JWT tokens genéricos (header.payload.signature)
    .replace(/eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, '••••••••[JWT_REDACTED]')
    // Mascara query params de URLs que contenham chaves sensíveis
    .replace(/([?&](?:key|api_key|apikey|token|access_token|secret)=)([^&\s]+)/gi, '$1••••••••');
}

export function sanitizeSecurityError(error: any): string {
  if (!error) return 'Erro desconhecido';
  let message = '';
  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'object') {
    try {
      message = JSON.stringify(error);
    } catch {
      message = String(error);
    }
  } else {
    message = String(error);
  }
  return sanitizeSecurityString(message);
}

export function validateApiKey(provider: 'groq' | 'gemini', rawKey: string): { valid: boolean; sanitizedKey: string; error?: string } {
  if (!rawKey || typeof rawKey !== 'string') {
    return { valid: false, sanitizedKey: '', error: 'Chave não pode ser vazia.' };
  }

  const key = rawKey.trim();

  // Prevenção contra injeção de scripts / caracteres ilegais
  if (!/^[a-zA-Z0-9_\-]+$/.test(key)) {
    return { 
      valid: false, 
      sanitizedKey: '', 
      error: 'Formato inválido: a chave deve conter apenas caracteres alfanuméricos, hífens ou sublinhados.' 
    };
  }

  if (provider === 'groq') {
    if (key.length < 20 || key.length > 100) {
      return { 
        valid: false, 
        sanitizedKey: '', 
        error: 'Chave Groq inválida: tamanho incompatível (esperado entre 20 e 100 caracteres).' 
      };
    }
  } else if (provider === 'gemini') {
    if (key.length < 30 || key.length > 70) {
      return { 
        valid: false, 
        sanitizedKey: '', 
        error: 'Chave Gemini inválida: tamanho incompatível (esperado entre 30 e 70 caracteres).' 
      };
    }
  }

  return { valid: true, sanitizedKey: key };
}

export function assertSafeSupabaseKey(key: string | null | undefined): void {
  if (!key) return;
  const trimmed = key.trim();

  // 1. Verificação direta de texto plano
  if (trimmed.toLowerCase().includes('service_role')) {
    throw new Error(
      'ALERTA CRÍTICO DE SEGURANÇA: Chave "service_role" detectada! NUNCA utilize a chave de serviço no frontend. Utilize apenas a chave pública (anon/publishable) com RLS ativado.'
    );
  }

  // 2. Verificação de payload em tokens JWT (formato do Supabase)
  if (trimmed.startsWith('eyJ') && trimmed.includes('.')) {
    try {
      const parts = trimmed.split('.');
      if (parts.length >= 2) {
        // Base64url decode do payload
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = typeof atob !== 'undefined' 
          ? atob(base64) 
          : Buffer.from(base64, 'base64').toString('utf-8');
        
        if (decoded.includes('"role":"service_role"') || decoded.includes('"service_role"')) {
          throw new Error(
            'ALERTA CRÍTICO DE SEGURANÇA: Token JWT com role "service_role" detectado! NUNCA utilize a chave de serviço no frontend. Utilize apenas a chave pública (anon/publishable) com RLS ativado.'
          );
        }
      }
    } catch (e: any) {
      if (e?.message?.includes('ALERTA CRÍTICO')) throw e;
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class SecuritySanitizerService {
  maskKey(key: string | null | undefined, visiblePrefix = 4, visibleSuffix = 4): string {
    return maskApiKey(key, visiblePrefix, visibleSuffix);
  }

  sanitize(input: string): string {
    return sanitizeSecurityString(input);
  }

  sanitizeError(error: any): string {
    return sanitizeSecurityError(error);
  }

  validateKey(provider: 'groq' | 'gemini', rawKey: string) {
    return validateApiKey(provider, rawKey);
  }

  assertSafeSupabaseKey(key: string | null | undefined): void {
    assertSafeSupabaseKey(key);
  }

  safeLog(level: 'log' | 'warn' | 'error', context: string, message: any, ...args: any[]): void {
    const sanitizedMsg = sanitizeSecurityError(message);
    const sanitizedArgs = args.map(arg => {
      if (typeof arg === 'string') return sanitizeSecurityString(arg);
      if (arg instanceof Error) return sanitizeSecurityError(arg);
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.parse(sanitizeSecurityString(JSON.stringify(arg)));
        } catch {
          return sanitizeSecurityString(String(arg));
        }
      }
      return arg;
    });

    const prefix = `[${context}]`;
    if (level === 'error') {
      console.error(prefix, sanitizedMsg, ...sanitizedArgs);
    } else if (level === 'warn') {
      console.warn(prefix, sanitizedMsg, ...sanitizedArgs);
    } else {
      console.log(prefix, sanitizedMsg, ...sanitizedArgs);
    }
  }
}
