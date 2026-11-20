import { ParsedStoreRow } from '../models';

export interface SkippedImportLine {
  lineNumber: number;
  content: string;
  reason: string;
}

export type DetectedImportOrder =
  | 'header'
  | 'luc_contract_name'
  | 'luc_name_contract'
  | 'two_columns'
  | 'auto';

export interface ParsedStoreListResult {
  rows: ParsedStoreRow[];
  skippedLines: SkippedImportLine[];
  detectedOrder: DetectedImportOrder;
}

/**
 * Verifica se o valor parece um código numérico de contrato (ex: 10423, 0000020000561, 50001539, 2000-01).
 */
export function isPureNumericContractCode(value?: string | null): boolean {
  const v = (value || '').trim();
  return /^[0-9][0-9\-\.\/]{1,19}$/.test(v);
}

/**
 * Verifica se o valor contém ao menos uma letra (aceita nomes curtos ou com pontuação como C&A, H&M, OI, LV, 3M).
 */
export function hasAnyLetter(value?: string | null): boolean {
  return /[a-zA-ZÀ-ÿ]/.test(value || '');
}

/**
 * Detecta se Contrato e Nome foram invertidos acidentalmente (ex: contrato="C&A", name="0000020000561").
 */
export function isLikelySwappedContractAndName(contrato?: string | null, name?: string | null): boolean {
  const cleanContrato = (contrato || '').trim();
  const cleanName = (name || '').trim();
  if (!cleanContrato || !cleanName) return false;
  return (
    isPureNumericContractCode(cleanName) &&
    !isPureNumericContractCode(cleanContrato) &&
    hasAnyLetter(cleanContrato)
  );
}

/**
 * Corrige automaticamente inversões entre Contrato e Nome preservando os valores limpos.
 */
export function normalizeContractAndNameOrder(
  contrato?: string | null,
  name?: string | null
): { contrato: string; name: string; swapped: boolean } {
  const cleanContrato = (contrato || '').trim();
  const cleanName = (name || '').trim();
  if (isLikelySwappedContractAndName(cleanContrato, cleanName)) {
    return {
      contrato: cleanName,
      name: cleanContrato,
      swapped: true
    };
  }
  return {
    contrato: cleanContrato,
    name: cleanName,
    swapped: false
  };
}

function unquoteCell(cell: string): string {
  const trimmed = cell.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1).replace(/""/g, '"').trim();
  }
  return trimmed;
}

function splitCsvRespectingQuotes(line: string): string[] {
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
    } else if (ch === ',' && !inQuotes) {
      result.push(unquoteCell(current));
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(unquoteCell(current));
  return result;
}

/**
 * Divide uma linha colada/importada respeitando prioridade de delimitadores e aspas CSV.
 */
export function splitDelimitedLine(line: string): {
  parts: string[];
  delimiter: '\t' | ';' | ',' | 'spaces' | 'none';
} {
  if (line.includes('\t')) {
    return { parts: line.split('\t').map(unquoteCell), delimiter: '\t' };
  }
  if (line.includes(';')) {
    return { parts: line.split(';').map(unquoteCell), delimiter: ';' };
  }
  if (line.includes(',')) {
    return { parts: splitCsvRespectingQuotes(line), delimiter: ',' };
  }
  const spaceSplit = line.split(/\s{2,}/).map(unquoteCell).filter(Boolean);
  if (spaceSplit.length >= 2 && spaceSplit.length <= 4) {
    return { parts: spaceSplit, delimiter: 'spaces' };
  }
  return { parts: [unquoteCell(line)], delimiter: 'none' };
}

