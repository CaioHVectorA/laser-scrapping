import { describe, it, expect } from 'bun:test';

interface OrderItem {
  id: string;
  situacao: string;
  data_entrada: string;
  cliente_nome: string;
  cliente_cpf_cnpj: string;
  equipamento_modelo: string;
  equipamento_codigo: string;
  tecnico_responsavel: string;
}

const normalizeStr = (str: string, isCaseSensitive: boolean): string => {
  if (!str) return '';
  let res = str;
  if (!isCaseSensitive) {
    res = res.toLowerCase();
  }
  return res.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

const sampleOrders: OrderItem[] = [
  {
    id: '7582',
    situacao: 'Aguardando Análise',
    data_entrada: '13/08/2026',
    cliente_nome: 'Hospital São Lucas & Cia',
    cliente_cpf_cnpj: '12.345.678/0001-90',
    equipamento_modelo: 'ERBE VIO 300D',
    equipamento_codigo: 'SN-998811',
    tecnico_responsavel: 'Roberto Aldilei Favoreto'
  },
  {
    id: '7507',
    situacao: 'Finalizada',
    data_entrada: '14/08/2026',
    cliente_nome: 'Clínica Médica Esperança',
    cliente_cpf_cnpj: '98.765.432/0001-11',
    equipamento_modelo: 'Quanta Cyber Ho 60',
    equipamento_codigo: 'CYH00360120',
    tecnico_responsavel: 'João da Silva'
  },
  {
    id: '7229',
    situacao: 'Em execução',
    data_entrada: '26/05/2026',
    cliente_nome: 'Instituto do Laser',
    cliente_cpf_cnpj: '55.444.333/0001-22',
    equipamento_modelo: 'UroPulse HRM',
    equipamento_codigo: 'HRM0244',
    tecnico_responsavel: 'Em aberto'
  }
];

describe('Filtros Inteligentes de Ordens de Serviço (OSTable Filters)', () => {
  it('encontra registros ignorando maiúsculas/minúsculas e acentuação', () => {
    // Buscar "sao lucas" encontra "Hospital São Lucas & Cia"
    const q1 = normalizeStr('sao lucas', false);
    const results1 = sampleOrders.filter(o => normalizeStr(o.cliente_nome, false).includes(q1));
    expect(results1).toHaveLength(1);
    expect(results1[0].id).toBe('7582');

    // Buscar "analise" encontra "Aguardando Análise"
    const q2 = normalizeStr('analise', false);
    const results2 = sampleOrders.filter(o => normalizeStr(o.situacao, false).includes(q2));
    expect(results2).toHaveLength(1);
    expect(results2[0].id).toBe('7582');

    // Buscar "joao" encontra "João da Silva"
    const q3 = normalizeStr('joao', false);
    const results3 = sampleOrders.filter(o => normalizeStr(o.tecnico_responsavel, false).includes(q3));
    expect(results3).toHaveLength(1);
    expect(results3[0].id).toBe('7507');
  });

  it('suporta modo Case-Sensitive quando ativado', () => {
    // Modo exato: "roberto" em minúsculo NÃO deve achar "Roberto" se caseSensitive = true
    const qCase = normalizeStr('roberto', true);
    const resultsCase = sampleOrders.filter(o => normalizeStr(o.tecnico_responsavel, true).includes(qCase));
    expect(resultsCase).toHaveLength(0);

    // Com caseSensitive = true e grafia exata "Roberto", deve encontrar
    const qExact = normalizeStr('Roberto', true);
    const resultsExact = sampleOrders.filter(o => normalizeStr(o.tecnico_responsavel, true).includes(qExact));
    expect(resultsExact).toHaveLength(1);
    expect(resultsExact[0].id).toBe('7582');
  });

  it('filtra corretamente por Técnico Responsável', () => {
    const techFilter = 'Roberto Aldilei Favoreto';
    const filtered = sampleOrders.filter(o => o.tecnico_responsavel === techFilter);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('7582');

    const openFilter = 'Em aberto';
    const openOrders = sampleOrders.filter(o => o.tecnico_responsavel === openFilter);
    expect(openOrders).toHaveLength(1);
    expect(openOrders[0].id).toBe('7229');
  });

  it('ordena corretamente por número da OS (numérico) crescente e decrescente', () => {
    const sortedAsc = [...sampleOrders].sort((a, b) => parseInt(a.id) - parseInt(b.id));
    expect(sortedAsc.map(o => o.id)).toEqual(['7229', '7507', '7582']);

    const sortedDesc = [...sampleOrders].sort((a, b) => parseInt(b.id) - parseInt(a.id));
    expect(sortedDesc.map(o => o.id)).toEqual(['7582', '7507', '7229']);
  });

  it('ordena alfabeticamente por Técnico', () => {
    const sortedTech = [...sampleOrders].sort((a, b) => 
      a.tecnico_responsavel.localeCompare(b.tecnico_responsavel, 'pt-BR')
    );
    expect(sortedTech.map(o => o.tecnico_responsavel)).toEqual([
      'Em aberto',
      'João da Silva',
      'Roberto Aldilei Favoreto'
    ]);
  });
});
