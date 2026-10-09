import { Injectable } from '@angular/core';
import { UtilityType, AlertSeverity } from '../models';

export interface StoreConsumptionParams {
  utilityType: UtilityType;
  currentReading: number;
  prevReading: number;
  constant?: number;
  adjustment?: number;
  virtual?: number | null;
  adjustmentAdd?: number;
  fcm?: number;
  isRollover?: boolean;
  gasFactor?: number;
  isGasAuto?: boolean;
}

export interface StoreConsumptionResult {
  diff: number;
  rawConsumption: number;
  consumption: number;
  isVirtual: boolean;
}

export interface CommonAreaResult {
  consumption: number;
  cost: number;
  consumptionPct: number;
  costPct: number;
}

export interface RateioSummaryResult {
  unitPrice: number;
  totalConcessionariaBill: number;
  totalConcessionariaConsumption: number;
  tenantsConsumption: number;
  tenantsCost: number;
  acConsumption: number;
  acCost: number;
  commonAreaConsumption: number;
  commonAreaCost: number;
  gasFactor: number;
}

/**
 * Funções puras de cálculo matemático de rateio (desacopladas do Angular para fácil testabilidade)
 */

export function calculateUnitPrice(totalBillAmount: number, totalConsumption: number): number {
  if (!totalBillAmount || !totalConsumption || totalConsumption <= 0) return 0;
  return totalBillAmount / totalConsumption;
}

export function calculateReadingDifference(currentReading: number, prevReading: number, isRollover: boolean = false): number {
  const curr = Number(currentReading) || 0;
  const prev = Number(prevReading) || 0;

  if (isRollover && curr < prev && prev > 0) {
    const digitsBase = prev > 10000 ? 100000 : (prev > 1000 ? 10000 : 1000);
    return Math.max(0, (digitsBase - prev) + curr);
  }

  const diff = curr - prev;
  return diff < 0 ? 0 : diff;
}

export function calculateGasFactor(
  gasConcessionaria: number, 
  totalRawGas: number, 
  isGasAuto: boolean = true
): number {
  if (isGasAuto && gasConcessionaria > 0 && totalRawGas > 0) {
    return gasConcessionaria / totalRawGas;
  }
  return 1.0;
}

export function calculateStoreConsumption(params: StoreConsumptionParams): StoreConsumptionResult {
  const {
    utilityType,
    currentReading,
    prevReading,
    isRollover = false,
    constant = 1,
    adjustmentAdd = 0,
    gasFactor = 1.0,
    isGasAuto = false
  } = params;

  let adjustment = params.adjustment;
  let fcm = params.fcm;

  if (utilityType === 'gas') {
    adjustment = adjustment !== undefined ? adjustment : 1.347;
    fcm = fcm || 1.0727;
  } else {
    adjustment = adjustment !== undefined ? adjustment : 1.0;
    fcm = 1.0;
  }

  const hasVirtual = params.virtual !== undefined && params.virtual !== null && !isNaN(Number(params.virtual));
  let diff = 0;
  let rawConsumption = 0;

  if (hasVirtual) {
    rawConsumption = Number(params.virtual);
  } else {
    diff = calculateReadingDifference(currentReading, prevReading, isRollover);

    if (utilityType === 'gas') {
      const initial = (diff * adjustment) + adjustmentAdd;
      rawConsumption = initial * fcm;
    } else {
      rawConsumption = diff * constant * adjustment;
    }
  }

  let consumption = rawConsumption;
  if (utilityType === 'gas' && isGasAuto && gasFactor > 0) {
    consumption = rawConsumption * gasFactor;
  }

  return {
    diff,
    rawConsumption,
    consumption,
    isVirtual: hasVirtual
  };
}

export function calculateStoreCost(consumption: number, unitPrice: number): number {
  if (!consumption || consumption <= 0 || !unitPrice || unitPrice <= 0) return 0;
  return consumption * unitPrice;
}

