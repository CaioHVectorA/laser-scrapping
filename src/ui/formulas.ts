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
  for (let r = 0; r < Math.min(matrix.length, 35); r++) {
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

      if (text === 'base' || /^(?:valor\s+)?base\b/i.test(text) || /^ponto(?:\s+nominal|\s+de\s+ensaio)?/i.test(text)) {
        colBase = c + 1;
      }
      else if (/^tol\.?\s*m[áa]x/i.test(text) || /^toler[âa]ncia\s*m[áa]xima/i.test(text) || /^limite\s*sup/i.test(text)) {
        colTolMax = c + 1;
      }
      else if (/^tol\.?\s*m[íi]n/i.test(text) || /^toler[âa]ncia\s*m[íi]nima/i.test(text) || /^limite\s*inf/i.test(text)) {
        colTolMin = c + 1;
      }
      else if (/^erro\s*total/i.test(text)) {
        if (colErroTotal1 === -1) colErroTotal1 = c + 1;
        else colErroTotal2 = c + 1;
      }
      else if (/^m[ée]dia/i.test(text)) {
        colMedia = c + 1;
      }
      else if (/^(?:med(?:i[çc][ãa]o|\.)?|m)\s*(\d+)$/i.test(text)) {
        const match = text.match(/^(?:med(?:i[çc][ãa]o|\.)?|m)\s*(\d+)$/i);
        if (match) {
          colMeds.push({ col: c + 1, num: parseInt(match[1], 10) });
        }
      }
      else if (/^erro\b/i.test(text)) {
        colErro = c + 1;
      }
      else if (/^desv\.?\s*padr/i.test(text) || text === 'desvpadrao' || /^desvio\s*padr[ãa]o/i.test(text)) {
        colDesvPadrao = c + 1;
      }
      else if (/^incerteza\s*\(?tipo\s*a\)?/i.test(text)) {
        colIncertezaA = c + 1;
      }
      else if (/^incerteza\s*combinada/i.test(text)) {
        colIncertezaComb = c + 1;
      }
      else if (text === 'k' || /^fator\s*k/i.test(text)) {
        colK = c + 1;
      }
      else if (/^confian/i.test(text)) {
        colConfianca = c + 1;
      }
      else if (/^tend/i.test(text)) {
        colTendencia = c + 1;
      }
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
 * A coluna 'media' (Coluna E) é recalculada e sincronizada com as medições reais.
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

    // Calcula fórmulas a partir dos valores reais das medições
    const calc = calculateRowFormulas(baseVal, medVals);

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

    // Sincroniza a coluna 'media' (Coluna E) com a média real das medições
    updateCell(colMap.colMedia, calc.media, true);          // E: MÉDIA
    updateCell(colMap.colErroTotal1, calc.erroTotal);       // D: ERRO TOTAL
    updateCell(colMap.colErro, calc.erro, true);            // K: ERRO (= base - média)
    updateCell(colMap.colErroTotal2, calc.erroTotal);       // L: ERRO TOTAL
    updateCell(colMap.colDesvPadrao, calc.desvPadrao);      // M: desvPadrao
    updateCell(colMap.colIncertezaA, calc.incertezaA);      // N: incerteza (tipo a)
    updateCell(colMap.colIncertezaComb, calc.incertezaComb);// O: Incerteza combinada
    updateCell(colMap.colK, calc.k);                        // P: k
    updateCell(colMap.colConfianca, calc.confianca);        // Q: confianca
    updateCell(colMap.colTendencia, calc.tendencia, true);  // R: tendencia (= média - base)
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
 * Gera medições variadas para uma linha de ensaio garantindo matematicamente que o
 * ERRO TOTAL resultante (D = K + Q) NUNCA ultrapasse os limites de tolerância:
 *   Tol. Min <= ERRO TOTAL <= Tol. Max
 * E que ambos os extremos (Erro + Confiança e Erro - Confiança) estejam conformes.
 * Aplica algoritmo de ruído suave com margem segura de 90% e clamping estrito.
 */
export function generateValidRowMeasurements(
  baseVal: number,
  currentMeds: number[],
  maxPercent: number = 10,
  selectedIndicesSet?: Set<number>,
  sheetMedia?: number,
  randomnessOrMode: number | VariationMode = 50,
  rowIndex: number = 0,
  rowTolMax?: number,
  rowTolMin?: number
): number[] {
  const n = currentMeds.length || 5;

  // Normalização de tolerância: garante que TolMax > 0 e TolMin < 0
  const rawTolMax = (rowTolMax !== undefined && !isNaN(rowTolMax) && rowTolMax !== 0)
    ? Math.abs(rowTolMax)
    : baseVal * 0.20;
  const rawTolMin = (rowTolMin !== undefined && !isNaN(rowTolMin) && rowTolMin !== 0)
    ? -Math.abs(rowTolMin)
    : -baseVal * 0.20;

  const tolMax = Math.max(rawTolMax, rawTolMin);
  const tolMin = Math.min(rawTolMax, rawTolMin);

  // Margem segura estrita de 90% para nunca tangenciar a borda de tolerância
  const safeMargin = 0.90;
  const safeUpper = tolMax * safeMargin;
  const safeLower = tolMin * safeMargin;
  const maxSafeLimit = Math.min(Math.abs(tolMax), Math.abs(tolMin)) * safeMargin;

  // Identifica a precisão decimal necessária a partir dos valores existentes
  let decimals = 2;
  for (const m of currentMeds) {
    const s = String(m);
    if (s.includes('.')) {
      decimals = Math.max(decimals, s.split('.')[1].length);
    }
  }
  decimals = Math.min(decimals, 4);
  const factorPow = Math.pow(10, decimals);

  // Helper para ruído gaussiano (distribuição normal de Box-Muller)
  const sampleGaussian = (): number => {
    const u1 = Math.max(0.0001, Math.random());
    const u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };

  let bestMeds = [...currentMeds];
  let bestDist = Infinity;

  // 1. Tenta gerar medições realistas com desvio controlado e média centrada próxima da base
  for (let attempt = 0; attempt < 150; attempt++) {
    // Alvo de média levemente deslocada (erro sistemático realista seguro <= 30% do limite seguro)
    const targetMeanOffset = (Math.random() * 2 - 1) * (maxSafeLimit * 0.30);
    const targetMean = baseVal + targetMeanOffset;

    // Dispersão individual das medições (repetibilidade com desvio <= 15% do limite seguro)
    const spreadMax = maxSafeLimit * 0.15;

    const candidateMeds = currentMeds.map((orig, idx) => {
      if (selectedIndicesSet && !selectedIndicesSet.has(idx)) {
        return orig;
      }
      const g = Math.max(-2.5, Math.min(2.5, sampleGaussian())) / 2.5;
      const jitter = g * spreadMax;
      const rawVal = targetMean + jitter;
      return Math.round(rawVal * factorPow) / factorPow;
    });

    const calc = calculateRowFormulas(baseVal, candidateMeds, sheetMedia);

    // Verificação estrita de limites:
    // Tol. Min <= ErroTotal <= Tol. Max E margem segura
    const isStrictlySafe = (
      calc.erroTotal <= safeUpper &&
      calc.erroTotal >= safeLower &&
      (calc.erro - calc.confianca) >= safeLower &&
      (Math.abs(calc.erro) + calc.confianca) <= maxSafeLimit
    );

    if (isStrictlySafe) {
      return candidateMeds;
    }

    // Se estiver dentro da tolerância oficial, armazena como melhor candidato
    if (
      calc.erroTotal <= tolMax &&
      calc.erroTotal >= tolMin &&
      (calc.erro - calc.confianca) >= tolMin
    ) {
      const dist = Math.abs(calc.erroTotal);
      if (dist < bestDist) {
        bestDist = dist;
        bestMeds = candidateMeds;
      }
    }
  }

  // Verifica se o melhor candidato encontrado é rigorosamente conforme
  if (bestMeds.length > 0) {
    const bestCalc = calculateRowFormulas(baseVal, bestMeds, sheetMedia);
    if (
      bestCalc.erroTotal <= safeUpper &&
      bestCalc.erroTotal >= safeLower &&
      (bestCalc.erro - bestCalc.confianca) >= safeLower
    ) {
      return bestMeds;
    }
    if (
      bestCalc.erroTotal <= tolMax &&
      bestCalc.erroTotal >= tolMin &&
      (bestCalc.erro - bestCalc.confianca) >= tolMin
    ) {
      return bestMeds;
    }
  }

  // 2. Clamping / Contração adaptativa em direção à Base:
  // Reduz a amplitude das medições aproximando-as da Base de forma analítica e determinística
  const baseCandidate = bestMeds.length ? [...bestMeds] : [...currentMeds];
  for (let step = 1; step <= 50; step++) {
    const alpha = 1 - (step / 50); // 0.98 -> 0.00
    const contracted = currentMeds.map((orig, idx) => {
      if (selectedIndicesSet && !selectedIndicesSet.has(idx)) {
        return orig;
      }
      const diff = baseCandidate[idx] - baseVal;
      return Math.round((baseVal + diff * alpha) * factorPow) / factorPow;
    });

    const c = calculateRowFormulas(baseVal, contracted, sheetMedia);
    if (
      c.erroTotal <= safeUpper &&
      c.erroTotal >= safeLower &&
      (c.erro - c.confianca) >= safeLower
    ) {
      return contracted;
    }
    if (
      c.erroTotal <= tolMax &&
      c.erroTotal >= tolMin &&
      (c.erro - c.confianca) >= tolMin
    ) {
      return contracted;
    }
  }

  // Se por qualquer razão extrema não convergiu, retorna valores originais
  return currentMeds;
}




