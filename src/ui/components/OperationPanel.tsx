import React, { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import {
  Search,
  Upload,
  FileSpreadsheet,
  Zap,
  CheckCircle2,
  RefreshCw,
  Save,
  Clock,
  LayoutTemplate,
  ChevronDown,
  Sparkles,
  Info,
  Building2,
  UserCheck,
  Hash,
  Calendar,
  FileText,
  Trash2,
  Plus,
  ArrowRight,
  FolderOpen,
  Activity
} from 'lucide-react';

import { parseXlsx, listXlsxFiles, randomizeXlsx } from '../api.js';
import { XlsxParsed, XlsxSheet, XlsxCellData } from '../types.js';
import { applyFormulasToMatrix, generateValidRowMeasurements, detectRowColumnMap } from '../formulas.js';
import { DbOrder, applyOsSubstitutions, SubstitutionDiffItem, formatDateExtenso } from '../osSubstitution.js';
import { getRecentFiles, saveRecentFile, removeRecentFile, getTemplates, saveTemplate, removeTemplate, RecentItem, TemplateItem } from '../storage.js';
import { MeasurementChart } from './MeasurementChart.js';

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
  const [isDragging, setIsDragging] = useState(false);
  const [substitutionDiffs, setSubstitutionDiffs] = useState<SubstitutionDiffItem[]>([]);
  const [isOsSubstituted, setIsOsSubstituted] = useState(false);

  // ── Storage State (Recents & Templates) ──
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [showRecentsModal, setShowRecentsModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
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

      // Salva em Recentes
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

      // Primeira passagem: detectar colunas medN
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

      // Segunda passagem: parsear células
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

      // Salva atualização em recentes
      const updatedRecents = saveRecentFile({
        fileName: parsedData.fileName,
        osId: selectedOs.id,
        clienteNome: selectedOs.cliente_nome,
        sheetsCount: parsedData.sheets.length,
      });
      setRecents(updatedRecents);

      setStatusMsg(`🎉 ${result.replacedCount} campos substituídos com sucesso no certificado da OS #${selectedOs.id}!`);
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao aplicar substituições: ${err?.message || String(err)}`);
    }
  };

  // ── Action: Quick Randomize ALL Frequency Sheets ──
  const handleRandomizeAllSheets = () => {
    if (!parsedData) return;
    setStatusMsg(`⏳ Randomizando medições de TODAS as páginas de frequência (±${maxPercent}%)...`);

    try {
      const nextParsed = cloneParsedData(parsedData);
      let totalAlteredCount = 0;

      // Percorre TODAS as folhas a partir do index 1 (ou qualquer folha com colunas medN)
      nextParsed.sheets.forEach((sheet: XlsxSheet) => {
        const worksheet = workbookRef.current?.getWorksheet(sheet.name);
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

            let sheetMedia: number | undefined = undefined;
            if (colMap.colMedia > 0 && row[colMap.colMedia - 1]) {
              const mCell = row[colMap.colMedia - 1];
              const v = typeof mCell?.value === 'number'
                ? mCell.value
                : parseFloat(String(mCell?.displayValue || '').replace(',', '.'));
              if (!isNaN(v) && v > 0) sheetMedia = v;
            }

            const validMeds = generateValidRowMeasurements(baseVal, currentMeds, maxPercent, undefined, sheetMedia);

            colMap.colMeds.forEach((cIdx, idx) => {
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
            });
          }
        }

        // Recalcula fórmulas da aba
        applyFormulasToMatrix(sheet.matrix, worksheet);
      });

      setParsedData(nextParsed);
      setStatusMsg(`✨ Randomização concluída! ${totalAlteredCount} medições variadas (±${maxPercent}%) em TODAS as abas de frequência.`);
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao randomizar abas: ${err?.message || String(err)}`);
    }
  };

  // ── Export Handler ──
  const handleExportFile = async () => {
    if (!parsedData) return;
    setStatusMsg('⏳ Exportando planilha formatada...');

    try {
      let buffer: ArrayBuffer;

      if (originalBufferRef.current && initialParsedDataRef.current) {
        // @ts-ignore
        const JSZip = (await import('jszip')).default || (await import('jszip'));
        const zip = new JSZip();
        await zip.loadAsync(originalBufferRef.current);

        // Mapeamento de XMLs de folhas
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
        throw new Error('Sem buffer original para exportar');
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

  // ── Model / Template Handlers ──
  const handleSaveAsTemplate = () => {
    if (!parsedData) return;
    if (!newTemplateName.trim()) {
      setStatusMsg('⚠️ Digite um nome para o modelo.');
      return;
    }

    const sheetNames = parsedData.sheets.map((s: XlsxSheet) => s.name);
    const updated = saveTemplate(newTemplateName, newTemplateDesc, sheetNames);
    setTemplates(updated);
    setNewTemplateName('');
    setNewTemplateDesc('');
    setShowTemplatesModal(false);
    setStatusMsg(`⭐ Modelo "${newTemplateName}" salvo em Meus Modelos!`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflowY: 'auto', paddingBottom: '24px' }}>
      
      {/* Top Banner & Quick Storage Access */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '10px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={22} color="#f59e0b" />
            <h2 style={{ fontSize: '1.15rem', color: '#ffffff', fontWeight: '700', margin: 0 }}>
              Central de Operação — Emissão por OS
            </h2>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#a1a1aa', margin: '4px 0 0 0' }}>
            Busque uma Ordem de Serviço, integre com os dados do certificado (Folha 1), randomize medições e exporte com gráficos preservados.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setShowRecentsModal(true)}>
            <Clock size={15} color="#3b82f6" /> Recentes ({recents.length})
          </button>

          <button className="btn btn-secondary" onClick={() => setShowTemplatesModal(true)}>
            <LayoutTemplate size={15} color="#10b981" /> Modelos ({templates.length})
          </button>
        </div>
      </div>

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
              <CheckCircle2 size={13} /> OS #{selectedOs.id} Selecionada
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
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                border: 'none',
                color: '#ffffff',
                padding: '10px 12px',
                fontSize: '0.88rem',
                outline: 'none'
              }}
            />
            {isSearchingOs && <RefreshCw size={16} className="animate-spin" color="#fbbf24" />}
          </div>

          {/* Autocomplete Dropdown */}
          {showOsDropdown && osList.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '6px',
              backgroundColor: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '8px',
              zIndex: 100,
              maxHeight: '260px',
              overflowY: 'auto',
              boxShadow: '0 16px 32px rgba(0,0,0,0.8)'
            }}>
              {osList.map((os) => (
                <div
                  key={os.id}
                  onClick={() => handleSelectOs(os)}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #27272a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
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

        {/* Selected OS Details Card — Highlights the 5 Substitution Target Fields */}
        {selectedOs && (
          <div style={{ backgroundColor: '#09090b', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272a', paddingBottom: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={15} /> Dados da OS a serem vinculados no Certificado (Folha 1):
              </span>
              <span style={{ fontSize: '0.76rem', color: '#71717a' }}>ID: #{selectedOs.id}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              {/* Field 1: Contratante */}
              <div style={{ backgroundColor: '#18181b', padding: '8px 12px', borderRadius: '6px', border: '1px solid #27272a' }}>
                <div style={{ fontSize: '0.72rem', color: '#a1a1aa', textTransform: 'uppercase', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Building2 size={13} color="#3b82f6" /> 1. Contratante
                </div>
                <div style={{ fontSize: '0.83rem', color: '#ffffff', fontWeight: '600', marginTop: '2px' }}>
                  {selectedOs.cliente_nome || 'N/A'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#a1a1aa' }}>
                  {selectedOs.cliente_cpf_cnpj ? `CNPJ/CPF: ${selectedOs.cliente_cpf_cnpj}` : 'Sem CNPJ'}
                </div>
              </div>

              {/* Field 2: Laboratório e Técnico Responsável */}
              <div style={{ backgroundColor: '#18181b', padding: '8px 12px', borderRadius: '6px', border: '1px solid #27272a' }}>
                <div style={{ fontSize: '0.72rem', color: '#a1a1aa', textTransform: 'uppercase', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <UserCheck size={13} color="#10b981" /> 2. Técnico Responsável
                </div>
                <div style={{ fontSize: '0.83rem', color: '#ffffff', fontWeight: '600', marginTop: '2px' }}>
                  {selectedOs.tecnico_responsavel || 'Roberto Aldilei Favoreto'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#a1a1aa' }}>
                  Laboratório Medlaser LTDA
                </div>
              </div>

              {/* Field 3: Números de Série */}
              <div style={{ backgroundColor: '#18181b', padding: '8px 12px', borderRadius: '6px', border: '1px solid #27272a' }}>
                <div style={{ fontSize: '0.72rem', color: '#a1a1aa', textTransform: 'uppercase', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Hash size={13} color="#ec4899" /> 3. Número de Série
                </div>
                <div style={{ fontSize: '0.83rem', color: '#ffffff', fontWeight: '600', marginTop: '2px' }}>
                  {selectedOs.equipamento_codigo || 'N/A'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#a1a1aa' }}>
                  Modelo: {selectedOs.equipamento_modelo || 'UroPulse'}
                </div>
              </div>

              {/* Field 4: Datas */}
              <div style={{ backgroundColor: '#18181b', padding: '8px 12px', borderRadius: '6px', border: '1px solid #27272a' }}>
                <div style={{ fontSize: '0.72rem', color: '#a1a1aa', textTransform: 'uppercase', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={13} color="#8b5cf6" /> 4. Data do Ensaio
                </div>
                <div style={{ fontSize: '0.83rem', color: '#ffffff', fontWeight: '600', marginTop: '2px' }}>
                  {formatDateExtenso(selectedOs.data_entrada || selectedOs.scraped_at)}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#a1a1aa' }}>
                  Validade: 12 Meses
                </div>
              </div>

              {/* Field 5: Ordens de Serviço */}
              <div style={{ backgroundColor: '#18181b', padding: '8px 12px', borderRadius: '6px', border: '1px solid #27272a' }}>
                <div style={{ fontSize: '0.72rem', color: '#a1a1aa', textTransform: 'uppercase', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <FileText size={13} color="#f59e0b" /> 5. Ordem de Serviço
                </div>
                <div style={{ fontSize: '0.83rem', color: '#fbbf24', fontWeight: '700', marginTop: '2px' }}>
                  #{selectedOs.id}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#a1a1aa' }}>
                  Serviço: {selectedOs.servico_tipo || 'Calibração'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STEP 2 & 3: Carregar Planilha & Aplicar Substituições no Certificado */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '10px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>2</div>
            <h3 style={{ fontSize: '0.98rem', color: '#ffffff', fontWeight: '600', margin: 0 }}>
              Carregar Planilha Base & Vincular Certificado
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

        {/* Loaded File Info & Action Button */}
        {parsedData ? (
          <div style={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileSpreadsheet size={18} color="#10b981" /> {parsedData.fileName}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#a1a1aa', marginTop: '2px' }}>
                  Abas encontradas: {parsedData.sheets.map((s: XlsxSheet) => s.name).join(', ')} ({parsedData.measurementCellsCount} medições)
                </div>
              </div>

              <button
                className="btn btn-amber"
                onClick={handleApplyOsSubstitutions}
                disabled={!selectedOs}
                style={{ opacity: selectedOs ? 1 : 0.5, cursor: selectedOs ? 'pointer' : 'not-allowed' }}
              >
                <RefreshCw size={16} /> Vincular Dados da OS na Folha 1 (Certificado)
              </button>
            </div>

            {/* Visual Diff Table of Replaced Fields */}
            {isOsSubstituted && substitutionDiffs.length > 0 && (
              <div style={{ borderTop: '1px solid #27272a', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={14} /> Resumo dos {substitutionDiffs.length} campos substituídos na Folha 1:
                </span>
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #27272a', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead style={{ backgroundColor: '#18181b', color: '#a1a1aa', textTransform: 'uppercase' }}>
                      <tr>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Categoria</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Campo / Endereço</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Valor Anterior</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Novo Valor (OS)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {substitutionDiffs.map((diff, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #27272a' }}>
                          <td style={{ padding: '6px 10px', color: '#fbbf24', fontWeight: '600' }}>{diff.fieldCategory}</td>
                          <td style={{ padding: '6px 10px', color: '#f4f4f5' }}>{diff.label} <span style={{ color: '#71717a' }}>({diff.address})</span></td>
                          <td style={{ padding: '6px 10px', color: '#ef4444', textDecoration: 'line-through' }}>{diff.oldValue || '(Vazio)'}</td>
                          <td style={{ padding: '6px 10px', color: '#10b981', fontWeight: '600' }}>{diff.newValue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ backgroundColor: '#09090b', border: '2px dashed #27272a', borderRadius: '8px', padding: '24px', textAlign: 'center', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
            <Upload size={32} color="#71717a" style={{ marginBottom: '8px' }} />
            <div style={{ color: '#ffffff', fontWeight: '600', fontSize: '0.9rem' }}>
              Clique ou arraste um arquivo XLSX para iniciar o laudo
            </div>
            <div style={{ color: '#71717a', fontSize: '0.8rem', marginTop: '4px' }}>
              Suporta laudos com abas de certificado (Relatório) e medições de frequência (3Hz, 5Hz...)
            </div>
          </div>
        )}
      </div>

      {/* STEP 4: Randomização Automática de Frequências (Todas as Abas) */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '10px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ backgroundColor: 'rgba(236, 72, 153, 0.15)', color: '#ec4899', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>3</div>
            <h3 style={{ fontSize: '0.98rem', color: '#ffffff', fontWeight: '600', margin: 0 }}>
              Randomização Automática de Frequências (Todas as Páginas)
            </h3>
          </div>

          {parsedData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#09090b', padding: '4px 12px', borderRadius: '6px', border: '1px solid #27272a' }}>
                <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: '600' }}>±{maxPercent}%</span>
                <input type="range" min="1" max="25" value={maxPercent} onChange={(e) => setMaxPercent(parseInt(e.target.value, 10))} style={{ width: '80px', accentColor: '#ec4899' }} />
              </div>

              <button className="btn btn-amber" onClick={handleRandomizeAllSheets} style={{ backgroundColor: '#ec4899', borderColor: '#db2777', color: '#ffffff' }}>
                <Sparkles size={16} /> Randomizar TODAS as Frequências (±{maxPercent}%)
              </button>
            </div>
          )}
        </div>

        <p style={{ fontSize: '0.81rem', color: '#a1a1aa', margin: 0 }}>
          Gera variação estocástica estrita em todas as colunas de medição (med1 a med5) de todas as abas de frequência (3Hz, 5Hz, 8Hz, 10Hz, 12Hz) mantendo o Erro Total rigorosamente dentro dos limites de tolerância (±20%).
        </p>

        {/* Visualização do Gráfico de Erro por Aba */}
        {parsedData && parsedData.sheets.length > 0 && (
          <div style={{ borderTop: '1px solid #27272a', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', color: '#fbbf24', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={16} /> Visualização em Tempo Real do Gráfico de Erros:
              </span>

              {/* Aba Selector Pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {parsedData.sheets.map((sheet: XlsxSheet, idx: number) => {
                  const isCandidateSheet = sheet.columnsWithCandidates && sheet.columnsWithCandidates.length > 0;
                  const isActive = activeSheetIndex === idx;
                  return (
                    <button
                      key={sheet.name}
                      onClick={() => setActiveSheetIndex(idx)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.76rem',
                        borderRadius: '6px',
                        border: isActive ? '1px solid #f59e0b' : '1px solid #27272a',
                        backgroundColor: isActive ? 'rgba(245, 158, 11, 0.15)' : '#09090b',
                        color: isActive ? '#fbbf24' : '#a1a1aa',
                        cursor: 'pointer',
                        fontWeight: isActive ? '700' : '400'
                      }}
                    >
                      {sheet.name} {isCandidateSheet ? '📊' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#09090b', borderRadius: '8px', padding: '12px', border: '1px solid #27272a' }}>
              <div style={{ width: '45%', minWidth: '400px', maxWidth: '100%' }}>
                <MeasurementChart
                  sheetData={parsedData.sheets[activeSheetIndex] || parsedData.sheets[1] || parsedData.sheets[0]}
                  frequencyLabel={parsedData.sheets[activeSheetIndex]?.name || 'Frequência'}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STEP 5: Exportação & Modelo */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '10px', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '0.98rem', color: '#ffffff', fontWeight: '600', margin: 0 }}>
            Exportação & Gerenciamento de Modelo
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#a1a1aa', margin: '2px 0 0 0' }}>
            Exporte o arquivo XLSX final preservando os gráficos ou salve a estrutura atual em seus modelos.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setShowTemplatesModal(true)} disabled={!parsedData}>
            <Save size={15} /> Salvar como Modelo
          </button>

          <button className="btn btn-primary" style={{ backgroundColor: '#10b981', color: '#ffffff' }} onClick={handleExportFile} disabled={!parsedData}>
            <Save size={16} /> Exportar Planilha Processada (.xlsx)
          </button>
        </div>
      </div>

      {/* ── MODAL: Meus Recentes ── */}
      {showRecentsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px', width: '500px', maxWidth: '90%', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272a', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '1rem', color: '#ffffff', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={18} color="#3b82f6" /> Meus Recentes
              </h3>
              <button style={{ backgroundColor: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '1.1rem' }} onClick={() => setShowRecentsModal(false)}>✕</button>
            </div>

            {recents.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: '#a1a1aa', textAlign: 'center', padding: '20px 0' }}>
                Nenhuma planilha recente salva.
              </p>
            ) : (
              <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recents.map((item) => (
                  <div key={item.id} style={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: '600' }}>{item.fileName}</div>
                      <div style={{ fontSize: '0.74rem', color: '#a1a1aa', marginTop: '2px' }}>
                        {item.osId ? `OS #${item.osId} • ${item.clienteNome || ''}` : 'Sem OS associada'} • {item.dateUpdated}
                      </div>
                    </div>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setRecents(removeRecentFile(item.id))}>
                      <Trash2 size={13} color="#ef4444" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: Meus Modelos ── */}
      {showTemplatesModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px', width: '560px', maxWidth: '90%', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272a', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '1rem', color: '#ffffff', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <LayoutTemplate size={18} color="#10b981" /> Meus Modelos (Templates)
              </h3>
              <button style={{ backgroundColor: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '1.1rem' }} onClick={() => setShowTemplatesModal(false)}>✕</button>
            </div>

            {/* Criar Novo Modelo */}
            {parsedData && (
              <div style={{ backgroundColor: '#09090b', border: '1px dashed rgba(16, 185, 129, 0.4)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: '700' }}>Salvar planilha atual como modelo:</div>
                <input
                  type="text"
                  placeholder="Nome do Modelo (ex: Modelo UROPULSE 2026)"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '6px', color: '#ffffff', padding: '6px 10px', fontSize: '0.8rem' }}
                />
                <input
                  type="text"
                  placeholder="Descrição opcional..."
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '6px', color: '#ffffff', padding: '6px 10px', fontSize: '0.8rem' }}
                />
                <button className="btn btn-primary" style={{ backgroundColor: '#10b981', color: '#ffffff', alignSelf: 'flex-end', padding: '6px 12px', fontSize: '0.78rem' }} onClick={handleSaveAsTemplate}>
                  <Plus size={14} /> Salvar Modelo
                </button>
              </div>
            )}

            {/* Lista de Modelos */}
            <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {templates.map((tmpl) => (
                <div key={tmpl.id} style={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: '600' }}>{tmpl.name}</div>
                    <div style={{ fontSize: '0.76rem', color: '#a1a1aa', marginTop: '2px' }}>{tmpl.description}</div>
                    <div style={{ fontSize: '0.71rem', color: '#71717a', marginTop: '2px' }}>Abas: {tmpl.sheetNames.join(', ')} • Criado em {tmpl.dateCreated}</div>
                  </div>
                  <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setTemplates(removeTemplate(tmpl.id))}>
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
