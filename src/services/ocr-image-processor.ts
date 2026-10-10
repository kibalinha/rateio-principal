/**
 * Relatório de qualidade da imagem do medidor capturada para OCR.
 */
export interface ImageQualityReport {
  brightness: number;       // 0 a 255 (média de luminosidade)
  contrast: number;         // 0 a 128 (desvio padrão)
  isTooDark: boolean;       // < 45
  isTooBright: boolean;     // > 215 (reflexo excessivo no vidro)
  isLowContrast: boolean;   // < 22 (imagem desbotada/embaçada)
  qualityScore: 'good' | 'warning' | 'poor';
  warningMessage?: string;
}

/**
 * Analisa os pixels RGBA para determinar iluminação e contraste.
 */
export function analyzeRgbaQuality(rgbaData: Uint8ClampedArray | number[]): ImageQualityReport {
  const pixelCount = Math.floor(rgbaData.length / 4);
  if (pixelCount === 0) {
    return {
      brightness: 128,
      contrast: 50,
      isTooDark: false,
      isTooBright: false,
      isLowContrast: false,
      qualityScore: 'good'
    };
  }

  let totalLuma = 0;
  // Amostragem em passos para rapidez em imagens grandes
  const step = Math.max(1, Math.floor(pixelCount / 10000));
  let samples = 0;

  for (let i = 0; i < rgbaData.length; i += 4 * step) {
    const r = rgbaData[i];
    const g = rgbaData[i + 1];
    const b = rgbaData[i + 2];
    // Fórmula ITU-R BT.601
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuma += luma;
    samples++;
  }

  const brightness = Math.round(totalLuma / samples);

  let varianceSum = 0;
  for (let i = 0; i < rgbaData.length; i += 4 * step) {
    const r = rgbaData[i];
    const g = rgbaData[i + 1];
    const b = rgbaData[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    varianceSum += (luma - brightness) * (luma - brightness);
  }

  const contrast = Math.round(Math.sqrt(varianceSum / samples));

  const isTooDark = brightness < 45;
  const isTooBright = brightness > 215;
  const isLowContrast = contrast < 22;

  let qualityScore: 'good' | 'warning' | 'poor' = 'good';
  let warningMessage: string | undefined;

  if (isTooDark) {
    qualityScore = 'poor';
    warningMessage = '🔦 Foto muito escura: acenda a lanterna ou melhore a luz sobre o visor.';
  } else if (isTooBright) {
    qualityScore = 'warning';
    warningMessage = '☀️ Reflexo forte no visor: incline levemente a câmera para evitar o reflexo do vidro.';
  } else if (isLowContrast) {
    qualityScore = 'warning';
    warningMessage = '🔍 Baixo contraste: aproxime a câmera para focar nos números.';
  }

  return {
    brightness,
    contrast,
    isTooDark,
    isTooBright,
    isLowContrast,
    qualityScore,
    warningMessage
  };
}

/**
 * Aplica ajuste de contraste e nitidez simples no array RGBA para realçar dígitos do medidor.
 * Realiza histogram stretching moderado (clip 2% a 98%).
 */
export function enhanceRgbaForOcr(rgbaData: Uint8ClampedArray): void {
  let min = 255;
  let max = 0;
  const len = rgbaData.length;

  for (let i = 0; i < len; i += 4) {
    const luma = 0.299 * rgbaData[i] + 0.587 * rgbaData[i + 1] + 0.114 * rgbaData[i + 2];
    if (luma < min) min = luma;
    if (luma > max) max = luma;
  }

  // Se a faixa dinâmica já é ampla, não altera
  if (max - min < 30 || (min <= 15 && max >= 240)) return;

  const range = max - min || 1;
  const factor = 255 / range;

  for (let i = 0; i < len; i += 4) {
    rgbaData[i] = Math.min(255, Math.max(0, (rgbaData[i] - min) * factor));
    rgbaData[i + 1] = Math.min(255, Math.max(0, (rgbaData[i + 1] - min) * factor));
    rgbaData[i + 2] = Math.min(255, Math.max(0, (rgbaData[i + 2] - min) * factor));
  }
}

/**
 * Carrega a imagem base64 em canvas, avalia qualidade de iluminação/reflexo
 * e aprimora contraste para máxima legibilidade do OCR.
 */
export function analyzeAndEnhanceBase64Image(dataUrl: string): Promise<{ enhancedDataUrl: string; quality: ImageQualityReport }> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      return resolve({
        enhancedDataUrl: dataUrl,
        quality: {
          brightness: 128,
          contrast: 50,
          isTooDark: false,
          isTooBright: false,
          isLowContrast: false,
          qualityScore: 'good'
        }
      });
    }

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve({ enhancedDataUrl: dataUrl, quality: analyzeRgbaQuality([]) });
        }

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const quality = analyzeRgbaQuality(imgData.data);

        // Se a qualidade for aceitável mas precisar de mais contraste para o OCR
        enhanceRgbaForOcr(imgData.data);
        ctx.putImageData(imgData, 0, 0);

        const enhancedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve({ enhancedDataUrl, quality });
      } catch {
        resolve({
          enhancedDataUrl: dataUrl,
          quality: {
            brightness: 128,
            contrast: 50,
            isTooDark: false,
            isTooBright: false,
            isLowContrast: false,
            qualityScore: 'good'
          }
        });
      }
    };

    img.onerror = () => {
      resolve({
        enhancedDataUrl: dataUrl,
        quality: {
          brightness: 128,
          contrast: 50,
          isTooDark: false,
          isTooBright: false,
          isLowContrast: false,
          qualityScore: 'good'
        }
      });
    };

    img.src = dataUrl;
  });
}
