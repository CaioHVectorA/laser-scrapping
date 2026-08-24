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

// ─── Start Bun API Server as child process ──────────────────────────────
function startBackend() {
  const serverPath = path.join(projectRoot, 'src', 'server.ts');
  console.log(`🚀 Starting Bun backend: ${serverPath}`);

  // Try bun first, fall back to npx tsx
  const bunPath = process.env.BUN_PATH
    || path.join(process.env.HOME || '', '.bun', 'bin', 'bun');

  backendProcess = spawn(bunPath, [serverPath], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(BACKEND_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[backend] ${data}`);
  });

  backendProcess.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[backend] ${data}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`[backend] Process exited with code ${code}`);
    backendProcess = null;
  });
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
