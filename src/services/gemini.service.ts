import { Injectable, inject } from '@angular/core';
import { GoogleGenAI } from '@google/genai';
import { SecuritySanitizerService } from './security-sanitizer.service';

import { MeterOcrResult, OcrReadingContext } from '../models';
import { formatContextForPrompt } from './ocr-context';

export type { MeterOcrResult };

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private sanitizer = inject(SecuritySanitizerService);

  constructor() { }

  private getGeminiApiKey(): string {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env['API_KEY'] && process.env['API_KEY'] !== 'PLACEHOLDER_API_KEY') {
        return process.env['API_KEY'];
      }
      if (process.env['GEMINI_API_KEY'] && process.env['GEMINI_API_KEY'] !== 'PLACEHOLDER_API_KEY') {
        return process.env['GEMINI_API_KEY'];
      }
    }
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.process?.env?.API_KEY && w.process.env.API_KEY !== 'PLACEHOLDER_API_KEY') {
        return w.process.env.API_KEY;
      }
      if (w.process?.env?.GEMINI_API_KEY && w.process.env.GEMINI_API_KEY !== 'PLACEHOLDER_API_KEY') {
        return w.process.env.GEMINI_API_KEY;
      }
      if (w.__GEMINI_API_KEY__) {
        return w.__GEMINI_API_KEY__;
      }
      const local = localStorage.getItem('gemini_api_key');
      if (local) return local;
    }
    return '';
  }

  private getGroqApiKey(): string {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env['GROQ_API_KEY'] && process.env['GROQ_API_KEY'] !== 'PLACEHOLDER_API_KEY') {
        return process.env['GROQ_API_KEY'];
      }
    }
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.process?.env?.GROQ_API_KEY && w.process.env.GROQ_API_KEY !== 'PLACEHOLDER_API_KEY') {
        return w.process.env.GROQ_API_KEY;
      }
      if (w.__GROQ_API_KEY__) {
        return w.__GROQ_API_KEY__;
      }
      const local = localStorage.getItem('groq_api_key');
      if (local) return local;
    }
    return '';
  }

  hasConfiguredApiKey(): boolean {
    return !!(this.getGroqApiKey() || this.getGeminiApiKey());
  }

  getSavedGroqKey(): string {
    return this.getGroqApiKey();
  }

  getSavedGeminiKey(): string {
    return this.getGeminiApiKey();
  }

  getMaskedGroqKey(): string {
    return this.sanitizer.maskKey(this.getGroqApiKey());
  }

  getMaskedGeminiKey(): string {
    return this.sanitizer.maskKey(this.getGeminiApiKey());
  }

  saveApiKeys(groqKey?: string, geminiKey?: string) {
    if (typeof localStorage !== 'undefined') {
      if (groqKey !== undefined) {
        const trimmedGroq = groqKey.trim();
        if (trimmedGroq) {
          const valid = this.sanitizer.validateKey('groq', trimmedGroq);
          if (!valid.valid) {
            throw new Error(valid.error || 'Chave Groq inválida');
          }
          localStorage.setItem('groq_api_key', valid.sanitizedKey);
        } else {
          localStorage.removeItem('groq_api_key');
        }
      }
      if (geminiKey !== undefined) {
        const trimmedGemini = geminiKey.trim();
        if (trimmedGemini) {
          const valid = this.sanitizer.validateKey('gemini', trimmedGemini);
          if (!valid.valid) {
            throw new Error(valid.error || 'Chave Gemini inválida');
          }
          localStorage.setItem('gemini_api_key', valid.sanitizedKey);
        } else {
          localStorage.removeItem('gemini_api_key');
        }
        this.ai = null; // Reseta instância anterior para aplicar a nova chave
      }
    }
  }

  private initGeminiClient(): GoogleGenAI | null {
    if (!this.ai) {
      const apiKey = this.getGeminiApiKey();
      if (!apiKey) return null;
      try {
        this.ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build'
            }
          }
        });
      } catch (err) {
        console.warn('Não foi possível inicializar o cliente Gemini:', err);
        return null;
      }
    }
    return this.ai;
  }

  /**
   * Extrai a leitura numérica de consumo de um medidor.
   * ESTRATÉGIA: Prioriza Qwen 3.8 27B (Groq ultra-rápido) -> caso falhe ou não detecte, usa Gemini 3.8 Flash como fallback.
   */
  async extractMeterReading(
    imageBase64: string,
    utilityType: string = 'luz',
    forceProvider?: 'qwen' | 'gemini',
    context?: OcrReadingContext | null
  ): Promise<MeterOcrResult> {
    if (!imageBase64) {
      return {
        success: false,
        reading: null,
        confidence: 'low',
        error: 'Nenhuma imagem fornecida para leitura.',
        provider: 'none',
        modelName: 'None'
      };
    }

    let cleanBase64 = imageBase64;
    let mimeType = 'image/jpeg';

    // Se for URL remota (ex: imagem pública do Supabase Storage no PC)
    if (imageBase64.startsWith('http://') || imageBase64.startsWith('https://')) {
      try {
        const resp = await fetch(imageBase64);
        if (!resp.ok) {
          throw new Error(`Falha HTTP ${resp.status} ao baixar foto.`);
        }
        const blob = await resp.blob();
        mimeType = blob.type || 'image/jpeg';
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
        }
        cleanBase64 = btoa(binary);
      } catch (fetchErr: any) {
        console.error('Erro ao baixar foto da nuvem para OCR:', fetchErr);
        return {
          success: false,
          reading: null,
          confidence: 'low',
          error: `Erro ao baixar imagem da nuvem: ${fetchErr?.message || 'Falha de rede'}`,
          provider: 'none',
          modelName: 'None'
        };
      }
    } else if (imageBase64.includes(';base64,')) {
      const parts = imageBase64.split(';base64,');
      const mimeMatch = parts[0].match(/data:([^;]+)/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
      cleanBase64 = parts[1];
    }

    // Se forçou Gemini, prioriza Gemini (com fallback para Qwen se falhar e não for estrito)
    if (forceProvider === 'gemini') {
      try {
        const gemResult = await this.extractWithGemini(cleanBase64, mimeType, utilityType, false, context);
        if (gemResult.success && gemResult.reading !== null) return gemResult;
        console.warn('[OCR Pipeline] Gemini não detectou leitura. Acionando Fallback Qwen 3.8 27B...');
        return await this.extractWithQwen(cleanBase64, mimeType, utilityType, context);
      } catch {
        return await this.extractWithQwen(cleanBase64, mimeType, utilityType, context);
      }
    }

    // Se forçou especificamente Qwen
    if (forceProvider === 'qwen') {
      return await this.extractWithQwen(cleanBase64, mimeType, utilityType, context);
    }

    // FLUXO PADRÃO: 1º Qwen 3.8 27B (Groq) -> 2º Fallback Gemini 3.8 Flash
    try {
      console.log('[OCR Pipeline] Tentativa 1: Executando OCR com Qwen 3.8 27B (Groq)...');
      const qwenResult = await this.extractWithQwen(cleanBase64, mimeType, utilityType, context);

      if (qwenResult.success && qwenResult.reading !== null) {
        console.log('[OCR Pipeline] Sucesso com Qwen 3.8 27B:', qwenResult.reading);
        return qwenResult;
      }

      console.warn('[OCR Pipeline] Qwen não identificou leitura válida ou retornou erro. Acionando Fallback Gemini 3.8 Flash...');
      const geminiResult = await this.extractWithGemini(cleanBase64, mimeType, utilityType, true, context);
      return geminiResult;
    } catch (err) {
      console.error('[OCR Pipeline] Erro no Qwen 3.8 27B, acionando Gemini 3.8 Flash Fallback...', err);
      return await this.extractWithGemini(cleanBase64, mimeType, utilityType, true, context);
    }
  }

  /**
   * Executa dupla checagem (Consenso) comparando Qwen e Gemini na mesma foto.
   * Se ambos concordarem, a confiança é elevada para 'high'.
   * Se divergirem, alerta o usuário com os dois valores para conferência rápida.
   */
  async extractWithDualCheck(
    imageBase64: string,
    utilityType: string = 'luz',
    context?: OcrReadingContext | null
  ): Promise<MeterOcrResult> {
    const primary = await this.extractMeterReading(imageBase64, utilityType, undefined, context);
    if (!primary.success || primary.reading === null) {
      return primary;
    }

    // Identifica o segundo motor para cross-validation
    const secondaryProvider = primary.provider === 'qwen' ? 'gemini' : 'qwen';
    try {
      const secondary = await this.extractMeterReading(imageBase64, utilityType, secondaryProvider, context);

      if (secondary.success && secondary.reading !== null) {
        const agreement = Math.abs(primary.reading - secondary.reading) < 0.001;
        const qwenVal = primary.provider === 'qwen' ? primary.reading : secondary.reading;
        const geminiVal = primary.provider === 'gemini' ? primary.reading : secondary.reading;

        return {
          ...primary,
          confidence: agreement ? 'high' : 'medium',
          explanation: agreement
            ? `✓ Consenso confirmado: Qwen e Gemini concordam com ${primary.reading}.`
            : `⚠️ Atenção: Qwen leu ${qwenVal} e Gemini leu ${geminiVal}. Confira no mostrador!`,
          dualCheck: {
            performed: true,
            qwenValue: qwenVal,
            geminiValue: geminiVal,
            agreement,
            divergenceNotice: agreement ? undefined : `Qwen: ${qwenVal} | Gemini: ${geminiVal}`
          }
        };
      }
    } catch (secErr) {
      console.warn('[OCR DualCheck] Falha na validação secundária, mantendo leitura primária:', secErr);
    }

    return primary;
  }

  /**
   * Extração de medidor com Qwen 3.8 27B via Groq API
   */
  async extractWithQwen(cleanBase64: string, mimeType: string, utilityType: string, context?: OcrReadingContext | null): Promise<MeterOcrResult> {
    const groqKey = this.getGroqApiKey();
    if (!groqKey) {
      throw new Error('Chave de API do Groq não configurada.');
    }

    const utilDesc = utilityType === 'luz'
      ? 'energia elétrica (kWh)'
      : utilityType === 'agua'
        ? 'água / hidrômetro (m³)'
        : 'gás canalizado (m³)';

    const prompt = `
Você é um leitor óptico (OCR) industrial de precisão absoluta para medidores de ${utilDesc} em shopping centers.
Analise a foto deste medidor (relógio analógico de roletes mecânicos ou visor digital LCD/LED).

OBJETIVO:
Identificar o valor numérico acumulado atual de consumo no mostrador.
${formatContextForPrompt(context) ? '\n' + formatContextForPrompt(context) + '\n' : ''}
REGRAS OBRIGATÓRIAS DE LEITURA E FORMATAÇÃO:
1. Extraia o valor do consumo acumulado principal exibido no mostrador.
2. NUNCA use ponto ou vírgula como separador de milhar no número. "reading" DEVE ser um número numérico puro (exemplo: 1510 e JAMAIS 1.510 para significar mil quinhentos e dez). Se o relógio marcar 1510 kWh ou m³, retorne 1510.
3. Foque sempre nos dígitos pretos inteiros. Na grande maioria dos medidores industriais de shopping (hidrômetros e relógios de luz), os dígitos pretos são a parte inteira (ex: 1510) e os dígitos vermelhos são frações/decimais. NÃO confunda os dígitos inteiros pretos com decimais (se houver 4 dígitos pretos "1510", o valor é 1510, NÃO é 1,510 nem 1.51).
4. IGNORE número de série, ano, modelo, tensão (ex: 220V, 380V), amperagem ou código de barras.
5. Se o rolete mecânico estiver entre dois números, use o dígito mais baixo já completado.
6. Responda ESTRITAMENTE em formato JSON com esta estrutura:
{
  "reading": 12345,
  "detectedDigits": "12345",
  "meterType": "digital" | "analogico_rolete" | "analogico_ponteiro" | "indeterminado",
  "confidence": "high" | "medium" | "low",
  "explanation": "Leitura identificada no mostrador principal: 12345"
}

Se o visor estiver ilegível, escuro ou sem medidor visível:
{
  "reading": null,
  "detectedDigits": null,
  "meterType": "indeterminado",
  "confidence": "low",
  "explanation": "Visor do medidor ilegível ou não detectado na foto"
}
`;

    const dataUrl = `data:${mimeType};base64,${cleanBase64}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } }
              ]
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 300
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);

      const num = this.parseOcrNumber(parsed.reading, parsed.detectedDigits);

      return {
        success: num !== null,
        reading: num,
        detectedDigits: parsed.detectedDigits || (num !== null ? String(num) : null),
        meterType: parsed.meterType || 'indeterminado',
        confidence: parsed.confidence || (num !== null ? 'high' : 'low'),
        explanation: parsed.explanation || (num !== null ? `Leitura ${num} extraída com Qwen 3.8 27B.` : 'Leitura não identificada.'),
        provider: 'qwen',
        modelName: 'Qwen 3.8 27B (Groq)',
        fallbackUsed: false
      };

    } catch (error: any) {
      clearTimeout(timeout);
      const sanitizedErr = this.sanitizer.sanitizeError(error);
      this.sanitizer.safeLog('warn', 'OCR Groq', 'Falha na chamada ao Qwen 3.8 27B:', sanitizedErr);
      return {
        success: false,
        reading: null,
        confidence: 'low',
        error: sanitizedErr || 'Falha ao processar com Qwen 3.8 27B.',
        provider: 'qwen',
        modelName: 'Qwen 3.8 27B (Groq)',
        fallbackUsed: false
      };
    }
  }

  /**
   * Extração de medidor com Google Gemini 3.8 Flash (Fallback ou Verificação)
   */
  async extractWithGemini(
    cleanBase64: string,
    mimeType: string,
    utilityType: string,
    isFallback: boolean = false,
    context?: OcrReadingContext | null
  ): Promise<MeterOcrResult> {
    try {
      const client = this.initGeminiClient();
      if (!client) {
        return {
          success: false,
          reading: null,
          confidence: 'low',
          error: 'Chave de API do Gemini não configurada.',
          provider: 'gemini',
          modelName: 'Gemini 2.5 Flash',
          fallbackUsed: isFallback
        };
      }

      const utilDesc = utilityType === 'luz'
        ? 'energia elétrica (kWh)'
        : utilityType === 'agua'
          ? 'água / hidrômetro (m³)'
          : 'gás canalizado (m³)';

      const prompt = `
Você é um leitor óptico (OCR) industrial de alta precisão para medidores de ${utilDesc} em shopping centers.
Analise a imagem deste medidor (relógio analógico de roletes, ponteiros ou display digital LCD/LED).

OBJETIVO PRINCIPAL:
Identificar e extrair com máxima acurácia o número atual acumulado de consumo exibido no display/contador.
${formatContextForPrompt(context) ? '\n' + formatContextForPrompt(context) + '\n' : ''}
REGRAS OBRIGATÓRIAS DE LEITURA E FORMATAÇÃO:
1. Extraia o valor do consumo acumulado principal exibido no mostrador.
2. NUNCA use ponto ou vírgula como separador de milhar no número. "reading" DEVE ser um número numérico puro (exemplo: 1510 e JAMAIS 1.510 para significar mil quinhentos e dez). Se o relógio marcar 1510 kWh ou m³, retorne 1510.
3. Foque prioritariamente nos dígitos pretos inteiros. Na grande maioria dos medidores industriais de shopping (hidrômetros e relógios de luz), os dígitos pretos são a parte inteira (ex: 1510) e os dígitos vermelhos são frações/decimais. NÃO confunda os dígitos inteiros pretos com decimais (se houver 4 dígitos pretos "1510", o valor é 1510, NÃO é 1,510 nem 1.51).
4. IGNORE qualquer número de série, ano de fabricação, código de barras, modelo, tensão (ex: 220V, 380V), amperagem ou constante do disco.
5. Se o relógio estiver entre dois números num rolete, considere o dígito mais baixo já ultrapassado (regra padrão de leituristas de utilidades).
6. Responda ESTRITAMENTE em formato JSON compatível com:
{
  "reading": 12345,
  "detectedDigits": "12345",
  "meterType": "digital" | "analogico_rolete" | "analogico_ponteiro" | "indeterminado",
  "confidence": "high" | "medium" | "low",
  "explanation": "Identificado no mostrador de roletes pretos principais: 12345"
}

Se a imagem estiver sem medidor, com desfoque total ou ilegível:
{
  "reading": null,
  "detectedDigits": null,
  "meterType": "indeterminado",
  "confidence": "low",
  "explanation": "Display do medidor ilegível ou não detectado na foto"
}
`;

      const imagePart = {
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      };

      const textPart = {
        text: prompt,
      };

      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: 'application/json',
        }
      });

      const rawText = response.text || '';
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();

      try {
        const parsed = JSON.parse(cleanJson);
        const num = this.parseOcrNumber(parsed.reading, parsed.detectedDigits);

        return {
          success: num !== null,
          reading: num,
          detectedDigits: parsed.detectedDigits || (num !== null ? String(num) : null),
          meterType: parsed.meterType || 'indeterminado',
          confidence: parsed.confidence || (num !== null ? 'medium' : 'low'),
          explanation: parsed.explanation || (num !== null ? `Leitura ${num} extraída com sucesso pelo Gemini.` : 'Leitura não identificada.'),
          provider: 'gemini',
          modelName: isFallback ? 'Gemini 3.8 Flash (Fallback)' : 'Gemini 3.8 Flash',
          fallbackUsed: isFallback
        };
      } catch (e) {
        // Fallback: extração por regex caso o JSON esteja com formatação residual
        const numMatch = rawText.match(/(\d{2,8}(?:[.,]\d{1,3})?)/);
        if (numMatch) {
          const val = this.parseOcrNumber(numMatch[1]);
          if (val !== null) {
            return {
              success: true,
              reading: val,
              detectedDigits: numMatch[1],
              meterType: 'indeterminado',
              confidence: 'medium',
              explanation: `Leitura aproximada detectada pelo Gemini: ${val}`,
              provider: 'gemini',
              modelName: isFallback ? 'Gemini 3.8 Flash (Fallback)' : 'Gemini 3.8 Flash',
              fallbackUsed: isFallback
            };
          }
        }
        return {
          success: false,
          reading: null,
          confidence: 'low',
          error: 'Não foi possível interpretar a resposta da IA Gemini.',
          provider: 'gemini',
          modelName: isFallback ? 'Gemini 3.8 Flash (Fallback)' : 'Gemini 3.8 Flash',
          fallbackUsed: isFallback
        };
      }

    } catch (error: any) {
      const sanitizedErr = this.sanitizer.sanitizeError(error);
      this.sanitizer.safeLog('error', 'OCR Gemini', 'Erro na extração de leitura com Gemini:', sanitizedErr);
      return {
        success: false,
        reading: null,
        confidence: 'low',
        error: sanitizedErr || 'Falha na comunicação com Gemini para leitura do medidor.',
        provider: 'gemini',
        modelName: isFallback ? 'Gemini 3.8 Flash (Fallback)' : 'Gemini 3.8 Flash',
        fallbackUsed: isFallback
      };
    }
  }

  /**
   * Sanitiza e normaliza números extraídos por OCR.
   * Evita que separadores de milhar como "1.510" ou "1,510" sejam interpretados
   * como decimais pequenos (1.51), garantindo a grandeza real do medidor.
   */
  private parseOcrNumber(rawVal: any, detectedDigits?: any): number | null {
    if (typeof rawVal === 'number' && !isNaN(rawVal)) {
      // Se for um número decimal cuja string original tem padrão de milhar (ex: "1.510" virou 1.51 em JS)
      if (detectedDigits) {
        const digitsStr = String(detectedDigits).trim();
        if (/^\d{1,3}\.\d{3}$/.test(digitsStr)) {
          return parseInt(digitsStr.replace('.', ''), 10);
        }
        if (/^\d{1,3},\d{3}$/.test(digitsStr)) {
          return parseInt(digitsStr.replace(',', ''), 10);
        }
      }
      return rawVal;
    }

    const str = String(rawVal ?? detectedDigits ?? '').trim();
    if (!str) return null;

    // Caso "1.510" ou "12.345" com ponto separador de milhar brasileiro (sem decimais)
    if (/^\d{1,3}\.\d{3}$/.test(str)) {
      return parseInt(str.replace('.', ''), 10);
    }

    // Caso brasileiro com milhar e decimal: "1.510,5" -> 1510.5
    if (str.includes('.') && str.includes(',')) {
      const clean = str.replace(/\./g, '').replace(',', '.');
      const n = parseFloat(clean);
      return isNaN(n) ? null : n;
    }

    // Caso com vírgula de milhar: "1,510" -> 1510
    if (/^\d{1,3},\d{3}$/.test(str)) {
      return parseInt(str.replace(',', ''), 10);
    }

    // Se tiver apenas vírgula com 1 ou 2 casas (ex: "1510,5") -> 1510.5
    if (str.includes(',')) {
      const clean = str.replace(',', '.');
      const n = parseFloat(clean);
      return isNaN(n) ? null : n;
    }

    const match = str.match(/[\d.]+/);
    if (match) {
      const parsed = parseFloat(match[0]);
      return isNaN(parsed) ? null : parsed;
    }

    return null;
  }

  async analyzeRateio(data: any): Promise<string> {
    try {
      const client = this.initGeminiClient();
      if (!client) {
        return 'Chave de API do Gemini não configurada.';
      }
      const prompt = `
        Você é um especialista em gestão de shopping centers e eficiência energética.
        Analise os dados de rateio abaixo (custos de Água, Luz ou Gás distribuídos entre lojas).
        Identifique anomalias, lojas com consumo desproporcional à sua área (se fornecida) ou categoria, e sugira ações para economia.
        Use formatação Markdown clara. Seja conciso e profissional.
        
        Dados do Rateio:
        ${JSON.stringify(data, null, 2)}
      `;

      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return response.text || 'Não foi possível gerar a análise.';
    } catch (error) {
      console.error('Erro ao chamar Gemini:', error);
      return 'Erro ao conectar com a IA. Verifique sua chave de API ou tente novamente.';
    }
  }
}