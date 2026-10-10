import { OcrFeedbackEntry } from '../models';

export interface OcrBucketStats {
  key: string;
  label: string;
  total: number;
  corrected: number;
  accuracyPct: number; // % de leituras confirmadas sem correção
}

export interface OcrStats {
  total: number;
  corrected: number;
  accuracyPct: number;
  byProvider: OcrBucketStats[];
  byUtility: OcrBucketStats[];
  byMeterType: OcrBucketStats[];
  byConfidence: OcrBucketStats[];
  /** Lojas com mais correções (mínimo de amostras aplicado), da pior para a melhor. */
  worstStores: OcrBucketStats[];
  errorKinds: { missingDigit: number; extraDigit: number; wrongDigits: number };
}

const intDigits = (n: number) => Math.floor(Math.abs(n)).toString().length;

const PROVIDER_LABEL: Record<string, string> = { qwen: 'Qwen (Groq)', gemini: 'Gemini', none: 'Sem IA' };
const UTILITY_LABEL: Record<string, string> = { luz: 'Luz', agua: 'Água', gas: 'Gás' };
const METER_LABEL: Record<string, string> = {
  digital: 'Digital',
  analogico_rolete: 'Analógico (rolete)',
  analogico_ponteiro: 'Analógico (ponteiro)',
  indeterminado: 'Indeterminado'
};
const CONFIDENCE_LABEL: Record<string, string> = { high: 'Alta', medium: 'Média', low: 'Baixa' };

const pct = (ok: number, total: number) => (total === 0 ? 0 : Math.round((ok / total) * 1000) / 10);

function bucketize(
  entries: OcrFeedbackEntry[],
  keyOf: (e: OcrFeedbackEntry) => string,
  labelOf: (key: string, e: OcrFeedbackEntry) => string
): OcrBucketStats[] {
  const map = new Map<string, OcrBucketStats>();
  for (const e of entries) {
    const key = keyOf(e) || 'indeterminado';
    let b = map.get(key);
    if (!b) {
      b = { key, label: labelOf(key, e), total: 0, corrected: 0, accuracyPct: 0 };
      map.set(key, b);
    }
    b.total++;
    if (e.wasCorrected) b.corrected++;
  }
  const out = [...map.values()];
  out.forEach(b => (b.accuracyPct = pct(b.total - b.corrected, b.total)));
  return out.sort((a, b) => b.total - a.total);
}

/**
 * Calcula a qualidade do OCR a partir das conferências dos técnicos.
 * `minStoreSamples` evita apontar loja "ruim" com apenas uma leitura.
 */
export function computeOcrStats(entries: OcrFeedbackEntry[], minStoreSamples = 2): OcrStats {
  const total = entries.length;
  const corrected = entries.filter(e => e.wasCorrected).length;

  const worstStores = bucketize(entries, e => e.storeId, (_k, e) => e.storeName)
    .filter(b => b.total >= minStoreSamples && b.corrected > 0)
    .sort((a, b) => a.accuracyPct - b.accuracyPct || b.corrected - a.corrected)
    .slice(0, 10);

  const errorKinds = { missingDigit: 0, extraDigit: 0, wrongDigits: 0 };
  for (const e of entries) {
    if (!e.wasCorrected) continue;
    const o = intDigits(e.ocrValue);
    const f = intDigits(e.finalValue);
    if (o < f) errorKinds.missingDigit++;
    else if (o > f) errorKinds.extraDigit++;
    else errorKinds.wrongDigits++;
  }

  return {
    total,
    corrected,
    accuracyPct: pct(total - corrected, total),
    byProvider: bucketize(entries, e => e.provider, k => PROVIDER_LABEL[k] || k),
    byUtility: bucketize(entries, e => e.utilityType, k => UTILITY_LABEL[k] || k),
    byMeterType: bucketize(entries, e => e.meterType || 'indeterminado', k => METER_LABEL[k] || k),
    byConfidence: bucketize(entries, e => e.confidence, k => CONFIDENCE_LABEL[k] || k),
    worstStores,
    errorKinds
  };
}

/**
 * Recomenda o motor ideal ('qwen' | 'gemini' | 'auto') com base no histórico real de acertos.
 * Se para esta utilidade ou tipo de medidor um motor tiver precisão superior com pelo menos 3 amostras,
 * ele é recomendado para evitar erros recorrentes.
 */
export function getRecommendedProvider(
  entries: OcrFeedbackEntry[],
  utilityType: string,
  meterType?: string
): 'auto' | 'qwen' | 'gemini' {
  // Filtra por tipo de medidor se conhecido, ou pela utilidade
  let relevant = entries.filter(e => e.utilityType === utilityType);
  if (meterType && meterType !== 'indeterminado') {
    const byMeter = relevant.filter(e => e.meterType === meterType);
    if (byMeter.length >= 4) relevant = byMeter;
  }

  const qwenEntries = relevant.filter(e => e.provider === 'qwen');
  const geminiEntries = relevant.filter(e => e.provider === 'gemini');

  if (qwenEntries.length < 3 || geminiEntries.length < 3) {
    return 'auto'; // Poucas amostras para tomar decisão estatística
  }

  const qwenOk = qwenEntries.filter(e => !e.wasCorrected).length;
  const geminiOk = geminiEntries.filter(e => !e.wasCorrected).length;

  const qwenAcc = qwenOk / qwenEntries.length;
  const geminiAcc = geminiOk / geminiEntries.length;

  // Se Gemini supera Qwen por mais de 12% de acerto
  if (geminiAcc - qwenAcc >= 0.12) {
    return 'gemini';
  }

  // Se Qwen for superior ou equivalente com margem de segurança
  if (qwenAcc - geminiAcc >= 0.10) {
    return 'qwen';
  }

  return 'auto';
}
