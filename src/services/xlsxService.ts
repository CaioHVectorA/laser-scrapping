import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';

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
  let temp = '';
  let letter = '';
  while (colIndex > 0) {
    temp = (colIndex - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    colIndex = Math.floor((colIndex - temp - 1) / 26);
  }
  return letter;
}

/**
 * Verifica se um valor numérico é candidato a ser uma medição de ensaio
 */
function isMeasurementCandidate(val: number, cellText: string, rowIdx: number): boolean {
  if (isNaN(val) || val === null || val === undefined) return false;

  // Ignora anos e IDs de OS se forem inteiros grandes
  if (Number.isInteger(val) && val > 1900 && val < 2100) return false;
  if (Number.isInteger(val) && val > 5000 && val < 99999) return false;

  // Ignora constantes padrão
  if ([60, 115, 230, 216, 25, 80, 900].includes(val)) return false;

  // Valores de energia e potência típicos de ensaio
  return val > 0 && val <= 200;
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
    const maxCol = Math.max(worksheet.columnCount, 12);
    const matrix: (XlsxCellData | null)[][] = [];
    const colsWithCandidatesSet = new Set<string>();

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

        if (rawVal && typeof rawVal === 'object') {
          if ('formula' in rawVal) {
            formula = (rawVal as any).formula;
            rawVal = (rawVal as any).result ?? 0;
          } else if ('result' in rawVal) {
            rawVal = (rawVal as any).result;
          } else if ('text' in rawVal) {
            rawVal = (rawVal as any).text;
          }
        }

        displayVal = cell.text ? String(cell.text).trim() : (rawVal !== undefined && rawVal !== null ? String(rawVal) : '');
        
        let numVal = typeof rawVal === 'number' ? rawVal : parseFloat(displayVal.replace(',', '.'));
        const isNum = !isNaN(numVal) && isFinite(numVal) && displayVal.trim() !== '';

        const candidate = isNum && !formula ? isMeasurementCandidate(numVal, displayVal, r) : false;
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

  workbook.eachSheet((worksheet) => {
    const sheetName = worksheet.name;
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        const address = cell.address;

        if (targetAddresses && targetAddresses.length > 0 && !targetAddresses.includes(address)) {
          return;
        }

        let rawVal = cell.value;
        if (rawVal && typeof rawVal === 'object') {
          if ('formula' in rawVal) return;
          if ('result' in rawVal) rawVal = (rawVal as any).result;
        }

        const displayVal = cell.text ? String(cell.text).trim() : (rawVal !== null && rawVal !== undefined ? String(rawVal) : '');
        let numVal = typeof rawVal === 'number' ? rawVal : parseFloat(displayVal.replace(',', '.'));

        if (!isNaN(numVal) && isFinite(numVal) && isMeasurementCandidate(numVal, displayVal, rowNumber)) {
          // Fórmula estrita: val + (random * val * maxPercent / 100)
          const deltaMax = Math.abs(numVal) * (maxPercent / 100);
          const randomFactor = Math.random() * 2 - 1;
          const delta = randomFactor * deltaMax;
          let newVal = numVal + delta;
          newVal = Math.round(newVal * 100) / 100;

          cell.value = newVal;

          changes.push({
            address,
            sheetName,
            oldValue: numVal,
            newValue: newVal
          });
        }
      });
    });
  });

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
