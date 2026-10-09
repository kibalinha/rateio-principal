import { describe, it, expect } from 'vitest';
import { 
  maskApiKey, 
  sanitizeSecurityString, 
  sanitizeSecurityError, 
  validateApiKey, 
  assertSafeSupabaseKey,
  SecuritySanitizerService 
} from './security-sanitizer.service';

describe('SecuritySanitizerService - Blindagem de Credenciais e Proteção Anti-Vazamento', () => {

  describe('maskApiKey', () => {
    it('deve mascarar uma chave Groq preservando prefixo e sufixo', () => {
      const groqKey = 'gsk_1234567890abcdef1234567890abcdef';
      const masked = maskApiKey(groqKey, 4, 4);
      expect(masked).toBe('gsk_••••••••cdef');
      expect(masked).not.toContain('1234567890');
    });

    it('deve mascarar uma chave Gemini preservando prefixo e sufixo', () => {
      const geminiKey = 'AIzaSyA1234567890abcdef1234567890abcdef99';
      const masked = maskApiKey(geminiKey, 4, 4);
      expect(masked).toBe('AIza••••••••ef99');
      expect(masked).not.toContain('A1234567890');
    });

    it('deve lidar com chaves curtas ou vazias com segurança', () => {
      expect(maskApiKey('')).toBe('');
      expect(maskApiKey(null)).toBe('');
      expect(maskApiKey(undefined)).toBe('');
      expect(maskApiKey('curto')).toBe('••••••••');
    });
  });

  describe('sanitizeSecurityString e sanitizeSecurityError', () => {
    it('deve ocultar chaves de API em strings de mensagens de erro', () => {
      const errorMsg = 'Failed to fetch: AIzaSyA1234567890abcdef1234567890abcdef99 responded with 403 Forbidden';
      const sanitized = sanitizeSecurityString(errorMsg);
      expect(sanitized).not.toContain('AIzaSyA1234567890abcdef1234567890abcdef99');
      expect(sanitized).toContain('AIza••••••••ef99');
    });

    it('deve ocultar chaves Groq em logs de requisição', () => {
      const log = 'Request failed using key gsk_abcdef1234567890abcdef1234567890';
      const sanitized = sanitizeSecurityString(log);
      expect(sanitized).not.toContain('gsk_abcdef1234567890abcdef1234567890');
      expect(sanitized).toContain('gsk_••••••••7890');
    });

    it('deve ocultar cabeçalhos Authorization Bearer', () => {
      const headerMsg = 'Headers: { Authorization: Bearer gsk_secret_token_123456789 }';
      const sanitized = sanitizeSecurityString(headerMsg);
      expect(sanitized).toContain('Bearer ••••••••[TOKEN]');
      expect(sanitized).not.toContain('gsk_secret_token_123456789');
    });

    it('deve ocultar parâmetros sensíveis de URL query strings', () => {
      const urlMsg = 'Error calling https://generativelanguage.googleapis.com/v1/models?key=AIzaSyA1234567890abcdef1234567890abcdef99';
      const sanitized = sanitizeSecurityString(urlMsg);
      expect(sanitized).toContain('key=••••••••');
      expect(sanitized).not.toContain('AIzaSyA1234567890abcdef1234567890abcdef99');
    });

    it('deve higienizar instâncias de Error nativas', () => {
      const err = new Error('HTTP 401 using key gsk_1234567890abcdef1234567890abcdef');
      const sanitized = sanitizeSecurityError(err);
      expect(sanitized).not.toContain('gsk_1234567890abcdef1234567890abcdef');
      expect(sanitized).toContain('gsk_••••••••cdef');
    });
  });

  describe('validateApiKey', () => {
    it('deve aprovar chaves válidas de Groq e Gemini', () => {
      const validGroq = 'gsk_1234567890abcdef1234567890';
      const validGemini = 'AIzaSyA1234567890abcdef1234567890abcdef';

      expect(validateApiKey('groq', validGroq).valid).toBe(true);
      expect(validateApiKey('gemini', validGemini).valid).toBe(true);
    });

    it('deve rejeitar chaves vazias ou somente espaços', () => {
      expect(validateApiKey('groq', '').valid).toBe(false);
      expect(validateApiKey('gemini', '   ').valid).toBe(false);
    });

    it('deve rejeitar tentativas de injeção de script ou caracteres maliciosos', () => {
      const malicious = '<script>alert("hack")</script>';
      const result = validateApiKey('groq', malicious);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Formato inválido');
    });

    it('deve rejeitar chaves Groq ou Gemini com tamanho fora dos limites de segurança', () => {
      expect(validateApiKey('groq', 'gsk_short').valid).toBe(false);
      expect(validateApiKey('gemini', 'short').valid).toBe(false);
    });
  });

  describe('assertSafeSupabaseKey', () => {
    it('deve aceitar chave pública (publishable / anon)', () => {
      expect(() => assertSafeSupabaseKey('sb_publishable_c--UjXXWohgzQqj_Ky496g_G7h62ned')).not.toThrow();
    });

    it('deve lançar erro crítico se detectar tentativa de uso de chave service_role no frontend', () => {
      expect(() => {
        assertSafeSupabaseKey('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.signature');
      }).toThrow(/ALERTA CRÍTICO DE SEGURANÇA/);
    });
  });

  describe('SecuritySanitizerService - Instância Injetável', () => {
    it('deve executar operações através dos métodos da classe de serviço', () => {
      const service = new SecuritySanitizerService();
      expect(service.maskKey('gsk_1234567890abcdef1234567890abcdef')).toBe('gsk_••••••••cdef');
      expect(service.sanitize('test AIzaSyA1234567890abcdef1234567890abcdef99')).not.toContain('AIzaSyA');
      expect(service.validateKey('groq', 'gsk_1234567890abcdef1234567890').valid).toBe(true);
    });
  });

});
