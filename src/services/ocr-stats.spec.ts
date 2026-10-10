import { describe, it, expect } from 'vitest';
import { computeOcrStats, getRecommendedProvider } from './ocr-stats';
import { OcrFeedbackEntry } from '../models';

function e(p: Partial<OcrFeedbackEntry>): OcrFeedbackEntry {
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

describe('computeOcrStats', () => {
  it('retorna zeros sem dados', () => {
    const s = computeOcrStats([]);
    expect(s.total).toBe(0);
    expect(s.accuracyPct).toBe(0);
    expect(s.byProvider).toEqual([]);
  });

  it('calcula acerto geral e por motor', () => {
    const s = computeOcrStats([
      e({ provider: 'qwen' }),
      e({ provider: 'qwen', wasCorrected: true, ocrValue: 5, finalValue: 6 }),
      e({ provider: 'gemini' }),
      e({ provider: 'gemini' })
    ]);
    expect(s.total).toBe(4);
    expect(s.corrected).toBe(1);
    expect(s.accuracyPct).toBe(75);
    const qwen = s.byProvider.find(b => b.key === 'qwen')!;
    expect(qwen).toMatchObject({ total: 2, corrected: 1, accuracyPct: 50 });
    expect(s.byProvider.find(b => b.key === 'gemini')!.accuracyPct).toBe(100);
  });

  it('classifica tipos de erro por contagem de dígitos', () => {
    const s = computeOcrStats([
      e({ wasCorrected: true, ocrValue: 151, finalValue: 1510 }),
      e({ wasCorrected: true, ocrValue: 15100, finalValue: 1510 }),
      e({ wasCorrected: true, ocrValue: 1519, finalValue: 1510 })
    ]);
    expect(s.errorKinds).toEqual({ missingDigit: 1, extraDigit: 1, wrongDigits: 1 });
  });

  it('só lista lojas com amostras mínimas e pelo menos uma correção', () => {
    const s = computeOcrStats([
      e({ storeId: 'a', storeName: 'A', wasCorrected: true, ocrValue: 1, finalValue: 2 }),
      e({ storeId: 'b', storeName: 'B', wasCorrected: true, ocrValue: 1, finalValue: 2 }),
      e({ storeId: 'b', storeName: 'B' }),
      e({ storeId: 'c', storeName: 'C' }),
      e({ storeId: 'c', storeName: 'C' })
    ]);
    expect(s.worstStores.map(b => b.label)).toEqual(['B']);
  });

  it('agrupa medidor sem tipo como indeterminado', () => {
    const s = computeOcrStats([e({}), e({ meterType: 'digital' })]);
    expect(s.byMeterType.map(b => b.key).sort()).toEqual(['digital', 'indeterminado']);
  });

  describe('getRecommendedProvider', () => {
    it('retorna auto se houver poucas amostras', () => {
      expect(getRecommendedProvider([], 'luz')).toBe('auto');
    });

    it('recomenda gemini quando sua precisão for superior à do qwen na utilidade', () => {
      const entries = [
        // Qwen: 1 acerto em 3 tentativas (33%)
        e({ provider: 'qwen', utilityType: 'agua', wasCorrected: false }),
        e({ provider: 'qwen', utilityType: 'agua', wasCorrected: true, ocrValue: 1, finalValue: 2 }),
        e({ provider: 'qwen', utilityType: 'agua', wasCorrected: true, ocrValue: 3, finalValue: 4 }),
        // Gemini: 3 acertos em 3 tentativas (100%)
        e({ provider: 'gemini', utilityType: 'agua', wasCorrected: false }),
        e({ provider: 'gemini', utilityType: 'agua', wasCorrected: false }),
        e({ provider: 'gemini', utilityType: 'agua', wasCorrected: false })
      ];
      expect(getRecommendedProvider(entries, 'agua')).toBe('gemini');
    });

    it('recomenda qwen quando sua precisão for comprovadamente superior', () => {
      const entries = [
        // Qwen: 3 acertos em 3 (100%)
        e({ provider: 'qwen', utilityType: 'luz', wasCorrected: false }),
        e({ provider: 'qwen', utilityType: 'luz', wasCorrected: false }),
        e({ provider: 'qwen', utilityType: 'luz', wasCorrected: false }),
        // Gemini: 1 acerto em 3 (33%)
        e({ provider: 'gemini', utilityType: 'luz', wasCorrected: false }),
        e({ provider: 'gemini', utilityType: 'luz', wasCorrected: true, ocrValue: 1, finalValue: 2 }),
        e({ provider: 'gemini', utilityType: 'luz', wasCorrected: true, ocrValue: 3, finalValue: 4 })
      ];
      expect(getRecommendedProvider(entries, 'luz')).toBe('qwen');
    });
  });
});

