---
name: rateio-test-gen
description: Gera especificações e testes unitários Vitest rigorosos para o motor de cálculo de rateio de shopping, considerando regras de água, energia, lojas vagas, histórico retroativo e precisão decimal.
---

# Rateio Test Gen (Vitest & Shopping Rateio Engine)

Especialista em gerar especificações e testes de regressão automatizados para o sistema de rateio de despesas de shopping center com **Vitest** e **TypeScript**.

## Contexto do Sistema

O motor de rateio (`apportionment-engine.service.ts` e `store.service.ts`) calcula a distribuição de custos entre lojas satélites, âncoras, quiosques e áreas de uso comum (AUC). Os cálculos envolvem:
- **Rateio de Energia e Água**: Leitura anterior, leitura atual, constante do medidor, consumo medido (m³ ou kWh), fração ideal por área (m²) e consumo excedente/comum.
- **Lojas Vagas**: Absorção de custos pela administração ou redistribuição proporcional aos lojistas ativos conforme convenção.
- **Ajustes Retroativos**: Compensações de faturamento de meses anteriores aplicadas no mês corrente.
- **Precisão Financeira**: Valores monetários em R$ arrendondados com precisão estrita de 2 casas decimais, sem vazamento de dízimas ou discrepâncias de centavos na soma final.

## Convenções de Testes no Projeto

- **Runner**: Vitest (`vitest run` ou `npm test`)
- **Arquivos de Teste**: `src/services/<service-name>.spec.ts`
- **Asserções**: `describe`, `it`, `expect` nativos do Vitest
- **Isolamento**: Mock de serviços externos (`SupabaseService`, `IndexedDbService`) e foco na lógica pura do motor de cálculo.

## Checklist Obrigatório ao Criar Novos Testes

1. **Casos Base**: Consumo normal de loja com medidor individual + rateio da área comum.
2. **Virada de Medidor (Rollover)**: Medidor mecânico/digital que atinge 99999 e volta para 00001.
3. **Consumo Zero ou Medidor Parado**: Alerta de anomalia sem travar o cálculo global.
4. **Discrepância Concessionária vs Medidores Individuais**: Garantir que a diferença (perdas + área comum) seja rateada corretamente.
5. **Soma dos Centavos**: A soma do rateio de todas as lojas DEVE bater exatamente com o valor total da fatura da concessionária (tolerância máx: R$ 0,00 ou resíduo de centavo atribuído à administração).

## Template de Teste Vitest para Rateio

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ApportionmentEngineService } from './apportionment-engine.service';
import { Store, UtilityBill } from '../models/store.model';

describe('ApportionmentEngineService - Fechamento Mensal', () => {
  let engine: ApportionmentEngineService;

  beforeEach(() => {
    engine = new ApportionmentEngineService();
  });

  it('deve distribuir a despesa de água respeitando a fração ideal e consumo individual', () => {
    const stores: Partial<Store>[] = [
      { id: 'loja-101', name: 'Loja 101', area: 50, waterMeterPrevious: 100, waterMeterCurrent: 120 },
      { id: 'loja-102', name: 'Loja 102', area: 150, waterMeterPrevious: 200, waterMeterCurrent: 280 },
    ];
    const totalBill = 1000.00; // Valor total da concessionária

    const result = engine.calculateMonthlyApportionment(stores as Store[], totalBill, 'water');

    // Validações
    expect(result.items).toHaveLength(2);
    const sumTotal = result.items.reduce((acc, item) => acc + item.totalCharge, 0);
    expect(sumTotal).toBeCloseTo(totalBill, 2);
  });

  it('deve tratar virada de medidor sem gerar consumo negativo', () => {
    const consumption = engine.calculateMeterConsumption({
      previous: 99950,
      current: 40,
      maxDigits: 5
    });
    expect(consumption).toBe(90);
  });
});
```
