export type UtilityType = 'luz' | 'agua' | 'gas';

export interface CostItem {
  id: string;
  name: string;
  value: number;
}

export interface UtilityConfig {
  type: UtilityType;
  label: string;
  unit: string;
  icon: string;
}

export const UTILITY_CONFIGS: Record<UtilityType, UtilityConfig> = {
  luz: { type: 'luz', label: 'Energia Elétrica', unit: 'kWh', icon: '⚡' },
  agua: { type: 'agua', label: 'Água', unit: 'm³', icon: '💧' },
  gas: { type: 'gas', label: 'Gás GLP', unit: 'm³', icon: '🔥' },
};
