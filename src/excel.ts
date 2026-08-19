import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import type { ScrapedItem } from './types/index.js';

/**
 * Salva a lista de itens detalhados da folha de impressão em uma planilha Excel (.xlsx).
 */
export async function exportToExcel(items: ScrapedItem[], filePath: string): Promise<string> {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Automação Scraper MedLaser';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Impressão OSs', {
    views: [{ showGridLines: true }]
  });

  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Situação', key: 'situacao', width: 18 },
    { header: 'Data Entrada', key: 'dataEntrada', width: 18 },
    { header: 'Cliente Nome', key: 'clienteNome', width: 35 },
    { header: 'CPF/CNPJ', key: 'clienteCpfCnpj', width: 18 },
    { header: 'Endereço', key: 'clienteEndereco', width: 40 },
    { header: 'Telefones', key: 'clienteTelefones', width: 22 },
    { header: 'Email', key: 'clienteEmail', width: 25 },
    { header: 'Equipamento Modelo', key: 'equipamentoModelo', width: 25 },
    { header: 'Equipamento Código', key: 'equipamentoCodigo', width: 18 },
    { header: 'Linha de Uso', key: 'equipamentoLinhaUso', width: 15 },
    { header: 'Dimensões', key: 'equipamentoDimensoes', width: 25 },
    { header: 'Descrição Equipamento', key: 'equipamentoDescricao', width: 30 },
    { header: 'Acessórios', key: 'equipamentoAcessorios', width: 30 },
    { header: 'Tipo de Serviço', key: 'servicoTipo', width: 20 },
    { header: 'Técnico Resp.', key: 'tecnicoResp', width: 18 },
    { header: 'Descrição Problema', key: 'descricaoProblema', width: 40 },
    { header: 'Valor Orçamento (R$)', key: 'valorOrcamento', width: 20 },
    { header: 'Observações', key: 'observacoes', width: 35 },
    { header: 'Laudo Técnico', key: 'laudoTecnico', width: 35 },
    { header: 'Data Extração', key: 'scrapedAt', width: 20 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1F4E78' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  for (const item of items) {
    const row = worksheet.addRow({
      id: item.id,
      situacao: item.situacao,
      dataEntrada: item.dataEntrada,
      clienteNome: item.clienteNome,
      clienteCpfCnpj: item.clienteCpfCnpj,
      clienteEndereco: item.clienteEndereco,
      clienteTelefones: item.clienteTelefones,
      clienteEmail: item.clienteEmail,
      equipamentoModelo: item.equipamentoModelo,
      equipamentoCodigo: item.equipamentoCodigo,
      equipamentoLinhaUso: item.equipamentoLinhaUso,
      equipamentoDimensoes: item.equipamentoDimensoes,
      equipamentoDescricao: item.equipamentoDescricao,
      equipamentoAcessorios: item.equipamentoAcessorios,
      servicoTipo: item.servicoTipo,
      tecnicoResp: item.tecnicoResp,
      descricaoProblema: item.descricaoProblema,
      valorOrcamento: item.valorOrcamento,
      observacoes: item.observacoes,
      laudoTecnico: item.laudoTecnico,
      scrapedAt: item.scrapedAt
    });

    row.height = 20;
    row.alignment = { vertical: 'middle', wrapText: true };
  }

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}
