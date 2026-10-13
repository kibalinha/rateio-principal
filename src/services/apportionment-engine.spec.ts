import { describe, it, expect } from 'vitest';
import {
  calculateUnitPrice,
  calculateReadingDifference,
  calculateGasFactor,
  calculateStoreConsumption,
  calculateStoreCost,
  calculateAirConditioningCost,
  calculateCommonArea,
  calculateVariationPct,
  evaluateAlertSeverity,
  ApportionmentEngineService
} from './apportionment-engine.service';

describe('ApportionmentEngineService - Cálculos Matemáticos de Rateio', () => {

  describe('1. Tarifa Unitária (calculateUnitPrice)', () => {
    it('deve calcular a tarifa unitária com precisão (R$ / Unidade)', () => {
      const price = calculateUnitPrice(10000, 5000);
      expect(price).toBe(2.0);
    });

    it('deve retornar 0 quando o consumo total for zero (proteção contra divisão por zero)', () => {
      expect(calculateUnitPrice(10000, 0)).toBe(0);
      expect(calculateUnitPrice(0, 5000)).toBe(0);
      expect(calculateUnitPrice(0, 0)).toBe(0);
    });

    it('deve retornar 0 para valores negativos ou inválidos', () => {
      expect(calculateUnitPrice(-1000, 500)).toBe(0);
      expect(calculateUnitPrice(1000, -500)).toBe(0);
    });
  });

  describe('2. Diferença de Leitura & Virada de Medidor (calculateReadingDifference)', () => {
    it('deve calcular a diferença normal entre leitura atual e anterior', () => {
      expect(calculateReadingDifference(1500, 1000)).toBe(500);
      expect(calculateReadingDifference(200, 200)).toBe(0);
    });

    it('não deve gerar consumo negativo se a leitura atual for menor que a anterior (sem rollover)', () => {
      expect(calculateReadingDifference(800, 1000, false)).toBe(0);
    });

    it('deve calcular corretamente a virada física de medidor de 4 dígitos (ex: 9950 -> 0050)', () => {
      // 9950 para 10000 = 50 + 50 da nova leitura = 100
      const diff = calculateReadingDifference(50, 9950, true);
      expect(diff).toBe(100);
    });

    it('deve calcular corretamente a virada de medidor de 5 dígitos (ex: 99980 -> 0020)', () => {
      const diff = calculateReadingDifference(20, 99980, true);
      expect(diff).toBe(40);
    });
  });

  describe('3. Consumo por Loja e Consumo Virtual (calculateStoreConsumption)', () => {
    it('deve calcular consumo elétrico padrão com constante 1 e ajuste 1', () => {
      const result = calculateStoreConsumption({
        utilityType: 'luz',
        currentReading: 1500,
        prevReading: 1000,
        constant: 1,
        adjustment: 1
      });
      expect(result.diff).toBe(500);
      expect(result.consumption).toBe(500);
      expect(result.isVirtual).toBe(false);
    });

    it('deve aplicar constante de medição (ex: TC 10x) e multiplicador de ajuste', () => {
      const result = calculateStoreConsumption({
        utilityType: 'luz',
        currentReading: 110,
        prevReading: 100,
        constant: 10,
        adjustment: 1.05
      });
      // diff = 10 * 10 * 1.05 = 105
      expect(result.consumption).toBeCloseTo(105, 4);
    });

    it('deve respeitar override de Consumo Virtual sobre a leitura de campo', () => {
      const result = calculateStoreConsumption({
        utilityType: 'luz',
        currentReading: 5000,
        prevReading: 1000,
        virtual: 350
      });
      expect(result.consumption).toBe(350);
      expect(result.rawConsumption).toBe(350);
      expect(result.isVirtual).toBe(true);
    });

    it('deve respeitar Consumo Virtual EXPLICITAMENTE ZERO (regra de negócio de isenção)', () => {
      const result = calculateStoreConsumption({
        utilityType: 'luz',
        currentReading: 5000,
        prevReading: 1000,
        virtual: 0
      });
      expect(result.consumption).toBe(0);
      expect(result.rawConsumption).toBe(0);
      expect(result.isVirtual).toBe(true);
    });

    it('deve voltar para a leitura normal se Consumo Virtual for undefined ou null', () => {
      const resultNull = calculateStoreConsumption({
        utilityType: 'agua',
        currentReading: 200,
        prevReading: 150,
        virtual: null
      });
      expect(resultNull.consumption).toBe(50);
      expect(resultNull.isVirtual).toBe(false);

      const resultUndefined = calculateStoreConsumption({
        utilityType: 'agua',
        currentReading: 200,
        prevReading: 150,
        virtual: undefined
      });
      expect(resultUndefined.consumption).toBe(50);
      expect(resultUndefined.isVirtual).toBe(false);
    });

    it('deve aplicar fórmulas específicas de Gás (FCM e ajuste volumétrico)', () => {
      const result = calculateStoreConsumption({
        utilityType: 'gas',
        currentReading: 110,
        prevReading: 100,
        adjustment: 1.347,
        adjustmentAdd: 0,
        fcm: 1.0727
      });
      // diff = 10
      // initial = 10 * 1.347 = 13.47
      // raw = 13.47 * 1.0727 = 14.449269
      expect(result.rawConsumption).toBeCloseTo(14.449, 2);
    });

    it('não deve inflar o consumo de Gás com adjustmentAdd (AJ+ é em R$, não m³)', () => {
      const result = calculateStoreConsumption({
        utilityType: 'gas',
        currentReading: 110,
        prevReading: 100,
        adjustment: 1.347,
        adjustmentAdd: 50, // R$ 50,00 de ajuste financeiro
        fcm: 1.0727
      });
      // O consumo medido em m³ não deve sofrer alteração pelo valor em R$
      expect(result.rawConsumption).toBeCloseTo(14.449, 2);
    });

    it('deve somar acréscimos em R$ (como AJ+ ou Fluxo) no custo final da loja', () => {
      // 10 m³ a R$ 5,00/m³ + R$ 25,00 de adicional (Aj+ ou Fluxo) = R$ 75,00
      const cost = calculateStoreCost(10, 5, 25);
      expect(cost).toBe(75);
    });
  });

  describe('4. Rateio Proporcional de Gás (calculateGasFactor)', () => {
    it('deve calcular o fator de rateio do gás proporcional à concessionária', () => {
      // Concessionária: 1000 m³, Medição em campo lojas: 800 m³ -> Fator = 1.25
      const factor = calculateGasFactor(1000, 800, true);
      expect(factor).toBe(1.25);
    });

    it('deve manter fator 1.0 se rateio automático de gás estiver desativado', () => {
      const factor = calculateGasFactor(1000, 800, false);
      expect(factor).toBe(1.0);
    });
  });

  describe('5. Ar-Condicionado e Área Comum (calculateCommonArea)', () => {
    it('deve calcular corretamente a Área Comum deduzindo lojas e ar-condicionado', () => {
      // Total Concessionária: 10.000 kWh, Fatura: R$ 20.000 (R$ 2,00 / kWh)
      // Lojas: 6.000 kWh (R$ 12.000)
      // Ar-condicionado: 2.500 kWh (R$ 5.000)
      // Resíduo Área Comum esperada: 1.500 kWh (15%) e R$ 3.000 (15%)
      const common = calculateCommonArea(
        10000,
        20000,
        6000,
        12000,
        2500,
        5000,
        false
      );

      expect(common.consumption).toBe(1500);
      expect(common.cost).toBe(3000);
      expect(common.consumptionPct).toBe(15.0);
      expect(common.costPct).toBe(15.0);
    });

    it('deve zerar a Área Comum para Gás quando estiver em modo 100% proporcional', () => {
      const common = calculateCommonArea(
        1000,
        5000,
        800,
        4000,
        0,
        0,
        true // isGasProportional
      );

      expect(common.consumption).toBe(0);
      expect(common.cost).toBe(0);
      expect(common.consumptionPct).toBe(0);
      expect(common.costPct).toBe(0);
    });

    it('não deve gerar valores negativos de área comum em caso de sobre-medição', () => {
      const common = calculateCommonArea(100, 200, 150, 300, 0, 0, false);
      expect(common.consumption).toBe(0);
      expect(common.cost).toBe(0);
    });
  });

  describe('6. Detecção de Alertas e Auditoria (evaluateAlertSeverity)', () => {
    it('deve classificar como crítico (🚨) quando desvio da média for >= 40%', () => {
      expect(evaluateAlertSeverity(40, null)).toBe('critical');
      expect(evaluateAlertSeverity(65, 10)).toBe('critical');
    });

    it('deve classificar como crítico (🚨) quando salto MoM for >= 50%', () => {
      expect(evaluateAlertSeverity(10, 50)).toBe('critical');
      expect(evaluateAlertSeverity(5, 75)).toBe('critical');
    });

    it('deve classificar como atenção (⚠️) quando desvio da média for entre 20% e 39.9%', () => {
      expect(evaluateAlertSeverity(20, null)).toBe('warning');
      expect(evaluateAlertSeverity(35, 10)).toBe('warning');
    });

    it('deve classificar como atenção (⚠️) quando salto MoM for entre 30% e 49.9%', () => {
      expect(evaluateAlertSeverity(5, 30)).toBe('warning');
      expect(evaluateAlertSeverity(10, 45)).toBe('warning');
    });

    it('deve classificar como normal quando as variações estiverem abaixo dos limiares', () => {
      expect(evaluateAlertSeverity(15, 20)).toBe('normal');
      expect(evaluateAlertSeverity(0, 0)).toBe('normal');
    });

    it('NÃO deve alertar em variações negativas / quedas de consumo (regra mantendo apenas alertas positivos)', () => {
      expect(evaluateAlertSeverity(-30, null)).toBe('normal');
      expect(evaluateAlertSeverity(-50, -40)).toBe('normal');
      expect(evaluateAlertSeverity(-100, -100)).toBe('normal');
    });
  });

  describe('7. Consolidação Completa (calculateFullRateio)', () => {
    it('deve consolidar um rateio completo de energia com perfeição matemática', () => {
      const engine = new ApportionmentEngineService();
      const summary = engine.calculateFullRateio(
        100000, // R$ 100.000
        50000,  // 50.000 kWh -> Preço Unitário R$ 2,0000
        30000,  // Lojas: 30.000 kWh (R$ 60.000)
        10000,  // AC: 10.000 kWh (R$ 20.000)
        'luz',
        false
      );

      expect(summary.unitPrice).toBe(2.0);
      expect(summary.tenantsCost).toBe(60000);
      expect(summary.acCost).toBe(20000);
      expect(summary.commonAreaConsumption).toBe(10000);
      expect(summary.commonAreaCost).toBe(20000);
      expect(summary.tenantsCost + summary.acCost + summary.commonAreaCost).toBe(100000);
    });

    it('deve consolidar um rateio de Gás 100% proporcional e justo entre todas as lojas', () => {
      const engine = new ApportionmentEngineService();
      // Concessionária: Fatura R$ 12.000,00 e Leitura 1.500 m³ -> Tarifa R$ 8,00 / m³
      const totalBill = 12000;
      const totalConcessionariaM3 = 1500;
      const unitPrice = engine.calculateUnitPrice(totalBill, totalConcessionariaM3);
      expect(unitPrice).toBe(8.0);

      // Três lojas com consumos diferentes medidos em campo:
      // Loja A (Restaurante grande): 600 m³ brutos
      // Loja B (Lanchonete média): 350 m³ brutos
      // Loja C (Cafeteria pequena): 50 m³ brutos
      // Loja D (Loja fechada): 0 m³ brutos
      const rawStoreA = 600;
      const rawStoreB = 350;
      const rawStoreC = 50;
      const rawStoreD = 0;
      const totalRawField = rawStoreA + rawStoreB + rawStoreC + rawStoreD; // 1.000 m³

      // Fator Proporcional da rede: Concessionária (1500) / Campo (1000) = 1.50x (+50%)
      const gasFactor = engine.calculateGasFactor(totalConcessionariaM3, totalRawField, true);
      expect(gasFactor).toBe(1.5);

      // Consumo rateado de cada loja:
      const consA = rawStoreA * gasFactor; // 600 * 1.5 = 900 m³ (60% do total)
      const consB = rawStoreB * gasFactor; // 350 * 1.5 = 525 m³ (35% do total)
      const consC = rawStoreC * gasFactor; // 50 * 1.5 = 75 m³ (5% do total)
      const consD = rawStoreD * gasFactor; // 0 * 1.5 = 0 m³

      // 1. O somatório de m³ rateados deve ser rigorosamente igual ao volume da concessionária
      const totalRateadoM3 = consA + consB + consC + consD;
      expect(totalRateadoM3).toBe(totalConcessionariaM3);

      // 2. Custos calculados
      const costA = engine.calculateStoreCost(consA, unitPrice); // 900 * 8 = R$ 7.200,00
      const costB = engine.calculateStoreCost(consB, unitPrice); // 525 * 8 = R$ 4.200,00
      const costC = engine.calculateStoreCost(consC, unitPrice); // 75 * 8 = R$ 600,00
      const costD = engine.calculateStoreCost(consD, unitPrice); // 0 * 8 = R$ 0,00

      // 3. O somatório dos custos deve fechar rigorosamente em 100% da fatura (R$ 12.000,00)
      const totalDistributedCost = costA + costB + costC + costD;
      expect(totalDistributedCost).toBe(totalBill);

      // 4. Justiça e Equidade:
      // - Cada loja pagou exatamente na proporção do que consumiu em relação ao grupo:
      //   Loja A consumiu 60% do campo (600/1000) e pagou exatamente 60% da fatura (R$ 7.200 / R$ 12.000)
      //   Loja B consumiu 35% do campo (350/1000) e pagou exatamente 35% da fatura (R$ 4.200 / R$ 12.000)
      //   Loja C consumiu 5% do campo (50/1000) e pagou exatamente 5% da fatura (R$ 600 / R$ 12.000)
      // - Loja D (fechada/sem consumo) pagou R$ 0,00, sem ser onerada pela diferença da rede
      expect(costA / totalBill).toBe(rawStoreA / totalRawField);
      expect(costB / totalBill).toBe(rawStoreB / totalRawField);
      expect(costC / totalBill).toBe(rawStoreC / totalRawField);
      expect(costD).toBe(0);

      // 5. Área comum de gás em modo proporcional é 0 (sem resíduo para condomínio)
      const summary = engine.calculateFullRateio(
        totalBill,
        totalConcessionariaM3,
        totalRateadoM3,
        0,
        'gas',
        true
      );
      expect(summary.commonAreaCost).toBe(0);
      expect(summary.commonAreaConsumption).toBe(0);
    });
  });

});
