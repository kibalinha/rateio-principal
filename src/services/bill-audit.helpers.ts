import { BillData, Store } from '../models';
import { normalizeContract, normalizeLuc, normalizeStoreName } from './store.service';

export type AuditUtilityType = 'luz' | 'agua' | 'gas';

export type AnomalySeverity = 'none' | 'warning' | 'critical';

export type AnomalyType =
  | 'none'
  | 'negative'
  | 'leak_suspect'
  | 'typo_extreme'
  | 'digits_mismatch'
  | 'zero_2months'
  | 'zero_month';

export interface HistoricalStoreStats {
  avgConsumption: number;
  count: number;
  prevMonthZero: boolean;
}

export interface ZeroConsumptionLearning {
  isFrequentZero: boolean;
  consecutiveZeroMonths: number;
  totalZeroMonths: number;
  lastNote: string;
  learnedReason: string;
  pastZeroMonthsList: string[];
}

export interface ValidationAlert {
  hasAlert: boolean;
  type: AnomalyType;
  severity: AnomalySeverity;
  badgeLabel: string;
  title: string;
  message: string;
  avgConsumption: number;
  prevConsumption: number;
  prevReading: number;
  currentReading: number;
  consumption: number;
  diffPct: number | null;
}

export interface ReadingAnomalyInput {
  isRead: boolean;
  storeActive: boolean;
  currentReading: number;
  prevReading: number;
  consumption: number;
  prevConsumption: number;
  histAvgConsumption: number;
  prevMonthZero: boolean;
  isRollover: boolean;
  isConfirmed: boolean;
  hasVirtualOverride: boolean;
  unit: string;
}

export interface ReadingAnomalyEvaluation {
  isNegative: boolean;
  is3xJump: boolean;
  isExtremeJump: boolean;
  isDigitsMismatch: boolean;
  is2MonthsZero: boolean;
  isZeroThisMonth: boolean;
  isZeroActive: boolean;
  hasSuspiciousAlert: boolean;
  hasUnconfirmedAlert: boolean;
  alertSeverity: AnomalySeverity;
  validationAlert: ValidationAlert;
}

function extractReadingConsumption(reading: unknown): number {
  if (typeof reading === 'object' && reading !== null) {
    return (reading as any).calculatedConsumption ?? (reading as any).consumption ?? 0;
  }
  if (typeof reading === 'number') {
    return reading;
  }
  return 0;
}

function findStoreReadingInBill(
  readings: Record<string, any>,
  store: Store,
  allStores: Store[],
  matchByName: boolean
): any {
  if (readings[store.id] !== undefined) {
    return readings[store.id];
  }

  const normLuc = store.luc ? normalizeLuc(store.luc) : '';
  const normContrato = store.contrato ? normalizeContract(store.contrato) : '';
  const normName = matchByName && store.name ? normalizeStoreName(store.name) : '';

  if (matchByName) {
    if (!normLuc && !normContrato && !normName) {
      return undefined;
    }
  } else if (!store.luc) {
    return undefined;
  }

  const matchStore = allStores.find(s => s.id !== store.id && (
    (normLuc && s.luc && normalizeLuc(s.luc) === normLuc) ||
    (normContrato && s.contrato && normalizeContract(s.contrato) === normContrato) ||
    (matchByName && normName && s.name && normalizeStoreName(s.name) === normName)
  ));

  if (matchStore && readings[matchStore.id] !== undefined) {
    return readings[matchStore.id];
  }

  return undefined;
}

/**
 * Calcula a média histórica de consumo positivo por loja e se o mês anterior fechou zerado.
 */
