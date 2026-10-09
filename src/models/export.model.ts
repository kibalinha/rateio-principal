import { UtilityType, CostItem } from './utility.model';

export interface StoreVoucherData {
  storeName: string;
  luc: string;
  contrato?: string;
  utilityType: UtilityType;
  utilityLabel: string;
  unit: string;
  month: string;
  monthLabel: string;
  prevReading: number;
  currentReading: number;
  readingDiff: number;
  constant: number;
  adjustment: number;
  consumption: number;
  rawConsumption?: number;
  gasFactor?: number;
  unitPrice: number;
  totalCost: number;
  variationPct?: number;
  note?: string;
  photoDataUrl?: string;
  photoCapturedAt?: string;
  issueDate?: string;
}

export interface CalculatorExcelOptions {
  utilityType: UtilityType;
  utilityLabel: string;
  unit: string;
  month: string;
  unitPrice: number;
  totalBill: number;
  totalConsumption: number;
  totalDistributedCost: number;
  totalStoreConsumption: number;
  costItems: CostItem[];
  consumptionInput: any;
  tableData: any[];
  airConditioningConsumption?: number;
  airConditioningCost?: number;
  commonAreaConsumption?: number;
  commonAreaCost?: number;
}

export interface PackageZipOptions extends CalculatorExcelOptions {
  photos?: Record<string, {
    photoDataUrl?: string;
    luc?: string;
    storeName?: string;
    capturedAt?: string;
    readingValue?: number;
    note?: string;
  }>;
}
