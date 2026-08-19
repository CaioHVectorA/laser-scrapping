import fs from 'node:fs';
import path from 'node:path';
import type { ScrapedItem } from './types/index.js';

/**
 * Escapa valores de string para o formato CSV.
 */
function escapeCsvField(value: string | number | undefined | null): string {
  if (value === undefined || value === null) {
    return '""';
  }
  const cleanValue = String(value).replace(/"/g, '""');
  return `"${cleanValue}"`;
}

/**
 * Salva a lista de itens extraídos da folha de impressão em um arquivo CSV codificado em UTF-8 com BOM (\uFEFF).
 */
export async function exportToCsv(
  items: ScrapedItem[],
  filePath: string,
  delimiter: string = ';'
): Promise<string> {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const headers = [
    'ID',
    'Situação',
    'Data Entrada',
    'Cliente Nome',
    'CPF/CNPJ',
    'Endereço',
    'Telefones',
    'Email',
    'Equipamento Modelo',
    'Equipamento Código',
    'Linha de Uso',
    'Dimensões',
    'Descrição Equipamento',
    'Acessórios',
    'Tipo de Serviço',
    'Técnico Resp.',
    'Descrição Problema',
    'Valor Orçamento (R$)',
    'Observações',
    'Laudo Técnico',
    'Data Extração'
  ];

  const lines: string[] = [];

  // Linha de cabeçalho
  lines.push(headers.map((h) => escapeCsvField(h)).join(delimiter));

  // Linhas de dados
  for (const item of items) {
    const row = [
      escapeCsvField(item.id),
      escapeCsvField(item.situacao),
      escapeCsvField(item.dataEntrada),
      escapeCsvField(item.clienteNome),
      escapeCsvField(item.clienteCpfCnpj),
      escapeCsvField(item.clienteEndereco),
      escapeCsvField(item.clienteTelefones),
      escapeCsvField(item.clienteEmail),
      escapeCsvField(item.equipamentoModelo),
      escapeCsvField(item.equipamentoCodigo),
      escapeCsvField(item.equipamentoLinhaUso),
      escapeCsvField(item.equipamentoDimensoes),
      escapeCsvField(item.equipamentoDescricao),
      escapeCsvField(item.equipamentoAcessorios),
      escapeCsvField(item.servicoTipo),
      escapeCsvField(item.tecnicoResp),
      escapeCsvField(item.descricaoProblema),
      escapeCsvField(item.valorOrcamento),
      escapeCsvField(item.observacoes),
      escapeCsvField(item.laudoTecnico),
      escapeCsvField(item.scrapedAt)
    ];
    lines.push(row.join(delimiter));
  }

  // BOM UTF-8 (\uFEFF) para visualização perfeita no Excel
  const csvContent = '\uFEFF' + lines.join('\n');

  await fs.promises.writeFile(filePath, csvContent, 'utf-8');
  return filePath;
}
