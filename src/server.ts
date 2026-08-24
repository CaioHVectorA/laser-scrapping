import { config } from './config.js';
import { runScraper } from './scraper.js';
import { saveToDatabase } from './db.js';
import { parseXlsx, randomizeMeasurements, updateCellValues } from './services/xlsxService.js';

declare const Bun: any;

const PORT = 3001;

// ─── SQLite Helper ──────────────────────────────────────────────────────
let db: any = null;

function getDb() {
  if (db) return db;
  const packageName = 'bun:sqlite';
  // Dynamic import workaround for tsc
  const sqliteModule = require(packageName);
  db = new sqliteModule.Database(config.dbFilePath);
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

// ─── CORS + JSON helpers ────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function errorResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status);
}

// ─── Scraper state (streaming logs via SSE) ─────────────────────────────
let scraperRunning = false;
const scraperLogs: string[] = [];
let scraperProgress = { current: 0, total: 0, percentage: 0 };
const sseClients: Set<ReadableStreamDefaultController> = new Set();

function broadcastSSE(event: string, data: any) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const ctrl of sseClients) {
    try { ctrl.enqueue(new TextEncoder().encode(msg)); } catch { sseClients.delete(ctrl); }
  }
}

// ─── Route handlers ─────────────────────────────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── Database: list orders ──
  if (path === '/api/orders' && req.method === 'GET') {
    try {
      const database = getDb();
      const search = url.searchParams.get('search') || '';
      const situacao = url.searchParams.get('situacao') || '';
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      let query = 'SELECT * FROM ordens_servico WHERE 1=1';
      let countQuery = 'SELECT COUNT(*) as cnt FROM ordens_servico WHERE 1=1';
      const params: any[] = [];

      if (situacao && situacao !== 'Todas') {
        query += ' AND situacao LIKE ?';
        countQuery += ' AND situacao LIKE ?';
        params.push(`%${situacao}%`);
      }

      if (search) {
        const s = `%${search}%`;
        const searchClause = ' AND (id LIKE ? OR cliente_nome LIKE ? OR cliente_cpf_cnpj LIKE ? OR equipamento_modelo LIKE ? OR equipamento_codigo LIKE ? OR tecnico_responsavel LIKE ?)';
        query += searchClause;
        countQuery += searchClause;
        params.push(s, s, s, s, s, s);
      }

      query += ' ORDER BY CAST(id AS INTEGER) DESC LIMIT ? OFFSET ?';

      const countRow = database.query(countQuery).get(...params) as any;
      const total = countRow?.cnt || 0;
      const items = database.query(query).all(...params, limit, offset);

      return jsonResponse({ items, total });
    } catch (err: any) {
      console.error('❌ /api/orders error:', err);
      return errorResponse(err.message);
    }
  }

  // ── Database: single order ──
  if (path.startsWith('/api/orders/') && req.method === 'GET') {
    try {
      const id = path.split('/').pop();
      const database = getDb();
      const row = database.query('SELECT * FROM ordens_servico WHERE id = ?').get(id);
      return row ? jsonResponse(row) : errorResponse('OS não encontrada', 404);
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }

  // ── Scraper: run ──
  if (path === '/api/scraper/run' && req.method === 'POST') {
    if (scraperRunning) {
      return errorResponse('Scraper já está em execução', 409);
    }

    const body = await req.json().catch(() => ({}));
    const headless = body.headless !== false;

    scraperRunning = true;
    scraperLogs.length = 0;
    scraperProgress = { current: 0, total: 0, percentage: 0 };

    // Intercept console.log to capture and broadcast logs
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const pushLog = (msg: string) => {
      scraperLogs.push(msg);
      broadcastSSE('log', { message: msg });

      const m = msg.match(/\[(\d+)\/(\d+)\]/);
      if (m) {
        scraperProgress = {
          current: parseInt(m[1]),
          total: parseInt(m[2]),
          percentage: Math.round((parseInt(m[1]) / parseInt(m[2])) * 100),
        };
        broadcastSSE('progress', scraperProgress);
      }
    };

    console.log = (...args: any[]) => {
      origLog(...args);
      pushLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    };
    console.warn = (...args: any[]) => { origWarn(...args); pushLog('⚠️ ' + args.map(String).join(' ')); };
    console.error = (...args: any[]) => { origError(...args); pushLog('❌ ' + args.map(String).join(' ')); };

    // Run async, respond immediately
    (async () => {
      try {
        pushLog('🚀 Iniciando automação...');
        const items = await runScraper({ url: config.targetUrl, headless });

        if (items.length > 0) {
          pushLog(`🗄️ Salvando ${items.length} registros no banco SQLite...`);
          await saveToDatabase(items, config.dbFilePath);
        }

        pushLog(`✅ Concluído! ${items.length} registros.`);
      } catch (err: any) {
        pushLog(`❌ Erro: ${err.message}`);
      } finally {
        scraperRunning = false;
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;
      }
    })();

    return jsonResponse({ status: 'started' });
  }

  // ── Scraper: SSE stream ──
  if (path === '/api/scraper/stream' && req.method === 'GET') {
    const stream = new ReadableStream({
      start(controller) {
        sseClients.add(controller);
        // Send existing logs
        for (const msg of scraperLogs) {
          controller.enqueue(new TextEncoder().encode(`event: log\ndata: ${JSON.stringify({ message: msg })}\n\n`));
        }
        controller.enqueue(new TextEncoder().encode(`event: progress\ndata: ${JSON.stringify(scraperProgress)}\n\n`));
      },
      cancel(controller) {
        sseClients.delete(controller);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders,
      },
    });
  }

  // ── Scraper: status ──
  if (path === '/api/scraper/status' && req.method === 'GET') {
    return jsonResponse({ running: scraperRunning, progress: scraperProgress, logCount: scraperLogs.length });
  }

  // ── XLSX: parse ──
  if (path === '/api/xlsx/parse' && req.method === 'POST') {
    try {
      const body = await req.json();
      const result = await parseXlsx(body.filePath);
      return jsonResponse(result);
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }

  // ── XLSX: randomize ──
  if (path === '/api/xlsx/randomize' && req.method === 'POST') {
    try {
      const body = await req.json();
      const result = await randomizeMeasurements(
        body.filePath,
        body.outputPath,
        body.maxPercent || 20,
        body.targetAddresses
      );
      return jsonResponse(result);
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }

  // ── XLSX: list files in output/ ──
  if (path === '/api/xlsx/files' && req.method === 'GET') {
    try {
      const fs = await import('node:fs');
      const pathMod = await import('node:path');
      const outputDir = pathMod.dirname(config.outputFilePath);
      const files = fs.readdirSync(outputDir)
        .filter((f: string) => f.endsWith('.xlsx') || f.endsWith('.xls'))
        .map((f: string) => ({
          name: f,
          path: pathMod.resolve(outputDir, f),
        }));
      return jsonResponse(files);
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }

  return errorResponse('Not found', 404);
}

// ─── Start server ───────────────────────────────────────────────────────
console.log(`🚀 LaserWidget API Server starting on http://localhost:${PORT}`);
console.log(`🗄️  SQLite: ${config.dbFilePath}`);

Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`✅ Servidor LaserWidget rodando em http://localhost:${PORT}`);
