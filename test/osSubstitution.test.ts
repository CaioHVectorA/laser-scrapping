import { describe, it, expect } from 'bun:test';
import path from 'path';
import { parseXlsx } from '../src/services/xlsxService.js';
import { applyOsSubstitutions, DbOrder } from '../src/ui/osSubstitution.js';

describe('Substituição de Dados da OS no Certificado/Laudo (osSubstitution)', () => {
  const templatePath = path.resolve(import.meta.dir, '../templates/ERBE_11357322_OS7582_20260813.xlsx');

  it('substitui os dados da OS com sucesso no template real da MedLaser', async () => {
    const parsed = await parseXlsx(templatePath);
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
  });
});
