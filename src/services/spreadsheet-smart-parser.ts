import * as XLSX from 'xlsx';
import { Store, UtilityType, CostItem, ParsedStoreRow } from '../models';
import { parsePtBrNumber } from './apportionment-engine.service';
import { normalizeLuc, normalizeContract, normalizeStoreName } from './store.service';
import { SkippedImportLine, parseMonthlyStoreListText } from './store-import.helpers';

export interface ParsedSheetGrid {
  name: string;
  grid: any[][];
}

export interface DetectedMonthBlock {
  id: string;                 // 'anterior' | '01'..'12'
  label: string;              // 'Novembro', 'Outubro', 'Anterior'...
  monthNumber: number | null; // 1..12 ou null para 'Anterior'
  year: number | null;
  startCol: number;
  endCol: number;
  hasReadings: boolean;
  readingsCount: number;
}

export interface ExtractedBillSummary {
  costItems: CostItem[];
  totalBillFromItems: number;
  luzConsumption?: { bss1: number; bss2: number; bss3: number; bss4: number };
  totalConsumption?: number;
  acConsumption?: number;
}

export interface SmartTableExtraction {
  headerRowIndex: number;
  isMultiMonthMatrix: boolean;
  detectedYear: number | null;
  detectedUtility: UtilityType | null;
  monthBlocks: DetectedMonthBlock[];
  selectedBlockId: string | null;
  headers: string[];
  rows: Record<string, any>[];
  suggestedMappings: Record<string, string>;
  billSummary: ExtractedBillSummary | null;
  ignoredNoiseRows: number;
}

export interface SmartMonthlyStoreExtraction {
  rows: ParsedStoreRow[];
  skippedLines: SkippedImportLine[];
  detectedHeaderRow: number;
  detectedUtility: UtilityType | null;
  usedSmartMatrixParser: boolean;
}

const MONTH_PATTERNS: Array<{ monthNumber: number; label: string; regex: RegExp }> = [
  { monthNumber: 1, label: 'Janeiro', regex: /^(janeiro|jan)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 2, label: 'Fevereiro', regex: /^(fevereiro|fev|feb)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 3, label: 'Março', regex: /^(marco|mar)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 4, label: 'Abril', regex: /^(abril|abr|apr)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 5, label: 'Maio', regex: /^(maio|mai|may)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 6, label: 'Junho', regex: /^(junho|jun)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 7, label: 'Julho', regex: /^(julho|jul)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 8, label: 'Agosto', regex: /^(agosto|ago|aug)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 9, label: 'Setembro', regex: /^(setembro|set|sep)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 10, label: 'Outubro', regex: /^(outubro|out|oct)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 11, label: 'Novembro', regex: /^(novembro|nov)(\s*[/\-]\s*\d{2,4})?$/i },
  { monthNumber: 12, label: 'Dezembro', regex: /^(dezembro|dez|dec)(\s*[/\-]\s*\d{2,4})?$/i }
];

const NOISE_ROW_PREFIXES = [
  'total',
  'subtotal',
  'total geral',
  'soma',
  'area comum',
  'areas comuns',
  'ar condicionado',
  'incorridos',
  'valor sap',
  'custo total',
  'consumo total',
  'valor do kwh',
  'valor do m3',
  'resumo',
  'media',
  'total recuperado'
];

export function normalizeHeaderText(val: any): string {
  return String(val ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCellNumber(val: any): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const str = String(val).trim();
  if (!str || str === '-' || str === '—' || str === 'N/A' || str === '#DIV/0!' || str === '#VALUE!' || str === '#REF!') {
    return null;
  }
  const hasDigit = /\d/.test(str);
  if (!hasDigit) return null;
  const parsed = parsePtBrNumber(str);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractSheetsFromWorkbook(workbook: XLSX.WorkBook): ParsedSheetGrid[] {
  return (workbook.SheetNames || []).map(name => {
    const ws = workbook.Sheets[name];
    const grid = ws
      ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as any[][])
      : [];
    return { name, grid };
  });
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) count++;
  }
  return count;
}

export function parseTextToGrid(rawText: string): string[][] {
  if (!rawText || !rawText.trim()) return [];
  const clean = rawText.replace(/^\uFEFF/, '');
  const rawLines = clean.split(/\r?\n/);

  const sample = rawLines.filter(l => l.trim().length > 0).slice(0, 40);
  if (sample.length === 0) return [];

  const totals = {
    '\t': sample.reduce((acc, l) => acc + countDelimiterOutsideQuotes(l, '\t'), 0),
    ';': sample.reduce((acc, l) => acc + countDelimiterOutsideQuotes(l, ';'), 0),
    ',': sample.reduce((acc, l) => acc + countDelimiterOutsideQuotes(l, ','), 0)
  };

  let delimiter = '\t';
  if (totals['\t'] > 0) {
    delimiter = '\t';
  } else if (totals[';'] >= totals[','] && totals[';'] > 0) {
    delimiter = ';';
  } else if (totals[','] > 0) {
    delimiter = ',';
  }

  return rawLines
    .filter(l => l.trim().length > 0)
    .map(line => splitDelimitedLine(line, delimiter));
}

