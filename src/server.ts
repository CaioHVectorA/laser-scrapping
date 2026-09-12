import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { config } from './config.js';
import { runScraper } from './scraper.js';
import { saveToDatabase } from './db.js';
import { exportToExcel } from './excel.js';
import { exportToCsv } from './csv.js';
import { parseXlsx, randomizeMeasurements, updateCellValues } from './services/xlsxService.js';
import { detectInstalledBrowsers } from './browserLauncher.js';

const require = createRequire(import.meta.url);

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception protegida no backend:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection protegida no backend:', reason);
});

const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── SQLite Helper ──────────────────────────────────────────────────────
let db: any = null;

function getDb() {
  if (db) return db;

  const dbDir = path.dirname(config.dbFilePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const isBun = typeof (globalThis as any).Bun !== 'undefined' || !!(process as any).versions?.bun;
  let rawDb: any = null;

  if (isBun) {
    try {
      const packageName = 'bun:sqlite';
      const sqliteModule = require(packageName);
      rawDb = new sqliteModule.Database(config.dbFilePath);
    } catch {}
  }

  if (!rawDb) {
    const { DatabaseSync } = require('node:sqlite');
    rawDb = new DatabaseSync(config.dbFilePath);
  }

  rawDb.exec('PRAGMA journal_mode = WAL;');

  // Garante a tabela ordens_servico no primeiro uso para evitar erro antes da raspagem
  rawDb.exec(`
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

  if (typeof rawDb.query === 'function') {
    db = rawDb;
  } else {
    db = {
      exec: (sql: string) => rawDb.exec(sql),
      prepare: (sql: string) => rawDb.prepare(sql),
      query: (sql: string) => {
        const stmt = rawDb.prepare(sql);
        return {
          get: (...params: any[]) => stmt.get(...params),
          all: (...params: any[]) => stmt.all(...params),
          run: (...params: any[]) => stmt.run(...params),
        };
      },
      close: () => rawDb.close?.(),
    };
  }

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
  for (const ctrl of Array.from(sseClients)) {
    try {
      ctrl.enqueue(new TextEncoder().encode(msg));
    } catch {
      sseClients.delete(ctrl);
    }
  }
}

// ─── Route handlers ─────────────────────────────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const reqPath = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── Database: list orders ──
  if (reqPath === '/api/orders' && req.method === 'GET') {
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
  if (reqPath.startsWith('/api/orders/') && req.method === 'GET') {
    try {
      const id = reqPath.split('/').pop();
      const database = getDb();
      const row = database.query('SELECT * FROM ordens_servico WHERE id = ?').get(id);
      return row ? jsonResponse(row) : errorResponse('OS não encontrada', 404);
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }

  // ── Scraper: list detected browsers ──
  if (reqPath === '/api/scraper/browsers' && req.method === 'GET') {
    try {
      const detected = detectInstalledBrowsers();
      const isWin = process.platform === 'win32';
      const recommended = isWin ? 'msedge' : 'chrome';
      return jsonResponse({
        detected,
        platform: process.platform,
        defaultChannel: config.browserChannel || 'auto',
        recommended,
      });
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }

  // ── Scraper: run ──
  if (reqPath === '/api/scraper/run' && req.method === 'POST') {
    if (scraperRunning) {
      return errorResponse('Scraper já está em execução', 409);
    }

    const body = await req.json().catch(() => ({}));
    const headless = body.headless !== false;
    const browserType = body.browser || config.browserChannel || 'auto';

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
        pushLog('🚀 Iniciando automação MedLaser (Scraper, SQLite, CSV & Excel)...');
        const items = await runScraper({
          url: config.targetUrl,
          headless,
          browserType,
          onItemScraped: async (item) => {
            try {
              await saveToDatabase([item], config.dbFilePath);
            } catch (saveErr) {
              console.warn('Erro ao salvar item incrementalmente:', saveErr);
            }
          }
        });

        if (items.length > 0) {
          pushLog(`🗄️ Salvando ${items.length} registros no banco SQLite...`);
          const dbCount = await saveToDatabase(items, config.dbFilePath);
          pushLog(`✅ ${dbCount} registros salvos/atualizados na tabela 'ordens_servico'.`);

          pushLog('📄 Gerando arquivo CSV com dados completos...');
          const csvPath = await exportToCsv(items, config.csvOutputFilePath);
          pushLog(`💾 CSV salvo com sucesso em: ${csvPath}`);

          pushLog('📊 Gerando planilha Excel (.xlsx)...');
          const excelPath = await exportToExcel(items, config.outputFilePath);
          pushLog(`💾 Planilha Excel salva com sucesso em: ${excelPath}`);
        } else {
          pushLog('⚠️ Nenhum registro encontrado na raspagem.');
        }

        pushLog(`🎉 Automação concluída com sucesso! Total: ${items.length} OSs processadas.`);
      } catch (err: any) {
        pushLog(`❌ Erro na automação: ${err.message}`);
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
  if (reqPath === '/api/scraper/stream' && req.method === 'GET') {
    let activeCtrl: ReadableStreamDefaultController | null = null;
    const stream = new ReadableStream({
      start(controller) {
        activeCtrl = controller;
        sseClients.add(controller);
        // Send existing logs
        for (const msg of scraperLogs) {
          try {
            controller.enqueue(new TextEncoder().encode(`event: log\ndata: ${JSON.stringify({ message: msg })}\n\n`));
          } catch {}
        }
        try {
          controller.enqueue(new TextEncoder().encode(`event: progress\ndata: ${JSON.stringify(scraperProgress)}\n\n`));
        } catch {}
      },
      cancel() {
        if (activeCtrl) {
          sseClients.delete(activeCtrl);
        }
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
  if (reqPath === '/api/scraper/status' && (req.method === 'GET' || req.method === 'HEAD')) {
    return jsonResponse({ running: scraperRunning, progress: scraperProgress, logCount: scraperLogs.length });
  }

  // ── XLSX: parse ──
  if (reqPath === '/api/xlsx/parse' && req.method === 'POST') {
    try {
      const body = await req.json();
      const result = await parseXlsx(body.filePath);
      return jsonResponse(result);
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }

  // ── XLSX: randomize ──
  if (reqPath === '/api/xlsx/randomize' && req.method === 'POST') {
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

  // ── XLSX: save to server (disk in output/) ──
  if (reqPath === '/api/xlsx/save' && req.method === 'POST') {
    try {
      const body = await req.json();
      const { fileName, fileBase64 } = body;
      if (!fileName || !fileBase64) {
        return errorResponse('Nome do modelo/arquivo e dados são obrigatórios', 400);
      }
      const fs = await import('node:fs');
      const pathMod = await import('node:path');
      const outputDir = pathMod.dirname(config.outputFilePath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      let cleanName = fileName.replace(/[\\/:*?"<>|]/g, '_').trim();
      if (!cleanName.endsWith('.xlsx') && !cleanName.endsWith('.xls')) {
        cleanName += '.xlsx';
      }
      const targetPath = pathMod.join(outputDir, cleanName);
      const buffer = Buffer.from(fileBase64, 'base64');
      fs.writeFileSync(targetPath, buffer);
      return jsonResponse({
        success: true,
        name: cleanName,
        path: targetPath,
        size: buffer.length
      });
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }

  // ── XLSX: get raw file bytes from output/ ──
  if (reqPath === '/api/xlsx/raw' && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      const fileName = url.searchParams.get('fileName') || url.searchParams.get('file');
      if (!fileName) return errorResponse('Nome do arquivo é obrigatório', 400);
      const fs = await import('node:fs');
      const pathMod = await import('node:path');
      const outputDir = pathMod.dirname(config.outputFilePath);
      const cleanName = pathMod.basename(fileName);
      const filePath = pathMod.join(outputDir, cleanName);
      if (!fs.existsSync(filePath)) return errorResponse('Arquivo não encontrado', 404);
      const fileBuffer = fs.readFileSync(filePath);
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${cleanName}"`,
          ...corsHeaders,
        },
      });
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }

  // ── XLSX: list files in output/ ──
  if (reqPath === '/api/xlsx/files' && req.method === 'GET') {
    try {
      const outputDir = path.dirname(config.outputFilePath);
      if (!fs.existsSync(outputDir)) {
        return jsonResponse([]);
      }
      const files = fs.readdirSync(outputDir)
        .filter((f: string) => f.endsWith('.xlsx') || f.endsWith('.xls'))
        .map((f: string) => ({
          name: f,
          path: path.resolve(outputDir, f),
        }));
      return jsonResponse(files);
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }

  return errorResponse('Not found', 404);
}

