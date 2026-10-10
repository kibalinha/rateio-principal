import { describe, it, expect } from 'vitest';
import { buildReadingContext, formatContextForPrompt } from './ocr-context';
import { OcrFeedbackEntry } from '../models';

function entry(p: Partial<OcrFeedbackEntry>): OcrFeedbackEntry {
  return {
    id: 'x',
    storeId: 's1',
    storeName: 'Loja 1',
    utilityType: 'luz',
    month: '2026-09',
    ocrValue: 100,
    finalValue: 100,
    wasCorrected: false,
    confidence: 'high',
    provider: 'qwen',
    modelName: 'Qwen',
    confirmedAt: '2026-09-01T10:00:00.000Z',
    ...p
  };
}

describe('OCR context', () => {
  it('inclui leitura anterior e número de dígitos', () => {
    const ctx = buildReadingContext([], { storeId: 's1', utilityType: 'luz', previousReading: 1480 });
    expect(ctx.previousReading).toBe(1480);
    expect(ctx.expectedIntDigits).toBe(4);
  });

  it('ignora leitura anterior zero ou ausente', () => {
    expect(buildReadingContext([], { storeId: 's1', utilityType: 'luz', previousReading: 0 }).previousReading).toBeNull();
    expect(buildReadingContext([], { storeId: 's1', utilityType: 'luz' }).previousReading).toBeNull();
  });

  it('prioriza correções da própria loja e limita a 3', () => {
    const entries = [
      entry({ storeId: 's2', wasCorrected: true, ocrValue: 5, finalValue: 50, confirmedAt: '2026-09-05T00:00:00Z' }),
      entry({ storeId: 's1', wasCorrected: true, ocrValue: 151, finalValue: 1510, confirmedAt: '2026-08-01T00:00:00Z' }),
      entry({ storeId: 's3', wasCorrected: true, ocrValue: 7, finalValue: 70, confirmedAt: '2026-09-04T00:00:00Z' }),
      entry({ storeId: 's4', wasCorrected: true, ocrValue: 8, finalValue: 80, confirmedAt: '2026-09-03T00:00:00Z' })
    ];
    const ctx = buildReadingContext(entries, { storeId: 's1', utilityType: 'luz' });
    expect(ctx.corrections).toHaveLength(3);
    expect(ctx.corrections![0]).toMatchObject({ ocrValue: 151, finalValue: 1510, sameStore: true });
  });

  it('não usa correções de outra utilidade nem leituras confirmadas sem correção', () => {
    const entries = [
      entry({ utilityType: 'agua', wasCorrected: true, ocrValue: 1, finalValue: 10 }),
      entry({ wasCorrected: false })
    ];
    const ctx = buildReadingContext(entries, { storeId: 's1', utilityType: 'luz' });
    expect(ctx.corrections).toHaveLength(0);
  });

  it('usa o tipo de medidor conhecido, ignorando "indeterminado"', () => {
    const entries = [
      entry({ meterType: 'analogico_rolete', confirmedAt: '2026-08-01T00:00:00Z' }),
      entry({ meterType: 'indeterminado', confirmedAt: '2026-09-01T00:00:00Z' })
    ];
    const ctx = buildReadingContext(entries, { storeId: 's1', utilityType: 'luz' });
    expect(ctx.meterType).toBe('analogico_rolete');
  });

  it('retorna texto vazio sem contexto útil', () => {
    expect(formatContextForPrompt(null)).toBe('');
    expect(formatContextForPrompt({ previousReading: null, corrections: [] })).toBe('');
  });

  it('gera bloco com leitura anterior, correções e aviso para não copiar', () => {
    const text = formatContextForPrompt({
      previousReading: 1480,
      expectedIntDigits: 4,
      corrections: [{ ocrValue: 151, finalValue: 1510, sameStore: true }]
    });
    expect(text).toContain('1480');
    expect(text).toContain('4 dígitos');
    expect(text).toContain('a IA leu 151');
    expect(text).toContain('NUNCA copie');
  });
});
