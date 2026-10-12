import { describe, it, expect } from 'vitest';
import { parseOcrReadingNumber } from './gemini.service';

describe('OCR - parseOcrReadingNumber', () => {
  it('deve converter número com ponto em inteiro unificado (ex: 456.567 -> 456567)', () => {
    expect(parseOcrReadingNumber(456.567)).toBe(456567);
    expect(parseOcrReadingNumber('456.567')).toBe(456567);
  });

  it('deve converter número com vírgula em inteiro unificado (ex: "456,567" -> 456567)', () => {
    expect(parseOcrReadingNumber('456,567')).toBe(456567);
  });

  it('deve recuperar o número completo quando reading vier truncado mas detectedDigits tiver o ponto/vírgula', () => {
    expect(parseOcrReadingNumber(456, '456.567')).toBe(456567);
    expect(parseOcrReadingNumber(456, '456,567')).toBe(456567);
  });

  it('deve tratar medidores com zeros à esquerda e ponto (ex: "000456.567" -> 456567)', () => {
    expect(parseOcrReadingNumber('000456.567')).toBe(456567);
    expect(parseOcrReadingNumber(null, '000456.567')).toBe(456567);
  });

  it('deve tratar separadores de milhar como "1.510" ou "12.345"', () => {
    expect(parseOcrReadingNumber('1.510')).toBe(1510);
    expect(parseOcrReadingNumber('1,510')).toBe(1510);
    expect(parseOcrReadingNumber('12.345')).toBe(12345);
  });

  it('deve manter inteiros puros sem alteração (ex: 142 -> 142)', () => {
    expect(parseOcrReadingNumber(142)).toBe(142);
    expect(parseOcrReadingNumber('0142')).toBe(142);
    expect(parseOcrReadingNumber(1510)).toBe(1510);
  });

  it('deve ignorar unidades de texto anexadas ao número (ex: "456.567 kWh")', () => {
    expect(parseOcrReadingNumber('456.567 kWh')).toBe(456567);
  });

  it('deve retornar null para valores nulos, vazios ou inválidos', () => {
    expect(parseOcrReadingNumber(null)).toBeNull();
    expect(parseOcrReadingNumber('')).toBeNull();
    expect(parseOcrReadingNumber(undefined)).toBeNull();
    expect(parseOcrReadingNumber('abc')).toBeNull();
  });
});
