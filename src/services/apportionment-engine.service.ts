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

/**
 * Converte string numérica no padrão pt-BR (ex: "994.683", "1.114.768,50", "56,89") para number.
 * Trata ponto seguido de 3 dígitos (ex: "994.683", "56.890") ou múltiplos pontos como separador de milhar.
 */
export function parsePtBrNumber(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;

  const cleaned = String(raw).trim().replace(/[^\d.,-]/g, '');
  if (!cleaned || cleaned === '-') return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized = cleaned;
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      // Padrão pt-BR: 1.234,56
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Padrão en-US (ex: Excel raw:false): 1,234.56
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    const firstPartDigits = parts[0].replace('-', '');
    // Múltiplos pontos (ex: 1.114.768) ou ponto único seguido de exatamente 3 dígitos (ex: 994.683, 56.890, exceto 0.xxx)
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && firstPartDigits !== '0')) {
      normalized = cleaned.replace(/\./g, '');
    }
  }

  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Formata número para exibição em input pt-BR (ex: 994683 -> "994.683", 1234.5 -> "1.234,5").
 */
export function formatPtBrInput(value: number | null | undefined, maxDecimals: number = 4): string {
  const num = Number(value);
  if (isNaN(num) || num === 0) return '0';
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

export function calculateUnitPrice(totalBillAmount: number, totalConsumption: number): number {
  if (!totalBillAmount || !totalConsumption || totalConsumption <= 0 || totalBillAmount <= 0) return 0;
  return totalBillAmount / totalConsumption;
}

export function calculateReadingDifference(currentReading: number, prevReading: number, isRollover: boolean = false): number {
  const curr = Number(currentReading) || 0;
  const prev = Number(prevReading) || 0;

  if (isRollover && curr < prev && prev > 0) {
    const digitsCount = Math.max(3, Math.floor(Math.abs(prev)).toString().length);
    const digitsBase = Math.pow(10, digitsCount);
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
    adjustmentAdd = 0,
    gasFactor = 1.0,
    isGasAuto = false
  } = params;

  const constNum = Number(params.constant);
  const constant = (!isNaN(constNum) && constNum > 0) ? constNum : 1.0;

  const adjNum = Number(params.adjustment);
  const fcmNum = Number(params.fcm);

  let adjustment: number;
  let fcm: number;

  if (utilityType === 'gas') {
    adjustment = (!isNaN(adjNum) && adjNum > 0) ? adjNum : 1.347;
    fcm = (!isNaN(fcmNum) && fcmNum > 0) ? fcmNum : 1.0727;
  } else {
    adjustment = (!isNaN(adjNum) && adjNum > 0) ? adjNum : 1.0;
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
      const initial = diff * adjustment;
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

export function calculateStoreCost(consumption: number, unitPrice: number, additionalCost: number = 0): number {
  const base = (!consumption || consumption <= 0 || !unitPrice || unitPrice <= 0) ? 0 : consumption * unitPrice;
  return base + (additionalCost || 0);
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
