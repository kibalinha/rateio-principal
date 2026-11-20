import { describe, it, expect } from 'vitest';
import {
  parseMonthlyStoreListText,
  normalizeContractAndNameOrder,
  isPureNumericContractCode,
  hasAnyLetter,
  splitDelimitedLine
} from './store-import.helpers';

describe('store-import.helpers', () => {
  it('detecta códigos numéricos de contrato e nomes curtos ou com pontuação', () => {
    expect(isPureNumericContractCode('0000020000561')).toBe(true);
    expect(isPureNumericContractCode('50001539')).toBe(true);
    expect(isPureNumericContractCode('2000-01')).toBe(true);
    expect(isPureNumericContractCode('3M')).toBe(false);
    expect(isPureNumericContractCode('C&A')).toBe(false);

    expect(hasAnyLetter('C&A')).toBe(true);
    expect(hasAnyLetter('H&M')).toBe(true);
    expect(hasAnyLetter('OI')).toBe(true);
    expect(hasAnyLetter('LV')).toBe(true);
    expect(hasAnyLetter('3M')).toBe(true);
    expect(hasAnyLetter('XP')).toBe(true);
    expect(hasAnyLetter('0000020000561')).toBe(false);
  });

  it('corrige inversão entre contrato e nome mesmo em nomes curtos/com símbolo (C&A, H&M, OI, LV, 3M, XP)', () => {
    const names = ['C&A', 'H&M', 'OI', 'LV', '3M', 'M&M', 'XP'];
    for (const storeName of names) {
      const fixed = normalizeContractAndNameOrder(storeName, '0000020000561');
      expect(fixed.swapped).toBe(true);
      expect(fixed.name).toBe(storeName);
      expect(fixed.contrato).toBe('0000020000561');
    }
  });

  it('faz parse correto sem cabeçalho na ordem LUC | NOME | CONTRATO para nomes curtos e com &', () => {
    const text = [
      '2120\tC&A\t0000020000561',
      '1010\tH&M\t0000020000562',
      '1011\tOI\t0000020000563',
      '1012\tLV\t0000020000564',
      '1013\t3M\t0000020000565',
      '1014\tXP\t0000020000566'
    ].join('\n');

    const parsed = parseMonthlyStoreListText(text);
    expect(parsed.detectedOrder).toBe('luc_name_contract');
    expect(parsed.skippedLines).toHaveLength(0);
    expect(parsed.rows).toEqual([
      { luc: '2120', name: 'C&A', contrato: '0000020000561' },
      { luc: '1010', name: 'H&M', contrato: '0000020000562' },
      { luc: '1011', name: 'OI', contrato: '0000020000563' },
      { luc: '1012', name: 'LV', contrato: '0000020000564' },
      { luc: '1013', name: '3M', contrato: '0000020000565' },
      { luc: '1014', name: 'XP', contrato: '0000020000566' }
    ]);
  });

  it('faz parse correto sem cabeçalho na ordem LUC | CONTRATO | NOME para C&A, H&M, OI, LV, 3M, XP', () => {
    const text = [
      '2120\t0000020000561\tC&A',
      '1010\t0000020000562\tH&M',
      '1011\t0000020000563\tOI',
      '1012\t0000020000564\tLV',
      '1013\t0000020000565\t3M',
      '1014\t0000020000566\tXP'
    ].join('\n');

    const parsed = parseMonthlyStoreListText(text);
    expect(parsed.detectedOrder).toBe('luc_contract_name');
    expect(parsed.skippedLines).toHaveLength(0);
    expect(parsed.rows).toEqual([
      { luc: '2120', name: 'C&A', contrato: '0000020000561' },
      { luc: '1010', name: 'H&M', contrato: '0000020000562' },
      { luc: '1011', name: 'OI', contrato: '0000020000563' },
      { luc: '1012', name: 'LV', contrato: '0000020000564' },
      { luc: '1013', name: '3M', contrato: '0000020000565' },
      { luc: '1014', name: 'XP', contrato: '0000020000566' }
    ]);
  });

  it('usa votação majoritária para desempatar linha com contrato alfanumérico ou nome numérico', () => {
    const text = [
      '1001\tRENNER\t20000100',
      '1002\tZARA\t20000200',
      '1003\t1000\tABC999' // linha ambígua seguindo a ordem LUC | NOME | CONTRATO da planilha
    ].join('\n');

    const parsed = parseMonthlyStoreListText(text);
    expect(parsed.detectedOrder).toBe('luc_name_contract');
    expect(parsed.rows[2]).toEqual({ luc: '1003', name: '1000', contrato: 'ABC999' });
  });

  it('reconhece cabeçalhos sem acento e não confunde "Código do Contrato" com LUC', () => {
    const text = [
      'Código do Contrato\tLUC\tLocatario',
      '0000020000561\t2120\tC&A',
      '0000020000712\t1093\tBURGER KING'
    ].join('\n');

    const parsed = parseMonthlyStoreListText(text);
    expect(parsed.detectedOrder).toBe('header');
    expect(parsed.rows).toEqual([
      { luc: '2120', contrato: '0000020000561', name: 'C&A' },
      { luc: '1093', contrato: '0000020000712', name: 'BURGER KING' }
    ]);

    const text2 = [
      'Unidade;Descricao;Contrato',
      'L-101;Lojista Alpha;9901'
    ].join('\n');
    const parsed2 = parseMonthlyStoreListText(text2);
    expect(parsed2.detectedOrder).toBe('header');
    expect(parsed2.rows).toEqual([{ luc: 'L-101', name: 'Lojista Alpha', contrato: '9901' }]);
  });

  it('não confunde linha de dados DEP/LUC1011 nas primeiras linhas com cabeçalho', () => {
    const text = [
      'DEP/LUC1011\t20000233\tLoja 233 Shopping',
      '1012\t20000234\tZara'
    ].join('\n');

    const parsed = parseMonthlyStoreListText(text);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].luc).toBe('DEP/LUC1011');
  });

  it('respeita vírgula dentro de aspas no CSV e reporta linhas inválidas em skippedLines', () => {
    const { parts, delimiter } = splitDelimitedLine('101,"LOJA A, FILIAL 1",12345');
    expect(delimiter).toBe(',');
    expect(parts).toEqual(['101', 'LOJA A, FILIAL 1', '12345']);

    const text = [
      '101,"LOJA A, FILIAL 1",12345',
      'LINHA_SEM_DELIMITADOR',
      '102,,Loja Sem Contrato',
      ',999,Sem LUC'
    ].join('\n');

    const parsed = parseMonthlyStoreListText(text);
    expect(parsed.rows).toEqual([
      { luc: '101', name: 'LOJA A, FILIAL 1', contrato: '12345' },
      { luc: '102', name: 'Loja Sem Contrato', contrato: '' }
    ]);
    expect(parsed.skippedLines).toHaveLength(2);
    expect(parsed.skippedLines[0].lineNumber).toBe(2);
    expect(parsed.skippedLines[1].lineNumber).toBe(4);
  });
});