export function calculateAirConditioningCost(acConsumption: number, unitPrice: number): number {
  if (!acConsumption || acConsumption <= 0 || !unitPrice || unitPrice <= 0) return 0;
  return acConsumption * unitPrice;
}

export function calculateCommonArea(
  totalConcessionariaConsumption: number,
  totalConcessionariaBill: number,
  tenantsConsumption: number,
  tenantsCost: number,
  acConsumption: number = 0,
  acCost: number = 0,
  isGasProportional: boolean = false
): CommonAreaResult {
  if (isGasProportional) {
    return { consumption: 0, cost: 0, consumptionPct: 0, costPct: 0 };
  }

  const remainingConsumption = totalConcessionariaConsumption - tenantsConsumption - acConsumption;
  const remainingCost = totalConcessionariaBill - tenantsCost - acCost;

  const safeConsumption = Math.max(0, Number(remainingConsumption.toFixed(4)));
  const safeCost = Math.max(0, Number(remainingCost.toFixed(2)));

  const consumptionPct = totalConcessionariaConsumption > 0 
    ? Number(((safeConsumption / totalConcessionariaConsumption) * 100).toFixed(2)) 
    : 0;
  const costPct = totalConcessionariaBill > 0 
    ? Number(((safeCost / totalConcessionariaBill) * 100).toFixed(2)) 
    : 0;

  return {
    consumption: safeConsumption,
    cost: safeCost,
    consumptionPct,
    costPct
  };
}

export function calculateVariationPct(current: number, baseline: number): number | null {
  if (baseline <= 0 || isNaN(baseline)) return null;
  return ((current - baseline) / baseline) * 100;
}

export function evaluateAlertSeverity(diffAvgPct: number, momPct: number | null): AlertSeverity {
  if (diffAvgPct >= 40 || (momPct !== null && momPct >= 50)) {
    return 'critical';
  }
  if (diffAvgPct >= 20 || (momPct !== null && momPct >= 30)) {
    return 'warning';
  }
  return 'normal';
}

@Injectable({
  providedIn: 'root'
})
export class ApportionmentEngineService {
  calculateUnitPrice = calculateUnitPrice;
  calculateReadingDifference = calculateReadingDifference;
  calculateGasFactor = calculateGasFactor;
  calculateStoreConsumption = calculateStoreConsumption;
  calculateStoreCost = calculateStoreCost;
  calculateAirConditioningCost = calculateAirConditioningCost;
  calculateCommonArea = calculateCommonArea;
  calculateVariationPct = calculateVariationPct;
  evaluateAlertSeverity = evaluateAlertSeverity;

  /**
   * Consolidação geral do rateio de um mês
   */
  calculateFullRateio(
    totalBill: number,
    totalConsumption: number,
    tenantsConsumption: number,
    acConsumption: number,
    utilityType: UtilityType,
    isGasAuto: boolean
  ): RateioSummaryResult {
    const unitPrice = calculateUnitPrice(totalBill, totalConsumption);
    const tenantsCost = tenantsConsumption * unitPrice;
    const acCost = calculateAirConditioningCost(acConsumption, unitPrice);
    const isGasProportional = utilityType === 'gas' && isGasAuto;

    const commonArea = calculateCommonArea(
      totalConsumption,
      totalBill,
      tenantsConsumption,
      tenantsCost,
      acConsumption,
      acCost,
      isGasProportional
    );

    return {
      unitPrice,
      totalConcessionariaBill: totalBill,
      totalConcessionariaConsumption: totalConsumption,
      tenantsConsumption,
      tenantsCost,
      acConsumption,
      acCost,
      commonAreaConsumption: commonArea.consumption,
      commonAreaCost: commonArea.cost,
      gasFactor: isGasProportional ? calculateGasFactor(totalConsumption, tenantsConsumption, true) : 1.0
    };
  }
}
