import {
  CostItem,
  MeterPhotoRecord,
  Store,
  StoreReading,
  UtilityType
} from '../models';
import { BillTableRow } from '../components/bill-subcomponents.types';
import { ApportionmentEngineService, parsePtBrNumber } from './apportionment-engine.service';
import { normalizeContract, normalizeLuc, normalizeStoreName } from './store.service';
import {
  AnomalyType,
  evaluateReadingAnomaly,
  HistoricalStoreStats,
  ZeroConsumptionLearning
} from './bill-audit.helpers';

export type BillStatusFilter = 'all' | 'pending' | 'completed' | 'alert' | 'prev_missing' | 'hidden_tech';

export interface PreviousReadingEntry {
  reading: number;
  consumption: number;
  cost?: number;
  month?: string;
}

export interface BuildBillTableRowsParams {
  stores: Store[];
  utilityType: UtilityType;
  unitPrice: number;
  readingsMap: Map<string, StoreReading>;
  prevReadings: Map<string, PreviousReadingEntry>;
  historicalStats: Map<string, HistoricalStoreStats>;
  zeroLearningMap: Map<string, ZeroConsumptionLearning>;
  meterPhotos: Record<string, MeterPhotoRecord>;
  gasTotalReading: number;
  gasAutoDistribute: boolean;
  apportionmentEngine: Pick<ApportionmentEngineService, 'calculateReadingDifference'>;
}

export interface GasDistributionStats {
  concessionaria: number;
  rawTotal: number;
  distributedTotal: number;
  diffM3: number;
  diffPct: number;
  factor: number;
  isEnabled: boolean;
  isBalanced: boolean;
  totalBill: number;
  totalDistributedCost: number;
  costDiff: number;
}

export interface PrevMonthAuditSummary {
  totalCount: number;
  pendingCount: number;
  completedCount: number;
  pendingStores: BillTableRow[];
  completedStores: BillTableRow[];
  frequentZeroPending: BillTableRow[];
  isAllDone: boolean;
  hasPreviousData: boolean;
}

export interface ClosingChecklistSummary {
  readings: {
    passed: boolean;
    totalStores: number;
    readStores: number;
    pendingStores: number;
    pendingList: Array<{ id: string; luc: string; name: string; routeOrder?: number }>;
  };
  continuity: {
    passed: boolean;
    totalCount: number;
    completedCount: number;
    pendingCount: number;
    hasPreviousData: boolean;
    pendingStores: BillTableRow[];
    frequentZeroPending: BillTableRow[];
  };
  anomalies: {
    passed: boolean;
    uninspectedCount: number;
    uninspectedList: Array<{
      id: string;
      luc: string;
      name: string;
      type: AnomalyType;
      badge: string;
      currentReading: number;
      prevReading: number;
      consumption: number;
      avgConsumption: number;
    }>;
  };
  reconciliation: {
    passed: boolean;
    billAmount: number;
    totalReconciled: number;
    diffFinancial: number;
    isGasAuto: boolean;
    gasConcessionaria: number;
    totalRawGas: number;
    gasDiff: number;
  };
  lock: {
    passed: boolean;
    lockedAt: string | null;
    lockedBy: string | null;
  };
  canFreeze: boolean;
  allPassed: boolean;
}

