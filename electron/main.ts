import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let isQuitting = false;

const BACKEND_PORT = 3001;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

import fs from 'node:fs';
import dotenv from 'dotenv';

// ─── Start Bun/Node API Server as child process ─────────────────────────
async function startBackend() {
  const isPackaged = app.isPackaged;
  const isWin = process.platform === 'win32';
  const userDataDir = app.getPath('userData');

  // Em modo de desenvolvimento, dá tempo para o backend iniciado externamente (ex: concurrently com tsx) subir
  if (!isPackaged) {
    console.log('⏳ Verificando se backend já está em execução...');
    const isRunning = await waitForBackend(3500);
    if (isRunning) {
      console.log(`✅ Backend já está em execução na porta ${BACKEND_PORT}`);
      return;
    }
  } else {
    try {
      const check = await fetch(`${BACKEND_URL}/api/scraper/status`);
      if (check.ok) {
        console.log(`✅ Backend já está em execução na porta ${BACKEND_PORT}`);
        return;
      }
    } catch {}
  }

  // Carrega configurações do .env a partir de resources, userData ou projectRoot
  const envCandidates = [
    path.join(process.resourcesPath || '', '.env'),
    path.join(projectRoot, '.env'),
    path.join(userDataDir, '.env'),
  ];
  for (const envFile of envCandidates) {
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile, override: false });
    }
  }

  // Se o .env existir no pacote mas ainda não na pasta userData do usuário, cria uma cópia editável
  const targetUserDataEnv = path.join(userDataDir, '.env');
  if (!fs.existsSync(targetUserDataEnv)) {
    const srcEnv = [path.join(process.resourcesPath || '', '.env'), path.join(projectRoot, '.env')].find(p => fs.existsSync(p));
    if (srcEnv) {
      try {
        fs.copyFileSync(srcEnv, targetUserDataEnv);
        console.log(`📋 .env copiado para ${targetUserDataEnv}`);
      } catch {}
    }
  }

  let serverCmd = 'node';
  let serverArgs: string[] = [];
  const serverEnv: Record<string, string> = {
    ...process.env,
    TARGET_URL: process.env.TARGET_URL || 'https://medlaserbrasil.com.br/?page_id=142',
    SYSTEM_USER: process.env.SYSTEM_USER || 'iury',
    SYSTEM_PASSWORD: process.env.SYSTEM_PASSWORD || 'Iur!3291',
    HEADLESS: process.env.HEADLESS || 'true',
    BROWSER_CHANNEL: process.env.BROWSER_CHANNEL || 'auto',
    CHROME_PATH: process.env.CHROME_PATH || '',
    BROWSER_PATH: process.env.BROWSER_PATH || '',
    PORT: String(BACKEND_PORT),
  } as any;


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
    console.log(`🚀 Starting development backend via TSX (Node): ${serverPath}`);
    // No Windows, o Playwright requer Node.js/TSX pois o Bun possui incompatibilidade com stdio debug pipes
    serverCmd = isWin ? 'npx.cmd' : 'npx';
    serverArgs = ['tsx', serverPath];
  }

  try {
    const logFilePath = path.join(isPackaged ? app.getPath('userData') : projectRoot, 'backend.log');
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    backendProcess = spawn(serverCmd, serverArgs, {
      cwd: isPackaged ? app.getPath('userData') : projectRoot,
      env: serverEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWin && !isPackaged,
      windowsHide: true,
    });

    backendProcess.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(`[backend] ${data}`);
      logStream.write(data);
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[backend] ${data}`);
      logStream.write(data);
    });

    backendProcess.on('error', (err) => {
      console.error('❌ Erro ao iniciar processo backend:', err);
      logStream.write(`[main error] Falha no processo: ${err.message}\n`);
    });

    backendProcess.on('exit', (code) => {
      console.log(`[backend] Process exited with code ${code}`);
      logStream.write(`[main] Backend encerrado com código ${code}\n`);
      backendProcess = null;

      if (code !== 0 && !isQuitting) {
        console.log('🔄 Reiniciando backend automaticamente após encerramento inesperado...');
        logStream.write('[main] Reiniciando backend automaticamente em 1s...\n');
        setTimeout(() => {
          if (!isQuitting) {
            startBackend();
          }
        }, 1000);
      }
    });
  } catch (err: any) {
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
async function waitForBackend(maxWaitMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/scraper/status`);
      if (res.ok) return true;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
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
  await startBackend();

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
  isQuitting = true;
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});
