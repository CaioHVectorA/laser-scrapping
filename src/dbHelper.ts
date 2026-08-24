import fs from 'node:fs';
import path from 'node:path';

export interface DbOrderRecord {
  id: string;
  situacao: string;
  data_entrada: string;
  cliente_nome: string;
  cliente_cpf_cnpj: string;
  cliente_endereco: string;
  cliente_telefones: string;
  cliente_email: string;
  equipamento_modelo: string;
  equipamento_codigo: string;
  equipamento_linha_uso: string;
  equipamento_dimensoes: string;
  equipamento_descricao: string;
  equipamento_acessorios: string;
  servico_tipo: string;
  tecnico_responsavel: string;
  descricao_problema: string;
  valor_orcamento: number;
  observacoes: string;
  laudo_tecnico: string;
  scraped_at: string;
}

let dbInstance: any = null;

async function getDatabaseConnection(dbPath: string) {
  if (dbInstance) return dbInstance;

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Tenta bun:sqlite primeiro
  if (typeof (globalThis as any).Bun !== 'undefined' || (process as any).versions?.bun) {
    try {
      const packageName = 'bun:sqlite';
      // @ts-ignore
      const sqliteModule = await import(packageName);
      dbInstance = new sqliteModule.Database(dbPath);
      dbInstance.exec('PRAGMA journal_mode = WAL;');
      return dbInstance;
    } catch (e) {
      console.warn('⚠️ Fallback de bun:sqlite para node:sqlite');
    }
  }

  // Fallback para node:sqlite em Node 22/24+
  try {
    const sqliteModule = await import('node:sqlite');
    dbInstance = new sqliteModule.DatabaseSync(dbPath);
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    return dbInstance;
  } catch (err) {
    console.error('❌ Falha ao carregar driver SQLite:', err);
    throw err;
  }
}

/**
 * Retorna lista filtrada de Ordens de Serviço do banco SQLite.
 */
export async function getOrders(
  dbPath: string,
  options: { search?: string; situacao?: string; limit?: number; offset?: number } = {}
): Promise<{ items: DbOrderRecord[]; total: number }> {
  const db = await getDatabaseConnection(dbPath);
  const { search = '', situacao = '', limit = 50, offset = 0 } = options;

  let query = 'SELECT * FROM ordens_servico WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as cnt FROM ordens_servico WHERE 1=1';
  const params: any[] = [];

  if (situacao && situacao.trim() !== '' && situacao !== 'Todas') {
    query += ' AND situacao LIKE ?';
    countQuery += ' AND situacao LIKE ?';
    params.push(`%${situacao.trim()}%`);
  }

  if (search && search.trim() !== '') {
    const s = `%${search.trim()}%`;
    query += ' AND (id LIKE ? OR cliente_nome LIKE ? OR cliente_cpf_cnpj LIKE ? OR equipamento_modelo LIKE ? OR equipamento_codigo LIKE ? OR tecnico_responsavel LIKE ?)';
    countQuery += ' AND (id LIKE ? OR cliente_nome LIKE ? OR cliente_cpf_cnpj LIKE ? OR equipamento_modelo LIKE ? OR equipamento_codigo LIKE ? OR tecnico_responsavel LIKE ?)';
    params.push(s, s, s, s, s, s);
  }

  query += ' ORDER BY CAST(id AS INTEGER) DESC LIMIT ? OFFSET ?';
  
  let items: DbOrderRecord[] = [];
  let total = 0;

  try {
    if (typeof db.prepare === 'function') {
      const stmt = db.prepare(query);
      const countStmt = db.prepare(countQuery);

      if (typeof db.query === 'function') {
        // Driver Bun
        items = db.query(query).all(...params, limit, offset) as DbOrderRecord[];
        const countRes = db.query(countQuery).get(...params) as any;
        total = countRes ? (countRes.cnt || countRes['COUNT(*)'] || 0) : 0;
      } else {
        // Driver Node DatabaseSync
        items = stmt.all(...params, limit, offset) as DbOrderRecord[];
        const countRes = countStmt.get(...params) as any;
        total = countRes ? (countRes.cnt || 0) : 0;
      }
    }
  } catch (err) {
    console.error('⚠️ Erro ao consultar ordens de serviço:', err);
  }

  return { items, total };
}

/**
 * Busca uma OS pelo ID.
 */
export async function getOrderById(dbPath: string, id: string): Promise<DbOrderRecord | null> {
  const db = await getDatabaseConnection(dbPath);

  try {
    if (typeof db.query === 'function') {
      return (db.query('SELECT * FROM ordens_servico WHERE id = ?').get(id) as DbOrderRecord) || null;
    } else {
      const stmt = db.prepare('SELECT * FROM ordens_servico WHERE id = ?');
      return (stmt.get(id) as DbOrderRecord) || null;
    }
  } catch (err) {
    console.error(`⚠️ Erro ao buscar OS #${id}:`, err);
    return null;
  }
}
