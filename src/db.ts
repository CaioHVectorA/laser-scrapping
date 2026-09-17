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

export type ServiceCategory = 'calibracao_e_seguranca_eletrica' | 'calibracao' | 'seguranca_eletrica' | 'manutencao_geral';

/**
 * Reconhece explicitamente se uma OS é de Calibração, Segurança Elétrica, Ambas ou Manutenção Geral.
 */
export function detectServiceCategory(
  servicoTipo?: string | null,
  descricaoProblema?: string | null,
  observacoes?: string | null
): { categoryKey: ServiceCategory; label: string } {
  const text = [(servicoTipo || ''), (descricaoProblema || ''), (observacoes || '')].join(' ').toLowerCase();
  const norm = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const hasCalib = norm.includes('calibra') || norm.includes('calib');
  const hasSeg = norm.includes('seguranca eletrica') ||
                 norm.includes('seg eletrica') ||
                 norm.includes('segu eletrica') ||
                 norm.includes('seg. eletrica') ||
                 norm.includes('seg.eletrica') ||
                 norm.includes('seguranca') ||
                 norm.includes('seg elet');

  if (hasCalib && hasSeg) {
    return { categoryKey: 'calibracao_e_seguranca_eletrica', label: 'Calibração + Seg. Elétrica' };
  }
  if (hasCalib) {
    return { categoryKey: 'calibracao', label: 'Calibração' };
  }
  if (hasSeg) {
    return { categoryKey: 'seguranca_eletrica', label: 'Segurança Elétrica' };
  }
  return { categoryKey: 'manutencao_geral', label: 'Manutenção / Outros' };
}

/**
 * Garante que a coluna categoria_servico exista e preenche registros legados.
 */
export async function ensureDbSchemaAndMigrate(db: any): Promise<void> {
  try {
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
        categoria_servico TEXT,
        scraped_at TEXT
      );
    `);
  } catch {}

  try {
    db.exec('ALTER TABLE ordens_servico ADD COLUMN categoria_servico TEXT;');
  } catch {}

  // Migra e classifica registros que estejam sem categoria definida
  try {
    let rows: any[] = [];
    if (typeof db.query === 'function') {
      rows = db.query("SELECT id, servico_tipo, descricao_problema, observacoes FROM ordens_servico WHERE categoria_servico IS NULL OR categoria_servico = ''").all();
    } else if (typeof db.prepare === 'function') {
      rows = db.prepare("SELECT id, servico_tipo, descricao_problema, observacoes FROM ordens_servico WHERE categoria_servico IS NULL OR categoria_servico = ''").all();
    }

    if (rows && rows.length > 0) {
      const updateStmt = db.prepare('UPDATE ordens_servico SET categoria_servico = ? WHERE id = ?');
      db.exec('BEGIN TRANSACTION;');
      for (const row of rows) {
        const detected = detectServiceCategory(row.servico_tipo, row.descricao_problema, row.observacoes);
        updateStmt.run(detected.label, row.id);
      }
      db.exec('COMMIT;');
      console.log(`✅ [Migração SQLite] Classificadas com sucesso ${rows.length} ordens de serviço legadas.`);
    }
  } catch (migErr) {
    console.warn('⚠️ Erro ao atualizar categorias de OSs legadas:', migErr);
  }
}

/**
 * Salva ou atualiza (UPSERT) uma lista de Ordens de Serviço no banco de dados SQLite.
 * Suporta bun:sqlite (Bun) e node:sqlite (Node 22/24+).
 */
export async function saveToDatabase(items: ScrapedItem[], dbPath: string): Promise<number> {
  const db = await getDatabaseConnection(dbPath);
  await ensureDbSchemaAndMigrate(db);

  const sql = `
    INSERT INTO ordens_servico (
      id, situacao, data_entrada, cliente_nome, cliente_cpf_cnpj, cliente_endereco, cliente_telefones, cliente_email,
      equipamento_modelo, equipamento_codigo, equipamento_linha_uso, equipamento_dimensoes, equipamento_descricao, equipamento_acessorios,
      servico_tipo, tecnico_responsavel, descricao_problema, valor_orcamento, observacoes, laudo_tecnico, categoria_servico, scraped_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
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
      categoria_servico = excluded.categoria_servico,
      scraped_at = excluded.scraped_at;
  `;

  const insertStmt = db.prepare(sql);
  let count = 0;

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const item of items) {
      const detected = item.categoriaServico || detectServiceCategory(item.servicoTipo, item.descricaoProblema, item.observacoes).label;

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
        detected,
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

