import { XlsxParsed, XlsxSheet, XlsxCellData } from './types.js';

export interface DbOrder {
  id: string;
  situacao?: string;
  data_entrada?: string;
  cliente_nome?: string;
  cliente_cpf_cnpj?: string;
  cliente_endereco?: string;
  cliente_telefones?: string;
  cliente_email?: string;
  equipamento_modelo?: string;
  equipamento_codigo?: string;
  equipamento_linha_uso?: string;
  equipamento_dimensoes?: string;
  equipamento_descricao?: string;
  equipamento_acessorios?: string;
  servico_tipo?: string;
  tecnico_responsavel?: string;
  descricao_problema?: string;
  valor_orcamento?: number;
  observacoes?: string;
  laudo_tecnico?: string;
  scraped_at?: string;
}

export interface SubstitutionDiffItem {
  fieldCategory: 'Contratante' | 'Técnico / Laboratório' | 'Número de Série' | 'Datas' | 'Ordem de Serviço' | 'Equipamento';
  label: string;
  address?: string;
  oldValue: string;
  newValue: string;
}

export interface SubstitutionResult {
  updatedParsedData: XlsxParsed;
  diffs: SubstitutionDiffItem[];
  replacedCount: number;
}

/**
 * Limpa textos que possam conter quebras de linha ou tabulações brutas.
 */
function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .split('\t')[0]
    .split('\n')[0]
    .replace(/^Nome:\s*/i, '')
    .replace(/^Modelo:\s*/i, '')
    .trim();
}

/**
 * Extrai o CNPJ ou CPF limpo.
 */
function cleanCpfCnpj(rawCpfCnpj: string | null | undefined, rawClienteNome: string | null | undefined): string {
  const combined = `${rawCpfCnpj || ''} ${rawClienteNome || ''}`;
  const match = combined.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/);
  return match ? match[0] : (cleanText(rawCpfCnpj) || '');
}

/**
 * Extrai endereço limpo.
 */
function cleanEndereco(rawEndereco: string | null | undefined, rawClienteNome: string | null | undefined): string {
  if (rawEndereco && !rawEndereco.includes('\n')) return rawEndereco.trim();
  const combined = `${rawEndereco || ''}\n${rawClienteNome || ''}`;
  const match = combined.match(/Endereço:\s*([^\n]+)/i);
  return match ? match[1].trim() : cleanText(rawEndereco);
}

/**
 * Extrai telefones limpos.
 */
function cleanTelefones(rawTelefones: string | null | undefined, rawClienteNome: string | null | undefined): string {
  if (rawTelefones && !rawTelefones.includes('\n')) return rawTelefones.trim();
  const combined = `${rawTelefones || ''}\n${rawClienteNome || ''}`;
  const match = combined.match(/Telefones?:\s*([^\n\t]+)/i);
  return match ? match[1].trim() : cleanText(rawTelefones);
}

/**
 * Converte a data da entrada/ensaio para extenso no padrão do laudo.
 * Ex: "18 DE AGOSTO DE 2026"
 */
export function formatDateExtenso(dateStr?: string): string {
  const meses = [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
  ];

  if (!dateStr || dateStr.trim() === '') {
    const now = new Date();
    return `${now.getDate()} DE ${meses[now.getMonth()]} DE ${now.getFullYear()}`;
  }

  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthIdx = parseInt(match[2], 10) - 1;
    const year = match[3];
    if (meses[monthIdx]) {
      return `${day} DE ${meses[monthIdx]} DE ${year}`;
    }
  }

  // ISO string fallback (ex: 2026-05-11)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthIdx = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    if (meses[monthIdx]) {
      return `${day} DE ${meses[monthIdx]} DE ${year}`;
    }
  }

  return dateStr.toUpperCase();
}

/**
 * Subtitui os campos da OS na primeira página (Relatório / Certificado) da planilha XLSX.
 */