export function createDefaultCostItems(type: UtilityType): CostItem[] {
  if (type === 'luz') {
    return [
      { id: '1', name: 'Conta CEEE BSS-1 (UC 72207914)', value: 0 },
      { id: '2', name: 'Valor conta CEMIG BSS-1', value: 0 },
      { id: '3', name: 'Valor ENEVA', value: 0 },
      { id: '4', name: 'Contribuição-1 associativa CCEE', value: 0 },
      { id: '5', name: 'Contabilização energia reserva - RES005', value: 0 },
      { id: '6', name: 'Tarifa bancária Bradesco', value: 0 },
      { id: '7', name: 'Diferenças convertidas no rateio (ajustes)', value: 0 },
      { id: '8', name: 'Sumário (liq. Financeira) - SUM001', value: 0 },
      { id: '9', name: 'Automação CAG - Microblau', value: 0 },
      { id: '10', name: 'Valor conta CEEE BSS-2 (UC 68203772)', value: 0 },
      { id: '11', name: 'Valor conta CEMIG BSS-2', value: 0 },
      { id: '12', name: 'Valor conta CEEE BSS-3 (UC 64550214)', value: 0 },
      { id: '13', name: 'Valor conta CEEE BSS-4 (UC 54031443)', value: 0 },
      { id: '14', name: 'Valor Siclo - Consultoria', value: 0 },
      { id: '15', name: 'Valor Agroenergia - Consultoria', value: 0 },
      { id: '16', name: 'Gestão Mercado Livre (Versa)', value: 0 },
      { id: '17', name: 'Fluxo de caixa', value: 0 },
      { id: '18', name: 'Guia judicial', value: 0 }
    ];
  }
  if (type === 'agua') {
    return [
      { id: 'w1', name: 'Valor conta', value: 0 },
      { id: 'w2', name: 'Enviro Tools', value: 0 },
      { id: 'w3', name: 'Fluxo de caixa', value: 0 }
    ];
  }
  return [
    { id: 'g1', name: 'Valor conta', value: 0 },
    { id: 'g2', name: 'Enviro Tools', value: 0 },
    { id: 'g3', name: 'Fluxo de caixa', value: 0 }
  ];
}

export function createDefaultReading(): StoreReading {
  return {
    reading: 0,
    constant: 1,
    virtual: undefined,
    adjustment: 1,
    calculatedConsumption: 0,
    excludedFromBill: false
  };
}

export function getPreviousMonthString(currentMonth: string): string {
  const [year, month] = currentMonth.split('-').map(Number);
  const date = new Date(year, month - 1 - 1, 1);
  return date.toISOString().substring(0, 7);
}

export function resolvePreviousReading(
  store: Store,
  prevReadings: Map<string, PreviousReadingEntry>
): PreviousReadingEntry {
  const normLuc = store.luc ? normalizeLuc(store.luc) : '';
  const normContrato = store.contrato ? normalizeContract(store.contrato) : '';
  const normName = store.name ? normalizeStoreName(store.name) : '';

  return (
    prevReadings.get(store.id) ||
    (normLuc && normContrato ? prevReadings.get(`luc_contrato:${normLuc}_${normContrato}`) : undefined) ||
    (normLuc && normName ? prevReadings.get(`luc_name:${normLuc}_${normName}`) : undefined) ||
    (normLuc ? prevReadings.get(`luc:${normLuc}`) : undefined) ||
    (normContrato ? prevReadings.get(`contrato:${normContrato}`) : undefined) ||
    (normName ? prevReadings.get(`name:${normName}`) : undefined) ||
    { reading: 0, consumption: 0 }
  );
}

/**
 * Calcula as linhas completas da tabela de rateio, preservando 100% da matemática de
 * consumo, rollover, fator proporcional de gás (100% rateável), auditoria de anomalias e ordenação.
 */
