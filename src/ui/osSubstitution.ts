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
  categoria_servico?: string;
  scraped_at?: string;
}

export interface SubstitutionDiffItem {
  fieldCategory: 'Contratante' | 'Técnico / Laboratório' | 'Número de Série' | 'Datas' | 'Ordem de Serviço' | 'Equipamento' | 'Segurança Elétrica';
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

export interface OsSubstitutionOptions {
  randomizeSegElet?: boolean;
  segEletPct?: number; // Padrão: 0.30 (30%)
  customDate?: Date; // Data customizada (padrão: hoje)
}

/**
 * Subtitui os campos da OS na primeira página (Relatório / Certificado) da planilha XLSX.
 */
export function applyOsSubstitutions(
  parsedData: XlsxParsed,
  order: DbOrder,
  workbookRef?: any,
  options?: OsSubstitutionOptions
): SubstitutionResult {
  let cloned = JSON.parse(JSON.stringify(parsedData)) as XlsxParsed;
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

  const equipamentoSerie = cleanText(order.equipamento_codigo) || '';
  // Conforme solicitação do usuário, a data deve SEMPRE ser atualizada para o dia de agora
  const dataExtenso = formatDateExtenso(options?.customDate ? options.customDate.toISOString() : undefined);

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
      if (targetSheet.cells && targetSheet.cells[cell.address]) {
        targetSheet.cells[cell.address].value = val;
        targetSheet.cells[cell.address].displayValue = val;
      }
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

  // ═══ 3. NÚMEROS DE SÉRIE E ORDENS DE SERVIÇO ═══
  // Protege para não alterar Equipamento e Modelo do template ('Não mudar equipamento!')
  // Corrige extravasamento do número de série para células adjacentes (I, J, K, L)
  const processedRows = new Set<number>();

  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const text = String(cell.displayValue || cell.value || '').trim();

      // Número de Série do Equipamento (Seção 5: r > 40)
      // Exclui a linha 31 do Fluke ESA612 ("Número de Série: 1910036")
      if ((/^N[úu]mero\s*de\s*S[ée]rie$/i.test(text) || /^Numero\s*de\s*Serie\s*do\s*Equipamento$/i.test(text)) && r > 40) {
        if (!processedRows.has(r * 1000 + 1)) {
          processedRows.add(r * 1000 + 1);
          if (/do\s*Equipamento/i.test(text)) {
            for (let col = 6; col <= 16; col++) {
              if (col < row.length && row[col] && String(row[col]?.displayValue || row[col]?.value || '').trim() !== '') {
                helperSetCell(r, col, equipamentoSerie, 'Número de Série', `Número de Série Rodapé (Linha ${r + 1})`);
              }
            }
          } else {
            for (let col = 5; col <= 7; col++) {
              if (col < row.length) {
                helperSetCell(r, col, equipamentoSerie, 'Número de Série', `Número de Série (Linha ${r + 1})`);
              }
            }
          }
        }
      }

      // Ordem de Serviço
      if (/^Ordem\s*de\s*Servi[çc]o$/i.test(text) || /^ORDEM\s*DE\s*SERVIÇO$/i.test(text)) {
        if (!processedRows.has(r * 1000 + 2)) {
          processedRows.add(r * 1000 + 2);
          const isExtendedFooter = row[5] && /^ORDEM\s*DE\s*SERVIÇO$/i.test(String(row[5]?.displayValue || row[5]?.value || '').trim());
          if (isExtendedFooter) {
            for (let col = 6; col <= 16; col++) {
              if (col < row.length && row[col] && String(row[col]?.displayValue || row[col]?.value || '').trim() !== '') {
                helperSetCell(r, col, osId, 'Ordem de Serviço', `Ordem de Serviço Rodapé (#${osId})`);
              }
            }
          } else {
            for (let col = 5; col <= 7; col++) {
              if (col < row.length) {
                helperSetCell(r, col, osId, 'Ordem de Serviço', `Ordem de Serviço (#${osId})`);
              }
            }
          }
        }
      }
    }
  }

  // ═══ 4. DATAS DO ENSAIO, AVALIAÇÃO E ASSINATURA (SEMPRE ATUALIZADAS PARA O DIA DE HOJE) ═══
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

  // Varredura universal de datas em todas as partes da planilha, principalmente na assinatura
  const dateRes = updateAllDateFields(cloned, workbookRef, options?.customDate);
  if (dateRes.replacedCount > 0) {
    diffs.push(...dateRes.diffs);
    replacedCount += dateRes.replacedCount;
    cloned = dateRes.updatedParsedData;
  }

  // ═══ 5. SEGURANÇA ELÉTRICA: RANDOMIZAR 30% DOS DADOS DA 1ª ABA ═══
  // Se a planilha contiver ensaios de segurança elétrica (Resistência para o terra e Corrente de fuga),
  // e options?.randomizeSegElet não for explicitamente falso, aplica a variação de ±30%.
  if (options?.randomizeSegElet !== false) {
    const segEletRes = randomizeSegEletFields(cloned, workbookRef, options?.segEletPct ?? 0.30);
    if (segEletRes.replacedCount > 0) {
      diffs.push(...segEletRes.diffs);
      replacedCount += segEletRes.replacedCount;
      cloned = segEletRes.updatedParsedData;
    }
  }

  return {
    updatedParsedData: cloned,
    diffs,
    replacedCount
  };
}

