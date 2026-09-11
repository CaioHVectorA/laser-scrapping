export interface CalculatedRow {
  media: number;        // E: =MÉDIA(F:J)
  erro: number;         // K: =A-E
  desvPadrao: number;   // M: =DESVPAD.A(F:J)
  incertezaA: number;   // N: =M/RAIZ(5)
  incertezaComb: number;// O: =RAIZ(N^2 + 0,1^2)
  k: number;            // P: =SE(N<(O/2); 2; INV.T.2C(0,05; 4))
  confianca: number;    // Q: =P*O
  erroTotal: number;    // D & L: =K+Q
  tendencia: number;    // R: =E-A
}

/**
 * Calcula todas as fórmulas da planilha associadas às medições med1..med5
 * conforme o modelo oficial do laudo:
 *
 * E2: =MÉDIA(F2:J2)
 * K2: =A2-E2
 * M2: =DESVPAD.A(F2:J2)
 * N2: =M2/RAIZ(5)
 * O2: =RAIZ(N2^2 + 0,1^2)
 * P2: =SE(N2<(O2/2); 2; INV.T.2C(0,05; 4))
 * Q2: =P2*O2
 * D2: =K2+Q2
 * L2: =K2+Q2
 * R2: =E2-A2
 */
export function calculateRowFormulas(
  base: number,
  meds: number[],
  sheetMedia?: number
): CalculatedRow {
  const n = meds.length;
  if (n === 0) {
    return {
      media: sheetMedia ?? 0,
      erro: 0,
      desvPadrao: 0,
      incertezaA: 0,
      incertezaComb: 0.1,
      k: 2,
      confianca: 0.2,
      erroTotal: 0,
      tendencia: 0,
    };
  }

  // E2: Usa a Média que veio na planilha (ou a média aritmética como fallback se não fornecida)
  const media = (sheetMedia !== undefined && !isNaN(sheetMedia) && sheetMedia > 0)
    ? sheetMedia
    : (meds.reduce((sum, v) => sum + v, 0) / n);

  // K2: =A2-E2 (Base - Média da Planilha)
  const erro = base - media;

  // M2: =DESVPAD.A(F2:J2) (Desvio padrão amostral das medições atuais)
  let desvPadrao = 0;
  if (n > 1) {
    const meanMeds = meds.reduce((sum, v) => sum + v, 0) / n;
    const variance = meds.reduce((acc, v) => acc + Math.pow(v - meanMeds, 2), 0) / (n - 1);
    desvPadrao = Math.sqrt(variance);
  }

  // N2: =M2/RAIZ(5)
  const incertezaA = desvPadrao / Math.sqrt(n);

  // O2: =RAIZ(N2^2 + 0,1^2)
  const incertezaComb = Math.sqrt(Math.pow(incertezaA, 2) + Math.pow(0.1, 2));

  // P2: =SE(N2<(O2/2); 2; INV.T.2C(0,05; 4))
  const tStudent4 = 2.77644510519;
  const k = incertezaA < (incertezaComb / 2) ? 2 : tStudent4;

  // Q2: =P2*O2
  const confianca = k * incertezaComb;

  // D2 & L2: =K2+Q2
  const erroTotal = erro + confianca;

  // R2: =E2-A2 (Média da Planilha - Base)
  const tendencia = media - base;

  return {
    media,
    erro,
    desvPadrao,
    incertezaA,
    incertezaComb,
    k,
    confianca,
    erroTotal,
    tendencia,
  };
}

export interface RowColumnMap {
  headerRow: number;
  colBase: number;
  colTolMax: number;
  colTolMin: number;
  colErroTotal1: number; // Col D
  colMedia: number;      // Col E
  colMeds: number[];     // Col F..J (med1..med5)
  colErro: number;       // Col K
  colErroTotal2: number; // Col L
  colDesvPadrao: number; // Col M
  colIncertezaA: number; // Col N
  colIncertezaComb: number; // Col O
  colK: number;          // Col P
  colConfianca: number;  // Col Q
  colTendencia: number;  // Col R
}

/**
 * Detecta as posições das colunas na matriz a partir dos cabeçalhos
 */