export function detectUtilityFromText(text: string): UtilityType | null {
  const n = normalizeHeaderText(text);
  if (!n) return null;
  if (/\b(energia|eletric|luz|kwh|ceee|cemig|subestacao|bss-?1)\b/.test(n)) return 'luz';
  if (/\b(agua|hidrometro|saneamento|dmae|esgoto)\b/.test(n)) return 'agua';
  if (/\b(gas|glp|sulgas|comgas|fcm)\b/.test(n)) return 'gas';
  return null;
}

export function chooseBestSheetIndex(sheets: ParsedSheetGrid[], utilityType?: UtilityType): number {
  if (!sheets || sheets.length <= 1) return 0;

  let bestIdx = 0;
  let bestScore = -1;

  sheets.forEach((sheet, idx) => {
    let score = 0;
    const sheetUtil = detectUtilityFromText(sheet.name);
    if (utilityType && sheetUtil === utilityType) score += 50;
    else if (utilityType && sheetUtil && sheetUtil !== utilityType) score -= 30;

    // Inspeciona título nas primeiras 3 linhas
    const topText = (sheet.grid || [])
      .slice(0, 3)
      .flat()
      .map(c => String(c ?? ''))
      .join(' ');
    const topUtil = detectUtilityFromText(topText);
    if (utilityType && topUtil === utilityType) score += 30;

    // Verifica se tem tabela real de lojas
    const headerRow = findHeaderRowIndex(sheet.grid || []);
    if (headerRow >= 0) score += 20;

    const nonEmptyRows = (sheet.grid || []).filter(r => r.some(c => String(c ?? '').trim() !== '')).length;
    if (nonEmptyRows >= 5) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });

  return bestIdx;
}

function classifyHeaderCell(cellText: string): string | null {
  const nh = normalizeHeaderText(cellText);
  if (!nh || nh.length > 60) return null;

  if (nh === 'luc' || nh === 'suc' || /\bluc\b/.test(nh) || nh.includes('unidade') || nh === 'box' || nh === 'espaco' || nh === 'ponto') {
    return 'luc';
  }
  if (nh.includes('contrato') || nh === 'contr' || nh.startsWith('contr.') || nh === 'n contrato') {
    return 'contrato';
  }
  if (
    nh.includes('nome fantasia') ||
    nh.includes('nome da loja') ||
    nh.includes('razao social') ||
    nh.includes('lojista') ||
    nh.includes('locatario') ||
    nh === 'fantasia' ||
    nh === 'loja' ||
    nh === 'descricao' ||
    (nh.includes('nome') && !nh.includes('medidor'))
  ) {
    return 'storeName';
  }
  if (
    (nh.includes('medidor') || nh.includes('hidrometro') || nh.includes('relogio') || nh.includes('serie') || nh.includes('patrimonio')) &&
    !nh.includes('const')
  ) {
    return 'meterNumber';
  }
  if (nh.includes('leitura anterior') || nh.includes('leit. ant') || nh.includes('leit ant') || nh === 'anterior' || nh === 'mes anterior') {
    return 'prevReading';
  }
  if (
    !nh.includes('anterior') &&
    !nh.includes('ant') &&
    (nh.includes('leitura atual') ||
      nh.includes('preencher') ||
      nh.includes('medicao atual') ||
      nh.includes('valor medido') ||
      nh === 'leitura' ||
      nh.includes('leitura') ||
      nh === 'ponteiro' ||
      nh === 'atual')
  ) {
    return 'reading';
  }
  if (nh.includes('const.') || nh.includes('constante') || nh === 'const' || nh === 'tc' || nh === 'fator tc') {
    return 'constant';
  }
  if (nh.includes('virtual') || nh.includes('cons. virtual')) {
    return 'virtual';
  }
  if (nh.includes('aj(+)') || nh.includes('ajuste add') || nh.includes('adicional')) {
    return 'adjustmentAdd';
  }
  if (nh === 'ajuste' || nh.includes('ajuste (x)') || nh === 'aj(x)' || nh.includes('fator ajuste')) {
    return 'adjustment';
  }
  if (nh.includes('fcm') || nh.includes('fator correcao')) {
    return 'fcm';
  }
  if (nh.includes('rec. fluxo') || nh.includes('fluxo') || nh.includes('custo fluxo')) {
    return 'fluxoCost';
  }
  if (nh === 'consumo' || nh.includes('consumo kwh') || nh.includes('consumo m3') || nh === 'consumo (kwh)' || nh === 'consumo (m3)') {
    return 'consumption';
  }
  if (nh.includes('custo') || nh === 'var (%)' || nh === 'var%') {
    return 'metric';
  }
  if (nh.includes('obs') || nh.includes('observacao') || nh.includes('nota') || nh.includes('comentario') || nh.includes('justificativa')) {
    return 'note';
  }

  return null;
}