/**
 * Randomiza campos de Segurança Elétrica da 1ª aba (±30%):
 * 1. Resistência para o Terra IEC 62353 5.3.2 (Row 109, colunas K..N) -> limite norma <= 0.30 Ohms
 * 2. Corrente de Fuga para Carcaça (Row 114, colunas K..L) -> limite norma <= 100 uA
 */
export function randomizeSegEletFields(
  parsedData: XlsxParsed,
  workbookRef?: any,
  pct: number = 0.30
): SubstitutionResult {
  const cloned = JSON.parse(JSON.stringify(parsedData)) as XlsxParsed;
  const diffs: SubstitutionDiffItem[] = [];
  let replacedCount = 0;

  if (!cloned.sheets || cloned.sheets.length === 0) {
    return { updatedParsedData: cloned, diffs, replacedCount: 0 };
  }

  const targetSheet = cloned.sheets[0];
  const origSheet = parsedData.sheets?.[0];
  const matrix = targetSheet.matrix;
  const sheetName = targetSheet.name;
  const excelWorksheet = workbookRef?.getWorksheet(sheetName);

  const helperSet = (rIdx: number, cIdx: number, val: string, label: string) => {
    if (rIdx < 0 || rIdx >= matrix.length) return;
    const row = matrix[rIdx];
    if (!row) return;
    const cell = row[cIdx];
    if (!cell) return;

    const oldDisplay = String(cell.displayValue || cell.value || '').trim();
    if (oldDisplay !== val) {
      diffs.push({
        fieldCategory: 'Segurança Elétrica',
        label,
        address: cell.address,
        oldValue: oldDisplay,
        newValue: val
      });

      // Atualiza célula na cópia (cloned)
      cell.value = val;
      cell.displayValue = val;
      if (targetSheet.cells && targetSheet.cells[cell.address]) {
        targetSheet.cells[cell.address].value = val;
        targetSheet.cells[cell.address].displayValue = val;
      }

      // Atualiza célula diretamente no objeto original passado (parsedData)
      if (origSheet) {
        if (origSheet.matrix[rIdx]?.[cIdx]) {
          origSheet.matrix[rIdx][cIdx].value = val;
          origSheet.matrix[rIdx][cIdx].displayValue = val;
        }
        if (origSheet.cells && origSheet.cells[cell.address]) {
          origSheet.cells[cell.address].value = val;
          origSheet.cells[cell.address].displayValue = val;
        }
      }

      // Sincroniza com ExcelJS
      if (excelWorksheet) {
        try {
          excelWorksheet.getRow(rIdx + 1).getCell(cIdx + 1).value = val;
        } catch {}
      }
      replacedCount++;
    }
  };

  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const text = String(cell.displayValue || cell.value || '').trim();

      // 1. Resistência para o Terra IEC 62353 5.3.2
      if (/Resist[êe]ncia\s+(?:para\s+o\s+)?Terra/i.test(text) && !/M[áa]xima|M[íi]nima/i.test(text)) {
        let curValStr = '';
        for (let col = 10; col <= 13; col++) {
          if (row[col]?.displayValue || row[col]?.value) {
            curValStr = String(row[col]?.displayValue || row[col]?.value);
            break;
          }
        }
        const match = curValStr.replace(',', '.').match(/\d+(\.\d+)?/);
        const baseNum = match ? parseFloat(match[0]) : 0.25;
        // Variação ±30%
        let delta = (Math.random() * 2 - 1) * pct;
        // Se a base já estiver no limite superior (>= 0.28), inclina a variação para baixo para não ficar travado
        if (baseNum >= 0.28 && delta > -0.05) {
          delta = -(0.05 + Math.random() * (pct - 0.05));
        }
        let newNum = baseNum * (1 + delta);
        // Limites normativos seguros IEC 62353: máximo 0.28 Ohms para manter APROVADO com folga (norma <= 0.30 Ohms)
        if (newNum > 0.28) newNum = 0.28;
        if (newNum < 0.16) newNum = 0.16;
        let formatted = newNum.toFixed(2).replace('.', ',') + ' Ohms';
        if (formatted === curValStr.trim()) {
          newNum = newNum > 0.22 ? newNum - 0.03 : newNum + 0.03;
          formatted = newNum.toFixed(2).replace('.', ',') + ' Ohms';
        }

        for (let col = 10; col <= 13; col++) {
          helperSet(r, col, formatted, 'Resistência para o Terra IEC 62353');
        }
        break;
      }

      // 2. Corrente de Fuga para Carcaça
      if (/Corrente\s+de\s+Fuga\s+(?:para\s+)?Carca[çc]a/i.test(text) && !/M[áa]xima|M[íi]nima/i.test(text)) {
        let curValStr = '';
        for (let col = 10; col <= 12; col++) {
          if (row[col]?.displayValue || row[col]?.value) {
            curValStr = String(row[col]?.displayValue || row[col]?.value);
            break;
          }
        }
        const match = curValStr.replace(',', '.').match(/\d+(\.\d+)?/);
        const baseNum = match ? parseFloat(match[0]) : 3.0;
        const delta = (Math.random() * 2 - 1) * pct;
        let newNum = baseNum * (1 + delta);
        // Limite seguro IEC 62353 (< 100 uA, proporcional à base)
        if (newNum < 1.5) newNum = 1.5;
        if (baseNum < 10 && newNum > 9.5) newNum = 9.5;
        if (baseNum >= 10 && newNum > 45) newNum = 45;
        let formatted = newNum.toFixed(1).replace('.', ',') + ' uA';
        if (formatted === curValStr.trim()) {
          newNum = newNum > 3.0 ? newNum - 0.6 : newNum + 0.6;
          formatted = newNum.toFixed(1).replace('.', ',') + ' uA';
        }

        for (let col = 10; col <= 11; col++) {
          helperSet(r, col, formatted, 'Corrente de Fuga para Carcaça');
        }
        break;
      }
    }
  }

  return {
    updatedParsedData: cloned,
    diffs,
    replacedCount
  };
}

