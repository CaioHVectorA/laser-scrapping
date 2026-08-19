import fs from 'node:fs';
import path from 'node:path';
import type { ScrapedItem } from './types/index.js';

declare const Bun: any;
let DatabaseClass: any = null;

/**
 * Obtém dinamicamente a classe Database do bun:sqlite somente quando executado dentro do Bun.
 */
async function getDatabaseClass() {
  if (!DatabaseClass) {
    if (typeof Bun !== 'undefined' || (process as any).versions?.bun) {
      const packageName = 'bun:sqlite';
      const module = await import(packageName);
      DatabaseClass = module.Database;
    } else {
      throw new Error(
        '⚠️ O suporte a SQLite neste projeto utiliza o driver nativo "bun:sqlite", que requer a runtime Bun.\n' +
        '👉 Para rodar com o navegador visível usando Bun, execute no terminal:\n' +
        '   HEADLESS=false bun src/index.ts\n' +
        '   ou\n' +
        '   npm run start:headed'
      );
    }
  }
  return DatabaseClass;
}

/**
 * Salva ou atualiza (UPSERT) uma lista de Ordens de Serviço no banco de dados SQLite usando bun:sqlite.
 */
export async function saveToDatabase(items: ScrapedItem[], dbPath: string): Promise<number> {
  const DB = await getDatabaseClass();

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DB(dbPath);

  // Ativa modo WAL para melhor performance
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ordens_servico (
      id TEXT PRIMARY KEY,
      situacao TEXT,
      data_entrada TEXT,
      cliente_nome TEXT,
      cliente_cpf_cnpj TEXT,
      cliente_endereco TEXT,
      cliente_telefones TEXT,
      cliente_email TEXT,
      equipamento_modelo TEXT,
      equipamento_codigo TEXT,
      equipamento_linha_uso TEXT,
      equipamento_dimensoes TEXT,
      equipamento_descricao TEXT,
      equipamento_acessorios TEXT,
      servico_tipo TEXT,
      tecnico_responsavel TEXT,
      descricao_problema TEXT,
      valor_orcamento REAL,
      observacoes TEXT,
      laudo_tecnico TEXT,
      scraped_at TEXT
    );
  `);

  const insertStmt = db.prepare(`
    INSERT INTO ordens_servico (
      id, situacao, data_entrada, cliente_nome, cliente_cpf_cnpj, cliente_endereco, cliente_telefones, cliente_email,
      equipamento_modelo, equipamento_codigo, equipamento_linha_uso, equipamento_dimensoes, equipamento_descricao, equipamento_acessorios,
      servico_tipo, tecnico_responsavel, descricao_problema, valor_orcamento, observacoes, laudo_tecnico, scraped_at
    ) VALUES (
      $id, $situacao, $data_entrada, $cliente_nome, $cliente_cpf_cnpj, $cliente_endereco, $cliente_telefones, $cliente_email,
      $equipamento_modelo, $equipamento_codigo, $equipamento_linha_uso, $equipamento_dimensoes, $equipamento_descricao, $equipamento_acessorios,
      $servico_tipo, $tecnico_responsavel, $descricao_problema, $valor_orcamento, $observacoes, $laudo_tecnico, $scraped_at
    ) ON CONFLICT(id) DO UPDATE SET
      situacao = excluded.situacao,
      data_entrada = excluded.data_entrada,
      cliente_nome = excluded.cliente_nome,
      cliente_cpf_cnpj = excluded.cliente_cpf_cnpj,
      cliente_endereco = excluded.cliente_endereco,
      cliente_telefones = excluded.cliente_telefones,
      cliente_email = excluded.cliente_email,
      equipamento_modelo = excluded.equipamento_modelo,
      equipamento_codigo = excluded.equipamento_codigo,
      equipamento_linha_uso = excluded.equipamento_linha_uso,
      equipamento_dimensoes = excluded.equipamento_dimensoes,
      equipamento_descricao = excluded.equipamento_descricao,
      equipamento_acessorios = excluded.equipamento_acessorios,
      servico_tipo = excluded.servico_tipo,
      tecnico_responsavel = excluded.tecnico_responsavel,
      descricao_problema = excluded.descricao_problema,
      valor_orcamento = excluded.valor_orcamento,
      observacoes = excluded.observacoes,
      laudo_tecnico = excluded.laudo_tecnico,
      scraped_at = excluded.scraped_at;
  `);

  let count = 0;

  db.transaction(() => {
    for (const item of items) {
      insertStmt.run({
        $id: item.id,
        $situacao: item.situacao || '',
        $data_entrada: item.dataEntrada || '',
        $cliente_nome: item.clienteNome || '',
        $cliente_cpf_cnpj: item.clienteCpfCnpj || '',
        $cliente_endereco: item.clienteEndereco || '',
        $cliente_telefones: item.clienteTelefones || '',
        $cliente_email: item.clienteEmail || '',
        $equipamento_modelo: item.equipamentoModelo || '',
        $equipamento_codigo: item.equipamentoCodigo || '',
        $equipamento_linha_uso: item.equipamentoLinhaUso || '',
        $equipamento_dimensoes: item.equipamentoDimensoes || '',
        $equipamento_descricao: item.equipamentoDescricao || '',
        $equipamento_acessorios: item.equipamentoAcessorios || '',
        $servico_tipo: item.servicoTipo || '',
        $tecnico_responsavel: item.tecnicoResp || '',
        $descricao_problema: item.descricaoProblema || '',
        $valor_orcamento: typeof item.valorOrcamento === 'number' ? item.valorOrcamento : parseFloat(String(item.valorOrcamento).replace(',', '.')) || 0,
        $observacoes: item.observacoes || '',
        $laudo_tecnico: item.laudoTecnico || '',
        $scraped_at: item.scrapedAt || new Date().toLocaleString('pt-BR')
      });
      count++;
    }
  })();

  db.close();
  return count;
}