export function computeHistoricalStats(params: {
  allData: Record<string, BillData>;
  type: AuditUtilityType;
  currentMonth: string;
  prevMonth: string;
  activeStores: Store[];
  allStores: Store[];
}): Map<string, HistoricalStoreStats> {
  const { allData, type, currentMonth, prevMonth, activeStores, allStores } = params;

  const prevBill = allData[`${type}_${prevMonth}`];
  const map = new Map<string, { total: number; count: number }>();

  Object.entries(allData).forEach(([key, bill]) => {
    const parts = key.split('_');
    if (parts.length === 2) {
      const [bType, bMonth] = parts;
      if (bType === type && bMonth && bMonth !== currentMonth && bill.readings) {
        Object.entries(bill.readings).forEach(([storeId, r]) => {
          const cons = extractReadingConsumption(r);
          if (cons > 0) {
            const curr = map.get(storeId) || { total: 0, count: 0 };
            curr.total += cons;
            curr.count += 1;
            map.set(storeId, curr);
          }
        });
      }
    }
  });

  const result = new Map<string, HistoricalStoreStats>();
  activeStores.forEach(store => {
    const hist = map.get(store.id);
    let isPrevZero = false;

    const r = prevBill && prevBill.readings
      ? findStoreReadingInBill(prevBill.readings, store, allStores, false)
      : undefined;

    if (r !== undefined) {
      const pCons = extractReadingConsumption(r);
      isPrevZero = pCons === 0;
    }

    result.set(store.id, {
      avgConsumption: hist && hist.count > 0 ? hist.total / hist.count : 0,
      count: hist ? hist.count : 0,
      prevMonthZero: isPrevZero
    });
  });

  return result;
}

/**
 * Aprende padrões recorrentes de consumo zero (ou observações equivalentes) nos meses anteriores.
 */
export function computeZeroConsumptionLearning(params: {
  allData: Record<string, BillData>;
  type: AuditUtilityType;
  currentMonth: string;
  prevMonth: string;
  activeStores: Store[];
  allStores: Store[];
}): Map<string, ZeroConsumptionLearning> {
  const { allData, type, currentMonth, prevMonth, activeStores, allStores } = params;

  const pastMonths: string[] = [];
  const prefix = `${type}_`;
  for (const key of Object.keys(allData)) {
    if (key.startsWith(prefix)) {
      const m = key.substring(prefix.length);
      if (m && /^\d{4}-\d{2}$/.test(m) && m < currentMonth) {
        pastMonths.push(m);
      }
    }
  }

  if (!pastMonths.includes(prevMonth)) {
    pastMonths.push(prevMonth);
  }
  pastMonths.sort().reverse();

  const map = new Map<string, ZeroConsumptionLearning>();

  for (const store of activeStores) {
    let consecutiveZero = 0;
    let totalZero = 0;
    let streakBroken = false;
    let lastNote = '';
    const pastZeroMonthsList: string[] = [];

    for (const m of pastMonths) {
      const bill = allData[`${prefix}${m}`];
      if (!bill || !bill.readings) continue;

      const r = findStoreReadingInBill(bill.readings, store, allStores, true);

      if (r !== undefined) {
        const cons = extractReadingConsumption(r);
        const note = typeof r === 'object' && r !== null ? ((r as any).note || '') : '';

        const hasZeroConsumption = cons === 0;
        const lowerRNote = note.toLowerCase();
        const hasZeroKeyword = !!note && (
          lowerRNote.includes('fechad') ||
          lowerRNote.includes('vaga') ||
          lowerRNote.includes('reforma') ||
          lowerRNote.includes('sem consumo') ||
          lowerRNote.includes('inativ') ||
          lowerRNote.includes('desocupad')
        );

        if (hasZeroConsumption || hasZeroKeyword) {
          totalZero++;
          pastZeroMonthsList.push(m);
          if (!streakBroken) {
            consecutiveZero++;
          }
          if (!lastNote && note) {
            lastNote = note;
          }
        } else {
          streakBroken = true;
        }
      }
    }

    let learnedReason = 'Loja Fechada / Vaga';
    const lowerNote = lastNote.toLowerCase();
    if (lowerNote.includes('reforma') || lowerNote.includes('obra')) {
      learnedReason = 'Em Reforma / Obra';
    } else if (lowerNote.includes('inacess') || lowerNote.includes('trancad')) {
      learnedReason = 'Medidor Inacessível';
    } else if (lowerNote.includes('sem hidr') || lowerNote.includes('sem ponto') || lowerNote.includes('inativ')) {
      learnedReason = 'Sem Ponto / Inativo';
    } else if (consecutiveZero >= 2) {
      learnedReason = 'Loja Fechada / Vaga';
    } else {
      learnedReason = 'Sem Consumo no Mês';
    }

    const isFrequentZero = (consecutiveZero >= 2) || (totalZero >= 2 && consecutiveZero >= 1);

    map.set(store.id, {
      isFrequentZero,
      consecutiveZeroMonths: consecutiveZero,
      totalZeroMonths: totalZero,
      lastNote,
      learnedReason,
      pastZeroMonthsList
    });
  }

  return map;
}