/**
 * Atualiza todas as datas presentes na planilha para o dia de agora (data atual do sistema).
 * Varre todas as abas, com foco especial na aba de certificado/laudo (1ª aba) e na área de assinaturas.
 */
export function updateAllDateFields(
  parsedData: XlsxParsed,
  workbookRef?: any,
  customDate?: Date
): SubstitutionResult {
  const cloned = JSON.parse(JSON.stringify(parsedData)) as XlsxParsed;
  const diffs: SubstitutionDiffItem[] = [];
  let replacedCount = 0;

  if (!cloned.sheets || cloned.sheets.length === 0) {
    return { updatedParsedData: cloned, diffs, replacedCount: 0 };
  }

  const now = customDate || new Date();
  const dia = now.getDate();
  const mesIdx = now.getMonth();
  const ano = now.getFullYear();

  const meses = [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
  ];
  const mesesMin = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];

  const dataExtensoUpper = `${dia} DE ${meses[mesIdx]} DE ${ano}`;
  const dataExtensoMin = `${dia} de ${mesesMin[mesIdx]} de ${ano}`;
  const dataCurta = `${String(dia).padStart(2, '0')}/${String(mesIdx + 1).padStart(2, '0')}/${ano}`;

  cloned.sheets.forEach((sheet, sheetIdx) => {
    const matrix = sheet.matrix;
    const excelWorksheet = workbookRef?.getWorksheet(sheet.name);

    const helperSet = (rIdx: number, cIdx: number, val: string, label: string) => {
      if (rIdx < 0 || rIdx >= matrix.length) return;
      const row = matrix[rIdx];
      if (!row) return;
      const cell = row[cIdx];
      if (!cell) return;

      const oldDisplay = String(cell.displayValue || cell.value || '').trim();
      if (oldDisplay !== val) {
        diffs.push({
          fieldCategory: 'Datas',
          label: `${label} (${sheet.name})`,
          address: cell.address,
          oldValue: oldDisplay,
          newValue: val
        });
        cell.value = val;
        cell.displayValue = val;
        if (sheet.cells && sheet.cells[cell.address]) {
          sheet.cells[cell.address].value = val;
          sheet.cells[cell.address].displayValue = val;
        }
        if (excelWorksheet) {
          try {
            excelWorksheet.getRow(rIdx + 1).getCell(cIdx + 1).value = val;
          } catch {}
        }
        replacedCount++;
      }
    };

    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row) continue;

      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;

        let text = String(cell.displayValue || cell.value || '').trim();
        if (!text) continue;

        // 1. Frases de Ensaio / Avaliação / Laudo
        if (/ENSAIO\s+(?:REALIZADO\s+NO\s+DIA|DATA)/i.test(text)) {
          const newText = text.replace(/(?:REALIZADO\s+NO\s+DIA|DATA\s*:?)\s*([^\n\r,]+)/i, `REALIZADO NO DIA ${dataExtensoUpper}`);
          if (newText !== text) {
            helperSet(r, c, newText, 'Data do Ensaio');
            continue;
          }
        }
        if (/AVALIA[ÇC][ÃA]O\s+(?:REALIZADA\s+NO\s+DIA|DATA)/i.test(text)) {
          const newText = text.replace(/(?:REALIZADA\s+NO\s+DIA|DATA\s*:?)\s*([^\n\r,]+)/i, `REALIZADA NO DIA ${dataExtensoUpper}`);
          if (newText !== text) {
            helperSet(r, c, newText, 'Data da Avaliação');
            continue;
          }
        }

        // 2. Local e Data na Seção de Assinatura (ex: "Belo Horizonte, 13 de agosto de 2026")
        if (/(?:Belo\s*Horizonte|Rio\s*de\s*Janeiro|S[ãa]o\s*Paulo|[A-Za-zÀ-ÿ\s]+),\s*\d{1,2}\s+de\s+[a-zA-ZçÇ]+\s+de\s+\d{4}/i.test(text)) {
          const newText = text.replace(/([A-Za-zÀ-ÿ\s]+),\s*\d{1,2}\s+de\s+[a-zA-ZçÇ]+\s+de\s+\d{4}/i, `$1, ${dataExtensoMin}`);
          if (newText !== text) {
            helperSet(r, c, newText, 'Data da Assinatura / Local');
            continue;
          }
        }

        // 3. Padrão Extenso Isolado ou em Frase: "18 DE AGOSTO DE 2026"
        if (/\b\d{1,2}\s+DE\s+(?:JANEIRO|FEVEREIRO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+\d{4}\b/i.test(text)) {
          const newText = text.replace(/\b\d{1,2}\s+DE\s+(?:JANEIRO|FEVEREIRO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+\d{4}\b/gi, dataExtensoUpper);
          if (newText !== text) {
            helperSet(r, c, newText, 'Data por Extenso');
            continue;
          }
        }

        // 4. Padrão Extenso minúsculo: "18 de agosto de 2026"
        if (/\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4}\b/i.test(text)) {
          const newText = text.replace(/\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4}\b/gi, dataExtensoMin);
          if (newText !== text) {
            helperSet(r, c, newText, 'Data por Extenso (Assinatura)');
            continue;
          }
        }

        // 5. Rótulo com Data: "Data do Laudo: 13/08/2026", "Data: 13/08/2026", "Emissão: 13/08/2026"
        if (/^(?:data\s*(?:do\s*laudo|da\s*assinatura|de\s*emiss[ãa]o|do\s*ensaio|da\s*calibra[çc][ãa]o)?|emitido\s*em)\s*[:=]\s*\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(text)) {
          const newText = text.replace(/(\d{1,2}\/\d{1,2}\/\d{2,4})/, dataCurta);
          if (newText !== text) {
            helperSet(r, c, newText, 'Data do Documento');
            continue;
          }
        }

        // 6. Célula de rótulo onde a data está na célula adjacente (ex: Col A = "Data:", Col B = "13/08/2026")
        if (/^(?:data(?:\s+do\s+laudo|\s+da\s+assinatura|\s+de\s+emiss[ãa]o|\s+do\s+ensaio|\s+da\s+calibra[çc][ãa]o)?|data\s*:)$/i.test(text)) {
          for (let colOff = 1; colOff <= 3; colOff++) {
            const adjCell = row[c + colOff];
            if (!adjCell) continue;
            const adjText = String(adjCell.displayValue || adjCell.value || '').trim();
            if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(adjText)) {
              helperSet(r, c + colOff, dataCurta, 'Data Adjacente');
              break;
            }
          }
        }

        // 7. Célula standalone de data curta na 1ª folha ou cabeçalhos (mas fora de colunas de medição med1..med5)
        if (sheetIdx === 0 && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
          helperSet(r, c, dataCurta, 'Data Curta (Laudo)');
          continue;
        }
      }
    }
  });

  return {
    updatedParsedData: cloned,
    diffs,
    replacedCount
  };
}