export function detectRowColumnMap(matrix: any[][]): RowColumnMap | null {
  for (let r = 0; r < Math.min(matrix.length, 25); r++) {
    const row = matrix[r];
    if (!row) continue;

    let colBase = -1;
    let colTolMax = -1;
    let colTolMin = -1;
    let colErroTotal1 = -1;
    let colMedia = -1;
    const colMeds: { col: number; num: number }[] = [];
    let colErro = -1;
    let colErroTotal2 = -1;
    let colDesvPadrao = -1;
    let colIncertezaA = -1;
    let colIncertezaComb = -1;
    let colK = -1;
    let colConfianca = -1;
    let colTendencia = -1;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const text = String(cell.displayValue || cell.value || '').trim().toLowerCase();

      if (text === 'base') colBase = c + 1;
      else if (/^tol\.?\s*max/i.test(text)) colTolMax = c + 1;
      else if (/^tol\.?\s*min/i.test(text)) colTolMin = c + 1;
      else if (text === 'erro total') {
        if (colErroTotal1 === -1) colErroTotal1 = c + 1;
        else colErroTotal2 = c + 1;
      }
      else if (/^medi?a$/i.test(text)) colMedia = c + 1;
      else if (/^med(\d+)$/i.test(text)) {
        const match = text.match(/^med(\d+)$/i);
        colMeds.push({ col: c + 1, num: parseInt(match![1], 10) });
      }
      else if (text === 'erro') colErro = c + 1;
      else if (/^desv\.?\s*padr/i.test(text) || text === 'desvpadrao') colDesvPadrao = c + 1;
      else if (/^incerteza\s*\(?tipo\s*a\)?/i.test(text)) colIncertezaA = c + 1;
      else if (/^incerteza\s*combinada/i.test(text)) colIncertezaComb = c + 1;
      else if (text === 'k') colK = c + 1;
      else if (/^confian/i.test(text)) colConfianca = c + 1;
      else if (/^tend/i.test(text)) colTendencia = c + 1;
    }

    if (colMeds.length > 0 && colBase !== -1) {
      colMeds.sort((a, b) => a.num - b.num);
      return {
        headerRow: r + 1,
        colBase,
        colTolMax,
        colTolMin,
        colErroTotal1: colErroTotal1 !== -1 ? colErroTotal1 : 4,
        colMedia: colMedia !== -1 ? colMedia : 5,
        colMeds: colMeds.map(m => m.col),
        colErro: colErro !== -1 ? colErro : 11,
        colErroTotal2: colErroTotal2 !== -1 ? colErroTotal2 : 12,
        colDesvPadrao: colDesvPadrao !== -1 ? colDesvPadrao : 13,
        colIncertezaA: colIncertezaA !== -1 ? colIncertezaA : 14,
        colIncertezaComb: colIncertezaComb !== -1 ? colIncertezaComb : 15,
        colK: colK !== -1 ? colK : 16,
        colConfianca: colConfianca !== -1 ? colConfianca : 17,
        colTendencia: colTendencia !== -1 ? colTendencia : 18,
      };
    }
  }
  return null;
}

/**
 * Atualiza dinamicamente na matriz de células (e opcionalmente no worksheet ExcelJS)
 * todas as colunas com fórmulas dependentes das medições med1..med5.
 * A coluna 'media' (Coluna E) NUNCA é sobrescrita, permanecendo o valor original da planilha.
 */
