import React, { useState, useEffect, useMemo } from 'react';
import { DbOrder, XlsxSheet } from '../types.js';
import { formatDateExtenso, randomizeSegEletFields } from '../osSubstitution.js';
import {
  FileText,
  Printer,
  ShieldCheck,
  Building2,
  UserCheck,
  Zap,
  CheckCircle2,
  Check,
  Award,
  Thermometer,
  Calendar,
  Sparkles,
  Activity
} from 'lucide-react';

export interface ReportDocumentViewProps {
  order?: DbOrder | null;
  sheet?: XlsxSheet | null;
  workbookRef?: any;
  onPrint?: () => void;
  onCellChange?: (address: string, newValue: string) => void;
  onDataChange?: (newData: Record<string, string>) => void;
}

export interface DocumentFields {
  osId: string;
  clienteNome: string;
  clienteCpfCnpj: string;
  clienteEndereco: string;
  clienteMunicipio: string;
  clienteTelefones: string;
  tecnicoNome: string;
  equipamentoLinha: string;
  equipamentoModelo: string;
  equipamentoFabricante: string;
  equipamentoSerie: string;
  dataExtenso: string;
  tempAmbiente: string;
  umidade: string;
  pressao: string;
  voltagem: string;
  resistenciaTerra?: string;
  correnteFuga?: string;
  addresses: Record<string, string>;
}

/**
 * Extrator leve e inteligente dos dados da 1ª página da planilha.
 */