export function buildBillTableRows(params: BuildBillTableRowsParams): BillTableRow[] {
  const {
    stores,
    utilityType: type,
    unitPrice: price,
    readingsMap,
    prevReadings,
    historicalStats: histAvgMap,
    zeroLearningMap,
    meterPhotos,
    gasTotalReading,
    gasAutoDistribute: isGasAuto,
    apportionmentEngine
  } = params;

  const unit = type === 'luz' ? 'kWh' : 'm³';

  // Se for Gás, pré-calculamos a soma bruta do consumo medido em campo para todas as lojas
  let totalRawGas = 0;
  if (type === 'gas') {
    stores.forEach(s => {
      const d = readingsMap.get(s.id) || createDefaultReading();
      const p = resolvePreviousReading(s, prevReadings);
      const hasVirtual =
        d.virtual !== undefined &&
        d.virtual !== null &&
        (d.virtual as any) !== '' &&
        !isNaN(Number(d.virtual));

      if (hasVirtual) {
        totalRawGas += Number(d.virtual);
      } else {
        const diff = apportionmentEngine.calculateReadingDifference(d.reading || 0, p.reading || 0, !!d.isRollover);
        const adjNum = Number(d.adjustment);
        const adj = !isNaN(adjNum) && adjNum > 0 ? adjNum : 1.347;
        const fcmNum = Number(d.fcm);
        const mfcm = !isNaN(fcmNum) && fcmNum > 0 ? fcmNum : 1.0727;
        totalRawGas += (diff * adj) * mfcm;
      }
    });
  }

  const gasConcessionaria = gasTotalReading || 0;
  const gasFactor =
    type === 'gas' && isGasAuto && gasConcessionaria > 0 && totalRawGas > 0
      ? gasConcessionaria / totalRawGas
      : 1.0;

  return stores
    .map(store => {
      let consumption = 0;
      let rawConsumption = 0;
      let cost = 0;

      let virtual: number | undefined = undefined;
      let adjustment = 1;
      let variation = 0;
      let adjustmentAdd = 0;
      let fcm = 1;
      let fluxoCost = 0;

      const data = readingsMap.get(store.id) || createDefaultReading();
      const prevData = resolvePreviousReading(store, prevReadings);

      const currentReading = data.reading;
      const prevReading = prevData.reading;
      const prevConsumption = prevData.consumption || 0;
      const prevCost = prevData.cost || 0;
      const prevReadingMonth = prevData.month || '';
      const constNum = Number(data.constant);
      const constant = !isNaN(constNum) && constNum > 0 ? constNum : 1;

      if (data.virtual !== undefined && data.virtual !== null && !isNaN(Number(data.virtual))) {
        virtual = Number(data.virtual);
      }

      const isConfirmed = !!data.anomalyConfirmed;
      const isRollover = !!data.isRollover;

      if (type === 'gas') {
        const adjNum = Number(data.adjustment);
        adjustment = !isNaN(adjNum) && adjNum > 0 ? adjNum : 1.347;
        adjustmentAdd = Number(data.adjustmentAdd) || 0;
        const fcmNum = Number(data.fcm);
        fcm = !isNaN(fcmNum) && fcmNum > 0 ? fcmNum : 1.0727;
        fluxoCost = Number(data.fluxoCost) || 0;
      } else {
        const adjNum = Number(data.adjustment);
        adjustment = !isNaN(adjNum) && adjNum > 0 ? adjNum : 1;
      }

      // Medição bruta de campo (com suporte a virada de relógio e override virtual)
      if (virtual !== undefined) {
        rawConsumption = virtual;
      } else {
        const diff = apportionmentEngine.calculateReadingDifference(currentReading, prevReading, isRollover);
        if (type === 'gas') {
          const initial = diff * adjustment;
          rawConsumption = initial * fcm;
        } else {
          rawConsumption = diff * constant * adjustment;
        }
      }

      // Distribuição Proporcional Automática no Gás (100% Rateável)
      if (type === 'gas' && isGasAuto && gasConcessionaria > 0 && totalRawGas > 0) {
        consumption = rawConsumption * gasFactor;
      } else {
        consumption = rawConsumption;
      }

      if (prevData.consumption > 0) {
        variation = ((consumption - prevData.consumption) / prevData.consumption) * 100;
      }

      let rawCost = consumption * price;
      if (type === 'gas') {
        rawCost += fluxoCost + adjustmentAdd;
      }

      const excludedFromBill = !!data.excludedFromBill;
      cost = excludedFromBill ? 0 : rawCost;

      const note = data.note || '';
      const photoRec = meterPhotos[store.id];
      const hasPhoto = !!data.hasPhoto || !!photoRec;
      const photoTimestamp = data.photoTimestamp || photoRec?.capturedAt || '';
      const isRead = currentReading > 0;
      const readingDiff = isRead ? currentReading - prevReading : 0;

      const isJustified = !!data.isJustified || (!!note && note.includes('[JUSTIFICADO]'));
      const justificationReason =
        data.justificationReason ||
        (note && note.includes('[JUSTIFICADO]') ? note.replace('[JUSTIFICADO]', '').trim() : '');

      const learnedZero = zeroLearningMap.get(store.id);
      const isFrequentZero = !!learnedZero?.isFrequentZero;
      const consecutiveZeroMonths = learnedZero?.consecutiveZeroMonths || 0;
      const learnedReason = learnedZero?.learnedReason || 'Loja Fechada / Vaga';

      const histData = histAvgMap.get(store.id);
      const anomalyEval = evaluateReadingAnomaly({
        isRead,
        storeActive: store.active !== false,
        currentReading,
        prevReading,
        consumption,
        prevConsumption: prevData.consumption,
        histAvgConsumption: histData?.avgConsumption || 0,
        prevMonthZero: histData?.prevMonthZero === true,
        isRollover,
        isConfirmed,
        hasVirtualOverride: virtual !== undefined,
        unit
      });

      return {
        storeId: store.id,
        luc: store.luc,
        contrato: store.contrato || '',
        storeName: store.name,
        routeOrder: store.routeOrder,
        meterNumber: store.meterNumber || '',
        active: store.active !== false,
        consumption,
        rawConsumption,
        gasFactor,
        isGasDistributed:
          type === 'gas' && isGasAuto && gasConcessionaria > 0 && totalRawGas > 0 && Math.abs(gasFactor - 1) > 0.0001,
        cost,
        originalCost: rawCost,
        excludedFromBill,
        hiddenFromTech: !!store.hiddenFromTech,
        prevReading,
        prevConsumption,
        prevCost,
        prevReadingMonth,
        currentReading,
        constant,
        virtual,
        adjustment,
        adjustmentAdd,
        fcm,
        fluxoCost,
        variation,
        note,
        hasPhoto,
        photoTimestamp,
        isRead,
        isJustified,
        justificationReason,
        isFrequentZero,
        consecutiveZeroMonths,
        learnedReason,
        isNegative: anomalyEval.isNegative,
        isZeroActive: anomalyEval.isZeroActive,
        isHugeTypoJump: anomalyEval.isExtremeJump,
        isAtypicalJump: anomalyEval.is3xJump,
        hasSuspiciousAlert: anomalyEval.hasUnconfirmedAlert,
        anomalyConfirmed: isConfirmed,
        isRollover,
        alertSeverity: anomalyEval.alertSeverity,
        validationAlert: anomalyEval.validationAlert,
        readingDiff
      };
    })
    .sort((a, b) => {
      const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
      const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.luc.localeCompare(b.luc, undefined, { numeric: true });
    });
}