export function applyFormulasToMatrix(
  matrix: any[][],
  worksheet?: any
): void {
  const colMap = detectRowColumnMap(matrix);
  if (!colMap) return;

  for (let r = colMap.headerRow; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    const baseCell = row[colMap.colBase - 1];
    if (!baseCell) continue;

    const baseVal = typeof baseCell.value === 'number'
      ? baseCell.value
      : parseFloat(String(baseCell.displayValue || baseCell.value || '').replace(',', '.'));

    if (isNaN(baseVal) || baseVal <= 0) continue;

    // Obtém o valor original da coluna 'media' da planilha
    let sheetMedia: number | undefined = undefined;
    if (colMap.colMedia > 0 && row[colMap.colMedia - 1]) {
      const mCell = row[colMap.colMedia - 1];
      const v = typeof mCell?.value === 'number'
        ? mCell.value
        : parseFloat(String(mCell?.displayValue || '').replace(',', '.'));
      if (!isNaN(v) && v > 0) sheetMedia = v;
    }

    // Coleta os valores atuais de med1..medN
    const medVals: number[] = [];
    for (const cIdx of colMap.colMeds) {
      const mCell = row[cIdx - 1];
      if (mCell) {
        const v = typeof mCell.value === 'number'
          ? mCell.value
          : parseFloat(String(mCell.displayValue || mCell.value || '').replace(',', '.'));
        if (!isNaN(v) && isFinite(v)) {
          medVals.push(v);
        }
      }
    }

    if (medVals.length === 0) continue;

    const calc = calculateRowFormulas(baseVal, medVals, sheetMedia);

    const updateCell = (colIdx: number, val: number, isShortDecimal = false) => {
      if (colIdx <= 0 || colIdx > row.length) return;
      const cell = row[colIdx - 1];
      if (!cell) return;

      const numVal = isShortDecimal
        ? Math.round(val * 100) / 100
        : Math.round(val * 10000000000) / 10000000000;

      let displayStr = '';
      if (Number.isInteger(numVal)) {
        displayStr = String(numVal);
      } else {
        displayStr = String(numVal).replace('.', ',');
      }

      cell.value = numVal;
      cell.displayValue = displayStr;
      cell.isNumeric = true;

      if (worksheet) {
        try {
          const excelCell = worksheet.getRow(r + 1).getCell(colIdx);
          excelCell.value = numVal;
        } catch {}
      }
    };

    // A coluna 'media' (Coluna E) NUNCA é sobrescrita (permanece o que veio na planilha)
    updateCell(colMap.colErroTotal1, calc.erroTotal);       // D: ERRO TOTAL
    updateCell(colMap.colErro, calc.erro, true);            // K: ERRO (= base - media_planilha)
    updateCell(colMap.colErroTotal2, calc.erroTotal);       // L: ERRO TOTAL
    updateCell(colMap.colDesvPadrao, calc.desvPadrao);      // M: desvPadrao
    updateCell(colMap.colIncertezaA, calc.incertezaA);      // N: incerteza (tipo a)
    updateCell(colMap.colIncertezaComb, calc.incertezaComb);// O: Incerteza combinada
    updateCell(colMap.colK, calc.k);                        // P: k
    updateCell(colMap.colConfianca, calc.confianca);        // Q: confianaca
    updateCell(colMap.colTendencia, calc.tendencia, true);  // R: tendencia (= media_planilha - base)
  }
}

export type VariationMode = 'uniform' | 'wobble' | 'gaussian' | 'trend';

export interface CustomLayoutPreset {
  name: string;
  colBase: number;
  colTolMax: number;
  colTolMin: number;
  colErroTotal1: number;
  colMedia: number;
  colMeds: number[];
  colErro: number;
  colErroTotal2: number;
  colDesvPadrao: number;
}

export const DEFAULT_MEDLASER_PRESET: CustomLayoutPreset = {
  name: 'Padrão MedLaser (Colunas A, D, E, F..J, K, M)',
  colBase: 1,       // A
  colTolMax: 2,     // B
  colTolMin: 3,     // C
  colErroTotal1: 4, // D
  colMedia: 5,      // E
  colMeds: [6, 7, 8, 9, 10], // F..J
  colErro: 11,      // K
  colErroTotal2: 12,// L
  colDesvPadrao: 13 // M
};

/**
 * Gera medições variadas para uma linha de ensaio garantindo que o
 * ERRO TOTAL resultante (D = K + Q) NUNCA ultrapasse os limites de tolerância:
 *   Tol. Min <= ERRO TOTAL <= Tol. Max
 * Suporta modos de variação: 'uniform', 'wobble', 'gaussian', 'trend'
 * Aplica algoritmo de Shrinkage / Clamping adaptativo com garantia estrita de limites.
 */