export function findHeaderRowIndex(grid: any[][]): number {
  if (!grid || grid.length === 0) return -1;

  const limit = Math.min(grid.length, 85);
  let bestRow = -1;
  let bestScore = 0;

  for (let r = 0; r < limit; r++) {
    const row = grid[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const categories = new Set<string>();
    let textCells = 0;
    let numericCells = 0;
    let totalHeaderHits = 0;

    for (let c = 0; c < row.length; c++) {
      const raw = row[c];
      const str = String(raw ?? '').trim();
      if (!str) continue;

      if (typeof raw === 'number' || /^[\d.,+\-%R$\s]+$/.test(str)) {
        numericCells++;
      } else {
        textCells++;
      }

      const role = classifyHeaderCell(str);
      if (role) {
        categories.add(role);
        totalHeaderHits++;
      }
    }

    if (categories.size < 2) continue;
    if (numericCells > textCells && categories.size < 3) continue;

    const hasId = categories.has('luc') || categories.has('contrato') || categories.has('storeName') || categories.has('meterNumber');
    const hasReading = categories.has('reading') || categories.has('prevReading') || categories.has('virtual');

    if (!hasId) continue;

    let score = categories.size * 10 + Math.min(totalHeaderHits, 30);
    if (categories.has('luc')) score += 12;
    if (categories.has('contrato')) score += 8;
    if (categories.has('storeName')) score += 10;
    if (hasReading) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }

  return bestRow;
}

function parseMonthBannerCell(val: any): { id: string; label: string; monthNumber: number | null; year: number | null } | null {
  const raw = String(val ?? '').trim();
  if (!raw || raw.length > 30) return null;
  const norm = normalizeHeaderText(raw);

  if (norm === 'anterior' || norm === 'mes anterior' || norm === 'base anterior') {
    return { id: 'anterior', label: 'Anterior', monthNumber: null, year: null };
  }

  // Formato MM/YYYY ou YYYY-MM
  const isoMatch = norm.match(/^(\d{4})[-/](\d{1,2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    if (m >= 1 && m <= 12) {
      const mInfo = MONTH_PATTERNS[m - 1];
      return { id: String(m).padStart(2, '0'), label: `${mInfo.label}/${y}`, monthNumber: m, year: y };
    }
  }
  const brMatch = norm.match(/^(\d{1,2})[-/](\d{2,4})$/);
  if (brMatch) {
    const m = Number(brMatch[1]);
    let y = Number(brMatch[2]);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) {
      const mInfo = MONTH_PATTERNS[m - 1];
      return { id: String(m).padStart(2, '0'), label: `${mInfo.label}/${y}`, monthNumber: m, year: y };
    }
  }

  for (const mp of MONTH_PATTERNS) {
    if (mp.regex.test(norm)) {
      const yearMatch = norm.match(/(\d{2,4})$/);
      let year: number | null = null;
      if (yearMatch) {
        year = Number(yearMatch[1]);
        if (year < 100) year += 2000;
      }
      return {
        id: String(mp.monthNumber).padStart(2, '0'),
        label: mp.label,
        monthNumber: mp.monthNumber,
        year
      };
    }
  }

  return null;
}

export function detectYearFromTopRows(grid: any[][], headerRowIndex: number): number | null {
  const limit = Math.min(grid.length, Math.max(headerRowIndex, 5));
  for (let r = 0; r < limit; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < Math.min(row.length, 6); c++) {
      const m = String(row[c] ?? '').match(/\b(20\d{2})\b/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

export function detectMonthBlocks(grid: any[][], headerRowIndex: number): DetectedMonthBlock[] {
  if (headerRowIndex <= 0) return [];

  const maxCols = grid.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
  const detectedYear = detectYearFromTopRows(grid, headerRowIndex);

  let bestBannerRow = -1;
  let bestMatches: Array<{ col: number; info: { id: string; label: string; monthNumber: number | null; year: number | null } }> = [];

  for (let r = 0; r < headerRowIndex; r++) {
    const row = grid[r] || [];
    const matches: Array<{ col: number; info: { id: string; label: string; monthNumber: number | null; year: number | null } }> = [];
    for (let c = 0; c < row.length; c++) {
      const info = parseMonthBannerCell(row[c]);
      if (info) {
        matches.push({ col: c, info });
      }
    }
    const realMonthCount = matches.filter(m => m.info.monthNumber !== null).length;
    if (realMonthCount >= 2 && matches.length > bestMatches.length) {
      bestMatches = matches;
      bestBannerRow = r;
    }
  }

  if (bestBannerRow < 0 || bestMatches.length < 2) return [];

  const headerRow = grid[headerRowIndex] || [];
  const dataRows = grid.slice(headerRowIndex + 1);

  return bestMatches.map((m, idx) => {
    const startCol = m.col;
    const endCol = idx + 1 < bestMatches.length ? bestMatches[idx + 1].col - 1 : maxCols - 1;

    // Descobre colunas de leitura / virtual dentro deste bloco para contar registros preenchidos
    let readingCol = -1;
    let virtualCol = -1;
    for (let c = startCol; c <= endCol; c++) {
      const role = classifyHeaderCell(String(headerRow[c] ?? ''));
      if (readingCol < 0 && role === 'reading') readingCol = c;
      if (virtualCol < 0 && role === 'virtual') virtualCol = c;
    }

    let readingsCount = 0;
    if (readingCol >= 0 || virtualCol >= 0) {
      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;
        const rd = readingCol >= 0 ? parseCellNumber(row[readingCol]) : null;
        const vt = virtualCol >= 0 ? parseCellNumber(row[virtualCol]) : null;
        if ((rd !== null && rd > 0) || (vt !== null && vt > 0)) {
          readingsCount++;
        }
      }
    }

    return {
      id: m.info.id,
      label: m.info.label,
      monthNumber: m.info.monthNumber,
      year: m.info.year ?? detectedYear,
      startCol,
      endCol,
      hasReadings: readingsCount > 0,
      readingsCount
    };
  });
}

function isNoiseRowValues(values: string[]): boolean {
  const nonEmpty = values.map(v => v.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return true;

  const firstNorm = normalizeHeaderText(nonEmpty[0]);
  const secondNorm = nonEmpty[1] ? normalizeHeaderText(nonEmpty[1]) : '';
  const thirdNorm = nonEmpty[2] ? normalizeHeaderText(nonEmpty[2]) : '';

  for (const prefix of NOISE_ROW_PREFIXES) {
    if (
      firstNorm === prefix ||
      firstNorm.startsWith(`${prefix} `) ||
      secondNorm === prefix ||
      thirdNorm === prefix
    ) {
      return true;
    }
  }

  // Linha de cabeçalho repetida no meio da tabela
  if (
    (firstNorm === 'luc' || firstNorm === 'suc') &&
    (secondNorm.includes('contrato') || thirdNorm.includes('nome') || secondNorm.includes('loja'))
  ) {
    return true;
  }

  return false;
}

export function extractBillSummaryForBlock(
  grid: any[][],
  headerRowIndex: number,
  block: DetectedMonthBlock,
  utilityType: UtilityType | null
): ExtractedBillSummary | null {
  if (headerRowIndex <= 2) return null;

  const scanStart = block.id === 'anterior' ? Math.max(0, block.startCol - 2) : block.startCol;
  const scanEnd = block.endCol;

  // Identifica a coluna principal de valores dentro do bloco (onde ficam os valores das contas no topo)
  const colNumericHits = new Map<number, number>();
  for (let r = 1; r < headerRowIndex; r++) {
    const row = grid[r] || [];
    for (let c = scanStart; c <= scanEnd; c++) {
      const val = parseCellNumber(row[c]);
      if (val !== null && val !== 0) {
        colNumericHits.set(c, (colNumericHits.get(c) || 0) + 1);
      }
    }
  }

  if (colNumericHits.size === 0) return null;

  let valueCol = scanEnd;
  let maxHits = -1;
  for (const [col, hits] of colNumericHits.entries()) {
    if (hits > maxHits) {
      maxHits = hits;
      valueCol = col;
    }
  }
  const labelCol = Math.max(0, valueCol - 1);

  const costItems: CostItem[] = [];
  let inCostSection = true;
  let bss1 = 0;
  let bss2 = 0;
  let bss3 = 0;
  let bss4 = 0;
  let hasBss = false;
  let totalConsumption: number | undefined;
  let acConsumption: number | undefined;

  for (let r = 1; r < headerRowIndex; r++) {
    const row = grid[r] || [];
    // Procura o rótulo na coluna imediatamente à esquerda do valor (ou 2 colunas à esquerda para linhas como "Ar Condicionado")
    let rawLabel = labelCol !== valueCol ? String(row[labelCol] ?? '').trim() : '';
    if (!rawLabel && labelCol - 1 >= 0 && labelCol - 1 !== valueCol) {
      const candidate = String(row[labelCol - 1] ?? '').trim();
      if (candidate && parseCellNumber(candidate) === null) {
        rawLabel = candidate;
      }
    }
    const normLabel = normalizeHeaderText(rawLabel);
    const val = parseCellNumber(row[valueCol]);

    // Detecta transição da seção de custos para consumo/resumo
    if (
      normLabel.includes('consumo (ponta') ||
      normLabel.startsWith('consumo ') ||
      normLabel === 'consumo total' ||
      normLabel === 'custo total' ||
      normLabel === 'valor do kwh' ||
      normLabel.includes('areas comuns') ||
      normLabel.includes('area comum') ||
      normLabel.includes('ar condicionado') ||
      normLabel.includes('incorridos') ||
      normLabel.includes('valor sap')
    ) {
      inCostSection = false;
    }

    if (inCostSection) {
      // Ignora rótulos informativos de período/data
      if (normLabel.includes('periodo de medicao') || normLabel.includes('data leitura')) continue;
      if (val !== null && val !== 0) {
        costItems.push({
          id: `imp-${block.id}-${r}`,
          name: rawLabel || (val < 0 ? 'Crédito / Ajuste' : `Item de Fatura (Linha ${r + 1})`),
          value: Number(val.toFixed(2))
        });
      }
      continue;
    }

    // Consumo BSS-1..BSS-4 (Energia)
    if (normLabel.includes('consumo') && val !== null) {
      if (/bss[\s-]*1\b/.test(normLabel)) { bss1 = val; hasBss = true; }
      else if (/bss[\s-]*2\b/.test(normLabel)) { bss2 = val; hasBss = true; }
      else if (/bss[\s-]*3\b/.test(normLabel)) { bss3 = val; hasBss = true; }
      else if (/bss[\s-]*4\b/.test(normLabel)) { bss4 = val; hasBss = true; }
      else if (normLabel.includes('consumo total') && val > 0) {
        totalConsumption = val;
      }
    }

    // Ar Condicionado: na planilha padrão, linha r = R$, linha r+1 = % (0..1), linha r+2 = kWh/m³
    if (normLabel.includes('ar condicionado')) {
      const next1 = r + 1 < headerRowIndex ? parseCellNumber((grid[r + 1] || [])[valueCol]) : null;
      const next2 = r + 2 < headerRowIndex ? parseCellNumber((grid[r + 2] || [])[valueCol]) : null;
      if (next2 !== null && next2 > 0 && (next1 === null || (next1 >= 0 && next1 <= 1.5))) {
        acConsumption = next2;
      } else if (next1 !== null && next1 > 1.5) {
        acConsumption = next1;
      }
    }
  }

  const totalBillFromItems = Number(costItems.reduce((acc, item) => acc + item.value, 0).toFixed(2));
  const computedTotalCons = hasBss
    ? Number((bss1 + bss2 + bss3 + bss4).toFixed(2))
    : totalConsumption;

  if (costItems.length === 0 && !hasBss && !computedTotalCons && !acConsumption) {
    return null;
  }

  return {
    costItems,
    totalBillFromItems,
    luzConsumption: (utilityType === 'luz' || hasBss) && hasBss
      ? { bss1, bss2, bss3, bss4 }
      : undefined,
    totalConsumption: computedTotalCons,
    acConsumption
  };
}

export function autoMapColumns(
  headers: string[],
  rows: Record<string, any>[],
  knownStores: Store[] = []
): Record<string, string> {
  const mappings: Record<string, string> = {
    luc: '',
    storeName: '',
    contrato: '',
    meterNumber: '',
    prevReading: '',
    reading: '',
    constant: '',
    adjustment: '',
    virtual: '',
    adjustmentAdd: '',
    fcm: '',
    fluxoCost: '',
    note: ''
  };

  // Passada 1: Mapeamento semântico pelos cabeçalhos
  headers.forEach(h => {
    const nh = normalizeHeaderText(h);
    if (!nh) return;

    if (!mappings.contrato && (nh.includes('contrato') || nh === 'contr' || nh.startsWith('contr.'))) {
      mappings.contrato = h;
      return;
    }
    if (!mappings.luc && (nh === 'luc' || nh === 'suc' || /\bluc\b/.test(nh) || nh.includes('unidade') || nh === 'loja' || nh === 'codigo')) {
      mappings.luc = h;
      return;
    }
    if (
      !mappings.storeName &&
      (nh.includes('nome fantasia') ||
        nh.includes('nome da loja') ||
        nh.includes('razao social') ||
        nh.includes('lojista') ||
        nh.includes('locatario') ||
        nh === 'fantasia' ||
        nh === 'descricao' ||
        (nh.includes('nome') && !nh.includes('medidor')))
    ) {
      mappings.storeName = h;
      return;
    }
    if (
      !mappings.meterNumber &&
      !nh.includes('const') &&
      (nh.includes('medidor') || nh.includes('hidrometro') || nh.includes('relogio') || nh.includes('serie') || nh.includes('patrimonio'))
    ) {
      mappings.meterNumber = h;
      return;
    }
    if (!mappings.prevReading && (nh.includes('leitura anterior') || nh.includes('leit. ant') || nh.includes('leit ant') || nh === 'anterior')) {
      mappings.prevReading = h;
      return;
    }
    if (
      !mappings.reading &&
      !nh.includes('anterior') &&
      !nh.includes('ant') &&
      (nh.includes('leitura atual') ||
        nh.includes('preencher') ||
        nh.includes('medicao atual') ||
        nh.includes('valor medido') ||
        nh === 'leitura' ||
        nh.includes('leitura') ||
        nh === 'ponteiro' ||
        nh === 'atual')
    ) {
      mappings.reading = h;
      return;
    }
    if (!mappings.constant && (nh.includes('const.') || nh.includes('constante') || nh === 'const' || nh === 'tc')) {
      mappings.constant = h;
      return;
    }
    if (!mappings.virtual && (nh.includes('virtual') || nh.includes('cons. virtual'))) {
      mappings.virtual = h;
      return;
    }
    if (!mappings.adjustmentAdd && (nh.includes('aj(+)') || nh.includes('ajuste add') || nh.includes('adicional'))) {
      mappings.adjustmentAdd = h;
      return;
    }
    if (!mappings.adjustment && (nh === 'ajuste' || nh.includes('ajuste (x)') || nh === 'aj(x)' || nh.includes('fator ajuste'))) {
      mappings.adjustment = h;
      return;
    }
    if (!mappings.fcm && (nh.includes('fcm') || nh.includes('fator correcao'))) {
      mappings.fcm = h;
      return;
    }
    if (!mappings.fluxoCost && (nh.includes('rec. fluxo') || nh.includes('fluxo') || nh.includes('custo fluxo'))) {
      mappings.fluxoCost = h;
      return;
    }
    if (!mappings.note && (nh.includes('obs') || nh.includes('observacao') || nh.includes('nota') || nh.includes('comentario') || nh.includes('campo'))) {
      mappings.note = h;
      return;
    }
  });

  // Passada 2: Inferência pelo conteúdo (quando cabeçalhos são genéricos ou inexistentes)
  const sampleRows = rows.slice(0, 40);
  if (sampleRows.length > 0 && (!mappings.luc || !mappings.reading)) {
    const usedHeaders = new Set(Object.values(mappings).filter(Boolean));
    const knownLucs = new Set(knownStores.map(s => normalizeLuc(s.luc)).filter(Boolean));
    const knownContracts = new Set(knownStores.map(s => normalizeContract(s.contrato)).filter(Boolean));
    const knownNames = new Set(knownStores.map(s => normalizeStoreName(s.name)).filter(Boolean));

    if (!mappings.luc && knownLucs.size > 0) {
      let bestCol = '';
      let bestHits = 0;
      for (const h of headers) {
        if (usedHeaders.has(h)) continue;
        let hits = 0;
        for (const row of sampleRows) {
          const v = normalizeLuc(String(row[h] ?? ''));
          if (v && knownLucs.has(v)) hits++;
        }
        if (hits > bestHits) {
          bestHits = hits;
          bestCol = h;
        }
      }
      if (bestCol && bestHits >= Math.max(2, Math.floor(sampleRows.length * 0.2))) {
        mappings.luc = bestCol;
        usedHeaders.add(bestCol);
      }
    }

    if (!mappings.contrato && knownContracts.size > 0) {
      let bestCol = '';
      let bestHits = 0;
      for (const h of headers) {
        if (usedHeaders.has(h)) continue;
        let hits = 0;
        for (const row of sampleRows) {
          const v = normalizeContract(String(row[h] ?? ''));
          if (v && knownContracts.has(v)) hits++;
        }
        if (hits > bestHits) {
          bestHits = hits;
          bestCol = h;
        }
      }
      if (bestCol && bestHits >= Math.max(2, Math.floor(sampleRows.length * 0.2))) {
        mappings.contrato = bestCol;
        usedHeaders.add(bestCol);
      }
    }

    if (!mappings.storeName && knownNames.size > 0) {
      let bestCol = '';
      let bestHits = 0;
      for (const h of headers) {
        if (usedHeaders.has(h)) continue;
        let hits = 0;
        for (const row of sampleRows) {
          const v = normalizeStoreName(String(row[h] ?? ''));
          if (v && knownNames.has(v)) hits++;
        }
        if (hits > bestHits) {
          bestHits = hits;
          bestCol = h;
        }
      }
      if (bestCol && bestHits >= Math.max(2, Math.floor(sampleRows.length * 0.2))) {
        mappings.storeName = bestCol;
        usedHeaders.add(bestCol);
      }
    }

    if (!mappings.reading) {
      // Escolhe a coluna numérica não mapeada com cara de ponteiro/leitura (números > 10, não constantes)
      const typicalConstants = new Set([0, 1, 1.25, 1.5, 1.75, 2, 10, 20, 25, 30, 40, 50, 60, 100, 1000]);
      let bestCol = '';
      let bestScore = 0;

      for (const h of headers) {
        if (usedHeaders.has(h)) continue;
        const nh = normalizeHeaderText(h);
        if (nh.includes('custo') || nh.includes('var') || nh.includes('consumo') || nh.includes('anterior')) continue;

        let numericCount = 0;
        let nonConstantReadingLike = 0;
        for (const row of sampleRows) {
          const num = parseCellNumber(row[h]);
          if (num !== null && num > 0) {
            numericCount++;
            if (num > 10 && !typicalConstants.has(num)) {
              nonConstantReadingLike++;
            }
          }
        }
        if (numericCount >= Math.max(1, Math.floor(sampleRows.length * 0.2))) {
          const score = nonConstantReadingLike * 3 + numericCount;
          if (score > bestScore) {
            bestScore = score;
            bestCol = h;
          }
        }
      }
      if (bestCol) {
        mappings.reading = bestCol;
      }
    }
  }

  return mappings;
}

export function extractSmartTableFromGrid(
  grid: any[][],
  options: {
    selectedMonth?: string;
    requestedBlockId?: string | null;
    utilityType?: UtilityType;
    knownStores?: Store[];
  } = {}
): SmartTableExtraction {
  if (!grid || grid.length === 0) {
    return {
      headerRowIndex: -1,
      isMultiMonthMatrix: false,
      detectedYear: null,
      detectedUtility: null,
      monthBlocks: [],
      selectedBlockId: null,
      headers: [],
      rows: [],
      suggestedMappings: autoMapColumns([], []),
      billSummary: null,
      ignoredNoiseRows: 0
    };
  }

  const headerRowIndex = findHeaderRowIndex(grid);
  const topSampleText = grid
    .slice(0, Math.min(grid.length, 5))
    .flat()
    .map(c => String(c ?? ''))
    .join(' ');
  const detectedUtility = detectUtilityFromText(topSampleText);
  const detectedYear = detectYearFromTopRows(grid, headerRowIndex >= 0 ? headerRowIndex : 5);

  const monthBlocks = headerRowIndex > 0 ? detectMonthBlocks(grid, headerRowIndex) : [];
  const isMultiMonthMatrix = monthBlocks.length >= 2;

  let selectedBlock: DetectedMonthBlock | null = null;
  if (isMultiMonthMatrix) {
    if (options.requestedBlockId) {
      selectedBlock = monthBlocks.find(b => b.id === options.requestedBlockId) || null;
    }
    if (!selectedBlock && options.selectedMonth) {
      const mPart = Number(options.selectedMonth.split('-')[1]);
      if (!isNaN(mPart) && mPart >= 1 && mPart <= 12) {
        selectedBlock = monthBlocks.find(b => b.monthNumber === mPart) || null;
      }
    }
    if (!selectedBlock) {
      // Último mês com leituras preenchidas
      const withData = monthBlocks.filter(b => b.hasReadings && b.monthNumber !== null);
      selectedBlock = withData.length > 0 ? withData[withData.length - 1] : monthBlocks[0];
    }
  }

  const headers: string[] = [];
  const colIndices: number[] = [];
  const seenHeaderCounts = new Map<string, number>();

  const pushUniqueHeader = (rawName: string, colIdx: number) => {
    const base = rawName.trim() || `Coluna ${colIdx + 1}`;
    const count = (seenHeaderCounts.get(base) || 0) + 1;
    seenHeaderCounts.set(base, count);
    const unique = count === 1 ? base : `${base} (${count})`;
    headers.push(unique);
    colIndices.push(colIdx);
  };

  let prevBlockReadingCol = -1;

  if (headerRowIndex >= 0 && isMultiMonthMatrix && selectedBlock) {
    const headerRow = grid[headerRowIndex] || [];
    const firstMonthCol = monthBlocks[0].startCol;

    // 1. Colunas fixas de identificação à esquerda (LUC, Contrato, Nome Fantasia...)
    for (let c = 0; c < firstMonthCol; c++) {
      const h = String(headerRow[c] ?? '').trim();
      if (h) pushUniqueHeader(h, c);
    }

    // 2. Se existir bloco imediatamente anterior na matriz, captura a leitura anterior como fallback
    const selectedIdx = monthBlocks.findIndex(b => b.id === selectedBlock!.id);
    if (selectedIdx > 0) {
      const prevBlock = monthBlocks[selectedIdx - 1];
      for (let c = prevBlock.startCol; c <= prevBlock.endCol; c++) {
        if (classifyHeaderCell(String(headerRow[c] ?? '')) === 'reading') {
          prevBlockReadingCol = c;
          break;
        }
      }
      if (prevBlockReadingCol >= 0) {
        pushUniqueHeader(`Leitura Anterior (${prevBlock.label})`, prevBlockReadingCol);
      }
    }

    // 3. Colunas do bloco mensal selecionado
    for (let c = selectedBlock.startCol; c <= selectedBlock.endCol; c++) {
      const h = String(headerRow[c] ?? '').trim();
      if (h) pushUniqueHeader(h, c);
    }
  } else if (headerRowIndex >= 0) {
    const headerRow = grid[headerRowIndex] || [];
    const dataSlice = grid.slice(headerRowIndex + 1, headerRowIndex + 30);
    const maxCols = Math.max(headerRow.length, ...dataSlice.map(r => (Array.isArray(r) ? r.length : 0)));

    for (let c = 0; c < maxCols; c++) {
      const h = String(headerRow[c] ?? '').trim();
      const hasAnyData = dataSlice.some(r => String((r || [])[c] ?? '').trim() !== '');
      if (h || hasAnyData) {
        pushUniqueHeader(h, c);
      }
    }
  } else {
    // Planilha sem cabeçalho: sintetiza Coluna 1..N
    const sampleSlice = grid.slice(0, 30);
    const maxCols = Math.max(...sampleSlice.map(r => (Array.isArray(r) ? r.length : 0)), 0);
    for (let c = 0; c < maxCols; c++) {
      const hasAnyData = sampleSlice.some(r => String((r || [])[c] ?? '').trim() !== '');
      if (hasAnyData) {
        pushUniqueHeader(`Coluna ${c + 1}`, c);
      }
    }
  }

  const dataStartRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  const rows: Record<string, any>[] = [];
  let ignoredNoiseRows = 0;

  for (let r = dataStartRow; r < grid.length; r++) {
    const rawRow = grid[r];
    if (!Array.isArray(rawRow)) continue;

    const extractedVals = colIndices.map(c => rawRow[c] ?? '');
    const stringVals = extractedVals.map(v => String(v ?? '').trim());
    if (stringVals.every(v => v === '')) continue;

    // Verifica ruído nas primeiras 3 colunas
    if (isNoiseRowValues(stringVals.slice(0, 4))) {
      ignoredNoiseRows++;
      continue;
    }

    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      obj[h] = extractedVals[i] ?? '';
    });
    rows.push(obj);
  }

  const suggestedMappings = autoMapColumns(headers, rows, options.knownStores || []);
  const billSummary =
    isMultiMonthMatrix && selectedBlock
      ? extractBillSummaryForBlock(grid, headerRowIndex, selectedBlock, options.utilityType || detectedUtility)
      : null;

  return {
    headerRowIndex,
    isMultiMonthMatrix,
    detectedYear,
    detectedUtility,
    monthBlocks,
    selectedBlockId: selectedBlock?.id || null,
    headers,
    rows,
    suggestedMappings,
    billSummary,
    ignoredNoiseRows
  };
}

/**
 * Extrai lista mensal de lojas (LUC, Contrato, Nome) a partir de qualquer grid de planilha,
 * incluindo planilhas mestres desorganizadas (ex: RATEIO ENERGIA 2026 com 35 linhas de resumo no topo
 * e 12 meses horizontais), ou delega ao parser de texto rápido quando não houver cabeçalho estruturado.
 */
export function extractMonthlyStoreRowsFromGrid(grid: any[][]): SmartMonthlyStoreExtraction {
  if (!grid || grid.length === 0) {
    return { rows: [], skippedLines: [], detectedHeaderRow: -1, detectedUtility: null, usedSmartMatrixParser: false };
  }

  const headerRowIndex = findHeaderRowIndex(grid);
  const topText = grid
    .slice(0, Math.min(grid.length, 5))
    .flat()
    .map(c => String(c ?? ''))
    .join(' ');
  const detectedUtility = detectUtilityFromText(topText);

  if (headerRowIndex < 0) {
    // Sem cabeçalho explícito (ex: 3 colunas coladas direto): delega ao parser tabular robusto já validado
    const tsv = grid.map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim()).join('\t') : '')).join('\n');
    const parsed = parseMonthlyStoreListText(tsv);
    return {
      rows: parsed.rows,
      skippedLines: parsed.skippedLines,
      detectedHeaderRow: -1,
      detectedUtility,
      usedSmartMatrixParser: false
    };
  }

  const headerRow = grid[headerRowIndex] || [];
  const monthBlocks = detectMonthBlocks(grid, headerRowIndex);
  const idColLimit = monthBlocks.length >= 2 ? monthBlocks[0].startCol : headerRow.length;

  let lucCol = -1;
  let contractCol = -1;
  let nameCol = -1;

  for (let c = 0; c < idColLimit; c++) {
    const role = classifyHeaderCell(String(headerRow[c] ?? ''));
    if (lucCol < 0 && role === 'luc') lucCol = c;
    else if (contractCol < 0 && role === 'contrato') contractCol = c;
    else if (nameCol < 0 && role === 'storeName') nameCol = c;
  }

  // Fallback se alguma coluna de ID ficou além de idColLimit
  if (lucCol < 0 || nameCol < 0) {
    for (let c = 0; c < headerRow.length; c++) {
      const role = classifyHeaderCell(String(headerRow[c] ?? ''));
      if (lucCol < 0 && role === 'luc') lucCol = c;
      else if (contractCol < 0 && role === 'contrato') contractCol = c;
      else if (nameCol < 0 && role === 'storeName') nameCol = c;
    }
  }

  // Se achou ao menos LUC e Nome (ou Contrato e Nome), extrai diretamente das colunas corretas
  if ((lucCol >= 0 || contractCol >= 0) && nameCol >= 0) {
    const rows: ParsedStoreRow[] = [];
    const skippedLines: SkippedImportLine[] = [];

    for (let r = headerRowIndex + 1; r < grid.length; r++) {
      const row = grid[r];
      if (!Array.isArray(row)) continue;

      const luc = lucCol >= 0 ? String(row[lucCol] ?? '').trim() : '';
      const contrato = contractCol >= 0 ? String(row[contractCol] ?? '').trim() : '';
      const name = nameCol >= 0 ? String(row[nameCol] ?? '').trim() : '';

      if (!luc && !contrato && !name) continue;
      if (isNoiseRowValues([luc, contrato, name])) continue;

      if (!name) {
        skippedLines.push({
          lineNumber: r + 1,
          content: [luc, contrato, name].filter(Boolean).join(' | ').slice(0, 120),
          reason: 'Nome da loja vazio'
        });
        continue;
      }

      if (!luc && !contrato) {
        skippedLines.push({
          lineNumber: r + 1,
          content: name.slice(0, 120),
          reason: 'Sem LUC e sem Contrato'
        });
        continue;
      }

      rows.push({
        luc: luc || contrato,
        contrato,
        name
      });
    }

    return {
      rows,
      skippedLines,
      detectedHeaderRow: headerRowIndex,
      detectedUtility,
      usedSmartMatrixParser: true
    };
  }

  // Fallback: reconstrói linhas a partir do headerRowIndex e usa o parser padrão
  const tsv = grid
    .slice(headerRowIndex)
    .map(r => (Array.isArray(r) ? r.slice(0, Math.min(r.length, 6)).map(c => String(c ?? '').trim()).join('\t') : ''))
    .join('\n');
  const parsed = parseMonthlyStoreListText(tsv);
  return {
    rows: parsed.rows,
    skippedLines: parsed.skippedLines,
    detectedHeaderRow: headerRowIndex,
    detectedUtility,
    usedSmartMatrixParser: headerRowIndex > 0
  };
}