export function computeGasDistributionStats(params: {
  utilityType: UtilityType;
  gasTotalReading: number;
  gasAutoDistribute: boolean;
  tableData: BillTableRow[];
  totalBillAmount: number;
  totalDistributedCost: number;
}): GasDistributionStats | null {
  if (params.utilityType !== 'gas') return null;

  const concessionaria = params.gasTotalReading || 0;
  const rawTotal = params.tableData.reduce(
    (acc, item) => acc + (item.rawConsumption !== undefined ? item.rawConsumption : item.consumption),
    0
  );
  const distributedTotal = params.tableData.reduce((acc, item) => acc + item.consumption, 0);
  const diffM3 = concessionaria - rawTotal;
  const diffPct = rawTotal > 0 ? ((concessionaria - rawTotal) / rawTotal) * 100 : 0;
  const factor = concessionaria > 0 && rawTotal > 0 ? concessionaria / rawTotal : 1.0;
  const costDiff = params.totalBillAmount - params.totalDistributedCost;

  return {
    concessionaria,
    rawTotal,
    distributedTotal,
    diffM3,
    diffPct,
    factor,
    isEnabled: params.gasAutoDistribute,
    isBalanced: Math.abs(concessionaria - distributedTotal) < 0.01 && concessionaria > 0,
    totalBill: params.totalBillAmount,
    totalDistributedCost: params.totalDistributedCost,
    costDiff
  };
}

