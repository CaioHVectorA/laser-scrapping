import fs from 'node:fs';
import path from 'node:path';
import type { ScrapedItem } from './types/index.js';

async function getDatabaseConnection(dbPath: string) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Tenta bun:sqlite primeiro em runtime Bun
  if (typeof (globalThis as any).Bun !== 'undefined' || (process as any).versions?.bun) {
    try {
      const packageName = 'bun:sqlite';
      const sqliteModule = await import(packageName);
      const db = new sqliteModule.Database(dbPath);
      db.exec('PRAGMA journal_mode = WAL;');
      return db;
    } catch {
      // Fallback para node:sqlite
    }
  }

  // Fallback para node:sqlite em Node 22/24+
  try {
    const sqliteModule = await import('node:sqlite');
    const db = new sqliteModule.DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    return db;
  } catch (err) {
    console.error('❌ Falha ao carregar driver SQLite (bun:sqlite ou node:sqlite):', err);
    throw err;
  }
}

/**
 * Salva ou atualiza (UPSERT) uma lista de Ordens de Serviço no banco de dados SQLite.
 * Suporta bun:sqlite (Bun) e node:sqlite (Node 22/24+).
 */
export async function saveToDatabase(items: ScrapedItem[], dbPath: string): Promise<number> {
  const db = await getDatabaseConnection(dbPath);

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

  const sql = `
    INSERT INTO ordens_servico (
      id, situacao, data_entrada, cliente_nome, cliente_cpf_cnpj, cliente_endereco, cliente_telefones, cliente_email,
      equipamento_modelo, equipamento_codigo, equipamento_linha_uso, equipamento_dimensoes, equipamento_descricao, equipamento_acessorios,
      servico_tipo, tecnico_responsavel, descricao_problema, valor_orcamento, observacoes, laudo_tecnico, scraped_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
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
  `;

  const insertStmt = db.prepare(sql);
  let count = 0;

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const item of items) {
      const val = [
        item.id,
        item.situacao || '',
        item.dataEntrada || '',
        item.clienteNome || '',
        item.clienteCpfCnpj || '',
        item.clienteEndereco || '',
        item.clienteTelefones || '',
        item.clienteEmail || '',
        item.equipamentoModelo || '',
        item.equipamentoCodigo || '',
        item.equipamentoLinhaUso || '',
        item.equipamentoDimensoes || '',
        item.equipamentoDescricao || '',
        item.equipamentoAcessorios || '',
        item.servicoTipo || '',
        item.tecnicoResp || '',
        item.descricaoProblema || '',
        typeof item.valorOrcamento === 'number' ? item.valorOrcamento : parseFloat(String(item.valorOrcamento).replace(',', '.')) || 0,
        item.observacoes || '',
        item.laudoTecnico || '',
        item.scrapedAt || new Date().toLocaleString('pt-BR')
      ];

      insertStmt.run(...val);
      count++;
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  if (typeof db.close === 'function') {
    db.close();
  }

  return count;
}