export function applyOsSubstitutions(
  parsedData: XlsxParsed,
  order: DbOrder,
  workbookRef?: any
): SubstitutionResult {
  const cloned = JSON.parse(JSON.stringify(parsedData)) as XlsxParsed;
  const diffs: SubstitutionDiffItem[] = [];
  let replacedCount = 0;

  if (!cloned.sheets || cloned.sheets.length === 0) {
    return { updatedParsedData: cloned, diffs, replacedCount: 0 };
  }

  // A primeira folha (index 0) é a folha de certificado / dados ("Relatório" ou "Dados")
  const targetSheet = cloned.sheets[0];
  const matrix = targetSheet.matrix;
  const sheetName = targetSheet.name;
  const excelWorksheet = workbookRef?.getWorksheet(sheetName);

  // Preparação dos dados da OS formatados
  const osId = String(order.id || '').trim();
  const clienteNome = cleanText(order.cliente_nome) || 'Cliente Não Informado';
  const clienteCpfCnpj = cleanCpfCnpj(order.cliente_cpf_cnpj, order.cliente_nome);
  const clienteEndereco = cleanEndereco(order.cliente_endereco, order.cliente_nome);
  const clienteTelefone = cleanTelefones(order.cliente_telefones, order.cliente_nome);

  const tecnicoNome = (order.tecnico_responsavel && order.tecnico_responsavel !== 'Em aberto')
    ? order.tecnico_responsavel.trim()
    : 'Roberto Aldilei Favoreto';
  const tecnicoUpper = tecnicoNome.toUpperCase();

  const equipamentoLinha = cleanText(order.equipamento_linha_uso) || 'Laser';
  const equipamentoModelo = cleanText(order.equipamento_modelo) || 'UroPulse';
  const equipamentoSerie = cleanText(order.equipamento_codigo) || '';
  const dataExtenso = formatDateExtenso(order.data_entrada || order.scraped_at);

  const helperSetCell = (rIdx: number, cIdx: number, val: string, category: SubstitutionDiffItem['fieldCategory'], label: string) => {
    if (rIdx < 0 || rIdx >= matrix.length) return;
    const row = matrix[rIdx];
    if (!row) return;
    const cell = row[cIdx];
    if (!cell) return;

    const oldDisplay = String(cell.displayValue || cell.value || '').trim();
    // Protege células de rótulo para não sobrescrever o título da linha
    if (/^(N[úu]mero de S[ée]rie|Ordem de Servi[çc]o)/i.test(oldDisplay)) {
      return;
    }

    if (oldDisplay !== val) {
      diffs.push({
        fieldCategory: category,
        label,
        address: cell.address,
        oldValue: oldDisplay,
        newValue: val
      });
      cell.value = val;
      cell.displayValue = val;
      if (excelWorksheet) {
        try {
          excelWorksheet.getRow(rIdx + 1).getCell(cIdx + 1).value = val;
        } catch {}
      }
      replacedCount++;
    }
  };

  // ═══ 1. CONTRATANTE ═══
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const text = String(cell.displayValue || cell.value || '').trim();

      if (text.includes('1 - CONTRATANTE')) {
        // Linha Nome + CNPJ
        const linhaNomeStr = `,${clienteNome} ${clienteCpfCnpj ? 'CNPJ: ' + clienteCpfCnpj : ''}`.replace(/^,/, '');
        helperSetCell(r + 2, c + 1, linhaNomeStr, 'Contratante', 'Nome e CNPJ do Contratante');

        // Linha Endereço
        if (clienteEndereco) {
          helperSetCell(r + 3, c + 1, clienteEndereco, 'Contratante', 'Endereço do Contratante');
        }

        // Linha Telefone / Município
        const telStr = `Município: Belo horizonte MG Telefone:  ${clienteTelefone}`;
        helperSetCell(r + 4, c + 1, telStr, 'Contratante', 'Telefone do Contratante');
      }
    }
  }

  // ═══ 2. TÉCNICO E LABORATÓRIO ═══
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const text = String(cell.displayValue || cell.value || '').trim();

      // Responsável Técnico no item 2
      if (/^Respos[áa]vel\s*T[ée]nico:/i.test(text)) {
        const newTecStr = `Resposável Ténico: ${tecnicoNome}`;
        helperSetCell(r, c, newTecStr, 'Técnico / Laboratório', 'Responsável Técnico');
      }

      // Declaração final (Item 7)
      if (text.includes('DECLARO QUE O EQUIPAMENTE') || text.includes('DECLARO QUE O EQUIPAMENTO')) {
        const declStr = `EU ${tecnicoUpper} DECLARO QUE O EQUIPAMENTE EM QUESTÃO ENCONTRA-SE APTO`;
        helperSetCell(r, c, declStr, 'Técnico / Laboratório', 'Declaração do Técnico');
      }

      // Assinaturas do Técnico (nome isolado em linha de assinatura)
      if (text === 'ROBERTO ALDILEI FAVORETO' || text === 'TECNICO RESPONSAVEL') {
        helperSetCell(r, c, tecnicoUpper, 'Técnico / Laboratório', 'Assinatura do Técnico');
      }
    }
  }

  // ═══ 3. NÚMEROS DE SÉRIE E ORDENS DE SERVIÇO E EQUIPAMENTO ═══
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const text = String(cell.displayValue || cell.value || '').trim();

      // Número de Série
      if (/^N[úu]mero\s*de\s*S[ée]rie/i.test(text)) {
        // Preenche as células adjacentes de valor
        for (let colOffset = 4; colOffset <= 7; colOffset++) {
          if (c + colOffset < row.length) {
            helperSetCell(r, c + colOffset, equipamentoSerie, 'Número de Série', `Número de Série (${cell.address})`);
          }
        }
      }

      // Ordem de Serviço
      if (/^Ordem\s*de\s*Servi[çc]o/i.test(text)) {
        for (let colOffset = 4; colOffset <= 7; colOffset++) {
          if (c + colOffset < row.length) {
            helperSetCell(r, c + colOffset, osId, 'Ordem de Serviço', `Ordem de Serviço (#${osId})`);
          }
        }
      }

      // Equipamento / Modelo nas seções 3 e 5
      if (text === 'Equipamento' && r > 50 && r < 70) {
        for (let colOffset = 6; colOffset <= 9; colOffset++) {
          if (c + colOffset < row.length) {
            helperSetCell(r, c + colOffset, `Laser ${equipamentoModelo}`, 'Equipamento', `Equipamento da Calibração`);
          }
        }
      }

      if (text === 'Modelo' && r > 115 && r < 130) {
        for (let colOffset = 4; colOffset <= 7; colOffset++) {
          if (c + colOffset < row.length) {
            helperSetCell(r, c + colOffset, equipamentoModelo, 'Equipamento', `Modelo do Equipamento`);
          }
        }
      }

      if (text === 'Equipamento' && r > 115 && r < 130) {
        for (let colOffset = 4; colOffset <= 7; colOffset++) {
          if (c + colOffset < row.length) {
            helperSetCell(r, c + colOffset, equipamentoLinha, 'Equipamento', `Linha do Equipamento`);
          }
        }
      }
    }
  }

  // ═══ 4. DATAS DO ENSAIO E AVALIAÇÃO ═══
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const text = String(cell.displayValue || cell.value || '').trim();

      if (text.includes('ENSAIO') && text.includes('REALIZADO NO DIA')) {
        const dataEnsaioStr = `ENSAIO  REALIZADO NO DIA ${dataExtenso}`;
        helperSetCell(r, c, dataEnsaioStr, 'Datas', 'Data do Ensaio');
      }

      if (text.includes('AVALIAÇÃO') && text.includes('REALIZADA NO DIA')) {
        const dataAvaliacaoStr = `AVALIAÇÃO  REALIZADA NO DIA ${dataExtenso}`;
        helperSetCell(r, c, dataAvaliacaoStr, 'Datas', 'Data da Avaliação');
      }
    }
  }

  return {
    updatedParsedData: cloned,
    diffs,
    replacedCount
  };
}
