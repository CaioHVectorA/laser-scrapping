import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { applyFormulasToMatrix, generateValidRowMeasurements, detectRowColumnMap } from '../ui/formulas.js';

export interface XlsxCellData {
  address: string;
  row: number;
  col: number;
  colLetter: string;
  value: any;
  displayValue: string;
  isNumeric: boolean;
  isMeasurementCandidate: boolean;
  isSelectedForVariation: boolean;
  formula?: string;
}

export interface XlsxSheetData {
  name: string;
  rowCount: number;
  colCount: number;
  cells: Record<string, XlsxCellData>;
  matrix: (XlsxCellData | null)[][];
  columnsWithCandidates: string[];
}

export interface XlsxParsedData {
  filePath: string;
  fileName: string;
  sheets: XlsxSheetData[];
  measurementCellsCount: number;
}

export interface CellChange {
  address: string;
  sheetName: string;
  oldValue: number;
  newValue: number;
}

function getColLetter(colIndex: number): string {
  let temp: number;
  let letter = '';
  while (colIndex > 0) {
    temp = (colIndex - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    colIndex = Math.floor((colIndex - temp - 1) / 26);
  }
  return letter;
}

/**
 * Lê e analisa a estrutura de um arquivo XLSX de laudo.
 */
export async function parseXlsx(filePath: string): Promise<XlsxParsedData> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const fileName = path.basename(filePath);
  const sheets: XlsxSheetData[] = [];
  let totalMeasurements = 0;

  workbook.eachSheet((worksheet) => {
    const cells: Record<string, XlsxCellData> = {};
    const maxRow = Math.max(worksheet.rowCount, 40);
    const maxCol = Math.max(worksheet.columnCount, 30);
    const matrix: (XlsxCellData | null)[][] = [];
    const colsWithCandidatesSet = new Set<string>();

    // ═══ PRIMEIRA PASSAGEM: detectar colunas "medN" pelo cabeçalho ═══
    const medColIndices = new Set<number>();
    let headerRow = -1;

    for (let scanR = 1; scanR <= Math.min(maxRow, 25); scanR++) {
      const scanRow = worksheet.getRow(scanR);
      for (let scanC = 1; scanC <= maxCol; scanC++) {
        const scanCell = scanRow.getCell(scanC);
        let cellText = '';
        try {
          cellText = (scanCell.text || String(scanCell.value || '')).trim();
        } catch { cellText = ''; }
        // Detecta med1, med2, ..., medN — mas NÃO "media"
        if (/^med\d+$/i.test(cellText)) {
          medColIndices.add(scanC);
          if (headerRow === -1) headerRow = scanR;
        }
      }
      if (medColIndices.size > 0) break;
    }

    // ═══ SEGUNDA PASSAGEM: parsear todas as células ═══
    for (let r = 1; r <= maxRow; r++) {
      const rowArray: (XlsxCellData | null)[] = [];
      const row = worksheet.getRow(r);

      for (let c = 1; c <= maxCol; c++) {
        const cell = row.getCell(c);
        const address = cell.address;
        const colLetter = getColLetter(c);

        let rawVal = cell.value;
        let displayVal = '';
        let formula: string | undefined = undefined;

        if (rawVal != null && typeof rawVal === 'object') {
          if (rawVal instanceof Date) {
            rawVal = rawVal.toLocaleDateString('pt-BR');
          } else if ('formula' in rawVal) {
            formula = (rawVal as any).formula;
            rawVal = (rawVal as any).result ?? 0;
          } else if ('result' in rawVal) {
            rawVal = (rawVal as any).result;
          } else if ('richText' in rawVal) {
            rawVal = ((rawVal as any).richText || []).map((rt: any) => rt?.text || '').join('');
          } else if ('text' in rawVal) {
            rawVal = (rawVal as any).text;
          } else if ('error' in rawVal) {
            rawVal = (rawVal as any).error || '#ERR';
          }
        }

        try {
          if (cell.text != null) {
            displayVal = String(cell.text).trim();
          } else if (rawVal != null) {
            displayVal = String(rawVal);
          }
        } catch { displayVal = ''; }
        
        let numVal = typeof rawVal === 'number' ? rawVal : parseFloat(displayVal.replace(',', '.'));
        const isNum = !isNaN(numVal) && isFinite(numVal) && displayVal.trim() !== '';

        // SÓ marca como candidato se estiver em coluna "medN" e ABAIXO do cabeçalho
        const candidate = isNum && !formula && medColIndices.size > 0
          ? (medColIndices.has(c) && r > headerRow)
          : false;

        if (candidate) {
          totalMeasurements++;
          colsWithCandidatesSet.add(colLetter);
        }

        const cellData: XlsxCellData = {
          address,
          row: r,
          col: c,
          colLetter,
          value: isNum ? numVal : (rawVal ?? ''),
          displayValue: displayVal,
          isNumeric: isNum,
          isMeasurementCandidate: candidate,
          isSelectedForVariation: candidate,
          formula
        };

        cells[address] = cellData;
        rowArray.push(cellData);
      }

      matrix.push(rowArray);
    }

    // Aplica as fórmulas da planilha no servidor
    applyFormulasToMatrix(matrix, worksheet);

    sheets.push({
      name: worksheet.name,
      rowCount: maxRow,
      colCount: maxCol,
      cells,
      matrix,
      columnsWithCandidates: Array.from(colsWithCandidatesSet)
    });
  });

  return {
    filePath,
    fileName,
    sheets,
    measurementCellsCount: totalMeasurements
  };
}

