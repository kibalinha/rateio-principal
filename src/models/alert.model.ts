import { MeterPhotoRecord } from './photo.model';

export type AlertSeverity = 'critical' | 'warning' | 'normal';

export interface MonthlyChartItem {
  key: string;
  monthLabel: string;
  consumption: number;
  cost: number;
  unitPrice: number;
  totalBill: number;
  pctBill: number;
  hasData: boolean;
  diffFromAvgPct: number;
  momDiffPct: number | null;
  alertLevel: AlertSeverity;
  photo?: MeterPhotoRecord | null;
}

export interface StoreAlertInfo {
  hasAlert: boolean;
  severity: AlertSeverity;
  badgeText: string;
  diffAvgPct: number;
  momPct: number | null;
  latestConsumption: number;
  avgConsumption: number;
}

export interface StoreAlertEntry {
  period: string;
  severity: 'critical' | 'warning';
  badgeText: string;
  diffAvgPct: number;
  momPct: number | null;
  val: number;
}
