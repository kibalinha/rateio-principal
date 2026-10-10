import { OcrFeedbackEntry, OcrReadingContext } from '../models';

const MAX_CORRECTIONS = 3;

const intDigits = (n: number) => Math.floor(Math.abs(n)).toString().length;

/**
 * Seleciona o contexto para a leitura de um medidor a partir do histórico de conferências.
 * Prioriza correções da própria loja; completa com correções de outras lojas da mesma utilidade.
 */
export function buildReadingContext(
  entries: OcrFeedbackEntry[],
  params: { storeId: string; utilityType: string; previousReading?: number | null }
): OcrReadingContext {
  const sameUtility = entries.filter(e => e.utilityType === params.utilityType);
  const ofStore = sameUtility.filter(e => e.storeId === params.storeId);

  const newestFirst = (list: OcrFeedbackEntry[]) =>
    [...list].sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));

  const storeCorrections = newestFirst(ofStore).filter(e => e.wasCorrected);
  const otherCorrections = newestFirst(sameUtility)
    .filter(e => e.storeId !== params.storeId && e.wasCorrected);

  const corrections = [...storeCorrections, ...otherCorrections]
    .slice(0, MAX_CORRECTIONS)
    .map(e => ({
      ocrValue: e.ocrValue,
      finalValue: e.finalValue,
      sameStore: e.storeId === params.storeId
    }));

  const knownType = newestFirst(ofStore)
    .map(e => e.meterType)
    .find(t => !!t && t !== 'indeterminado');

  const prev = params.previousReading;
  const hasPrev = typeof prev === 'number' && Number.isFinite(prev) && prev > 0;

  return {
    previousReading: hasPrev ? (prev as number) : null,
    expectedIntDigits: hasPrev ? intDigits(prev as number) : null,
    meterType: knownType,
    corrections
  };
}

/** Converte o contexto em um bloco de texto para o prompt. Retorna '' se não houver nada útil. */
export function formatContextForPrompt(ctx?: OcrReadingContext | null): string {
  if (!ctx) return '';
  const lines: string[] = [];

  if (ctx.previousReading != null) {
    lines.push(
      `- Leitura do mês anterior deste medidor: ${ctx.previousReading} (${ctx.expectedIntDigits} dígitos inteiros). ` +
      `A leitura atual costuma ser maior ou igual a esse valor e ter o mesmo número de dígitos.`
    );
    lines.push(
      `- NÚMEROS VERMELHOS: Se o mostrador tiver dígitos vermelhos (frações decimais), descarte-os totalmente! ` +
      `A leitura atual deve considerar apenas os ${ctx.expectedIntDigits} dígitos pretos inteiros (nunca concatene dígitos vermelhos).`
    );
  }
  if (ctx.meterType) {
    lines.push(`- Tipo de medidor já identificado nesta loja: ${ctx.meterType}.`);
  }
  if (ctx.corrections?.length) {
    lines.push('- Erros de leitura já corrigidos por técnicos (aprenda com eles):');
    for (const c of ctx.corrections) {
      lines.push(
        `  • ${c.sameStore ? 'neste medidor' : 'em outro medidor'}: a IA leu ${c.ocrValue}, mas o valor correto era ${c.finalValue}.`
      );
    }
  }

  if (!lines.length) return '';

  return [
    'CONTEXTO DESTE MEDIDOR (use APENAS para desambiguar dígitos duvidosos):',
    ...lines,
    'IMPORTANTE: o valor retornado deve vir do que a FOTO mostra. NUNCA copie a leitura anterior nem os exemplos acima; se a foto contradiz o contexto, confie na foto e use confidence "low" ou "medium".'
  ].join('\n');
}