// ─── Node.js HTTP Server Adapter ─────────────────────────────────────────
function startNodeServer(port: number, handler: (req: Request) => Promise<Response>) {
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || `localhost:${port}`;
      const url = `http://${host}${req.url || '/'}`;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else if (value !== undefined) {
          headers.set(key, value);
        }
      }

      const init: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = req as any;
        (init as any).duplex = 'half';
      }

      const webRequest = new Request(url, init);
      const webResponse = await handler(webRequest);

      res.statusCode = webResponse.status;
      webResponse.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      if (webResponse.headers.get('content-type')?.includes('text/event-stream')) {
        res.flushHeaders();
      }

      if (webResponse.body) {
        const reader = webResponse.body.getReader();
        let isClosed = false;

        req.on('close', () => {
          isClosed = true;
          reader.cancel().catch(() => {});
        });

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || isClosed) break;
            res.write(value);
          }
        } catch {
          // Stream cancelada ou conexão encerrada pelo cliente
        } finally {
          try {
            reader.releaseLock();
          } catch {}
          if (!res.writableEnded) {
            res.end();
          }
        }
      } else {
        res.end();
      }
    } catch (err: any) {
      console.error('❌ Erro no handler HTTP:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || String(err) }));
      }
    }
  });

  server.listen(port, () => {
    console.log(`✅ Servidor LaserWidget rodando via Node em http://localhost:${port}`);
  });

  return server;
}

// ─── Start server ───────────────────────────────────────────────────────
console.log(`🚀 LaserWidget API Server starting on http://localhost:${PORT}`);
console.log(`🗄️  SQLite: ${config.dbFilePath}`);

if (typeof (globalThis as any).Bun !== 'undefined' && (globalThis as any).Bun?.serve) {
  (globalThis as any).Bun.serve({
    port: PORT,
    fetch: handleRequest,
  });
  console.log(`✅ Servidor LaserWidget rodando via Bun em http://localhost:${PORT}`);
} else {
  startNodeServer(PORT, handleRequest);
}