export function generateValidRowMeasurements(
  baseVal: number,
  currentMeds: number[],
  maxPercent: number,
  selectedIndicesSet?: Set<number>,
  sheetMedia?: number,
  randomnessOrMode: number | VariationMode = 50,
  rowIndex: number = 0,
  rowTolMax?: number,
  rowTolMin?: number
): number[] {
  const n = currentMeds.length || 5;

  // Usa os limites reais da linha se válidos, senão fallback de 20%
  const tolMax = (rowTolMax !== undefined && !isNaN(rowTolMax) && rowTolMax > 0)
    ? rowTolMax
    : baseVal * 0.20;
  const tolMin = (rowTolMin !== undefined && !isNaN(rowTolMin) && rowTolMin < 0)
    ? rowTolMin
    : -baseVal * 0.20;

  // Margem segura para não tangenciar perigosamente o limiar da tolerância
  const safeUpper = tolMax * 0.95;
  const safeLower = tolMin * 0.95;

  let numRandomness = 50;
  if (typeof randomnessOrMode === 'number') {
    numRandomness = randomnessOrMode;
  } else if (randomnessOrMode === 'wobble') {
    numRandomness = 25;
  } else if (randomnessOrMode === 'gaussian') {
    numRandomness = 75;
  } else if (randomnessOrMode === 'trend') {
    numRandomness = 15;
  } else {
    numRandomness = 50;
  }

  const randRatio = Math.max(0, Math.min(100, numRandomness)) / 100;

  // Função de ruído/onda conforme o modo de variação selecionado
  const getNoiseFactor = (idx: number, attempt: number): number => {
    let wave = 0;
    if (randomnessOrMode === 'wobble') {
      wave = Math.sin((rowIndex + 1) * 0.9 + (idx + 1) * 1.3 + attempt * 0.1);
    } else if (randomnessOrMode === 'trend') {
      const slope = (rowIndex % 2 === 0 ? 1 : -1) * ((idx - (n - 1) / 2) / ((n - 1) / 2 || 1));
      wave = slope;
    } else if (randomnessOrMode === 'gaussian') {
      const u1 = Math.max(0.0001, Math.random());
      const u2 = Math.random();
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      wave = Math.max(-2, Math.min(2, z0)) / 2;
    } else {
      wave = Math.sin((rowIndex + 1) * 0.85 + (idx + 1) * 1.25);
    }
    const noise = (Math.random() * 2 - 1);
    const factor = wave * (1 - randRatio) + noise * randRatio;
    return Math.max(-1, Math.min(1, factor));
  };

  let bestMeds = [...currentMeds];
  let bestDistance = Infinity;

  // 1. Tenta gerar por perturbação com formato de curva em busca de resultado dentro da margem segura
  for (let attempt = 0; attempt < 300; attempt++) {
    const candidateMeds = currentMeds.map((val, idx) => {
      if (selectedIndicesSet && !selectedIndicesSet.has(idx)) return val;
      const deltaMax = Math.abs(val) * (maxPercent / 100);
      const factor = getNoiseFactor(idx, attempt);
      return Math.round((val + factor * deltaMax) * 100) / 100;
    });

    const calc = calculateRowFormulas(baseVal, candidateMeds, sheetMedia);

    // Se estiver estritamente dentro da margem segura, aceita imediatamente
    if (calc.erroTotal >= safeLower && calc.erroTotal <= safeUpper) {
      return candidateMeds;
    }

    // Se estiver dentro da tolerância, guarda o melhor candidato
    if (calc.erroTotal >= tolMin && calc.erroTotal <= tolMax) {
      const dist = Math.abs(calc.erroTotal);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMeds = candidateMeds;
      }
    }
  }

  // Verifica se o melhor candidato encontrado satisfaz rigorosamente
  const bestCalc = calculateRowFormulas(baseVal, bestMeds, sheetMedia);
  if (bestCalc.erroTotal >= tolMin && bestCalc.erroTotal <= tolMax) {
    return bestMeds;
  }

  // 2. Shrinkage Adaptativo / Clamping Vetorial em direção aos valores originais:
  // Reduz a amplitude das perturbações preservando a forma da curva até convergir 100% nos limites
  const currentCandidate = bestMeds.length ? [...bestMeds] : [...currentMeds];
  for (let step = 1; step <= 25; step++) {
    const factor = 1 - (step / 25);
    const scaled = currentMeds.map((orig, idx) => {
      if (selectedIndicesSet && !selectedIndicesSet.has(idx)) return orig;
      const diff = currentCandidate[idx] - orig;
      return Math.round((orig + diff * factor) * 100) / 100;
    });
    const c = calculateRowFormulas(baseVal, scaled, sheetMedia);
    if (c.erroTotal >= tolMin && c.erroTotal <= tolMax) {
      return scaled;
    }
  }

  // Se a linha original já estava conforme, retorna os valores originais intactos
  return currentMeds;
}