export function computePrevMonthAudit(fieldTableData: BillTableRow[]): PrevMonthAuditSummary {
  const measuredLastMonth = fieldTableData.filter(
    item =>
      (item.prevReading > 0 || item.prevConsumption > 0 || (item.prevCost && item.prevCost > 0)) &&
      !item.excludedFromBill
  );

  const pendingStores = measuredLastMonth.filter(item => !item.isRead && !item.isJustified);
  const completedStores = measuredLastMonth.filter(item => item.isRead || item.isJustified);

  const sortByRoute = (a: BillTableRow, b: BillTableRow) => {
    const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
    const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.luc || '').localeCompare(b.luc || '', undefined, { numeric: true });
  };
  pendingStores.sort(sortByRoute);
  completedStores.sort(sortByRoute);

  const frequentZeroPending = pendingStores.filter(item => item.isFrequentZero);
  const totalCount = measuredLastMonth.length;
  const pendingCount = pendingStores.length;
  const completedCount = completedStores.length;
  const isAllDone = totalCount > 0 && pendingCount === 0;

  return {
    totalCount,
    pendingCount,
    completedCount,
    pendingStores,
    completedStores,
    frequentZeroPending,
    isAllDone,
    hasPreviousData: totalCount > 0
  };
}

export function computeClosingChecklist(params: {
  tableData: BillTableRow[];
  prevAudit: PrevMonthAuditSummary;
  totalBillAmount: number;
  totalDistributedCost: number;
  airConditioningCost: number;
  commonAreaCost: number;
  gasTotalReading: number;
  gasAutoDistribute: boolean;
  isLocked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
}): ClosingChecklistSummary {
  const list = params.tableData;
  const totalStores = list.length;
  const readStores = list.filter(item => item.isRead || item.isJustified).length;
  const pendingStores = totalStores - readStores;
  const isComplete = totalStores > 0 && pendingStores === 0;

  const uninspectedAnomalies = list.filter(
    item => item.validationAlert.hasAlert && !item.anomalyConfirmed && item.isRead
  );
  const hasZeroAnomalies = uninspectedAnomalies.length === 0;

  const prevAudit = params.prevAudit;
  const prevMonthPending = prevAudit.pendingCount;
  const isContinuityComplete = prevAudit.hasPreviousData ? prevMonthPending === 0 : true;

  const billAmount = params.totalBillAmount || 0;
  const distributed = params.totalDistributedCost || 0;
  const acCost = params.airConditioningCost || 0;
  const commonArea = params.commonAreaCost || 0;
  const totalReconciled = distributed + acCost + commonArea;
  const diffFinancial = Math.abs(totalReconciled - billAmount);
  const isReconciled = billAmount > 0 ? diffFinancial <= 0.5 : true;

  const gasConcessionaria = params.gasTotalReading || 0;
  const isGasAuto = params.gasAutoDistribute;
  const totalRawGas = list.reduce((acc, row) => acc + (row.rawConsumption || 0), 0);
  const gasDiff = Math.abs(gasConcessionaria - totalRawGas);

  const isLocked = params.isLocked;
  const canFreeze = isComplete && hasZeroAnomalies && isContinuityComplete;
  const allPassed = isComplete && hasZeroAnomalies && isContinuityComplete && isReconciled && isLocked;

  return {
    readings: {
      passed: isComplete,
      totalStores,
      readStores,
      pendingStores,
      pendingList: list
        .filter(i => !i.isRead && !i.isJustified)
        .map(i => ({ id: i.storeId, luc: i.luc, name: i.storeName, routeOrder: i.routeOrder }))
    },
    continuity: {
      passed: isContinuityComplete,
      totalCount: prevAudit.totalCount,
      completedCount: prevAudit.completedCount,
      pendingCount: prevMonthPending,
      hasPreviousData: prevAudit.hasPreviousData,
      pendingStores: prevAudit.pendingStores,
      frequentZeroPending: prevAudit.frequentZeroPending
    },
    anomalies: {
      passed: hasZeroAnomalies,
      uninspectedCount: uninspectedAnomalies.length,
      uninspectedList: uninspectedAnomalies.map(i => ({
        id: i.storeId,
        luc: i.luc,
        name: i.storeName,
        type: i.validationAlert.type,
        badge: i.validationAlert.badgeLabel,
        currentReading: i.currentReading,
        prevReading: i.prevReading,
        consumption: i.consumption,
        avgConsumption: i.validationAlert.avgConsumption
      }))
    },
    reconciliation: {
      passed: isReconciled,
      billAmount,
      totalReconciled,
      diffFinancial,
      isGasAuto,
      gasConcessionaria,
      totalRawGas,
      gasDiff
    },
    lock: {
      passed: isLocked,
      lockedAt: params.lockedAt,
      lockedBy: params.lockedBy
    },
    canFreeze,
    allPassed
  };
}

