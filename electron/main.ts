import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const BACKEND_PORT = 3001;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

import fs from 'node:fs';

// ─── Start Bun API Server as child process ──────────────────────────────
async function startBackend() {
  try {
    const check = await fetch(`${BACKEND_URL}/api/scraper/status`);
    if (check.ok) {
      console.log(`✅ Backend já está em execução na porta ${BACKEND_PORT}`);
      return;
    }
  } catch {}

  const isPackaged = app.isPackaged;
  const isWin = process.platform === 'win32';
  const userDir = process.env.USERPROFILE || process.env.HOME || '';
  const winBun = path.join(userDir, '.bun', 'bin', 'bun.exe');
  const unixBun = path.join(userDir, '.bun', 'bin', 'bun');

  let serverCmd = 'bun';
  let serverArgs: string[] = [];
  const serverEnv: Record<string, string> = { ...process.env, PORT: String(BACKEND_PORT) } as any;

  if (isPackaged) {
    const candidatePaths = [
      path.join(process.resourcesPath, 'dist', 'server', 'server.js'),
      path.join(process.resourcesPath, 'server.js'),
      path.join(__dirname, '../server/server.js'),
      path.join(app.getAppPath(), 'dist', 'server', 'server.js'),
    ];
    const foundServer = candidatePaths.find(p => fs.existsSync(p));
    if (foundServer) {
      console.log(`📦 Running packaged server: ${foundServer}`);
      serverCmd = process.execPath;
      serverArgs = [foundServer];
      serverEnv.ELECTRON_RUN_AS_NODE = '1';
    } else {
      console.warn('⚠️ Packaged server.js not found in expected paths');
    }
  } else {
    const serverPath = path.join(projectRoot, 'src', 'server.ts');
    console.log(`🚀 Starting development backend: ${serverPath}`);
    serverArgs = [serverPath];

    if (process.env.BUN_PATH) {
      serverCmd = process.env.BUN_PATH;
    } else if (isWin && fs.existsSync(winBun)) {
      serverCmd = winBun;
    } else if (!isWin && fs.existsSync(unixBun)) {
      serverCmd = unixBun;
    }
  }

  try {
    backendProcess = spawn(serverCmd, serverArgs, {
      cwd: isPackaged ? app.getPath('userData') : projectRoot,
      env: serverEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWin && !isPackaged,
    });

    backendProcess.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(`[backend] ${data}`);
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[backend] ${data}`);
    });

    backendProcess.on('error', (err) => {
      console.error('❌ Erro ao iniciar processo backend:', err);
    });

    backendProcess.on('exit', (code) => {
      console.log(`[backend] Process exited with code ${code}`);
      backendProcess = null;
    });
  } catch (err) {
    console.error('❌ Falha ao tentar spawnar backend:', err);
  }
}

function stopBackend() {
  if (backendProcess) {
    console.log('🛑 Stopping backend...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// ─── Wait for backend to be ready ───────────────────────────────────────
async function waitForBackend(maxWaitMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/scraper/status`);
      if (res.ok) return true;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// ─── Create Electron Window ─────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'LaserWidget',
    backgroundColor: '#09090b',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // In dev mode, load from Vite dev server; in prod, load built files
  const devUrl = process.env.ELECTRON_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html');
    mainWindow.loadFile(indexPath);
  }
}

// ─── App Lifecycle ──────────────────────────────────────────────────────
app.whenReady().then(async () => {
  startBackend();

  console.log('⏳ Waiting for backend to be ready...');
  const ready = await waitForBackend();
  if (ready) {
    console.log('✅ Backend is ready!');
  } else {
    console.warn('⚠️ Backend did not respond in time, opening window anyway.');
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});