/**
 * Aplica variação aleatória estrita de até maxPercent nas células de medição.
 */
export async function randomizeMeasurements(
  filePath: string,
  outputPath: string,
  maxPercent: number = 10,
  targetAddresses?: string[]
): Promise<{ outputPath: string; changes: CellChange[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const changes: CellChange[] = [];
  const parsed = await parseXlsx(filePath);

  for (const sheet of parsed.sheets) {
    const worksheet = workbook.getWorksheet(sheet.name);
    if (!worksheet) continue;

    const colMap = detectRowColumnMap(sheet.matrix);
    if (colMap) {
      for (let r = colMap.headerRow; r < sheet.matrix.length; r++) {
        const row = sheet.matrix[r];
        if (!row) continue;

        const baseCell = row[colMap.colBase - 1];
        if (!baseCell) continue;
        const baseVal = typeof baseCell.value === 'number'
          ? baseCell.value
          : parseFloat(String(baseCell.displayValue || baseCell.value || '').replace(',', '.'));
        if (isNaN(baseVal) || baseVal <= 0) continue;

        const currentMeds: number[] = [];
        colMap.colMeds.forEach((cIdx) => {
          const cell = row[cIdx - 1];
          if (cell) {
            const v = typeof cell.value === 'number'
              ? cell.value
              : parseFloat(String(cell.displayValue || '').replace(',', '.'));
            currentMeds.push(!isNaN(v) ? v : baseVal);
          }
        });

        if (currentMeds.length === 0) continue;

        let sheetMedia: number | undefined = undefined;
        if (colMap.colMedia > 0 && row[colMap.colMedia - 1]) {
          const mCell = row[colMap.colMedia - 1];
          const v = typeof mCell?.value === 'number'
            ? mCell.value
            : parseFloat(String(mCell?.displayValue || '').replace(',', '.'));
          if (!isNaN(v) && v > 0) sheetMedia = v;
        }

        let rowTolMax: number | undefined = undefined;
        if (colMap.colTolMax > 0 && row[colMap.colTolMax - 1]) {
          const tCell = row[colMap.colTolMax - 1];
          const v = typeof tCell?.value === 'number'
            ? tCell.value
            : parseFloat(String(tCell?.displayValue || '').replace(',', '.'));
          if (!isNaN(v) && v > 0) rowTolMax = v;
        }

        let rowTolMin: number | undefined = undefined;
        if (colMap.colTolMin > 0 && row[colMap.colTolMin - 1]) {
          const tCell = row[colMap.colTolMin - 1];
          const v = typeof tCell?.value === 'number'
            ? tCell.value
            : parseFloat(String(tCell?.displayValue || '').replace(',', '.'));
          if (!isNaN(v) && v < 0) rowTolMin = v;
        }

        const validMeds = generateValidRowMeasurements(
          baseVal,
          currentMeds,
          maxPercent,
          undefined,
          sheetMedia,
          50,
          r,
          rowTolMax,
          rowTolMin
        );

        colMap.colMeds.forEach((cIdx, idx) => {
          const cell = row[cIdx - 1];
          if (cell) {
            const oldVal = cell.value;
            const newVal = validMeds[idx];
            cell.value = newVal;

            const excelCell = worksheet.getRow(r + 1).getCell(cIdx);
            excelCell.value = newVal;

            changes.push({
              address: cell.address,
              sheetName: sheet.name,
              oldValue: Number(oldVal),
              newValue: newVal
            });
          }
        });
      }
    }

    applyFormulasToMatrix(sheet.matrix, worksheet);
  }

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await workbook.xlsx.writeFile(outputPath);

  return {
    outputPath,
    changes
  };
}

/**
 * Salva modificações manuais diretas de células de volta no arquivo XLSX.
 */
export async function updateCellValues(
  filePath: string,
  outputPath: string,
  updates: { sheetName: string; address: string; newValue: any }[]
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  for (const update of updates) {
    const worksheet = workbook.getWorksheet(update.sheetName);
    if (worksheet) {
      const cell = worksheet.getCell(update.address);
      const parsedNum = parseFloat(String(update.newValue).replace(',', '.'));
      if (!isNaN(parsedNum) && String(update.newValue).trim() !== '') {
        cell.value = parsedNum;
      } else {
        cell.value = update.newValue;
      }
    }
  }

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}