export function filterAndSortBillRows(params: {
  rows: BillTableRow[];
  statusFilter: BillStatusFilter;
  searchQuery: string;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
}): BillTableRow[] {
  let list = params.rows;
  const filter = params.statusFilter;
  const q = params.searchQuery.trim().toLowerCase();
  const sortCol = params.sortBy;
  const sortDir = params.sortDirection;

  if (filter === 'pending') {
    list = list.filter(item => !item.isRead && !item.isJustified);
  } else if (filter === 'completed') {
    list = list.filter(item => item.isRead || item.isJustified);
  } else if (filter === 'alert') {
    list = list.filter(item => item.hasSuspiciousAlert);
  } else if (filter === 'hidden_tech') {
    list = list.filter(item => item.hiddenFromTech);
  } else if (filter === 'prev_missing') {
    list = list.filter(
      item =>
        (item.prevReading > 0 || item.prevConsumption > 0 || (item.prevCost && item.prevCost > 0)) &&
        !item.isRead &&
        !item.isJustified &&
        !item.excludedFromBill
    );
  }

  if (q) {
    list = list.filter(
      item =>
        item.storeName.toLowerCase().includes(q) ||
        item.luc.toLowerCase().includes(q) ||
        (item.contrato && item.contrato.toLowerCase().includes(q))
    );
  }

  const sorted = [...list];
  sorted.sort((a, b) => {
    let diff = 0;
    switch (sortCol) {
      case 'route': {
        const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
        const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
        diff = orderA - orderB;
        break;
      }
      case 'luc':
        diff = a.luc.localeCompare(b.luc, undefined, { numeric: true });
        break;
      case 'name':
      case 'storeName':
        diff = a.storeName.localeCompare(b.storeName);
        break;
      case 'prevReading':
        diff = (a.prevReading || 0) - (b.prevReading || 0);
        break;
      case 'prevConsumption':
        diff = (a.prevConsumption || 0) - (b.prevConsumption || 0);
        break;
      case 'prevCost':
        diff = (a.prevCost || 0) - (b.prevCost || 0);
        break;
      case 'currentReading':
      case 'reading':
        diff = (a.currentReading || 0) - (b.currentReading || 0);
        break;
      case 'constant':
        diff = (a.constant || 1) - (b.constant || 1);
        break;
      case 'virtual':
        diff = (a.virtual ?? 0) - (b.virtual ?? 0);
        break;
      case 'adjustment':
        diff = (a.adjustment ?? 0) - (b.adjustment ?? 0);
        break;
      case 'adjustmentAdd':
        diff = (a.adjustmentAdd ?? 0) - (b.adjustmentAdd ?? 0);
        break;
      case 'fcm':
        diff = (a.fcm ?? 0) - (b.fcm ?? 0);
        break;
      case 'consumption':
        diff = (a.consumption || 0) - (b.consumption || 0);
        break;
      case 'variation':
        diff = (a.variation || 0) - (b.variation || 0);
        break;
      case 'fluxoCost':
        diff = (a.fluxoCost || 0) - (b.fluxoCost || 0);
        break;
      case 'note':
        diff = (a.note || '').localeCompare(b.note || '');
        break;
      case 'hasPhoto':
      case 'photo':
        diff = (a.hasPhoto ? 1 : 0) - (b.hasPhoto ? 1 : 0);
        break;
      case 'cost':
        diff = (a.cost || 0) - (b.cost || 0);
        break;
      default: {
        const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
        const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
        diff = orderA - orderB;
        break;
      }
    }

    if (diff !== 0) {
      return sortDir === 'asc' ? diff : -diff;
    }

    // Tiebreaker determinístico para evitar instabilidade na visualização
    const orderA = a.routeOrder !== undefined && a.routeOrder !== null ? a.routeOrder : 9999;
    const orderB = b.routeOrder !== undefined && b.routeOrder !== null ? b.routeOrder : 9999;
    if (orderA !== orderB) return orderA - orderB;
    return a.luc.localeCompare(b.luc, undefined, { numeric: true });
  });

  return sorted;
}

