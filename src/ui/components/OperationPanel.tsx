import React, { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import {
  Search,
  Upload,
  FileSpreadsheet,
  Zap,
  CheckCircle2,
  RefreshCw,
  Clock,
  LayoutTemplate,
  Sparkles,
  Info,
  Building2,
  UserCheck,
  Hash,
  Calendar,
  FileText,
  CheckSquare,
  Square,
  Filter,
  BarChart3,
  SlidersHorizontal,
  Waves,
  Printer,
  Settings2,
  FolderOpen,
  Plus,
  X,
  Columns
} from 'lucide-react';

import { parseXlsx, listXlsxFiles, randomizeXlsx } from '../api.js';
import { XlsxParsed, XlsxSheet, XlsxCellData } from '../types.js';
import {
  applyFormulasToMatrix,
  generateValidRowMeasurements,
  detectRowColumnMap,
  VariationMode,
  DEFAULT_MEDLASER_PRESET,
  CustomLayoutPreset
} from '../formulas.js';
import { DbOrder, applyOsSubstitutions, SubstitutionDiffItem, formatDateExtenso } from '../osSubstitution.js';
import { getRecentFiles, saveRecentFile, getTemplates, saveTemplate, RecentItem, TemplateItem } from '../storage.js';
import { MeasurementChart } from './MeasurementChart.js';
import { ReportDocumentView } from './ReportDocumentView.js';

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
    sheets: data.sheets.map((sheet: XlsxSheet) => ({
      name: sheet.name,
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
      columnsWithCandidates: [...sheet.columnsWithCandidates],
      cells: Object.fromEntries(
        Object.entries(sheet.cells).map(([k, v]) => [k, { ...v }])
      ),
      matrix: sheet.matrix.map((row: (XlsxCellData | null)[]) =>
        row.map((cell: XlsxCellData | null) => (cell ? { ...cell } : null))
      ),
    })),
  };
}

