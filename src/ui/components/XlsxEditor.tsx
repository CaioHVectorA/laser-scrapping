import React, { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import { parseXlsx, randomizeXlsx, listXlsxFiles, saveXlsxToServer, getOrders } from '../api.js';
import {
  FileSpreadsheet, Sparkles, Undo, Redo, Save, Upload, FolderOpen,
  Info, ChevronDown, Layers, CheckSquare, Square, Filter, BarChart3,
  FileText, Table, HardDrive, Download, Search, X, Check, ClipboardList
} from 'lucide-react';
import { MeasurementChart } from './MeasurementChart.js';
import { ReportDocumentView } from './ReportDocumentView.js';
import { applyFormulasToMatrix, generateValidRowMeasurements, detectRowColumnMap } from '../formulas.js';
import { applyOsSubstitutions, DbOrder } from '../osSubstitution.js';

interface XlsxCellData {
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

interface XlsxSheet {
  name: string;
  rowCount: number;
  colCount: number;
  cells: Record<string, XlsxCellData>;
  matrix: (XlsxCellData | null)[][];
  columnsWithCandidates: string[];
}

interface XlsxParsed {
  filePath: string;
  fileName: string;
  sheets: XlsxSheet[];
  measurementCellsCount: number;
}

interface HistoryState {
  parsedData: XlsxParsed;
  label: string;
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

function cloneParsedData(data: XlsxParsed): XlsxParsed {
  return {
    filePath: data.filePath,
    fileName: data.fileName,
    measurementCellsCount: data.measurementCellsCount,
    sheets: data.sheets.map((sheet) => ({
      name: sheet.name,
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
      columnsWithCandidates: [...sheet.columnsWithCandidates],
      cells: Object.fromEntries(
        Object.entries(sheet.cells).map(([k, v]) => [k, { ...v }])
      ),
      matrix: sheet.matrix.map((row) =>
        row.map((cell) => (cell ? { ...cell } : null))
      ),
    })),
  };
}

/**
 * Modifica o valor de uma célula diretamente no XML do xlsx, preservando tags de fórmula se existirem.
 */
function patchCellInXml(xml: string, address: string, value: number): string {
  const escapedAddr = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cellRegex = new RegExp(
    `(<c\\b[^>]*?\\br="${escapedAddr}"[^>]*?)(?:\\s*\\/>|\\s*>([\\s\\S]*?)<\\/c>)`,
    ''
  );
  const match = xml.match(cellRegex);
  if (!match) return xml;

  let openTag = match[1];
  const innerContent = match[2] || '';
  openTag = openTag.replace(/\s+t="[^"]*"/g, '');

  const formulaMatch = innerContent.match(/<f\b[^>]*?>[\s\S]*?<\/f>/);
  if (formulaMatch) {
    return xml.replace(cellRegex, `${openTag}>${formulaMatch[0]}<v>${value}</v></c>`);
  } else {
    return xml.replace(cellRegex, `${openTag}><v>${value}</v></c>`);
  }
}

export const XlsxEditor: React.FC = () => {
  const [parsedData, setParsedData] = useState<XlsxParsed | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [maxPercent, setMaxPercent] = useState(10);
  const [randomness, setRandomness] = useState(50);
  const [statusMsg, setStatusMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Seleções customizáveis do usuário
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [selectedSheetsForVariation, setSelectedSheetsForVariation] = useState<Set<string>>(new Set());

  const [availableFiles, setAvailableFiles] = useState<{ name: string; path: string }[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [docViewMode, setDocViewMode] = useState<'document' | 'raw'>('document');

  // Modal para Salvar no Servidor (com nome do modelo)
  const [showSaveServerModal, setShowSaveServerModal] = useState(false);
  const [saveModelName, setSaveModelName] = useState('');
  const [savingToServer, setSavingToServer] = useState(false);

  // Modal para Puxar Dados da OS
  const [showOsModal, setShowOsModal] = useState(false);
  const [osList, setOsList] = useState<DbOrder[]>([]);
  const [osSearch, setOsSearch] = useState('');
  const [loadingOs, setLoadingOs] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const workbookRef = useRef<ExcelJS.Workbook | null>(null);
  const originalBufferRef = useRef<ArrayBuffer | null>(null);
  const initialParsedDataRef = useRef<XlsxParsed | null>(null);

  const [historyStack, setHistoryStack] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    loadAvailableFiles();
  }, []);

  // Atualiza abas e colunas ativas ao carregar planilha
  useEffect(() => {
    if (parsedData?.sheets) {
      if (parsedData.sheets[activeSheetIndex]) {
        const activeSheet = parsedData.sheets[activeSheetIndex];
        setSelectedColumns(new Set(activeSheet.columnsWithCandidates || []));
      }
      if (selectedSheetsForVariation.size === 0) {
        setSelectedSheetsForVariation(new Set(parsedData.sheets.map(s => s.name)));
      }
    }
  }, [activeSheetIndex, parsedData]);

  // Teclas de atalho (Ctrl+Z / Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) { handleRedo(); } else { handleUndo(); }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, historyStack]);

  const loadAvailableFiles = async () => {
    try {
      const files = await listXlsxFiles();
      setAvailableFiles(files);
    } catch (err) {
      console.error('Erro ao listar arquivos:', err);
    }
  };

  const pushHistoryState = (newState: XlsxParsed, label: string) => {
    const cloned = cloneParsedData(newState);
    const newStack = historyStack.slice(0, historyIndex + 1);
    newStack.push({ parsedData: cloned, label });
    setHistoryStack(newStack);
    setHistoryIndex(newStack.length - 1);
    setParsedData(cloned);
  };

  // Carrega arquivo .xlsx do PC
  const handleFileUpload = async (file: File) => {
    setStatusMsg(`⏳ Lendo "${file.name}"...`);
    setShowFilePicker(false);

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Guarda buffer original para preservar gráficos na exportação
      originalBufferRef.current = arrayBuffer.slice(0);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      workbookRef.current = workbook;

      const parsed = parseWorkbookStructure(workbook, file.name, file.name);
      const clonedInitial = cloneParsedData(parsed);
      initialParsedDataRef.current = clonedInitial;
      setParsedData(cloneParsedData(parsed));
      setActiveSheetIndex(0);
      setHistoryStack([{ parsedData: clonedInitial, label: 'Planilha Carregada' }]);
      setHistoryIndex(0);
      setStatusMsg(`✅ Planilha "${file.name}" carregada (${parsed.sheets.length} páginas, ${parsed.measurementCellsCount} medições med1-medN).`);
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao ler planilha do computador: ${err?.message || String(err)}`);
    }
  };

  const parseWorkbookStructure = (workbook: ExcelJS.Workbook, fileName: string, filePath: string): XlsxParsed => {
    const sheets: XlsxSheet[] = [];
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
          let displayValue = '';
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
              displayValue = String(cell.text).trim();
            } else if (rawVal != null) {
              displayValue = String(rawVal);
            }
          } catch { displayValue = ''; }

          let numVal = typeof rawVal === 'number' ? rawVal : parseFloat(displayValue.replace(',', '.'));
          const isNum = !isNaN(numVal) && isFinite(numVal) && displayValue.trim() !== '';

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
            displayValue,
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

      // Aplica o recálculo automático de todas as fórmulas associadas às medições
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
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const loadXlsxFromOutput = async (filePath: string) => {
    setStatusMsg('⏳ Lendo planilha do servidor...');
    setShowFilePicker(false);
    try {
      const fileName = filePath.split(/[\\/]/).pop() || 'planilha.xlsx';
      const rawRes = await fetch(`http://localhost:3001/api/xlsx/raw?fileName=${encodeURIComponent(fileName)}`);

      if (rawRes.ok) {
        const arrayBuffer = await rawRes.arrayBuffer();
        originalBufferRef.current = arrayBuffer.slice(0);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        workbookRef.current = workbook;

        const parsed = parseWorkbookStructure(workbook, fileName, filePath);
        const clonedInitial = cloneParsedData(parsed);
        initialParsedDataRef.current = clonedInitial;
        setParsedData(cloneParsedData(parsed));
        setActiveSheetIndex(0);
        setHistoryStack([{ parsedData: clonedInitial, label: 'Planilha Inicial' }]);
        setHistoryIndex(0);
        setStatusMsg(`✅ "${fileName}" carregada com SUCESSO (${parsed.sheets.length} páginas, ${parsed.measurementCellsCount} medições).`);
      } else {
        const res = await parseXlsx(filePath);
        setParsedData(res);
        setActiveSheetIndex(0);
        setHistoryStack([{ parsedData: res, label: 'Planilha Inicial' }]);
        setHistoryIndex(0);
        setStatusMsg(`✅ "${res.fileName}" carregada com SUCESSO.`);
      }
    } catch (err: any) {
      setStatusMsg(`❌ Erro: ${err?.message || String(err)}`);
    }
  };

  // Alterna a seleção de uma coluna para variação
  const toggleColumnSelection = (colLetter: string) => {
    const next = new Set(selectedColumns);
    if (next.has(colLetter)) {
      next.delete(colLetter);
    } else {
      next.add(colLetter);
    }
    setSelectedColumns(next);
  };

  // Alterna individualmente a seleção de uma célula ao clicar nela na grade
  const toggleCellSelection = (sheetIdx: number, rowIdx: number, colIdx: number) => {
    if (!parsedData) return;
    const targetCell = parsedData.sheets[sheetIdx]?.matrix[rowIdx]?.[colIdx];
    if (!targetCell || !targetCell.isNumeric) return;

    const newSheets = parsedData.sheets.map((sheet, sIdx) => {
      if (sIdx !== sheetIdx) return sheet;
      const newMatrix = sheet.matrix.map((row, rIdx) => {
        if (rIdx !== rowIdx) return row;
        return row.map((cell, cIdx) => {
          if (cIdx !== colIdx || !cell) return cell;
          return {
            ...cell,
            isSelectedForVariation: !cell.isSelectedForVariation,
            isMeasurementCandidate: true
          };
        });
      });
      return { ...sheet, matrix: newMatrix };
    });

    const updated = { ...parsedData, sheets: newSheets };
    setParsedData(updated);
  };

  // Aplica a variação matemática garantindo estritamente a conformidade com os limites de tolerância (Tol. Min <= ERRO TOTAL <= tol Max)
  const handleRandomize = async () => {
    if (!parsedData) return;
    setStatusMsg(`⏳ Aplicando variação estrita (garantindo conformidade com os limites de tolerância)...`);

    let alteredCount = 0;

    try {
      if (workbookRef.current) {
        // Clona para garantir imutabilidade do histórico
        const nextParsed = cloneParsedData(parsedData);
        const activeSheet = nextParsed.sheets[activeSheetIndex];
        const worksheet = workbookRef.current.getWorksheet(activeSheet?.name);

        if (activeSheet) {
          const colMap = detectRowColumnMap(activeSheet.matrix);

          if (colMap) {
            // Mapeamento analítico: garante que o ERRO TOTAL recalculado fique rigorosamente dentro de [-20%, +20%]
            for (let r = colMap.headerRow; r < activeSheet.matrix.length; r++) {
              const row = activeSheet.matrix[r];
              if (!row) continue;

              const baseCell = row[colMap.colBase - 1];
              if (!baseCell) continue;
              const baseVal = typeof baseCell.value === 'number'
                ? baseCell.value
                : parseFloat(String(baseCell.displayValue || baseCell.value || '').replace(',', '.'));
              if (isNaN(baseVal) || baseVal <= 0) continue;

              // Coleta as medições atuais
              const currentMeds: number[] = [];
              const selectedIndicesSet = new Set<number>();

              colMap.colMeds.forEach((cIdx, idx) => {
                const cell = row[cIdx - 1];
                if (cell) {
                  const v = typeof cell.value === 'number'
                    ? cell.value
                    : parseFloat(String(cell.displayValue || '').replace(',', '.'));
                  currentMeds.push(!isNaN(v) ? v : baseVal);
                  if (cell.isSelectedForVariation && selectedColumns.has(cell.colLetter)) {
                    selectedIndicesSet.add(idx);
                  }
                }
              });

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

              // Gera medições garantindo que o ERRO TOTAL nunca ultrapasse a tolerância
              const validMeds = generateValidRowMeasurements(
                baseVal,
                currentMeds,
                maxPercent,
                selectedIndicesSet,
                sheetMedia,
                randomness,
                r,
                rowTolMax,
                rowTolMin
              );

              colMap.colMeds.forEach((cIdx, idx) => {
                if (selectedIndicesSet.has(idx)) {
                  const cell = row[cIdx - 1];
                  if (cell) {
                    const newVal = validMeds[idx];
                    cell.value = newVal;
                    cell.displayValue = String(newVal).replace('.', ',');

                    if (worksheet) {
                      try {
                        worksheet.getRow(r + 1).getCell(cIdx).value = newVal;
                      } catch {}
                    }
                    alteredCount++;
                  }
                }
              });
            }
          } else {
            // Fallback genérico caso a planilha tenha outro layout
            activeSheet.matrix.forEach((row) => {
              row.forEach((cellData) => {
                if (!cellData) return;
                const isColSelected = selectedColumns.has(cellData.colLetter);

                if (cellData.isNumeric && cellData.isSelectedForVariation && isColSelected) {
                  const val = cellData.value as number;
                  const deltaMax = Math.abs(val) * (maxPercent / 100);
                  const randomFactor = Math.random() * 2 - 1;
                  const delta = randomFactor * deltaMax;
                  let newVal = Math.round((val + delta) * 100) / 100;

                  cellData.value = newVal;
                  cellData.displayValue = String(newVal).replace('.', ',');

                  if (worksheet) {
                    try {
                      worksheet.getRow(cellData.row).getCell(cellData.col).value = newVal;
                    } catch {}
                  }
                  alteredCount++;
                }
              });
            });
          }

          // Recalcula todas as fórmulas dependentes (media, ERRO TOTAL, desvPadrao, incerteza, k, confianca, tendencia)
          applyFormulasToMatrix(activeSheet.matrix, worksheet);
        }

        pushHistoryState(nextParsed, `Variação ±${maxPercent}% (${alteredCount} células)`);
        setStatusMsg(`✨ ${alteredCount} medições variadas (±${maxPercent}%). Erro Total garantido dentro dos limites de tolerância.`);
      } else {
        // Fallback para arquivo do servidor
        const tempOutput = parsedData.filePath.replace(/\.xlsx$/i, '_temp_variado.xlsx');
        const result = await randomizeXlsx({
          filePath: parsedData.filePath,
          outputPath: tempOutput,
          maxPercent,
        });

        const updatedParsed = await parseXlsx(tempOutput);
        updatedParsed.filePath = parsedData.filePath;

        pushHistoryState(updatedParsed, `Variação ±${maxPercent}%`);
        setStatusMsg(`✨ ${result.changes?.length || 0} medições alteradas (±${maxPercent}%).`);
      }
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao aplicar variação: ${err?.message || String(err)}`);
    }
  };

  /**
   * Exporta preservando gráficos: usa JSZip para modificar apenas os valores
   * das células no XML original, sem reescrever o arquivo inteiro.
   */
  const exportWithChartPreservation = async (): Promise<ArrayBuffer> => {
    // @ts-ignore — jszip vem como dependência do exceljs
    const JSZip = (await import('jszip')).default || (await import('jszip'));
    const originalBuffer = originalBufferRef.current!;

    // Compara estado atual com estado inicial imutável para encontrar TODAS as células alteradas
    const originalParsed = initialParsedDataRef.current || historyStack[0]?.parsedData;
    const currentParsed = parsedData!;
    const changesBySheet = new Map<number, { address: string; newValue: number }[]>();

    let totalChangesCount = 0;

    for (let s = 0; s < currentParsed.sheets.length; s++) {
      const origSheet = originalParsed?.sheets[s];
      const currSheet = currentParsed.sheets[s];
      if (!currSheet) continue;
      const changes: { address: string; newValue: number }[] = [];

      for (let r = 0; r < currSheet.matrix.length; r++) {
        for (let c = 0; c < (currSheet.matrix[r]?.length || 0); c++) {
          const origCell = origSheet?.matrix[r]?.[c];
          const currCell = currSheet.matrix[r]?.[c];
          if (currCell && typeof currCell.value === 'number') {
            const origVal = origCell ? origCell.value : null;
            // Detecta se o valor numérico mudou
            if (origVal === null || origVal === undefined || Math.abs(currCell.value - Number(origVal)) > 0.0000001) {
              changes.push({ address: currCell.address, newValue: currCell.value });
              totalChangesCount++;
            }
          }
        }
      }
      if (changes.length > 0) changesBySheet.set(s, changes);
    }

    console.log(`[Export] Total de células modificadas a serem gravadas no XML: ${totalChangesCount}`);

    // Abre o zip original e aplica patches nas células modificadas
    const zip = new JSZip();
    await zip.loadAsync(originalBuffer);

    // Mapeamento de índice de planilha para caminho do arquivo XML no zip
    const sheetPaths: string[] = [];
    try {
      const wbXml = await zip.file('xl/workbook.xml')?.async('string');
      const wbRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
      if (wbXml && wbRelsXml) {
        const sheetMatches = [...wbXml.matchAll(/<sheet\s[^>]*?r:id="([^"]+)"[^>]*?>/g)];
        for (const match of sheetMatches) {
          const rId = match[1];
          const relMatch = wbRelsXml.match(new RegExp(`<Relationship\\s[^>]*?Id="${rId}"[^>]*?Target="([^"]+)"`));
          if (relMatch) {
            let target = relMatch[1];
            if (!target.startsWith('xl/')) {
              target = 'xl/' + target.replace(/^\//, '');
            }
            sheetPaths.push(target);
          }
        }
      }
    } catch {}

    for (const [sheetIdx, changes] of changesBySheet) {
      const sheetPath = sheetPaths[sheetIdx] || `xl/worksheets/sheet${sheetIdx + 1}.xml`;
      let sheetFile = zip.file(sheetPath);
      if (!sheetFile) {
        const fallbackKey = Object.keys(zip.files).find(k => k.endsWith(`sheet${sheetIdx + 1}.xml`));
        if (fallbackKey) sheetFile = zip.file(fallbackKey);
      }
      if (!sheetFile) continue;

      let xml = await sheetFile.async('string');
      for (const change of changes) {
        xml = patchCellInXml(xml, change.address, change.newValue);
      }
      zip.file(sheetFile.name, xml);
    }

    return zip.generateAsync({ type: 'arraybuffer' });
  };

  // Exporta a planilha modificada para download
  const handleExportFile = async () => {
    if (!parsedData) return;
    setStatusMsg('⏳ Gerando arquivo .xlsx para download...');

    try {
      let buffer: Uint8Array | ArrayBuffer;

      if (originalBufferRef.current && historyStack.length > 0) {
        // Exportação com preservação de gráficos via JSZip
        buffer = await exportWithChartPreservation();
      } else if (workbookRef.current) {
        // Fallback sem buffer original
        buffer = await workbookRef.current.xlsx.writeBuffer();
      } else {
        const res = await fetch(`http://localhost:3001/api/xlsx/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: parsedData.filePath }),
        });
        const blobData = await res.blob();
        buffer = await blobData.arrayBuffer();
      }

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `modificado_${parsedData.fileName}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMsg(`🎉 Planilha "modificado_${parsedData.fileName}" exportada com gráficos preservados!`);
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao exportar: ${err?.message || String(err)}`);
    }
  };

  const handleSaveToServer = async () => {
    if (!parsedData || !saveModelName.trim()) return;
    setSavingToServer(true);
    setStatusMsg('⏳ Salvando modelo no servidor...');

    try {
      let buffer: Uint8Array | ArrayBuffer;
      if (originalBufferRef.current && historyStack.length > 0) {
        buffer = await exportWithChartPreservation();
      } else if (workbookRef.current) {
        buffer = await workbookRef.current.xlsx.writeBuffer();
      } else if (parsedData) {
        const wb = new ExcelJS.Workbook();
        parsedData.sheets.forEach((s) => {
          const ws = wb.addWorksheet(s.name);
          s.matrix.forEach((row) => {
            ws.addRow(row.map((c) => c?.value ?? ''));
          });
        });
        buffer = await wb.xlsx.writeBuffer();
      } else {
        throw new Error('Nenhum dado de planilha disponível para salvar.');
      }

      const uint8 = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize) as unknown as number[]);
      }
      const base64 = btoa(binary);

      const fileName = saveModelName.endsWith('.xlsx') ? saveModelName : `${saveModelName}.xlsx`;
      const res = await saveXlsxToServer(fileName, base64);

      setStatusMsg(`✅ Modelo "${res.name}" salvo com sucesso no servidor em output/!`);
      setShowSaveServerModal(false);
      await loadAvailableFiles();
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao salvar no servidor: ${err?.message || String(err)}`);
    } finally {
      setSavingToServer(false);
    }
  };

  const openOsModal = async () => {
    setShowOsModal(true);
    if (osList.length === 0) {
      setLoadingOs(true);
      try {
        const res = await getOrders({ limit: 100 });
        setOsList(res.items || []);
      } catch (err: any) {
        setStatusMsg(`❌ Erro ao buscar Ordens de Serviço: ${err?.message || String(err)}`);
      } finally {
        setLoadingOs(false);
      }
    }
  };

  const handleApplyOsSubstitution = (order: DbOrder) => {
    if (!parsedData) return;
    try {
      const result = applyOsSubstitutions(parsedData, order, workbookRef.current);
      pushHistoryState(result.updatedParsedData, `Substituição OS #${order.id}`);
      setStatusMsg(`✅ Dados da OS #${order.id} aplicados (${result.replacedCount} campos substituídos: Contratante, Técnico, Nº de Série, Datas e OS)!`);
      setShowOsModal(false);
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao aplicar dados da OS: ${err?.message || String(err)}`);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      const targetState = cloneParsedData(historyStack[prevIdx].parsedData);
      setHistoryIndex(prevIdx);
      setParsedData(targetState);

      // Sincroniza o workbook em memória
      if (workbookRef.current) {
        targetState.sheets.forEach((sheet) => {
          const ws = workbookRef.current?.getWorksheet(sheet.name);
          if (ws) {
            sheet.matrix.forEach((row) => {
              row.forEach((cell) => {
                if (cell && typeof cell.value === 'number') {
                  try {
                    ws.getRow(cell.row).getCell(cell.col).value = cell.value;
                  } catch {}
                }
              });
            });
          }
        });
      }

      setStatusMsg(`↩ Desfeito para: "${historyStack[prevIdx].label}"`);
    }
  };

  const handleRedo = () => {
    if (historyIndex < historyStack.length - 1) {
      const nextIdx = historyIndex + 1;
      const targetState = cloneParsedData(historyStack[nextIdx].parsedData);
      setHistoryIndex(nextIdx);
      setParsedData(targetState);

      // Sincroniza o workbook em memória
      if (workbookRef.current) {
        targetState.sheets.forEach((sheet) => {
          const ws = workbookRef.current?.getWorksheet(sheet.name);
          if (ws) {
            sheet.matrix.forEach((row) => {
              row.forEach((cell) => {
                if (cell && typeof cell.value === 'number') {
                  try {
                    ws.getRow(cell.row).getCell(cell.col).value = cell.value;
                  } catch {}
                }
              });
            });
          }
        });
      }

      setStatusMsg(`↪ Refeito para: "${historyStack[nextIdx].label}"`);
    }
  };

  const activeSheet = parsedData?.sheets?.[activeSheetIndex];
  const columnsWithCandidates = activeSheet?.columnsWithCandidates || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx, .xls"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* Top Toolbar */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> Adicionar Planilha do Computador
          </button>

          <button className="btn btn-secondary" onClick={() => { loadAvailableFiles(); setShowFilePicker(!showFilePicker); }}>
            <FolderOpen size={16} /> Servidor <ChevronDown size={14} />
          </button>

          {showFilePicker && (
            <div style={{ position: 'absolute', top: '100%', left: '160px', marginTop: '6px', backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', zIndex: 99, minWidth: '280px', maxHeight: '250px', overflowY: 'auto', boxShadow: '0 12px 32px rgba(0,0,0,0.8)' }}>
              {availableFiles.length === 0 ? (
                <div style={{ padding: '12px 16px', fontSize: '0.83rem', color: '#a1a1aa' }}>
                  Nenhum arquivo .xlsx encontrado no servidor
                </div>
              ) : (
                availableFiles.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => loadXlsxFromOutput(f.path)}
                    style={{ display: 'block', width: '100%', padding: '10px 16px', fontSize: '0.83rem', color: '#f4f4f5', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid #27272a', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = '#27272a'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  >
                    📄 {f.name}
                  </button>
                ))
              )}
            </div>
          )}

          {parsedData && (
            <div style={{ fontSize: '0.83rem', color: '#a1a1aa' }}>
              Arquivo: <strong style={{ color: '#ffffff' }}>{parsedData.fileName}</strong> ({parsedData.sheets.length} páginas)
            </div>
          )}
        </div>

        {/* Controls */}
        {parsedData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {activeSheetIndex === 0 ? (
              /* Controles específicos da 1ª Página (Documento A4) */
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(37, 99, 235, 0.15)',
                  border: '1px solid rgba(37, 99, 235, 0.3)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  color: '#60a5fa',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}>
                  <FileText size={15} /> 1ª Página: Certificado / Laudo
                </div>

                <div style={{ display: 'flex', backgroundColor: '#09090b', padding: '2px', borderRadius: '6px', border: '1px solid #27272a' }}>
                  <button
                    className="btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      backgroundColor: docViewMode === 'document' ? '#2563eb' : 'transparent',
                      color: docViewMode === 'document' ? '#ffffff' : '#a1a1aa',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={() => setDocViewMode('document')}
                    title="Visualizar formatado como Laudo / Certificado A4"
                  >
                    <FileText size={13} /> Laudo A4
                  </button>
                  <button
                    className="btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      backgroundColor: docViewMode === 'raw' ? '#27272a' : 'transparent',
                      color: docViewMode === 'raw' ? '#ffffff' : '#a1a1aa',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={() => setDocViewMode('raw')}
                    title="Visualizar grade de células original"
                  >
                    <Table size={13} /> Grade Bruta
                  </button>
                </div>

                <button
                  className="btn btn-secondary"
                  style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)', color: '#60a5fa' }}
                  onClick={openOsModal}
                  title="Puxar dados de uma OS e preencher Contratante, Técnico, Séries, Datas e OS"
                >
                  <ClipboardList size={15} /> Puxar Dados da OS
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSaveModelName(parsedData.fileName.replace(/\.xlsx$/i, ''));
                    setShowSaveServerModal(true);
                  }}
                  title="Salvar como modelo no disco do servidor"
                >
                  <HardDrive size={15} /> Salvar no Servidor
                </button>

                <button className="btn btn-primary" style={{ backgroundColor: '#10b981', color: '#ffffff' }} onClick={handleExportFile}>
                  <Download size={15} /> Exportar XLSX
                </button>
              </div>
            ) : (
              /* Controles de Variação para Abas de Medição (3Hz, 5Hz, etc) */
              <>
                {/* Slider 1: Variação % */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#09090b', padding: '4px 10px', borderRadius: '6px', border: '1px solid #27272a' }}>
                  <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: '500' }}>
                    Variação: <strong style={{ color: '#ffffff' }}>±{maxPercent}%</strong>
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="25"
                    value={maxPercent}
                    onChange={(e) => setMaxPercent(parseInt(e.target.value, 10))}
                    style={{ width: '70px', accentColor: '#3b82f6' }}
                    title="Porcentagem máxima de variação em torno da base"
                  />
                </div>

                {/* Slider 2: Randomização / Dispersão */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#09090b', padding: '4px 10px', borderRadius: '6px', border: '1px solid #27272a' }}>
                  <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: '500' }}>
                    Dispersão: <strong style={{ color: '#ffffff' }}>{randomness}%</strong>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={randomness}
                    onChange={(e) => setRandomness(parseInt(e.target.value, 10))}
                    style={{ width: '70px', accentColor: '#10b981' }}
                    title="0% = onda suave / harmônica, 100% = dispersão aleatória / ruído"
                  />
                </div>

                <button className="btn btn-amber" onClick={handleRandomize}>
                  <Sparkles size={16} /> Variar Medições
                </button>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={handleUndo} disabled={historyIndex <= 0} title="Desfazer (Ctrl+Z)">
                    <Undo size={15} /> Desfazer
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={handleRedo} disabled={historyIndex >= historyStack.length - 1} title="Refazer (Ctrl+Y)">
                    <Redo size={15} /> Refazer
                  </button>
                </div>

                <button className="btn btn-secondary" onClick={() => setShowChart(!showChart)} title="Mostrar/ocultar gráfico">
                  <BarChart3 size={15} /> {showChart ? 'Ocultar' : 'Ver'} Gráfico
                </button>

                <button
                  className="btn btn-secondary"
                  style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)', color: '#60a5fa' }}
                  onClick={openOsModal}
                  title="Puxar dados de uma OS e preencher Contratante, Técnico, Séries, Datas e OS"
                >
                  <ClipboardList size={15} /> Puxar OS
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSaveModelName(parsedData.fileName.replace(/\.xlsx$/i, ''));
                    setShowSaveServerModal(true);
                  }}
                  title="Salvar como modelo no disco do servidor"
                >
                  <HardDrive size={15} /> Salvar no Servidor
                </button>

                <button className="btn btn-primary" style={{ backgroundColor: '#10b981', color: '#ffffff' }} onClick={handleExportFile}>
                  <Download size={15} /> Exportar XLSX
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Status Bar */}
      {statusMsg && (
        <div style={{ backgroundColor: '#09090b', border: '1px solid #27272a', padding: '8px 14px', borderRadius: '6px', fontSize: '0.82rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={15} /> {statusMsg}
        </div>
      )}

      {/* Column Selection Toolbar (apenas para abas numéricas de medição) */}
      {activeSheetIndex > 0 && activeSheet && columnsWithCandidates.length > 0 && (
        <div style={{ backgroundColor: '#141417', border: '1px solid #27272a', borderRadius: '6px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} color="#fbbf24" /> Seleção de Colunas para Variação:
          </span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {columnsWithCandidates.map((colLetter) => {
              const isSelected = selectedColumns.has(colLetter);
              return (
                <button
                  key={colLetter}
                  onClick={() => toggleColumnSelection(colLetter)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 10px',
                    fontSize: '0.75rem',
                    borderRadius: '4px',
                    border: isSelected ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid #27272a',
                    backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.15)' : '#09090b',
                    color: isSelected ? '#fbbf24' : '#71717a',
                    cursor: 'pointer',
                    fontWeight: isSelected ? '600' : '400'
                  }}
                >
                  {isSelected ? <CheckSquare size={13} /> : <Square size={13} />} Coluna {colLetter}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: '0.73rem', color: '#71717a', marginLeft: 'auto' }}>
            * Clique nas colunas acima ou direto em uma célula para marcar/desmarcar
          </span>
        </div>
      )}

      {/* Main Spreadsheet Container */}
      {!parsedData ? (
        <div
          className={`dropzone-box ${isDragging ? 'dragging' : ''}`}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <FileSpreadsheet size={54} color={isDragging ? '#10b981' : '#fafafa'} />
          <div>
            <h3 style={{ color: '#ffffff', fontSize: '1.1rem', marginBottom: '4px' }}>
              {isDragging ? 'Solte o arquivo XLSX aqui' : 'Adicione uma planilha do seu computador'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
              Arraste ou selecione qualquer arquivo <strong>.xlsx</strong> para variar os dados de frequência e medição.
            </p>
          </div>
          <button className="btn btn-primary" style={{ marginTop: '8px' }}>
            <Upload size={16} /> Selecionar Arquivo XLSX
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', overflow: 'hidden' }}>
          
          {/* VISUALIZAÇÃO: DOCUMENTO A4 vs GRADE COM GRÁFICO SIDE-BY-SIDE */}
          {activeSheetIndex === 0 && docViewMode === 'document' ? (
            /* Modo Documento A4 Human-Readable para a 1ª Página */
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', backgroundColor: '#09090b', width: '100%', display: 'flex', justifyContent: 'center' }}>
              {activeSheet && (
                <ReportDocumentView
                  sheet={activeSheet}
                  workbookRef={workbookRef.current}
                  onCellChange={(addr, val) => {
                    if (activeSheet && activeSheet.cells[addr]) {
                      activeSheet.cells[addr].displayValue = val;
                      activeSheet.cells[addr].value = val;
                    }
                  }}
                />
              )}
            </div>
          ) : (
            /* Side-by-Side: Tabela à Esquerda (altura cheia) e Gráfico à Direita */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
              <div style={{
                flex: showChart && activeSheetIndex > 0 ? '1 1 58%' : '1 1 100%',
                overflow: 'auto',
                borderRight: showChart && activeSheetIndex > 0 ? '1px solid #27272a' : 'none',
                height: '100%'
              }}>
                {activeSheet && (
                  <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '45px', textAlign: 'center', backgroundColor: '#09090b', color: '#71717a', borderRight: '1px solid #27272a' }}>#</th>
                          {Array.from({ length: activeSheet.colCount }).map((_, c) => {
                            const letter = getColLetter(c + 1);
                            const isColActive = selectedColumns.has(letter);
                            return (
                              <th key={c} style={{
                                textAlign: 'center',
                                minWidth: '95px',
                                backgroundColor: isColActive ? 'rgba(245, 158, 11, 0.08)' : '#09090b',
                                color: isColActive ? '#fbbf24' : '#a1a1aa',
                                borderRight: '1px solid #27272a'
                              }}>
                                {letter}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {activeSheet.matrix.slice(0, Math.min(activeSheet.matrix.length, 60)).map((row, rIdx) => (
                          <tr key={rIdx}>
                            <td style={{ textAlign: 'center', fontWeight: '600', color: '#71717a', backgroundColor: '#09090b', borderRight: '1px solid #27272a', borderBottom: '1px solid #27272a' }}>
                              {rIdx + 1}
                            </td>
                            {row.map((cell, cIdx) => {
                              const isColActive = cell ? selectedColumns.has(cell.colLetter) : false;
                              const isTargetCell = cell?.isNumeric && cell?.isSelectedForVariation && isColActive;

                              return (
                                <td
                                  key={cIdx}
                                  onClick={() => toggleCellSelection(activeSheetIndex, rIdx, cIdx)}
                                  style={{
                                    backgroundColor: isTargetCell ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                                    color: isTargetCell ? '#fbbf24' : '#f4f4f5',
                                    fontWeight: isTargetCell ? '600' : '400',
                                    borderRight: '1px solid #27272a',
                                    borderBottom: '1px solid #27272a',
                                    fontSize: '0.81rem',
                                    padding: '7px 12px',
                                    cursor: cell?.isNumeric ? 'pointer' : 'default'
                                  }}
                                  title={cell?.isNumeric ? 'Clique para marcar/desmarcar variação desta célula' : undefined}
                                >
                                  {cell?.displayValue || ''}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Painel do Gráfico à Direita (apenas em abas de medição > 0) */}
              {activeSheetIndex > 0 && showChart && activeSheet && (
                <div style={{
                  flex: '0 0 42%',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: '#09090b',
                  overflowY: 'auto',
                  padding: '16px',
                  boxSizing: 'border-box'
                }}>
                  <MeasurementChart
                    sheetData={activeSheet}
                    frequencyLabel={activeSheet.name}
                  />
                </div>
              )}
            </div>
          )}

          {/* Bottom Sheet Tabs Bar (Google Sheets Style) */}
          <div className="sheets-tabs-bar">
            <div style={{ display: 'flex', alignItems: 'center', paddingRight: '8px', color: '#71717a' }}>
              <Layers size={15} />
            </div>

            {parsedData.sheets.map((sheet, idx) => (
              <div
                key={sheet.name}
                onClick={() => setActiveSheetIndex(idx)}
                className={`sheet-tab-item ${activeSheetIndex === idx ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderBottom: activeSheetIndex === idx ? (idx === 0 ? '2px solid #2563eb' : '2px solid #fbbf24') : 'none'
                }}
              >
                <span>{idx === 0 ? '📄' : '📊'}</span>
                <span>{idx === 0 ? `${sheet.name} (Laudo A4)` : sheet.name}</span>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* Modal: Salvar Modelo no Servidor (em disco) */}
      {showSaveServerModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '12px',
            padding: '24px',
            width: '460px',
            maxWidth: '92%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f4f4f5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HardDrive size={18} color="#3b82f6" /> Salvar Modelo no Servidor
              </h3>
              <button
                onClick={() => setShowSaveServerModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: '#a1a1aa', marginBottom: '16px', lineHeight: 1.5 }}>
              O modelo será gravado em disco no servidor (pasta <code>output/</code>) com todas as fórmulas, dados e gráficos intactos.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#d4d4d8', marginBottom: '6px' }}>
                Nome do Modelo / Arquivo:
              </label>
              <input
                type="text"
                value={saveModelName}
                onChange={(e) => setSaveModelName(e.target.value)}
                placeholder="ex: modelo_calibracao_v1"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#09090b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  color: '#f4f4f5',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveToServer(); }}
                onFocus={(e) => e.target.select()}
                autoFocus
              />
              <span style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px', display: 'block' }}>
                Extensão <code>.xlsx</code> será adicionada automaticamente se omitida.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowSaveServerModal(false)}
                disabled={savingToServer}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: '#2563eb' }}
                onClick={handleSaveToServer}
                disabled={savingToServer || !saveModelName.trim()}
              >
                {savingToServer ? 'Gravando em disco...' : 'Salvar no Servidor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Puxar Dados da OS */}
      {showOsModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '12px',
            padding: '24px',
            width: '760px',
            maxWidth: '95%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f4f4f5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={18} color="#60a5fa" /> Puxar Dados de Ordem de Serviço (OS)
              </h3>
              <button
                onClick={() => setShowOsModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: '#a1a1aa', marginBottom: '14px', lineHeight: 1.4 }}>
              Selecione uma Ordem de Serviço cadastrada no sistema. O sistema substituirá automaticamente os dados de:
              <strong style={{ color: '#e4e4e7' }}> Contratante, Laboratório e Técnico, Números de Série, Datas e Ordens de Serviço</strong>.
            </p>

            {/* Campo de Busca */}
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
              <input
                type="text"
                value={osSearch}
                onChange={(e) => setOsSearch(e.target.value)}
                placeholder="Buscar por número da OS, cliente, equipamento ou técnico..."
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  backgroundColor: '#09090b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  color: '#f4f4f5',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Lista de Ordens de Serviço */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {loadingOs ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#a1a1aa', fontSize: '0.9rem' }}>
                  ⏳ Carregando Ordens de Serviço do banco de dados...
                </div>
              ) : osList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#71717a', fontSize: '0.85rem' }}>
                  Nenhuma Ordem de Serviço encontrada no banco de dados. Execute o Scraper para coletar OSs.
                </div>
              ) : (
                osList
                  .filter((os) => {
                    if (!osSearch.trim()) return true;
                    const q = osSearch.toLowerCase();
                    return (
                      String(os.id).toLowerCase().includes(q) ||
                      (os.cliente_nome && os.cliente_nome.toLowerCase().includes(q)) ||
                      (os.equipamento_modelo && os.equipamento_modelo.toLowerCase().includes(q)) ||
                      (os.tecnico_responsavel && os.tecnico_responsavel.toLowerCase().includes(q)) ||
                      (os.equipamento_codigo && os.equipamento_codigo.toLowerCase().includes(q))
                    );
                  })
                  .map((os) => (
                    <div
                      key={os.id}
                      style={{
                        backgroundColor: '#09090b',
                        border: '1px solid #27272a',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        transition: 'border-color 0.2s',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#3b82f6'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#27272a'; }}
                      onClick={() => handleApplyOsSubstitution(os)}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, color: '#60a5fa', fontSize: '0.9rem' }}>
                            OS #{os.id}
                          </span>
                          {os.situacao && (
                            <span style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(59, 130, 246, 0.1)',
                              color: '#93c5fd',
                              fontWeight: 500
                            }}>
                              {os.situacao}
                            </span>
                          )}
                          {os.data_entrada && (
                            <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                              Entrada: {os.data_entrada}
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.84rem', color: '#f4f4f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <strong style={{ color: '#a1a1aa' }}>Cliente: </strong>
                          {os.cliente_nome || 'Não informado'}
                        </div>

                        <div style={{ fontSize: '0.78rem', color: '#a1a1aa', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <span>
                            <strong>Equipamento: </strong>
                            {os.equipamento_modelo || 'Laser UroPulse'} {os.equipamento_codigo ? `(S/N: ${os.equipamento_codigo})` : ''}
                          </span>
                          <span>
                            <strong>Técnico: </strong>
                            {os.tecnico_responsavel || 'Roberto Aldilei Favoreto'}
                          </span>
                        </div>
                      </div>

                      <button
                        className="btn btn-primary"
                        style={{ padding: '6px 14px', fontSize: '0.78rem', whiteSpace: 'nowrap', backgroundColor: '#2563eb' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyOsSubstitution(os);
                        }}
                      >
                        <Check size={14} /> Aplicar nesta Planilha
                      </button>
                    </div>
                  ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #27272a' }}>
              <button className="btn btn-secondary" onClick={() => setShowOsModal(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