export function sanitizeReadingFieldValue(
  field: keyof StoreReading,
  value: any,
  utilityType: UtilityType
): any {
  if (field === 'reading') {
    return parsePtBrNumber(value);
  }
  if (field === 'virtual') {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const str = String(value).trim();
    if (str === '' || str === '-' || str === '—') {
      return undefined;
    }
    return parsePtBrNumber(value);
  }
  if (field === 'adjustment') {
    const num = parsePtBrNumber(value);
    return num <= 0 ? (utilityType === 'gas' ? 1.347 : 1) : num;
  }
  if (field === 'fcm') {
    const num = parsePtBrNumber(value);
    return num <= 0 ? 1.0727 : num;
  }
  if (field === 'constant') {
    const num = parsePtBrNumber(value);
    return num <= 0 ? 1 : num;
  }
  if (field === 'adjustmentAdd' || field === 'fluxoCost') {
    return parsePtBrNumber(value);
  }
  return value;
}

/**
 * Aplica colagem multilinha (Excel/Google Sheets) a partir de `startStoreId`,
 * retornando um novo Map de leituras ou `null` caso o texto não seja multilinha/válido.
 */
export function applySpreadsheetPasteToReadings(params: {
  clipboardText: string;
  startStoreId: string;
  field: keyof StoreReading;
  tableData: Pick<BillTableRow, 'storeId'>[];
  currentReadings: Map<string, StoreReading>;
}): Map<string, StoreReading> | null {
  const { clipboardText, startStoreId, field, tableData, currentReadings } = params;
  if (!clipboardText.includes('\n') && !clipboardText.includes('\r')) {
    return null;
  }

  const rawLines = clipboardText.split(/\r?\n/).map(line => line.trim());
  const valList = rawLines.filter((l, i) => l !== '' || i < rawLines.length - 1);
  if (valList.length === 0) return null;

  const startIndex = tableData.findIndex(item => item.storeId === startStoreId);
  if (startIndex === -1) return null;

  const map = new Map(currentReadings);
  valList.forEach((line, i) => {
    const targetIndex = startIndex + i;
    if (targetIndex >= tableData.length) return;

    const targetStoreId = tableData[targetIndex].storeId;
    const currentData = map.get(targetStoreId) || createDefaultReading();

    const cellStr = line.split('\t')[0]?.trim() || '';
    if (field === 'virtual' && (cellStr === '' || cellStr === '-' || cellStr === '—')) {
      map.set(targetStoreId, { ...currentData, virtual: undefined });
      return;
    }
    if (cellStr === '') return;

    const numVal = parsePtBrNumber(cellStr);
    if (!isNaN(numVal)) {
      map.set(targetStoreId, { ...currentData, [field]: numVal });
    }
  });

  return map;
}