export function extractDocData(sheet?: XlsxSheet | null, order?: DbOrder | null): DocumentFields {
  const data: DocumentFields = {
    osId: order?.id ? String(order.id) : '',
    clienteNome: order?.cliente_nome || '',
    clienteCpfCnpj: order?.cliente_cpf_cnpj || '',
    clienteEndereco: order?.cliente_endereco || '',
    clienteMunicipio: 'Belo Horizonte / MG',
    clienteTelefones: order?.cliente_telefones || '',
    tecnicoNome: (order?.tecnico_responsavel && order.tecnico_responsavel !== 'Em aberto')
      ? order.tecnico_responsavel
      : 'Roberto Aldilei Favoreto',
    equipamentoLinha: order?.equipamento_linha_uso || 'Laser',
    equipamentoModelo: order?.equipamento_modelo || 'UroPulse',
    equipamentoFabricante: 'Dornier',
    equipamentoSerie: order?.equipamento_codigo || '',
    dataExtenso: formatDateExtenso(),
    tempAmbiente: '+25°C',
    umidade: '80%',
    pressao: '900hPA',
    voltagem: '216V (60Hz)',
    addresses: {}
  };

  if (!sheet?.matrix || sheet.matrix.length === 0) {
    if (!data.clienteNome) data.clienteNome = 'Cliente Não Informado';
    if (!data.osId) data.osId = '—';
    return data;
  }

  const matrix = sheet.matrix;
  const numRows = matrix.length;

  for (let r = 0; r < numRows; r++) {
    const row = matrix[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const text = String(cell.displayValue || cell.value || '').trim();
      if (!text) continue;

      // 1. CONTRATANTE
      if (text.includes('1 - CONTRATANTE') || text === 'CONTRATANTE') {
        for (let offR = 1; offR <= 5; offR++) {
          if (r + offR < numRows) {
            const nextRow = matrix[r + offR];
            for (let offC = 0; offC < (nextRow?.length || 0); offC++) {
              const subCell = nextRow?.[offC];
              const subText = String(subCell?.displayValue || subCell?.value || '').trim();
              if (!subText) continue;

              const cnpjMatch = subText.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/);
              if (cnpjMatch && !data.clienteCpfCnpj) {
                data.clienteCpfCnpj = cnpjMatch[0];
                data.addresses['clienteCpfCnpj'] = subCell!.address;
              }

              if (offR <= 2 && !data.clienteNome && subText.length > 3 && !subText.startsWith('1 -')) {
                const cleanName = subText.replace(/CNPJ:.*$/i, '').replace(/^,\s*/, '').trim();
                if (cleanName) {
                  data.clienteNome = cleanName;
                  data.addresses['clienteNome'] = subCell!.address;
                }
              }

              if ((subText.toLowerCase().includes('rua') || subText.toLowerCase().includes('av') || subText.toLowerCase().includes('endereço')) && !data.clienteEndereco) {
                data.clienteEndereco = subText.replace(/^Endereço:\s*/i, '').replace(/^,\s*/, '').trim();
                data.addresses['clienteEndereco'] = subCell!.address;
              }

              if (subText.toLowerCase().includes('telefone') || subText.toLowerCase().includes('município')) {
                const telMatch = subText.match(/Telefone[s]?:\s*([^\n\r]+)/i);
                if (telMatch && !data.clienteTelefones) {
                  data.clienteTelefones = telMatch[1].trim();
                  data.addresses['clienteTelefones'] = subCell!.address;
                }
                const munMatch = subText.match(/Município:\s*([^T\n\r]+)/i);
                if (munMatch && !data.clienteMunicipio) {
                  data.clienteMunicipio = munMatch[1].trim();
                }
              }
            }
          }
        }
      }

      // 2. RESPONSÁVEL TÉCNICO
      if (/Respos[áa]vel\s*T[ée]nico:/i.test(text) || /Respons[áa]vel\s*T[ée]cnico:/i.test(text)) {
        const parts = text.split(':');
        if (parts.length > 1 && parts[1].trim()) {
          data.tecnicoNome = parts[1].trim();
          data.addresses['tecnicoNome'] = cell.address;
        }
      }

      // 3. NÚMERO DE SÉRIE (Seção 5: r > 40 para não pegar Fluke ESA612 na linha 31)
      if (((/^N[úu]mero\s*de\s*S[ée]rie$/i.test(text) || /^Numero\s*de\s*Serie/i.test(text)) && r > 40)) {
        for (let colOff = 1; colOff <= 8; colOff++) {
          const adjCell = row[c + colOff];
          const adjText = String(adjCell?.displayValue || adjCell?.value || '').trim();
          if (adjText && adjText !== text) {
            data.equipamentoSerie = adjText;
            data.addresses['equipamentoSerie'] = adjCell!.address;
            break;
          }
        }
      }

      // 4. ORDEM DE SERVIÇO
      if (/^Ordem\s*de\s*Servi[çc]o/i.test(text) || /^ORDEM\s*DE\s*SERVIÇO/i.test(text)) {
        for (let colOff = 1; colOff <= 8; colOff++) {
          const adjCell = row[c + colOff];
          const adjText = String(adjCell?.displayValue || adjCell?.value || '').trim();
          if (adjText && adjText !== text) {
            data.osId = adjText.replace('#', '');
            data.addresses['osId'] = adjCell!.address;
            break;
          }
        }
      }

      // 5. MODELO
      if (text === 'Modelo' || text.startsWith('Modelo:')) {
        for (let colOff = 1; colOff <= 8; colOff++) {
          const adjCell = row[c + colOff];
          const adjText = String(adjCell?.displayValue || adjCell?.value || '').trim();
          if (adjText && adjText !== text && adjText.length > 1) {
            data.equipamentoModelo = adjText;
            data.addresses['equipamentoModelo'] = adjCell!.address;
            break;
          }
        }
      }

      // 6. DATAS
      if (text.includes('ENSAIO') && text.includes('REALIZADO NO DIA')) {
        const dMatch = text.match(/REALIZADO NO DIA\s+([^\n\r,]+)/i);
        if (dMatch) {
          data.dataExtenso = dMatch[1].trim();
          data.addresses['dataExtenso'] = cell.address;
        }
      }

      // 7. SEGURANÇA ELÉTRICA: Resistência para o Terra IEC 62353
      if (/Resist[êe]ncia\s+(?:para\s+o\s+)?Terra/i.test(text) && !/M[áa]xima|M[íi]nima/i.test(text)) {
        for (let col = 10; col <= 13; col++) {
          const adjCell = row[col];
          const adjText = String(adjCell?.displayValue || adjCell?.value || '').trim();
          if (adjText) {
            data.resistenciaTerra = adjText;
            data.addresses['resistenciaTerra'] = adjCell!.address;
            break;
          }
        }
      }

      // 8. SEGURANÇA ELÉTRICA: Corrente de Fuga para Carcaça
      if (/Corrente\s+de\s+Fuga\s+(?:para\s+)?Carca[çc]a/i.test(text) && !/M[áa]xima|M[íi]nima/i.test(text)) {
        for (let col = 10; col <= 12; col++) {
          const adjCell = row[col];
          const adjText = String(adjCell?.displayValue || adjCell?.value || '').trim();
          if (adjText) {
            data.correnteFuga = adjText;
            data.addresses['correnteFuga'] = adjCell!.address;
            break;
          }
        }
      }
    }
  }

  if (!data.clienteNome && order?.cliente_nome) data.clienteNome = order.cliente_nome;
  if (!data.clienteCpfCnpj && order?.cliente_cpf_cnpj) data.clienteCpfCnpj = order.cliente_cpf_cnpj;
  if (!data.clienteEndereco && order?.cliente_endereco) data.clienteEndereco = order.cliente_endereco;
  if (!data.clienteTelefones && order?.cliente_telefones) data.clienteTelefones = order.cliente_telefones;
  if (!data.equipamentoModelo && order?.equipamento_modelo) data.equipamentoModelo = order.equipamento_modelo;
  if (!data.equipamentoSerie && order?.equipamento_codigo) data.equipamentoSerie = order.equipamento_codigo;
  if (!data.osId && order?.id) data.osId = String(order.id);

  if (!data.clienteNome) data.clienteNome = 'Cliente Não Informado';
  if (!data.osId) data.osId = '—';

  return data;
}