function normalizeHeaderCell(cell: string): string {
  return cell
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function classifyHeaderCell(normalizedCell: string): 'contrato' | 'luc' | 'name' | null {
  if (!normalizedCell) return null;

  // Contrato PRIMEIRO (evita que "Código do Contrato" seja confundido com LUC)
  if (normalizedCell.includes('contrato') || normalizedCell.includes('contr')) {
    return 'contrato';
  }

  // LUC / Unidade
  if (
    normalizedCell === 'luc' ||
    normalizedCell === 'luc2' ||
    normalizedCell === 'unidade' ||
    normalizedCell === 'sala' ||
    normalizedCell === 'espaco' ||
    normalizedCell === 'codigo' ||
    normalizedCell === 'codigo luc' ||
    normalizedCell === 'cod luc' ||
    normalizedCell === 'cod. luc' ||
    normalizedCell.includes('codigo da loja') ||
    normalizedCell.includes('cod loja') ||
    normalizedCell.includes('cod. loja') ||
    (/^luc\b/.test(normalizedCell) && !/\d{2,}/.test(normalizedCell) && !normalizedCell.includes('nome'))
  ) {
    return 'luc';
  }

  // Nome da Loja / Lojista
  if (
    normalizedCell === 'nome' ||
    normalizedCell === 'loja' ||
    normalizedCell === 'fantasia' ||
    normalizedCell === 'razao' ||
    normalizedCell === 'razao social' ||
    normalizedCell === 'descricao' ||
    normalizedCell === 'lojista' ||
    normalizedCell === 'locatario' ||
    normalizedCell === 'inquilino' ||
    normalizedCell === 'cliente' ||
    normalizedCell.startsWith('nome ') ||
    normalizedCell.includes('fantasia') ||
    normalizedCell.includes('razao social') ||
    normalizedCell.includes('descricao') ||
    normalizedCell.includes('lojista') ||
    normalizedCell.includes('locatario')
  ) {
    return 'name';
  }

  return null;
}

const EXACT_HEADER_TOKENS = new Set([
  'luc',
  'luc2',
  'contrato',
  'nome',
  'loja',
  'unidade',
  'razao social',
  'nome da loja',
  'nome fantasia',
  'fantasia',
  'descricao',
  'lojista',
  'locatario',
  'inquilino'
]);

/**
 * Faz o parse completo de texto colado na importação mensal (LUC, Contrato, Nome),
 * com detecção de cabeçalho sem acentos, votação majoritária de colunas e relatório de linhas ignoradas.
 */
export function parseMonthlyStoreListText(text: string): ParsedStoreListResult {
  if (!text || !text.trim()) {
    return { rows: [], skippedLines: [], detectedOrder: 'auto' };
  }

  const rawLines = text.split(/\r?\n/);

  let headerLucIdx = -1;
  let headerNameIdx = -1;
  let headerContratoIdx = -1;
  let nonEmptySeen = 0;

  interface TokenizedLine {
    lineNumber: number;
    rawContent: string;
    parts: string[];
    delimiter: '\t' | ';' | ',' | 'spaces' | 'none';
  }

  const dataLines: TokenizedLine[] = [];
  const skippedLines: SkippedImportLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i].trim();
    if (!rawLine) continue;
    nonEmptySeen++;

    const { parts: cleanParts, delimiter } = splitDelimitedLine(rawLine);

    if (headerLucIdx === -1 && nonEmptySeen <= 3) {
      let lucCandidate = -1;
      let contratoCandidate = -1;
      let nameCandidate = -1;
      let exactMatches = 0;
      let hasNumericCode = false;

      cleanParts.forEach((p, idx) => {
        if (isPureNumericContractCode(p)) hasNumericCode = true;
        const normCell = normalizeHeaderCell(p);
        if (EXACT_HEADER_TOKENS.has(normCell)) exactMatches++;

        const role = classifyHeaderCell(normCell);
        if (role === 'contrato' && contratoCandidate === -1) {
          contratoCandidate = idx;
        } else if (role === 'luc' && lucCandidate === -1) {
          lucCandidate = idx;
        } else if (role === 'name' && nameCandidate === -1) {
          nameCandidate = idx;
        }
      });

      const rolesFound =
        (lucCandidate !== -1 ? 1 : 0) +
        (contratoCandidate !== -1 ? 1 : 0) +
        (nameCandidate !== -1 ? 1 : 0);

      if (rolesFound >= 2 || (exactMatches >= 1 && !hasNumericCode)) {
        headerLucIdx = lucCandidate;
        headerContratoIdx = contratoCandidate;
        headerNameIdx = nameCandidate;
        continue;
      }
    }

    dataLines.push({
      lineNumber: i + 1,
      rawContent: rawLine,
      parts: cleanParts,
      delimiter
    });
  }

  const hasExplicitHeader = headerLucIdx !== -1 && headerNameIdx !== -1;

  // Votação majoritária de colunas quando não há cabeçalho completo
  let tableOrder: 'luc_contract_name' | 'luc_name_contract' | 'auto' = 'auto';
  let threeColCount = 0;
  let twoColCount = 0;

  if (!hasExplicitHeader) {
    let votesContractFirst = 0;
    let votesNameFirst = 0;

    for (const item of dataLines) {
      const effectiveParts = [...item.parts];
      while (effectiveParts.length > 2 && effectiveParts[effectiveParts.length - 1] === '') {
        effectiveParts.pop();
      }
      if (effectiveParts.length >= 3) {
        threeColCount++;
        const p1 = effectiveParts[1];
        const p2 = effectiveParts.slice(2).filter(Boolean).join(' ').trim();
        if (isPureNumericContractCode(p1) && !isPureNumericContractCode(p2)) {
          votesContractFirst++;
        } else if (isPureNumericContractCode(p2) && !isPureNumericContractCode(p1)) {
          votesNameFirst++;
        }
      } else if (effectiveParts.length === 2) {
        twoColCount++;
      }
    }

    if (votesNameFirst > votesContractFirst) {
      tableOrder = 'luc_name_contract';
    } else if (votesContractFirst > votesNameFirst) {
      tableOrder = 'luc_contract_name';
    }
  }

  const rows: ParsedStoreRow[] = [];

  for (const item of dataLines) {
    const cleanParts = item.parts;
    let luc = '';
    let contrato = '';
    let name = '';

    if (hasExplicitHeader) {
      luc = cleanParts[headerLucIdx] || '';
      name = cleanParts[headerNameIdx] || '';
      contrato = headerContratoIdx !== -1 ? cleanParts[headerContratoIdx] || '' : '';
    } else {
      const effectiveParts = [...cleanParts];
      while (effectiveParts.length > 2 && effectiveParts[effectiveParts.length - 1] === '') {
        effectiveParts.pop();
      }

      if (effectiveParts.length >= 3) {
        luc = effectiveParts[0];
        const p1 = effectiveParts[1];
        const p2 = effectiveParts.slice(2).filter(Boolean).join(' ').trim();

        if (tableOrder === 'luc_contract_name') {
          contrato = p1;
          name = p2;
        } else if (tableOrder === 'luc_name_contract') {
          name = p1;
          contrato = p2;
        } else {
          const p1IsNumeric = isPureNumericContractCode(p1);
          const p2IsNumeric = isPureNumericContractCode(p2);
          const p1HasLetter = hasAnyLetter(p1);
          const p2HasLetter = hasAnyLetter(p2);

          if (p1IsNumeric && p2HasLetter && !p2IsNumeric) {
            contrato = p1;
            name = p2;
          } else if (p1HasLetter && p2IsNumeric && !p1IsNumeric) {
            name = p1;
            contrato = p2;
          } else if (p1HasLetter && !p2HasLetter) {
            name = p1;
            contrato = p2;
          } else {
            contrato = p1;
            name = p2;
          }
        }
      } else if (effectiveParts.length === 2) {
        luc = effectiveParts[0];
        name = effectiveParts[1];
        contrato = '';
      } else {
        skippedLines.push({
          lineNumber: item.lineNumber,
          content: item.rawContent,
          reason: 'Menos de 2 colunas identificadas (use TAB, ponto e vírgula ou vírgula)'
        });
        continue;
      }
    }

    if (!hasExplicitHeader && tableOrder === 'auto') {
      const normalized = normalizeContractAndNameOrder(contrato, name);
      contrato = normalized.contrato;
      name = normalized.name;
    } else {
      contrato = contrato.trim();
      name = name.trim();
    }
    luc = luc.trim();

    if (!luc || !name) {
      skippedLines.push({
        lineNumber: item.lineNumber,
        content: item.rawContent,
        reason: !luc ? 'Código LUC vazio' : 'Nome da loja vazio'
      });
      continue;
    }

    rows.push({ luc, contrato, name });
  }

  let detectedOrder: DetectedImportOrder = 'auto';
  if (hasExplicitHeader) {
    detectedOrder = 'header';
  } else if (tableOrder !== 'auto') {
    detectedOrder = tableOrder;
  } else if (twoColCount > 0 && threeColCount === 0) {
    detectedOrder = 'two_columns';
  }

  return { rows, skippedLines, detectedOrder };
}
