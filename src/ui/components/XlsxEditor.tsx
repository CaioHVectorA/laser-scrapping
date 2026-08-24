import React, { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import { parseXlsx, randomizeXlsx, listXlsxFiles } from '../api.js';
import { FileSpreadsheet, Sparkles, Undo, Redo, Save, Upload, FolderOpen, Info, ChevronDown, Layers, CheckSquare, Square, Filter } from 'lucide-react';

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
  let temp = '';
  let letter = '';
  while (colIndex > 0) {
    temp = (colIndex - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    colIndex = Math.floor((colIndex - temp - 1) / 26);
  }
  return letter;
}

function isCandidate(val: number, cellText: string): boolean {
  if (isNaN(val) || val === null || val === undefined) return false;
  if (Number.isInteger(val) && val > 1900 && val < 2100) return false;
  if (Number.isInteger(val) && val > 5000 && val < 99999) return false;
  if ([60, 115, 230, 216, 25, 80, 900].includes(val)) return false;
  return val > 0 && val <= 200;
}

export const XlsxEditor: React.FC = () => {
  const [parsedData, setParsedData] = useState<XlsxParsed | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [maxPercent, setMaxPercent] = useState(10);
  const [statusMsg, setStatusMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Colunas selecionadas pelo usuário para variação
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());

  const [availableFiles, setAvailableFiles] = useState<{ name: string; path: string }[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const workbookRef = useRef<ExcelJS.Workbook | null>(null);

  const [historyStack, setHistoryStack] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    loadAvailableFiles();
  }, []);

  // Atualiza colunas ativas ao trocar de aba ou carregar planilha
  useEffect(() => {
    if (parsedData?.sheets?.[activeSheetIndex]) {
      const activeSheet = parsedData.sheets[activeSheetIndex];
      setSelectedColumns(new Set(activeSheet.columnsWithCandidates || []));
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
    const newStack = historyStack.slice(0, historyIndex + 1);
    newStack.push({ parsedData: newState, label });
    setHistoryStack(newStack);
    setHistoryIndex(newStack.length - 1);
    setParsedData(newState);
  };

  // Carrega arquivo .xlsx do PC
  const handleFileUpload = async (file: File) => {
    setStatusMsg(`⏳ Lendo "${file.name}"...`);
    setShowFilePicker(false);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      workbookRef.current = workbook;

      const parsed = parseWorkbookStructure(workbook, file.name, file.name);
      setParsedData(parsed);
      setActiveSheetIndex(0);
      setHistoryStack([{ parsedData: parsed, label: 'Planilha Carregada' }]);
      setHistoryIndex(0);
      setStatusMsg(`✅ Planilha "${file.name}" carregada (${parsed.sheets.length} páginas, ${parsed.measurementCellsCount} medições identificadas).`);
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
          let displayValue = '';
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

          displayValue = cell.text ? String(cell.text).trim() : (rawVal !== undefined && rawVal !== null ? String(rawVal) : '');
          let numVal = typeof rawVal === 'number' ? rawVal : parseFloat(displayValue.replace(',', '.'));
          const isNum = !isNaN(numVal) && isFinite(numVal) && displayValue.trim() !== '';

          const candidate = isNum && !formula ? isCandidate(numVal, displayValue) : false;
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
      const res = await parseXlsx(filePath);
      setParsedData(res);
      setActiveSheetIndex(0);
      setHistoryStack([{ parsedData: res, label: 'Planilha Inicial' }]);
      setHistoryIndex(0);
      setStatusMsg(`✅ "${res.fileName}" carregada com SUCESSO.`);
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

  // Aplica a variação matemática estrita ±(val * maxPercent / 100)
  const handleRandomize = async () => {
    if (!parsedData) return;
    setStatusMsg(`⏳ Aplicando variação estrita de ±${maxPercent}%...`);

    let alteredCount = 0;

    try {
      if (workbookRef.current) {
        const activeSheetName = parsedData.sheets[activeSheetIndex]?.name;
        const worksheet = workbookRef.current.getWorksheet(activeSheetName);

        if (worksheet) {
          parsedData.sheets[activeSheetIndex].matrix.forEach((row) => {
            row.forEach((cellData) => {
              if (!cellData) return;
              const isColSelected = selectedColumns.has(cellData.colLetter);

              if (cellData.isNumeric && cellData.isSelectedForVariation && isColSelected) {
                const val = cellData.value as number;
                const deltaMax = Math.abs(val) * (maxPercent / 100);
                const randomFactor = Math.random() * 2 - 1; // [-1.0, +1.0]
                const delta = randomFactor * deltaMax;
                let newVal = val + delta;
                newVal = Math.round(newVal * 100) / 100; // Arredonda estritamente para 2 casas decimais

                const excelCell = worksheet.getRow(cellData.row).getCell(cellData.col);
                excelCell.value = newVal;
                alteredCount++;
              }
            });
          });
        }

        const updatedParsed = parseWorkbookStructure(workbookRef.current, parsedData.fileName, parsedData.filePath);
        pushHistoryState(updatedParsed, `Variação ±${maxPercent}% (${alteredCount} células)`);
        setStatusMsg(`✨ ${alteredCount} medições alteradas estritamente em até ±${maxPercent}%. Exemplo: 1.20 ➔ ${(1.20 * (1 + (maxPercent/100))).toFixed(2)} máx.`);
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

  // Exporta a planilha modificada para download
  const handleExportFile = async () => {
    if (!parsedData) return;
    setStatusMsg('⏳ Gerando arquivo .xlsx para download...');

    try {
      let buffer: Uint8Array | ArrayBuffer;

      if (workbookRef.current) {
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

      setStatusMsg(`🎉 Planilha "modificado_${parsedData.fileName}" baixada com SUCESSO! Ao reabrir no Google Sheets, os gráficos existentes atualizarão automaticamente.`);
    } catch (err: any) {
      setStatusMsg(`❌ Erro ao exportar: ${err?.message || String(err)}`);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setParsedData(historyStack[prevIdx].parsedData);
      setStatusMsg(`↩ Desfeito para: "${historyStack[prevIdx].label}"`);
    }
  };

  const handleRedo = () => {
    if (historyIndex < historyStack.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setParsedData(historyStack[nextIdx].parsedData);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#09090b', padding: '4px 10px', borderRadius: '6px', border: '1px solid #27272a' }}>
              <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: '500' }}>±{maxPercent}%</span>
              <input type="range" min="1" max="25" value={maxPercent} onChange={(e) => setMaxPercent(parseInt(e.target.value, 10))} style={{ width: '70px', accentColor: '#fafafa' }} />
            </div>

            <button className="btn btn-amber" onClick={handleRandomize}>
              <Sparkles size={16} /> Variar Medições (±{maxPercent}%)
            </button>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={handleUndo} disabled={historyIndex <= 0} title="Desfazer (Ctrl+Z)">
                <Undo size={15} /> Desfazer
              </button>
              <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={handleRedo} disabled={historyIndex >= historyStack.length - 1} title="Refazer (Ctrl+Y)">
                <Redo size={15} /> Refazer
              </button>
            </div>

            <button className="btn btn-primary" style={{ backgroundColor: '#10b981', color: '#ffffff' }} onClick={handleExportFile}>
              <Save size={16} /> Exportar XLSX
            </button>
          </div>
        )}
      </div>

      {/* Status Bar */}
      {statusMsg && (
        <div style={{ backgroundColor: '#09090b', border: '1px solid #27272a', padding: '8px 14px', borderRadius: '6px', fontSize: '0.82rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={15} /> {statusMsg}
        </div>
      )}

      {/* Column Selection Toolbar */}
      {activeSheet && columnsWithCandidates.length > 0 && (
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
          
          {/* Table Grid (Google Sheets style) */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
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
                    {activeSheet.matrix.slice(0, 45).map((row, rIdx) => (
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
              >
                <span>📄</span>
                <span>{sheet.name}</span>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
};