const intDigits = (n: number): number => Math.floor(Math.abs(n)).toString().length;

/**
 * Avalia anomalias de leitura em campo (leitura menor, salto 3x/5x, dígitos a mais,
 * relógio parado por 2 meses e consumo zero) mantendo severidades, badges e mensagens idênticas.
 */
export function evaluateReadingAnomaly(input: ReadingAnomalyInput): ReadingAnomalyEvaluation {
  const {
    isRead,
    storeActive,
    currentReading,
    prevReading,
    consumption,
    prevConsumption,
    histAvgConsumption,
    prevMonthZero,
    isRollover,
    isConfirmed,
    hasVirtualOverride,
    unit
  } = input;

  const avgCons = histAvgConsumption > 0
    ? histAvgConsumption
    : (prevConsumption > 0 ? prevConsumption : 0);

  // 1. Alerta Crítico: Leitura menor que a anterior (sem marcação de virada de medidor)
  const isNegative = isRead && prevReading > 0 && currentReading < prevReading && !isRollover;

  // 2. Alerta de Suspeita de Vazamento / Salto Abrupto (>= 3x a média histórica da loja)
  const is3xJump = isRead && !isNegative && (
    (avgCons > 0 && consumption >= avgCons * 3 && consumption >= 12) ||
    (prevConsumption > 0 && consumption >= prevConsumption * 3 && consumption >= 12)
  );

  // 3. Alerta de Suspeita de Zero a Mais / Salto Extremo (>= 5x da média)
  const isExtremeJump = isRead && !isNegative && (
    (avgCons > 0 && consumption >= avgCons * 5 && consumption >= 25) ||
    (prevConsumption > 0 && consumption >= prevConsumption * 5 && consumption >= 25)
  );

  // 4. Alerta de Relógio Parado por 2 meses seguidos (loja ativa com 0 no mês anterior E agora)
  const is2MonthsZero = isRead && storeActive && prevReading > 0 &&
    (currentReading === prevReading || consumption === 0) && prevMonthZero;

  // 5. Alerta de Consumo Zero no mês atual (loja ativa)
  const isZeroThisMonth = isRead && storeActive && prevReading > 0 &&
    (currentReading === prevReading || consumption === 0) && !is2MonthsZero;

  // 6. Alerta de Dígitos a Mais: leitura com mais dígitos que a anterior sem ser uma virada natural
  // (ex.: 1510 -> 15100). Cobre lojas sem histórico, onde o alerta de salto não dispara.
  const isDigitsMismatch = isRead && !isNegative && !isRollover && !hasVirtualOverride &&
    prevReading >= 100 && intDigits(currentReading) > intDigits(prevReading) &&
    currentReading > prevReading * 2 && !isExtremeJump;

  const hasSuspiciousAlert = isNegative || is3xJump || isExtremeJump || isDigitsMismatch || is2MonthsZero || isZeroThisMonth;

  const alertSeverity: AnomalySeverity =
    isConfirmed
      ? 'none'
      : ((isNegative || isExtremeJump)
        ? 'critical'
        : ((is3xJump || isDigitsMismatch || is2MonthsZero || isZeroThisMonth) ? 'warning' : 'none'));

  let alertType: AnomalyType = 'none';
  let alertBadge = '';
  let alertTitle = '';
  let alertMessage = '';

  if (isNegative) {
    alertType = 'negative';
    alertBadge = isConfirmed ? '✓ Leitura Menor Auditada' : '🚨 Leitura Menor';
    alertTitle = '🚨 Leitura Menor que a Anterior';
    const diffVal = Math.abs(currentReading - prevReading);
    alertMessage = `A leitura digitada (${currentReading}) é menor que a anterior (${prevReading}). Diferença: -${diffVal.toFixed(1)} ${unit}. Verifique se houve virada física de medidor ou erro na digitação dos dígitos.`;
  } else if (isExtremeJump) {
    alertType = 'typo_extreme';
    alertBadge = isConfirmed ? '✓ Salto Auditado' : '🚨 Zero a Mais?';
    alertTitle = '🚨 Suspeita de Zero a Mais (Salto Extremo)';
    const mult = avgCons > 0 ? (consumption / avgCons).toFixed(1) : (consumption / prevConsumption).toFixed(1);
    alertMessage = `Atenção: Consumo desta loja deu ${consumption.toFixed(1)} ${unit} (a média é ${avgCons.toFixed(1)} ${unit}, salto de ${mult}x). Confira no visor do relógio se não digitou um zero extra no final!`;
  } else if (is3xJump) {
    alertType = 'leak_suspect';
    alertBadge = isConfirmed ? '✓ Salto Auditado' : '⚠️ Salto >3x (Vazamento?)';
    alertTitle = '⚠️ Suspeita de Vazamento / Salto Abrupto (>3x Média)';
    alertMessage = `Atenção: Consumo desta loja deu ${consumption.toFixed(1)} ${unit} (a média histórica é ${avgCons.toFixed(1)} ${unit}). Deseja confirmar ou conferir o relógio no local?`;
  } else if (isDigitsMismatch) {
    alertType = 'digits_mismatch';
    alertBadge = isConfirmed ? '✓ Dígitos Auditados' : '🔢 Dígito a Mais?';
    alertTitle = '🔢 Leitura com Mais Dígitos que a Anterior';
    alertMessage = `A leitura (${currentReading}) tem ${intDigits(currentReading)} dígitos e a anterior (${prevReading}) tinha ${intDigits(prevReading)}. Confira no visor se não foi lido um dígito a mais (ex.: casa decimal ou roleta vermelha).`;
  } else if (is2MonthsZero) {
    alertType = 'zero_2months';
    alertBadge = isConfirmed ? '✓ Relógio Checado' : '⏱️ Relógio Parado (2m Zerado)';
    alertTitle = '⏱️ Suspeita de Relógio Parado (2 Meses Seguidos Zerado)';
    alertMessage = `Atenção: Esta loja ativa está com consumo 0 pelo segundo mês consecutivo (Leitura anterior: ${prevReading}, Leitura atual: ${currentReading}). Verifique no local se o hidrômetro/relógio está travado ou desligado.`;
  } else if (isZeroThisMonth) {
    alertType = 'zero_month';
    alertBadge = isConfirmed ? '✓ Consumo 0 Auditado' : '⚠️ Consumo Zero';
    alertTitle = '⚠️ Consumo Zero em Loja Ativa';
    alertMessage = `A loja está ativa, mas a leitura digitada (${currentReading}) é idêntica à anterior (${prevReading}), gerando consumo 0 ${unit}. Verifique se o medidor operou no período.`;
  } else if (isConfirmed) {
    alertBadge = '✅ Auditado em Campo';
  }

  const validationAlert: ValidationAlert = {
    hasAlert: hasSuspiciousAlert,
    type: alertType,
    severity: alertSeverity,
    badgeLabel: alertBadge,
    title: alertTitle,
    message: alertMessage,
    avgConsumption: avgCons,
    prevConsumption,
    prevReading,
    currentReading,
    consumption,
    diffPct: avgCons > 0 ? Math.round(((consumption - avgCons) / avgCons) * 100) : null
  };

  return {
    isNegative,
    is3xJump,
    isExtremeJump,
    isDigitsMismatch,
    is2MonthsZero,
    isZeroThisMonth,
    isZeroActive: isZeroThisMonth || is2MonthsZero,
    hasSuspiciousAlert,
    hasUnconfirmedAlert: hasSuspiciousAlert && !isConfirmed,
    alertSeverity,
    validationAlert
  };
}
