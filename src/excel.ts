import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import type { ScrapedItem } from './types/index.js';

/**
 * Salva a lista de itens extraídos em um arquivo Excel (.xlsx).
 *
 * @param items Lista de objetos extraídos pelo scraper
 * @param filePath Caminho completo onde a planilha será salva
 */
export async function exportToExcel(items: ScrapedItem[], filePath: string): Promise<string> {
  // Garante que o diretório de destino existe
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Automação Scraper';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Dados Extraídos', {
    views: [{ showGridLines: true }]
  });

  // Configuração das colunas
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Título / Citação', key: 'title', width: 50 },
    { header: 'Autor', key: 'author', width: 25 },
    { header: 'Tags', key: 'tags', width: 30 },
    { header: 'URL de Origem', key: 'url', width: 35 },
    { header: 'Data da Extração', key: 'scrapedAt', width: 22 },
  ];

  // Estilização do cabeçalho (Linha 1)
  const headerRow = worksheet.getRow(1);
  headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1F4E78' } // Azul escuro corporativo
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  // Adiciona os dados
  for (const item of items) {
    const row = worksheet.addRow({
      id: item.id,
      title: item.title,
      author: item.author,
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : item.tags,
      url: item.url || '',
      scrapedAt: item.scrapedAt
    });

    row.height = 20;
    row.alignment = { vertical: 'middle', wrapText: true };
  }

  // Ajuste automático leve da largura das colunas
  worksheet.columns.forEach((column) => {
    let maxLen = column.header ? column.header.length : 10;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const cellVal = cell.value ? cell.value.toString() : '';
      if (cellVal.length > maxLen) {
        maxLen = cellVal.length;
      }
    });
    column.width = Math.min(Math.max(maxLen + 4, 12), 60);
  });

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}
