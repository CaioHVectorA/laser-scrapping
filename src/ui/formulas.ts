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
export function calculateRowFormulas(base: number, meds: number[]): CalculatedRow {
  const n = meds.length;
  if (n === 0) {
    return {
      media: 0,
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

  // E2: =MÉDIA(F2:J2)
  const media = meds.reduce((sum, v) => sum + v, 0) / n;

  // K2: =A2-E2 (Base - Média)
  const erro = base - media;

  // M2: =DESVPAD.A(F2:J2) (Desvio padrão amostral com n-1 graus de liberdade)
  let desvPadrao = 0;
  if (n > 1) {
    const variance = meds.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / (n - 1);
    desvPadrao = Math.sqrt(variance);
  }

  // N2: =M2/RAIZ(5)
  const incertezaA = desvPadrao / Math.sqrt(n);

  // O2: =RAIZ(N2^2 + 0,1^2)
  const incertezaComb = Math.sqrt(Math.pow(incertezaA, 2) + Math.pow(0.1, 2));

  // P2: =SE(N2<(O2/2); 2; INV.T.2C(0,05; 4))
  // Para 95% de confiança (alfa = 0.05) e graus de liberdade gl = n - 1 = 4:
  // t-Student bicaudal = 2.77644510519
  const tStudent4 = 2.77644510519;
  const k = incertezaA < (incertezaComb / 2) ? 2 : tStudent4;

  // Q2: =P2*O2
  const confianca = k * incertezaComb;

  // D2 & L2: =K2+Q2
  const erroTotal = erro + confianca;

  // R2: =E2-A2 (Média - Base)
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

    updateCell(colMap.colMedia, calc.media, true);          // E: media
    updateCell(colMap.colErroTotal1, calc.erroTotal);       // D: ERRO TOTAL
    updateCell(colMap.colErro, calc.erro, true);            // K: ERRO
    updateCell(colMap.colErroTotal2, calc.erroTotal);       // L: ERRO TOTAL
    updateCell(colMap.colDesvPadrao, calc.desvPadrao);      // M: desvPadrao
    updateCell(colMap.colIncertezaA, calc.incertezaA);      // N: incerteza (tipo a)
    updateCell(colMap.colIncertezaComb, calc.incertezaComb);// O: Incerteza combinada
    updateCell(colMap.colK, calc.k);                        // P: k
    updateCell(colMap.colConfianca, calc.confianca);        // Q: confianaca
    updateCell(colMap.colTendencia, calc.tendencia, true);  // R: tendencia
  }
}