export const ReportDocumentView: React.FC<ReportDocumentViewProps> = ({
  order,
  sheet,
  workbookRef,
  onPrint,
  onCellChange,
  onDataChange
}) => {
  const initialData = useMemo(() => extractDocData(sheet, order), [sheet, order]);
  const [doc, setDoc] = useState<DocumentFields>(initialData);
  const [savedBadge, setSavedBadge] = useState(false);

  useEffect(() => {
    setDoc(initialData);
  }, [initialData]);

  // Atualiza um campo e sincroniza imediatamente com a planilha
  const updateField = (key: keyof DocumentFields, val: string) => {
    setDoc((prev) => {
      const updated = { ...prev, [key]: val };

      // Sincroniza com as células da planilha
      if (sheet) {
        const addr = updated.addresses[key];
        if (addr && sheet.cells[addr]) {
          sheet.cells[addr].displayValue = val;
          sheet.cells[addr].value = val;
        }
        if (workbookRef && addr) {
          try {
            const ws = workbookRef.getWorksheet(sheet.name);
            if (ws) ws.getCell(addr).value = val;
          } catch {}
        }
      }

      if (onCellChange && updated.addresses[key]) {
        onCellChange(updated.addresses[key], val);
      }
      if (onDataChange) {
        onDataChange(updated as any);
      }

      return updated;
    });

    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 2000);
  };

  const handleRandomizeSegElet = () => {
    if (!sheet) return;
    const mockParsed: any = {
      filePath: '',
      fileName: '',
      sheets: [sheet],
      measurementCellsCount: 0
    };
    const res = randomizeSegEletFields(mockParsed, workbookRef, 0.30);

    // Atualiza diretamente o estado do documento para refletir imediatamente na tela
    setDoc((prev) => {
      const updated = { ...prev };
      for (const diff of res.diffs) {
        if (diff.label.includes('Resistência')) {
          updated.resistenciaTerra = diff.newValue;
        } else if (diff.label.includes('Corrente')) {
          updated.correnteFuga = diff.newValue;
        }
      }
      if (onDataChange) {
        onDataChange(updated as any);
      }
      return updated;
    });

    for (const diff of res.diffs) {
      if (diff.address && onCellChange) {
        onCellChange(diff.address, diff.newValue);
      }
    }
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 2500);
  };

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#f8fafc',
    border: '1px solid #cbd5e1',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '11px',
    color: '#0f172a',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
    outline: 'none'
  };

  return (
    <div className="report-doc-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '14px' }}>
      
      {/* Barra de Ações Superior Limpa */}
      <div className="no-print" style={{
        width: '100%',
        maxWidth: '820px',
        backgroundColor: '#18181b',
        border: '1px solid #27272a',
        borderRadius: '8px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="#10b981" />
          <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#f4f4f5' }}>
            Laudo de Calibração / Segurança Elétrica
          </span>
          <span style={{ fontSize: '0.74rem', color: '#71717a' }}>
            • Campos editáveis abaixo sincronizam com o arquivo .xlsx
          </span>
          {savedBadge && (
            <span style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Check size={13} /> Sincronizado
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(doc.resistenciaTerra || doc.correnteFuga) && (
            <button
              className="btn btn-amber"
              onClick={handleRandomizeSegElet}
              style={{ backgroundColor: '#f59e0b', color: '#000', fontWeight: 600, padding: '6px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Aplica variação de ±30% nos testes de Resistência para o Terra e Corrente de Fuga"
            >
              <Sparkles size={15} /> Randomizar Seg. Elétrica (±30%)
            </button>
          )}

          <button
            className="btn btn-primary"
            onClick={handlePrint}
            style={{ backgroundColor: '#2563eb', padding: '6px 14px', fontSize: '0.8rem' }}
          >
            <Printer size={15} /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* ═══ FOLHA A4 CLEAN ═══ */}
      <div
        className="pdf-paper"
        style={{
          width: '100%',
          maxWidth: '820px',
          backgroundColor: '#ffffff',
          color: '#1e293b',
          borderRadius: '4px',
          padding: '36px 44px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
          fontSize: '11px',
          lineHeight: '1.5',
          boxSizing: 'border-box'
        }}
      >
        {/* Cabeçalho do Laudo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1e3a8a', paddingBottom: '12px', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ backgroundColor: '#1e3a8a', color: '#ffffff', fontWeight: 900, padding: '3px 7px', borderRadius: '3px', fontSize: '13px' }}>
                MEDLASER
              </span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>
                BRASIL
              </span>
            </div>
            <div style={{ fontSize: '9px', color: '#64748b', marginTop: '3px' }}>
              Manutenção e Calibração de Equipamentos Médicos & Hospitalares LTDA
            </div>
            <div style={{ fontSize: '8.5px', color: '#94a3b8' }}>
              CNPJ: 30.619.169/0001-95 • Registro CREA/CRT
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>
              CERTIFICADO DE CALIBRAÇÃO
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', marginTop: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>OS Nº:</span>
              <input
                type="text"
                value={doc.osId}
                onChange={(e) => updateField('osId', e.target.value)}
                style={{ ...inputStyle, width: '100px', fontWeight: 700, color: '#dc2626', textAlign: 'right', padding: '2px 6px' }}
              />
            </div>
            <div style={{ fontSize: '9px', color: '#64748b', marginTop: '3px' }}>
              Emissão: {doc.dataExtenso}
            </div>
          </div>
        </div>

        {/* 1 - CONTRATANTE */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Building2 size={13} /> 1 - CONTRATANTE
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginBottom: '6px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>Razão Social / Nome:</label>
              <input
                type="text"
                value={doc.clienteNome}
                onChange={(e) => updateField('clienteNome', e.target.value)}
                style={{ ...inputStyle, fontWeight: 600 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>CPF / CNPJ:</label>
              <input
                type="text"
                value={doc.clienteCpfCnpj}
                onChange={(e) => updateField('clienteCpfCnpj', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>Endereço:</label>
              <input
                type="text"
                value={doc.clienteEndereco}
                onChange={(e) => updateField('clienteEndereco', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>Telefones:</label>
              <input
                type="text"
                value={doc.clienteTelefones}
                onChange={(e) => updateField('clienteTelefones', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* 2 - LABORATÓRIO E TÉCNICO */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <UserCheck size={13} /> 2 - LABORATÓRIO E TÉCNICO RESPONSÁVEL
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '8px' }}>
            <div style={{ fontSize: '9.5px', color: '#475569', lineHeight: '1.5' }}>
              <strong>Laboratório:</strong> MEDLASER MANUTENÇÃO DE EQUIPAMENTOS MÉDICOS LTDA<br />
              <strong>Endereço:</strong> Rua São Francisco Xavier 989, Loj R Loj H - Rio de Janeiro / RJ
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>Técnico Responsável:</label>
              <input
                type="text"
                value={doc.tecnicoNome}
                onChange={(e) => updateField('tecnicoNome', e.target.value)}
                style={{ ...inputStyle, fontWeight: 700, color: '#1e3a8a' }}
              />
            </div>
          </div>
        </div>

        {/* 3 & 4 - EQUIPAMENTO E CONDIÇÕES DO ENSAIO */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          
          {/* Detalhes do Equipamento */}
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Zap size={13} /> 3 - DETALHES DO EQUIPAMENTO
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '6px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>Modelo:</label>
                <input
                  type="text"
                  value={doc.equipamentoModelo}
                  onChange={(e) => updateField('equipamentoModelo', e.target.value)}
                  style={{ ...inputStyle, fontWeight: 700 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>Número de Série:</label>
                <input
                  type="text"
                  value={doc.equipamentoSerie}
                  onChange={(e) => updateField('equipamentoSerie', e.target.value)}
                  style={{ ...inputStyle, fontWeight: 700, color: '#b91c1c' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>Linha / Uso:</label>
                <input
                  type="text"
                  value={doc.equipamentoLinha}
                  onChange={(e) => updateField('equipamentoLinha', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>Fabricante:</label>
                <input
                  type="text"
                  value={doc.equipamentoFabricante}
                  onChange={(e) => updateField('equipamentoFabricante', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Condições de Ensaio */}
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Thermometer size={13} /> 4 - CONDIÇÕES DO ENSAIO
            </div>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px 12px', fontSize: '9.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>Temperatura Ambiente:</span>
                <strong>+25°C (15°C a 30°C)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>Umidade Relativa:</span>
                <strong>80% (30% a 85%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>Pressão Atmosférica:</span>
                <strong>900 hPa</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: '#64748b' }}>Voltagem da Rede:</span>
                <strong>216V (60Hz)</strong>
              </div>
            </div>
          </div>

        </div>

        {/* ENSAIOS DE SEGURANÇA ELÉTRICA (NBR IEC 62353) */}
        {(doc.resistenciaTerra || doc.correnteFuga) && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Activity size={13} color="#0284c7" /> ENSAIOS DE SEGURANÇA ELÉTRICA (NBR IEC 62353)
              </div>
              <button
                onClick={handleRandomizeSegElet}
                style={{
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #fde68a',
                  borderRadius: '3px',
                  padding: '2px 8px',
                  fontSize: '9px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Randomizar valores de ensaio em ±30%"
              >
                <Sparkles size={11} /> Randomizar (±30%)
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {doc.resistenciaTerra && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: '#166534' }}>Resistência para o Terra (IEC 5.3.2):</span>
                    <span style={{ fontSize: '8.5px', fontWeight: 700, color: '#15803d', backgroundColor: '#dcfce7', padding: '1px 5px', borderRadius: '3px' }}>APROVADO (≤ 0.30 Ω)</span>
                  </div>
                  <input
                    type="text"
                    value={doc.resistenciaTerra}
                    onChange={(e) => updateField('resistenciaTerra', e.target.value)}
                    style={{ ...inputStyle, fontWeight: 700, color: '#166534', backgroundColor: '#ffffff' }}
                  />
                </div>
              )}
              {doc.correnteFuga && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: '#166534' }}>Corrente de Fuga para Carcaça (IEC 5.3.3):</span>
                    <span style={{ fontSize: '8.5px', fontWeight: 700, color: '#15803d', backgroundColor: '#dcfce7', padding: '1px 5px', borderRadius: '3px' }}>APROVADO (≤ 100 µA)</span>
                  </div>
                  <input
                    type="text"
                    value={doc.correnteFuga}
                    onChange={(e) => updateField('correnteFuga', e.target.value)}
                    style={{ ...inputStyle, fontWeight: 700, color: '#166534', backgroundColor: '#ffffff' }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5 - CHECKLIST DE MANUTENÇÃO PREVENTIVA / CORRETIVA */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <CheckCircle2 size={13} /> 5 - AVALIAÇÃO E MANUTENÇÃO PREVENTIVA / CORRETIVA
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '9.5px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '4px' }}>
            <div>✔️ Verificação da carcaça: <strong style={{ color: '#166534' }}>OK</strong></div>
            <div>✔️ Pedais de acionamento: <strong style={{ color: '#166534' }}>OK</strong></div>
            <div>✔️ Painel de controle: <strong style={{ color: '#166534' }}>OK</strong></div>
            <div>✔️ Cabo de força: <strong style={{ color: '#166534' }}>OK</strong></div>
            <div>✔️ Limpeza externa: <strong style={{ color: '#166534' }}>OK</strong></div>
            <div>✔️ Limpeza interna: <strong style={{ color: '#166534' }}>OK</strong></div>
          </div>
        </div>

        {/* 6 - CONSIDERAÇÕES FINAIS E ASSINATURA */}
        <div style={{ borderTop: '1.5px solid #cbd5e1', paddingTop: '12px', marginTop: '14px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1e3a8a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Award size={13} /> 6 - CONSIDERAÇÕES FINAIS E PARECER TÉCNICO
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <span style={{ fontSize: '9.5px', color: '#64748b' }}>Data do Laudo:</span>
            <input
              type="text"
              value={doc.dataExtenso}
              onChange={(e) => updateField('dataExtenso', e.target.value)}
              style={{ ...inputStyle, width: '220px', padding: '2px 6px', fontSize: '10px' }}
            />
          </div>

          <p style={{ fontSize: '9.5px', color: '#334155', margin: '0 0 20px 0', lineHeight: '1.6', textAlign: 'justify' }}>
            EU, <strong>{(doc.tecnicoNome || '').toUpperCase()}</strong>, DECLARO QUE O EQUIPAMENTO EM QUESTÃO ENCONTRA-SE <strong>APTO PARA USO DENTRO DAS FAIXAS DE ENERGIA E FREQUÊNCIA ENSAIADAS</strong>, UMA VEZ QUE APRESENTOU BOM FUNCIONAMENTO EM TODAS AS SITUAÇÕES. ESTE LAUDO TEM VALIDADE DE 12 MESES.
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '8.5px', color: '#94a3b8' }}>
              Autenticado digitalmente por Medlaser Brasil.<br />
              Ordem de Serviço #{doc.osId}.
            </div>

            <div style={{ textAlign: 'center', width: '240px' }}>
              <div style={{ borderBottom: '1.5px solid #1e293b', marginBottom: '4px' }}></div>
              <div style={{ fontWeight: 800, fontSize: '10.5px', color: '#1e3a8a' }}>
                {(doc.tecnicoNome || 'ROBERTO ALDILEI FAVORETO').toUpperCase()}
              </div>
              <div style={{ fontSize: '8.5px', color: '#64748b' }}>
                TÉCNICO RESPONSÁVEL / ENGENHARIA CLÍNICA
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