export const OperationPanel: React.FC = () => {
  // ── OS Database State ──
  const [osSearchQuery, setOsSearchQuery] = useState('');
  const [osList, setOsList] = useState<DbOrder[]>([]);
  const [selectedOs, setSelectedOs] = useState<DbOrder | null>(null);
  const [isSearchingOs, setIsSearchingOs] = useState(false);
  const [showOsDropdown, setShowOsDropdown] = useState(false);

  // ── Spreadsheet State ──
  const [parsedData, setParsedData] = useState<XlsxParsed | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(1);
  const [maxPercent, setMaxPercent] = useState(10);
  const [statusMsg, setStatusMsg] = useState('');
  const [substitutionDiffs, setSubstitutionDiffs] = useState<SubstitutionDiffItem[]>([]);
  const [isOsSubstituted, setIsOsSubstituted] = useState(false);

  // ── Customizable Selection & Curve Variation State ──
  const [selectedSheetsForVariation, setSelectedSheetsForVariation] = useState<Set<string>>(new Set());
  const [selectedColumnsForVariation, setSelectedColumnsForVariation] = useState<Set<string>>(new Set());
  const [variationMode, setVariationMode] = useState<VariationMode>('wobble');
  const [activeViewTab, setActiveViewTab] = useState<'editor' | 'report_pdf' | 'preset_config'>('editor');
  const [customPreset, setCustomPreset] = useState<CustomLayoutPreset>(DEFAULT_MEDLASER_PRESET);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [manualColInput, setManualColInput] = useState('');

  // Identifica todas as colunas que possuem dados numéricos ou cabeçalhos nas abas de medição
  const getAvailableDataColumns = (): { letter: string; colIdx: number; headerName: string; count: number }[] => {
    if (!parsedData?.sheets) return [];
    const sheetsToScan = parsedData.sheets.filter((_, idx) => idx > 0 || parsedData.sheets.length === 1);
    const colStats: Record<string, { letter: string; colIdx: number; headerName: string; count: number }> = {};

    sheetsToScan.forEach(sheet => {
      // Procura linha de cabeçalho
      const headerRow = sheet.matrix.slice(0, 15).find(row =>
        row.some(cell => cell && /^(base|tol|med1|erro)/i.test(String(cell.displayValue || cell.value || '')))
      );

      for (let c = 1; c <= Math.min(sheet.colCount, 26); c++) {
        const letter = getColLetter(c);
        let headerText = '';
        if (headerRow && headerRow[c - 1]) {
          headerText = String(headerRow[c - 1]?.displayValue || headerRow[c - 1]?.value || '').trim();
        }

        let numCount = 0;
        for (let r = 0; r < sheet.matrix.length; r++) {
          const cell = sheet.matrix[r]?.[c - 1];
          if (cell && cell.isNumeric && cell.value !== '' && cell.value !== null) {
            numCount++;
          }
        }

        if (numCount > 0 || headerText) {
          if (!colStats[letter]) {
            colStats[letter] = {
              letter,
              colIdx: c,
              headerName: headerText,
              count: numCount
            };
          } else {
            colStats[letter].count += numCount;
            if (!colStats[letter].headerName && headerText) {
              colStats[letter].headerName = headerText;
            }
          }
        }
      }
    });

    return Object.values(colStats).sort((a, b) => a.colIdx - b.colIdx);
  };

  // ── Storage State ──
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [availableServerFiles, setAvailableServerFiles] = useState<{ name: string; path: string }[]>([]);

  // ── Refs ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workbookRef = useRef<ExcelJS.Workbook | null>(null);
  const originalBufferRef = useRef<ArrayBuffer | null>(null);
  const initialParsedDataRef = useRef<XlsxParsed | null>(null);

  // Initial load
  useEffect(() => {
    loadOrders('');
    setRecents(getRecentFiles());
    setTemplates(getTemplates());
    loadServerFiles();
  }, []);

  // Sync available sheet checkboxes & column checkboxes when spreadsheet loads
  useEffect(() => {
    if (parsedData?.sheets) {
      // By default select all sheets containing measurement columns (except Sheet 0 which is the report/certificate)
      const freqSheets = parsedData.sheets
        .filter((_, idx) => idx > 0 || parsedData.sheets.length === 1)
        .map(s => s.name);
      setSelectedSheetsForVariation(new Set(freqSheets));

      // Collect all candidate columns
      const allCandidateCols = new Set<string>();
      parsedData.sheets.forEach(s => {
        (s.columnsWithCandidates || []).forEach(c => allCandidateCols.add(c));
      });
      if (allCandidateCols.size === 0) {
        ['F', 'G', 'H', 'I', 'J'].forEach(c => allCandidateCols.add(c));
      }
      setSelectedColumnsForVariation(allCandidateCols);
    }
  }, [parsedData]);

  const loadServerFiles = async () => {
    try {
      const files = await listXlsxFiles();
      setAvailableServerFiles(files);
    } catch {}
  };

  const loadOrders = async (query: string) => {
    setIsSearchingOs(true);
    try {
      const res = await fetch(`http://localhost:3001/api/orders?search=${encodeURIComponent(query)}&limit=15`);
      if (res.ok) {
        const data = await res.json();
        setOsList(data.items || []);
      }
    } catch (err) {
      console.error('Erro ao carregar OSs:', err);
    } finally {
      setIsSearchingOs(false);
    }
  };

  const handleOsSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOsSearchQuery(val);
    setShowOsDropdown(true);
    loadOrders(val);
  };

  const handleSelectOs = (os: DbOrder) => {
    setSelectedOs(os);
    setOsSearchQuery(`OS #${os.id} - ${os.cliente_nome || ''}`);
    setShowOsDropdown(false);
    setIsOsSubstituted(false);
    setSubstitutionDiffs([]);
    setStatusMsg(`✅ Ordem de Serviço #${os.id} selecionada (${os.cliente_nome || 'Cliente'}).`);

    // Auto-apply OS substitutions if spreadsheet is loaded
    if (parsedData) {
      try {
        const res = applyOsSubstitutions(parsedData, os, workbookRef.current);
        setParsedData(res.updatedParsedData);
        setSubstitutionDiffs(res.diffs);
        setIsOsSubstituted(true);
      } catch {}
    }
  };

  // ── File Upload Handler ──
  const handleFileUpload = async (file: File) => {
    setStatusMsg(`⏳ Lendo "${file.name}"...`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      originalBufferRef.current = arrayBuffer.slice(0);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      workbookRef.current = workbook;

      const parsed = parseWorkbookStructure(workbook, file.name, file.name);
      const clonedInitial = cloneParsedData(parsed);
      initialParsedDataRef.current = clonedInitial;
      setParsedData(clonedInitial);
      setIsOsSubstituted(false);
      setSubstitutionDiffs([]);

      if (selectedOs) {
        try {
          const res = applyOsSubstitutions(clonedInitial, selectedOs, workbook);
          setParsedData(res.updatedParsedData);
          setSubstitutionDiffs(res.diffs);
          setIsOsSubstituted(true);
        } catch {}
      }

      const updatedRecents = saveRecentFile({
        fileName: file.name,
        osId: selectedOs?.id,
        clienteNome: selectedOs?.cliente_nome,
        sheetsCount: parsed.sheets.length,
      });
      setRecents(updatedRecents);

      setStatusMsg(`✅ Planilha "${file.name}" carregada (${parsed.sheets.length} abas).`);
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao carregar planilha: ${err?.message || String(err)}`);
    }
  };

  const loadXlsxFromServer = async (filePath: string) => {
    setStatusMsg('⏳ Lendo planilha do servidor...');
    try {
      const res = await parseXlsx(filePath);
      setParsedData(res);
      setIsOsSubstituted(false);
      setSubstitutionDiffs([]);

      if (selectedOs) {
        try {
          const subRes = applyOsSubstitutions(res, selectedOs, workbookRef.current);
          setParsedData(subRes.updatedParsedData);
          setSubstitutionDiffs(subRes.diffs);
          setIsOsSubstituted(true);
        } catch {}
      }

      const updatedRecents = saveRecentFile({
        fileName: res.fileName,
        osId: selectedOs?.id,
        clienteNome: selectedOs?.cliente_nome,
        sheetsCount: res.sheets.length,
      });
      setRecents(updatedRecents);

      setStatusMsg(`✅ Planilha "${res.fileName}" carregada do servidor.`);
    } catch (err: any) {
      setStatusMsg(`❌ Erro: ${err?.message || String(err)}`);
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

      const medColIndices = new Set<number>();
      let headerRow = -1;

      for (let scanR = 1; scanR <= Math.min(maxRow, 25); scanR++) {
        const scanRow = worksheet.getRow(scanR);
        for (let scanC = 1; scanC <= maxCol; scanC++) {
          const scanCell = scanRow.getCell(scanC);
          let cellText = '';
          try { cellText = (scanCell.text || String(scanCell.value || '')).trim(); } catch { cellText = ''; }
          if (/^med\d+$/i.test(cellText)) {
            medColIndices.add(scanC);
            if (headerRow === -1) headerRow = scanR;
          }
        }
        if (medColIndices.size > 0) break;
      }

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
            if (cell.text != null) displayValue = String(cell.text).trim();
            else if (rawVal != null) displayValue = String(rawVal);
          } catch { displayValue = ''; }

          let numVal = typeof rawVal === 'number' ? rawVal : parseFloat(displayValue.replace(',', '.'));
          const isNum = !isNaN(numVal) && isFinite(numVal) && displayValue.trim() !== '';

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

  // ── Sheet & Column Checkbox Helpers ──
  const toggleSheetForVariation = (sheetName: string) => {
    const next = new Set(selectedSheetsForVariation);
    if (next.has(sheetName)) next.delete(sheetName);
    else next.add(sheetName);
    setSelectedSheetsForVariation(next);
  };

  const toggleColumnForVariation = (colLetter: string) => {
    const next = new Set(selectedColumnsForVariation);
    if (next.has(colLetter)) next.delete(colLetter);
    else next.add(colLetter);
    setSelectedColumnsForVariation(next);
  };

  // ── Action: Custom Randomize Selected Sheets & Columns ──
  const handleRandomizeSelectedSheets = () => {
    if (!parsedData) return;
    if (selectedSheetsForVariation.size === 0) {
      setStatusMsg('⚠️ Selecione pelo menos uma página (aba) para aplicar a variação.');
      return;
    }

    const modeLabels: Record<VariationMode, string> = {
      uniform: 'Estocástico Uniforme (±%)',
      wobble: 'Ondulação Senoidal (Wobble de Curva)',
      gaussian: 'Ruído Gaussiano (Distribuição Normal)',
      trend: 'Deslocamento de Tendência'
    };

    setStatusMsg(`⏳ Randomizando ${selectedSheetsForVariation.size} abas no modo "${modeLabels[variationMode]}" (±${maxPercent}%)...`);

    try {
      const nextParsed = cloneParsedData(parsedData);
      let totalAlteredCount = 0;

      nextParsed.sheets.forEach((sheet: XlsxSheet) => {
        if (!selectedSheetsForVariation.has(sheet.name)) return;

        const worksheet = workbookRef.current?.getWorksheet(sheet.name);
        const colMap = detectRowColumnMap(sheet.matrix) || {
          headerRow: 1,
          colBase: customPreset.colBase,
          colTolMax: customPreset.colTolMax,
          colTolMin: customPreset.colTolMin,
          colErroTotal1: customPreset.colErroTotal1,
          colMedia: customPreset.colMedia,
          colMeds: customPreset.colMeds,
          colErro: customPreset.colErro,
          colErroTotal2: customPreset.colErroTotal2,
          colDesvPadrao: customPreset.colDesvPadrao,
          colIncertezaA: 14,
          colIncertezaComb: 15,
          colK: 16,
          colConfianca: 17,
          colTendencia: 18
        };

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
            const selectedIndicesSet = new Set<number>();

            colMap.colMeds.forEach((cIdx, idx) => {
              const cell = row[cIdx - 1];
              if (cell) {
                const v = typeof cell.value === 'number'
                  ? cell.value
                  : parseFloat(String(cell.displayValue || '').replace(',', '.'));
                currentMeds.push(!isNaN(v) ? v : baseVal);
                if (selectedColumnsForVariation.has(cell.colLetter)) {
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

            const validMeds = generateValidRowMeasurements(
              baseVal,
              currentMeds,
              maxPercent,
              selectedIndicesSet,
              sheetMedia,
              variationMode,
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
                  totalAlteredCount++;
                }
              }
            });
          }
        }

        applyFormulasToMatrix(sheet.matrix, worksheet);
      });

      setParsedData(nextParsed);
      setStatusMsg(`✨ Variação "${modeLabels[variationMode]}" aplicada com SUCESSO em ${totalAlteredCount} medições nas ${selectedSheetsForVariation.size} abas selecionadas.`);
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao aplicar variação: ${err?.message || String(err)}`);
    }
  };

  // ── Action: Apply OS Data to Sheet 1 (Certificate) ──
  const handleApplyOsSubstitutions = () => {
    if (!parsedData) {
      setStatusMsg('⚠️ Carregue uma planilha primeiro!');
      return;
    }
    if (!selectedOs) {
      setStatusMsg('⚠️ Selecione uma Ordem de Serviço (OS) primeiro!');
      return;
    }

    setStatusMsg(`⏳ Aplicando dados da OS #${selectedOs.id} no certificado (Folha 1)...`);

    try {
      const result = applyOsSubstitutions(parsedData, selectedOs, workbookRef.current);
      setParsedData(result.updatedParsedData);
      setSubstitutionDiffs(result.diffs);
      setIsOsSubstituted(true);
      setStatusMsg(`🎉 ${result.replacedCount} campos substituídos no certificado da OS #${selectedOs.id}!`);
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao aplicar substituições: ${err?.message || String(err)}`);
    }
  };

  // ── Export Handler ──
  const handleExportFile = async () => {
    if (!parsedData) return;
    setStatusMsg('⏳ Exportando planilha formatada com gráficos preservados...');

    try {
      let buffer: ArrayBuffer;

      if (originalBufferRef.current && initialParsedDataRef.current) {
        // @ts-ignore
        const JSZip = (await import('jszip')).default || (await import('jszip'));
        const zip = new JSZip();
        await zip.loadAsync(originalBufferRef.current);

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
                if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\//, '');
                sheetPaths.push(target);
              }
            }
          }
        } catch {}

        const originalParsed = initialParsedDataRef.current;
        for (let s = 0; s < parsedData.sheets.length; s++) {
          const currSheet = parsedData.sheets[s];
          const origSheet = originalParsed.sheets[s];
          if (!currSheet) continue;

          const sheetPath = sheetPaths[s] || `xl/worksheets/sheet${s + 1}.xml`;
          let sheetFile = zip.file(sheetPath);
          if (!sheetFile) {
            const fallbackKey = Object.keys(zip.files).find(k => k.endsWith(`sheet${s + 1}.xml`));
            if (fallbackKey) sheetFile = zip.file(fallbackKey);
          }
          if (!sheetFile) continue;

          let xml = await sheetFile.async('string');

          for (let r = 0; r < currSheet.matrix.length; r++) {
            for (let c = 0; c < (currSheet.matrix[r]?.length || 0); c++) {
              const currCell = currSheet.matrix[r]?.[c];
              const origCell = origSheet?.matrix[r]?.[c];

              if (currCell && currCell.value != null && currCell.value !== '') {
                const origVal = origCell ? origCell.value : null;
                const isChanged = origVal === null || origVal === undefined || String(currCell.value) !== String(origVal);

                if (isChanged) {
                  const address = currCell.address;
                  const escapedAddr = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const cellRegex = new RegExp(
                    `(<c\\b[^>]*?\\br="${escapedAddr}"[^>]*?)(?:\\s*\\/>|\\s*>([\\s\\S]*?)<\\/c>)`,
                    ''
                  );
                  const match = xml.match(cellRegex);
                  if (match) {
                    let openTag = match[1].replace(/\s+t="[^"]*"/g, '');
                    const innerContent = match[2] || '';
                    const formulaMatch = innerContent.match(/<f\b[^>]*?>[\s\S]*?<\/f>/);
                    const cellValStr = typeof currCell.value === 'number' ? String(currCell.value) : currCell.value;

                    if (formulaMatch) {
                      xml = xml.replace(cellRegex, `${openTag}>${formulaMatch[0]}<v>${cellValStr}</v></c>`);
                    } else if (typeof currCell.value === 'number') {
                      xml = xml.replace(cellRegex, `${openTag}><v>${cellValStr}</v></c>`);
                    } else {
                      const escapedVal = String(currCell.value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                      xml = xml.replace(cellRegex, `${openTag} t="str"><v>${escapedVal}</v></c>`);
                    }
                  }
                }
              }
            }
          }
          zip.file(sheetFile.name, xml);
        }

        buffer = await zip.generateAsync({ type: 'arraybuffer' });
      } else if (workbookRef.current) {
        buffer = await workbookRef.current.xlsx.writeBuffer();
      } else {
        throw new Error('Sem buffer de planilha para exportar');
      }

      const osPrefix = selectedOs ? `OS_${selectedOs.id}_` : '';
      const exportName = `${osPrefix}${parsedData.fileName}`;

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMsg(`🎉 Planilha "${exportName}" exportada com SUCESSO!`);
    } catch (err: any) {
      setStatusMsg(`❌ Erro na exportação: ${err?.message || String(err)}`);
    }
  };

  const activeSheet = parsedData?.sheets?.[activeSheetIndex];
  const allSheetNames = parsedData?.sheets.map(s => s.name) || [];
  const candidateCols = Array.from(selectedColumnsForVariation);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflowY: 'auto', paddingBottom: '24px' }}>
      
      {/* Top Banner */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '10px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={22} color="#f59e0b" />
            <h2 style={{ fontSize: '1.15rem', color: '#ffffff', fontWeight: '700', margin: 0 }}>
              Central de Operação — Laudos & Planilhas Customizáveis
            </h2>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#a1a1aa', margin: '4px 0 0 0' }}>
            Vincule Ordens de Serviço (OS), escolha as abas e colunas para variação, configure o formato da curva e visualize o laudo em estilo PDF A4.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setShowPresetModal(!showPresetModal)}>
            <Settings2 size={15} color="#fbbf24" /> Preset de Colunas ({customPreset.name.split(' ')[0]})
          </button>
        </div>
      </div>

      {/* Preset Customization Panel (Drawer) */}
      {showPresetModal && (
        <div style={{ backgroundColor: '#09090b', border: '1px solid #3f3f46', borderRadius: '8px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Settings2 size={16} /> Configuração de Layout e Posição de Colunas (Presets)
            </span>
            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setCustomPreset(DEFAULT_MEDLASER_PRESET)}>
              Restaurar Padrão MedLaser
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#a1a1aa', margin: 0 }}>
            Tudo vem pré-configurado para o caso padrão (Coluna Base A, Total D, Média E, Medições F..J, Erro K, Desvio M). Se sua planilha seguir outro modelo, ajuste os índices das colunas abaixo:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginTop: '4px' }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#a1a1aa', display: 'block' }}>Coluna Base (Valor Nominal):</label>
              <input type="number" min="1" value={customPreset.colBase} onChange={(e) => setCustomPreset({ ...customPreset, colBase: parseInt(e.target.value) || 1 })} style={{ width: '100%', backgroundColor: '#18181b', color: '#fff', border: '1px solid #27272a', borderRadius: '4px', padding: '4px 8px', fontSize: '0.8rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#a1a1aa', display: 'block' }}>Coluna Média:</label>
              <input type="number" min="1" value={customPreset.colMedia} onChange={(e) => setCustomPreset({ ...customPreset, colMedia: parseInt(e.target.value) || 5 })} style={{ width: '100%', backgroundColor: '#18181b', color: '#fff', border: '1px solid #27272a', borderRadius: '4px', padding: '4px 8px', fontSize: '0.8rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#a1a1aa', display: 'block' }}>Coluna Erro Total:</label>
              <input type="number" min="1" value={customPreset.colErroTotal1} onChange={(e) => setCustomPreset({ ...customPreset, colErroTotal1: parseInt(e.target.value) || 4 })} style={{ width: '100%', backgroundColor: '#18181b', color: '#fff', border: '1px solid #27272a', borderRadius: '4px', padding: '4px 8px', fontSize: '0.8rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: '#a1a1aa', display: 'block' }}>Coluna Desvio Padrão:</label>
              <input type="number" min="1" value={customPreset.colDesvPadrao} onChange={(e) => setCustomPreset({ ...customPreset, colDesvPadrao: parseInt(e.target.value) || 13 })} style={{ width: '100%', backgroundColor: '#18181b', color: '#fff', border: '1px solid #27272a', borderRadius: '4px', padding: '4px 8px', fontSize: '0.8rem' }} />
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      {statusMsg && (
        <div style={{ backgroundColor: '#09090b', border: '1px solid #27272a', padding: '10px 16px', borderRadius: '8px', fontSize: '0.84rem', color: '#f4f4f5', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={16} color="#3b82f6" /> {statusMsg}
        </div>
      )}

      {/* STEP 1: Selección de Ordem de Serviço (OS) */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '10px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>1</div>
            <h3 style={{ fontSize: '0.98rem', color: '#ffffff', fontWeight: '600', margin: 0 }}>
              Selecionar Ordem de Serviço (OS) do Banco de Dados
            </h3>
          </div>
          {selectedOs && (
            <span style={{ fontSize: '0.78rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={13} /> OS #{selectedOs.id} Vincular Automático
            </span>
          )}
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', padding: '0 12px' }}>
            <Search size={18} color="#71717a" />
            <input
              type="text"
              placeholder="Digite o número da OS, nome do cliente, modelo ou técnico..."
              value={osSearchQuery}
              onChange={handleOsSearchChange}
              onFocus={() => setShowOsDropdown(true)}
              style={{ flex: 1, backgroundColor: 'transparent', border: 'none', color: '#ffffff', padding: '10px 12px', fontSize: '0.88rem', outline: 'none' }}
            />
            {isSearchingOs && <RefreshCw size={16} className="animate-spin" color="#fbbf24" />}
          </div>

          {showOsDropdown && osList.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '6px', backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', zIndex: 100, maxHeight: '240px', overflowY: 'auto', boxShadow: '0 16px 32px rgba(0,0,0,0.8)' }}>
              {osList.map((os) => (
                <div
                  key={os.id}
                  onClick={() => handleSelectOs(os)}
                  style={{ padding: '10px 14px', borderBottom: '1px solid #27272a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div>
                    <span style={{ fontWeight: '700', color: '#fbbf24', fontSize: '0.86rem', marginRight: '8px' }}>
                      OS #{os.id}
                    </span>
                    <span style={{ color: '#f4f4f5', fontSize: '0.86rem' }}>
                      {os.cliente_nome || 'Cliente Não Informado'}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '2px' }}>
                      Modelo: {os.equipamento_modelo || 'N/I'} • Série: {os.equipamento_codigo || 'N/I'} • Técnico: {os.tecnico_responsavel || 'Em aberto'}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', backgroundColor: '#09090b', color: '#a1a1aa', padding: '3px 8px', borderRadius: '4px' }}>
                    {os.situacao || 'Normal'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* STEP 2: Carregar Planilha Base & Controles de Variação de Curva */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '10px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>2</div>
            <h3 style={{ fontSize: '0.98rem', color: '#ffffff', fontWeight: '600', margin: 0 }}>
              Carregar Planilha Base & Configurar Variação de Medições
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />

            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} /> Carregar do PC
            </button>

            {availableServerFiles.length > 0 && (
              <select
                style={{ backgroundColor: '#09090b', color: '#f4f4f5', border: '1px solid #27272a', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem' }}
                onChange={(e) => e.target.value && loadXlsxFromServer(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>📂 Carregar do Servidor...</option>
                {availableServerFiles.map(f => (
                  <option key={f.path} value={f.path}>{f.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* CUSTOMIZATION BOX: Escolha de Páginas & Colunas & Modo de Curva */}
        {parsedData && (
          <div style={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Sheet Selector Checkboxes */}
            <div>
              <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <CheckSquare size={14} color="#3b82f6" /> 1. Escolher Páginas (Abas) para Aplicar Variação:
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {allSheetNames.map((sheetName, sIdx) => {
                  const isChecked = selectedSheetsForVariation.has(sheetName);
                  return (
                    <button
                      key={sheetName}
                      onClick={() => toggleSheetForVariation(sheetName)}
                      style={{
                        backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.2)' : '#18181b',
                        color: isChecked ? '#60a5fa' : '#a1a1aa',
                        border: `1px solid ${isChecked ? '#3b82f6' : '#27272a'}`,
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        fontWeight: isChecked ? '700' : '400',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {isChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                      {sIdx === 0 ? `📄 ${sheetName} (Folha OS)` : `📊 ${sheetName}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column Selector Checkboxes */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Filter size={14} color="#fbbf24" /> 2. Colunas Selecionadas para Variar ({selectedColumnsForVariation.size}):
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#27272a' }}
                  onClick={() => setShowColumnModal(true)}
                >
                  <SlidersHorizontal size={13} color="#fbbf24" /> Gerenciar / Adicionar Mais Colunas...
                </button>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {Array.from(selectedColumnsForVariation).sort().map((colLetter) => {
                  return (
                    <button
                      key={colLetter}
                      onClick={() => toggleColumnForVariation(colLetter)}
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.2)',
                        color: '#fbbf24',
                        border: '1px solid #f59e0b',
                        borderRadius: '4px',
                        padding: '4px 10px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Clique para desmarcar esta coluna"
                    >
                      <CheckSquare size={13} />
                      Coluna {colLetter}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mode & Noise Control */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid #27272a', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Waves size={16} color="#ec4899" />
                  <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: '600' }}>Formato da Curva:</span>
                </div>
                <select
                  value={variationMode}
                  onChange={(e) => setVariationMode(e.target.value as VariationMode)}
                  style={{ backgroundColor: '#18181b', color: '#ffffff', border: '1px solid #27272a', borderRadius: '6px', padding: '6px 12px', fontSize: '0.8rem', outline: 'none' }}
                >
                  <option value="wobble">🌊 Ondulação Senoidal (Wobble de Curva)</option>
                  <option value="gaussian">🎲 Ruído Gaussiano (Distribuição Normal)</option>
                  <option value="trend">📈 Deslocamento de Tendência (Linear/Curvado)</option>
                  <option value="uniform">📊 Estocástico Uniforme (Padrão ±%)</option>
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#18181b', padding: '4px 10px', borderRadius: '6px', border: '1px solid #27272a' }}>
                  <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: '500' }}>Intensidade ±{maxPercent}%</span>
                  <input type="range" min="1" max="25" value={maxPercent} onChange={(e) => setMaxPercent(parseInt(e.target.value, 10))} style={{ width: '70px', accentColor: '#fbbf24' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-amber" onClick={handleRandomizeSelectedSheets}>
                  <Sparkles size={16} /> Aplicar Variação ({selectedSheetsForVariation.size} Abas)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STEP 3: Alternar entre Visualização do Relatório (PDF 1ª Página) e Editor de Grade */}
      {parsedData && (
        <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '10px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272a', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className={`tab-btn ${activeViewTab === 'report_pdf' ? 'active' : ''}`}
                onClick={() => setActiveViewTab('report_pdf')}
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                <FileText size={16} color="#ef4444" /> Relatório / Certificado (PDF A4)
              </button>

              <button
                className={`tab-btn ${activeViewTab === 'editor' ? 'active' : ''}`}
                onClick={() => setActiveViewTab('editor')}
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                <FileSpreadsheet size={16} color="#10b981" /> Grade da Planilha (Frequências)
              </button>
            </div>

            <button className="btn btn-primary" style={{ backgroundColor: '#10b981' }} onClick={handleExportFile}>
              <Printer size={16} /> Exportar XLSX Completo
            </button>
          </div>

          {/* VIEW MODE 1: Visualização do Relatório no Estilo PDF A4 (1ª Página) */}
          {activeViewTab === 'report_pdf' && (
            <div style={{ width: '100%', padding: '12px 0' }}>
              <ReportDocumentView
                order={selectedOs}
                sheet={parsedData?.sheets?.[0]}
                workbookRef={workbookRef.current}
              />
            </div>
          )}

          {/* VIEW MODE 2: Grade Interativa da Planilha */}
          {activeViewTab === 'editor' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Sheet Tabs */}
              <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', borderBottom: '1px solid #27272a', paddingBottom: '4px' }}>
                {parsedData.sheets.map((sheet, sIdx) => (
                  <button
                    key={sheet.name}
                    onClick={() => setActiveSheetIndex(sIdx)}
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.8rem',
                      fontWeight: activeSheetIndex === sIdx ? '700' : '400',
                      backgroundColor: activeSheetIndex === sIdx ? '#27272a' : 'transparent',
                      color: activeSheetIndex === sIdx ? '#ffffff' : '#a1a1aa',
                      border: 'none',
                      borderBottom: activeSheetIndex === sIdx ? (sIdx === 0 ? '2px solid #2563eb' : '2px solid #fbbf24') : 'none',
                      borderRadius: '4px 4px 0 0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{sIdx === 0 ? '📄' : '📊'}</span>
                    <span>{sIdx === 0 ? `${sheet.name} (Laudo PDF)` : sheet.name}</span>
                  </button>
                ))}
              </div>

              {/* Se a 1ª página estiver selecionada no editor, renderiza o documento human-readable */}
              {activeSheetIndex === 0 ? (
                <div style={{ width: '100%', padding: '12px 0', display: 'flex', justifyContent: 'center' }}>
                  <ReportDocumentView
                    order={selectedOs}
                    sheet={parsedData?.sheets?.[0]}
                    workbookRef={workbookRef.current}
                  />
                </div>
              ) : (
                /* Matrix Grid para abas de medição (3Hz, 5Hz, etc) */
                activeSheet && (
                  <div style={{ overflowX: 'auto', maxHeight: '480px', border: '1px solid #27272a', borderRadius: '6px' }}>
                    <table className="xlsx-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#09090b', color: '#a1a1aa' }}>
                          <th style={{ padding: '6px 10px', border: '1px solid #27272a', width: '40px' }}>#</th>
                          {Array.from({ length: Math.min(activeSheet.colCount, 20) }).map((_, cIdx) => (
                            <th key={cIdx} style={{ padding: '6px 10px', border: '1px solid #27272a' }}>
                              {getColLetter(cIdx + 1)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeSheet.matrix.slice(0, 35).map((row, rIdx) => (
                          <tr key={rIdx} style={{ backgroundColor: rIdx % 2 === 0 ? '#18181b' : '#141417' }}>
                            <td style={{ padding: '4px 8px', border: '1px solid #27272a', color: '#71717a', textAlign: 'center', fontWeight: '600' }}>
                              {rIdx + 1}
                            </td>
                            {Array.from({ length: Math.min(activeSheet.colCount, 20) }).map((_, cIdx) => {
                              const cell = row[cIdx];
                              return (
                                <td
                                  key={cIdx}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #27272a',
                                    color: cell?.isNumeric ? '#60a5fa' : '#f4f4f5',
                                    fontWeight: cell?.isNumeric ? '600' : '400'
                                  }}
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
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* POPUP MODAL: Gerenciador de Colunas de Variação */}
      {showColumnModal && (
        <div className="modal-overlay" onClick={() => setShowColumnModal(false)}>
          <div className="modal-card" style={{ maxWidth: '640px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '2px solid #f59e0b' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', color: '#ffffff' }}>
                <Columns size={18} color="#fbbf24" /> Gerenciar Colunas de Variação
              </h3>
              <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '0.75rem' }} onClick={() => setShowColumnModal(false)}>
                <X size={14} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: '14px', maxHeight: '65vh', overflowY: 'auto' }}>
              <p style={{ fontSize: '0.82rem', color: '#a1a1aa', margin: 0 }}>
                Selecione as colunas da planilha onde deseja aplicar a variação de curva ou adicione novas colunas conforme os dados detectados:
              </p>

              {/* Botões de Ação Rápida */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => {
                    const next = new Set<string>();
                    ['F', 'G', 'H', 'I', 'J'].forEach(c => next.add(c));
                    setSelectedColumnsForVariation(next);
                  }}
                >
                  Padrão (F..J / med1..med5)
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => {
                    const allDataCols = getAvailableDataColumns().map(c => c.letter);
                    setSelectedColumnsForVariation(new Set(allDataCols));
                  }}
                >
                  Marcar Todas com Dados
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => setSelectedColumnsForVariation(new Set())}
                >
                  Desmarcar Todas
                </button>
              </div>

              {/* Grid de Colunas Detectadas com Dados */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                {getAvailableDataColumns().map((col) => {
                  const isChecked = selectedColumnsForVariation.has(col.letter);
                  return (
                    <div
                      key={col.letter}
                      onClick={() => toggleColumnForVariation(col.letter)}
                      style={{
                        backgroundColor: isChecked ? 'rgba(245, 158, 11, 0.15)' : '#09090b',
                        border: `1px solid ${isChecked ? '#f59e0b' : '#27272a'}`,
                        borderRadius: '6px',
                        padding: '8px 10px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: '700', color: isChecked ? '#fbbf24' : '#ffffff', fontSize: '0.85rem' }}>
                          Col. {col.letter}
                        </span>
                        {isChecked ? <CheckSquare size={15} color="#fbbf24" /> : <Square size={15} color="#71717a" />}
                      </div>
                      <span style={{ fontSize: '0.73rem', color: '#a1a1aa', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {col.headerName ? col.headerName : `Índice ${col.colIdx}`}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#71717a' }}>
                        {col.count} valores
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Seção para Adicionar Coluna Manual */}
              <div style={{ borderTop: '1px solid #27272a', paddingTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: '#a1a1aa' }}>Adicionar Coluna Específica:</span>
                <input
                  type="text"
                  maxLength={3}
                  placeholder="Ex: K"
                  value={manualColInput}
                  onChange={(e) => setManualColInput(e.target.value.toUpperCase())}
                  style={{ width: '60px', backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '4px', padding: '4px 8px', color: '#ffffff', fontSize: '0.82rem', textAlign: 'center' }}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => {
                    const col = manualColInput.trim().toUpperCase();
                    if (/^[A-Z]+$/.test(col)) {
                      const next = new Set(selectedColumnsForVariation);
                      next.add(col);
                      setSelectedColumnsForVariation(next);
                      setManualColInput('');
                    }
                  }}
                >
                  <Plus size={14} /> Adicionar
                </button>
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid #27272a' }}>
              <span style={{ fontSize: '0.78rem', color: '#a1a1aa', marginRight: 'auto' }}>
                Total selecionado: <strong>{selectedColumnsForVariation.size}</strong> colunas
              </span>
              <button className="btn btn-primary" onClick={() => setShowColumnModal(false)}>
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
