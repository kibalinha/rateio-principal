import { describe, it, expect } from 'vitest';
import { analyzeRgbaQuality, enhanceRgbaForOcr } from './ocr-image-processor';

describe('OCR Image Processor - Qualidade de Foto e Aprimoramento', () => {
  it('detecta foto muito escura (brilho baixo)', () => {
    // Todos os pixels pretos ou quase pretos (luma ~ 10)
    const darkPixels = new Uint8ClampedArray(400);
    for (let i = 0; i < darkPixels.length; i += 4) {
      darkPixels[i] = 10;     // R
      darkPixels[i + 1] = 10; // G
      darkPixels[i + 2] = 10; // B
      darkPixels[i + 3] = 255;
    }

    const report = analyzeRgbaQuality(darkPixels);
    expect(report.isTooDark).toBe(true);
    expect(report.qualityScore).toBe('poor');
    expect(report.warningMessage).toContain('lanterna');
  });

  it('detecta foto muito clara/estourada (reflexo no visor)', () => {
    // Pixels brancos (luma ~ 240)
    const brightPixels = new Uint8ClampedArray(400);
    for (let i = 0; i < brightPixels.length; i += 4) {
      brightPixels[i] = 240;
      brightPixels[i + 1] = 240;
      brightPixels[i + 2] = 240;
      brightPixels[i + 3] = 255;
    }

    const report = analyzeRgbaQuality(brightPixels);
    expect(report.isTooBright).toBe(true);
    expect(report.qualityScore).toBe('warning');
    expect(report.warningMessage).toContain('Reflexo');
  });

  it('classifica como boa iluminação uma imagem equilibrada com bom contraste', () => {
    // Metade preto, metade branco = alto contraste e brilho médio
    const goodPixels = new Uint8ClampedArray(400);
    for (let i = 0; i < goodPixels.length; i += 4) {
      const val = (i % 8 === 0) ? 20 : 220;
      goodPixels[i] = val;
      goodPixels[i + 1] = val;
      goodPixels[i + 2] = val;
      goodPixels[i + 3] = 255;
    }

    const report = analyzeRgbaQuality(goodPixels);
    expect(report.isTooDark).toBe(false);
    expect(report.isTooBright).toBe(false);
    expect(report.isLowContrast).toBe(false);
    expect(report.qualityScore).toBe('good');
  });

  it('aplica estiramento de contraste em imagem com faixa dinâmica reduzida', () => {
    // Imagem acinzentada opaca: valores entre 80 e 120
    const flatPixels = new Uint8ClampedArray([
      80, 80, 80, 255,
      120, 120, 120, 255
    ]);
    enhanceRgbaForOcr(flatPixels);
    // 80 deve esticar perto de 0 e 120 perto de 255
    expect(flatPixels[0]).toBe(0);
    expect(flatPixels[4]).toBe(255);
  });
});
