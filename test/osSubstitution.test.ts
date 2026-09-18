import { describe, it, expect } from 'bun:test';
import path from 'path';
import fs from 'fs';
import { parseXlsx } from '../src/services/xlsxService.js';
import { applyOsSubstitutions, DbOrder, updateAllDateFields, formatDateExtenso } from '../src/ui/osSubstitution.js';

describe('Substituição de Dados da OS no Certificado/Laudo (osSubstitution)', () => {
  const templatePath = path.resolve(import.meta.dir, '../templates/ERBE_11357322_OS7582_20260813.xlsx');

  const createMockParsed = () => {
    const matrix: any[][] = Array.from({ length: 75 }, () => []);
    matrix[0] = [{ value: '1 - CONTRATANTE', displayValue: '1 - CONTRATANTE', address: 'A1', row: 1, col: 1, isNumeric: false }];
    matrix[2] = [null, { value: 'Cliente Antigo CNPJ: 00.000.000/0001-00', displayValue: 'Cliente Antigo CNPJ: 00.000.000/0001-00', address: 'B3', row: 3, col: 2, isNumeric: false }];
    matrix[3] = [null, { value: 'Endereço Antigo', displayValue: 'Endereço Antigo', address: 'B4', row: 4, col: 2, isNumeric: false }];
    matrix[4] = [null, { value: 'Município: Belo horizonte MG Telefone: (00)0000-0000', displayValue: 'Município: Belo horizonte MG Telefone: (00)0000-0000', address: 'B5', row: 5, col: 2, isNumeric: false }];
    matrix[5] = [{ value: '2 - LABORATÓRIO E TÉCNICO RESPONSÁVEL', displayValue: '2 - LABORATÓRIO E TÉCNICO RESPONSÁVEL', address: 'A6', row: 6, col: 1, isNumeric: false }];
    matrix[6] = [{ value: 'Resposável Ténico: Antigo Técnico', displayValue: 'Resposável Ténico: Antigo Técnico', address: 'A7', row: 7, col: 1, isNumeric: false }];

    // Seção 5: r > 40
    matrix[44] = [
      null, null, null, null, null,
      { value: 'Número de Série', displayValue: 'Número de Série', address: 'F45', row: 45, col: 6, isNumeric: false },
      { value: 'SN-ANTIGO', displayValue: 'SN-ANTIGO', address: 'G45', row: 45, col: 7, isNumeric: false }
    ];
    matrix[45] = [
      null, null, null, null, null,
      { value: 'Ordem de Serviço', displayValue: 'Ordem de Serviço', address: 'F46', row: 46, col: 6, isNumeric: false },
      { value: '1000', displayValue: '1000', address: 'G46', row: 46, col: 7, isNumeric: false }
    ];

    matrix[49] = [{ value: 'ENSAIO  REALIZADO NO DIA 01 DE JANEIRO DE 2020', displayValue: 'ENSAIO  REALIZADO NO DIA 01 DE JANEIRO DE 2020', address: 'A50', row: 50, col: 1, isNumeric: false }];
    matrix[51] = [{ value: 'AVALIAÇÃO  REALIZADA NO DIA 01 DE JANEIRO DE 2020', displayValue: 'AVALIAÇÃO  REALIZADA NO DIA 01 DE JANEIRO DE 2020', address: 'A52', row: 52, col: 1, isNumeric: false }];
    matrix[59] = [{ value: 'Belo Horizonte, 01 de janeiro de 2020', displayValue: 'Belo Horizonte, 01 de janeiro de 2020', address: 'A60', row: 60, col: 1, isNumeric: false }];
    matrix[61] = [{ value: 'Data do Laudo: 01/01/2020', displayValue: 'Data do Laudo: 01/01/2020', address: 'A62', row: 62, col: 1, isNumeric: false }];
    matrix[69] = [{ value: 'ROBERTO ALDILEI FAVORETO', displayValue: 'ROBERTO ALDILEI FAVORETO', address: 'A70', row: 70, col: 1, isNumeric: false }];

    return {
      filePath: 'mock.xlsx',
      fileName: 'mock.xlsx',
      sheets: [
        {
          name: 'Relatório',
          rowCount: 75,
          colCount: 15,
          matrix,
          cells: {}
        }
      ],
      measurementCellsCount: 0
    };
  };

  it('substitui os dados da OS com sucesso e atualiza datas para o dia de agora', async () => {
    let parsed: any;
    if (fs.existsSync(templatePath)) {
      parsed = await parseXlsx(templatePath);
    } else {
      parsed = createMockParsed();
    }
    expect(parsed.sheets.length).toBeGreaterThan(0);

    const mockOs: DbOrder = {
      id: '9911',
      cliente_nome: 'Hospital Geral Integrado de Campinas',
      cliente_cpf_cnpj: '44.555.666/0001-77',
      cliente_endereco: 'Rua das Flores 500, Centro - Campinas / SP',
      cliente_telefones: '(19) 3322-1100',
      equipamento_modelo: 'VIO 300 D MedLaser',
      equipamento_codigo: 'SN-TESTE-9911',
      tecnico_responsavel: 'Carlos Eduardo Oliveira',
      data_entrada: '10/09/2026'
    };

    const result = applyOsSubstitutions(parsed as any, mockOs);

    expect(result.replacedCount).toBeGreaterThan(0);
    expect(result.diffs.length).toBeGreaterThan(0);

    // Verifica que as alterações foram registradas nos diffs
    const clienteDiff = result.diffs.find(d => d.fieldCategory === 'Contratante');
    expect(clienteDiff).toBeDefined();
    expect(clienteDiff?.newValue).toContain('Hospital Geral Integrado de Campinas');

    const tecDiff = result.diffs.find(d => d.fieldCategory === 'Técnico / Laboratório');
    expect(tecDiff).toBeDefined();
    expect(tecDiff?.newValue).toContain('Carlos Eduardo Oliveira');

    const serieDiff = result.diffs.find(d => d.fieldCategory === 'Número de Série');
    expect(serieDiff).toBeDefined();
    expect(serieDiff?.newValue).toContain('SN-TESTE-9911');

    const osDiff = result.diffs.find(d => d.fieldCategory === 'Ordem de Serviço');
    expect(osDiff).toBeDefined();
    expect(osDiff?.newValue).toBe('9911');

    // Verifica que qualquer parte que contenha data foi atualizada para a data de hoje
    const dateDiffs = result.diffs.filter(d => d.fieldCategory === 'Datas');
    expect(dateDiffs.length).toBeGreaterThan(0);
    const todayExtenso = formatDateExtenso();
    expect(dateDiffs.some(d => d.newValue.includes(todayExtenso) || d.newValue.includes(String(new Date().getFullYear())))).toBe(true);
  });

  it('updateAllDateFields atualiza assinaturas, laudo e datas curtas para hoje', () => {
    const mock = createMockParsed();
    const res = updateAllDateFields(mock as any);
    expect(res.replacedCount).toBeGreaterThanOrEqual(4);

    const todayExtenso = formatDateExtenso();
    const ensaioCell = res.updatedParsedData.sheets[0].matrix[49][0]?.value;
    expect(ensaioCell).toContain(todayExtenso);

    const now = new Date();
    const ano = now.getFullYear();
    const assinaturaCell = res.updatedParsedData.sheets[0].matrix[59][0]?.value;
    expect(assinaturaCell).toContain(String(ano));

    const laudoCell = res.updatedParsedData.sheets[0].matrix[61][0]?.value;
    expect(laudoCell).toContain(String(ano));
  });
});
