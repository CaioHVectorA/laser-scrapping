import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium, type Browser } from 'playwright';

const require = createRequire(import.meta.url);

export interface DetectedBrowser {
  id: string;
  name: string;
  channel?: string;
  path?: string;
  available: boolean;
}

export interface BrowserLaunchOptions {
  headless: boolean;
  channelPreference?: string;
  customExecutablePath?: string;
  onLog?: (message: string) => void;
  timeoutMs?: number;
}

/**
 * Diretório local para armazenar navegadores baixados automaticamente.
 */
function getLocalBrowsersDirectory(): string {
  const isWin = process.platform === 'win32';
  const baseDir = isWin
    ? (process.env.LOCALAPPDATA || process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:', 'AppData', 'Local'))
    : (process.env.HOME ? path.join(process.env.HOME, '.local', 'share') : process.cwd());

  const appDir = path.join(baseDir, 'LaserWidget', 'browsers');
  try {
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }
  } catch {}
  return appDir;
}

/**
 * Caminho do executável do Chromium baixado diretamente pelo LaserWidget.
 */
function getDirectDownloadedChromiumPath(): string {
  const isWin = process.platform === 'win32';
  const browsersDir = getLocalBrowsersDirectory();
  if (isWin) {
    // Pode estar em chrome-win64/chrome.exe ou chrome-win/chrome.exe
    const candidates = [
      path.join(browsersDir, 'chrome-win64', 'chrome.exe'),
      path.join(browsersDir, 'chrome-win', 'chrome.exe'),
      path.join(browsersDir, 'chromium', 'chrome-win64', 'chrome.exe'),
      path.join(browsersDir, 'chromium', 'chrome-win', 'chrome.exe'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return path.join(browsersDir, 'chrome-win64', 'chrome.exe');
  }
  return path.join(browsersDir, 'chrome-linux64', 'chrome');
}

/**
 * Retorna todos os caminhos padrão onde executáveis de navegadores costumam estar instalados no SO.
 */
function getStandardBrowserPaths(): Record<string, string[]> {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';

  if (isWin) {
    const drives = ['C:', 'D:', (process.env.HOMEDRIVE || 'C:').replace(/\\$/, '')];
    const uniqueDrives = Array.from(new Set(drives));

    const prefixes = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      process.env.LOCALAPPDATA,
      ...uniqueDrives.map(d => `${d}\\Program Files`),
      ...uniqueDrives.map(d => `${d}\\Program Files (x86)`),
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : null,
    ].filter(Boolean) as string[];

    const uniquePrefixes = Array.from(new Set(prefixes));

    return {
      msedge: [
        ...uniquePrefixes.map(p => path.join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
        ...uniquePrefixes.map(p => path.join(p, 'Microsoft', 'EdgeCore', 'msedge.exe')),
      ],
      chrome: [
        ...uniquePrefixes.map(p => path.join(p, 'Google', 'Chrome', 'Application', 'chrome.exe')),
      ],
      brave: [
        ...uniquePrefixes.map(p => path.join(p, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')),
      ],
    };
  }

  if (isMac) {
    return {
      chrome: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        path.join(process.env.HOME || '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      ],
      msedge: [
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        path.join(process.env.HOME || '', 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
      ],
      brave: [
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      ],
    };
  }

  if (isLinux) {
    return {
      chrome: [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
      ],
      msedge: [
        '/opt/microsoft/msedge/msedge',
        '/usr/bin/microsoft-edge',
        '/usr/bin/microsoft-edge-stable',
      ],
      brave: [
        '/usr/bin/brave-browser',
        '/snap/bin/brave',
      ],
    };
  }

  return {};
}

function fileExists(filePath: string | undefined): boolean {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function findFirstExistingPath(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Detecta quais navegadores compatíveis estão instalados na máquina atual.
 */
export function detectInstalledBrowsers(): DetectedBrowser[] {
  const standardPaths = getStandardBrowserPaths();
  const results: DetectedBrowser[] = [];

  // 1. Chromium baixado direto pelo LaserWidget
  const directPath = getDirectDownloadedChromiumPath();
  if (fileExists(directPath)) {
    results.push({
      id: 'downloaded-chromium',
      name: 'Chromium Local (LaserWidget)',
      path: directPath,
      available: true,
    });
  }

  // 2. Playwright Bundled Chromium (%LOCALAPPDATA%\ms-playwright)
  let playwrightPath: string | undefined;
  let playwrightAvailable = false;
  try {
    playwrightPath = chromium.executablePath();
    playwrightAvailable = fileExists(playwrightPath);
  } catch {}

  results.push({
    id: 'chromium',
    name: 'Chromium (Playwright)',
    path: playwrightPath,
    available: playwrightAvailable,
  });

  // 3. Microsoft Edge (nativo em Windows 10/11)
  const edgePath = findFirstExistingPath(standardPaths.msedge || []);
  results.push({
    id: 'msedge',
    name: 'Microsoft Edge',
    channel: 'msedge',
    path: edgePath,
    available: !!edgePath || process.platform === 'win32',
  });

  // 4. Google Chrome
  const chromePath = findFirstExistingPath(standardPaths.chrome || []);
  results.push({
    id: 'chrome',
    name: 'Google Chrome',
    channel: 'chrome',
    path: chromePath,
    available: !!chromePath,
  });

  // 5. Brave Browser
  const bravePath = findFirstExistingPath(standardPaths.brave || []);
  if (bravePath) {
    results.push({
      id: 'brave',
      name: 'Brave Browser',
      path: bravePath,
      available: true,
    });
  }

  // 6. Custom PATH configurado via ambiente
  const customPath = process.env.CHROME_PATH || process.env.BROWSER_PATH;
  if (customPath && fileExists(customPath)) {
    results.unshift({
      id: 'custom',
      name: `Personalizado (${path.basename(customPath)})`,
      path: customPath,
      available: true,
    });
  }

  return results;
}

/**
 * Baixa e descompacta o Chromium oficial do Google Cloud / Playwright CDN diretamente via HTTP.
 * Não requer Node, npx ou CLI instalado no computador Windows do usuário.
 */
export async function downloadChromiumDirectly(onLog?: (msg: string) => void): Promise<string> {
  const log = onLog || console.log;
  const isWin = process.platform === 'win32';
  const targetDir = getLocalBrowsersDirectory();

  // URL do Chrome for Testing oficial
  const browserVersion = '151.0.7922.34';
  const downloadUrl = isWin
    ? `https://storage.googleapis.com/chrome-for-testing-public/${browserVersion}/win64/chrome-win64.zip`
    : `https://storage.googleapis.com/chrome-for-testing-public/${browserVersion}/linux64/chrome-linux64.zip`;

  const zipPath = path.join(targetDir, 'chromium-download.zip');
  log(`📥 Baixando Chromium oficial (${isWin ? 'Windows x64' : 'Linux x64'})...`);
  log(`🔗 URL: ${downloadUrl}`);

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Falha no download do Chromium: HTTP ${res.status} ${res.statusText}`);
  }

  const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Não foi possível obter stream de leitura do download.');
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let lastLoggedPercent = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.length;
      if (contentLength > 0) {
        const percent = Math.round((receivedBytes / contentLength) * 100);
        if (percent !== lastLoggedPercent && percent % 15 === 0) {
          lastLoggedPercent = percent;
          const mbRec = (receivedBytes / (1024 * 1024)).toFixed(1);
          const mbTotal = (contentLength / (1024 * 1024)).toFixed(1);
          log(`📥 Progresso do download: ${percent}% (${mbRec}MB de ${mbTotal}MB)...`);
        }
      }
    }
  }

  const fullBuffer = Buffer.concat(chunks);
  fs.writeFileSync(zipPath, fullBuffer);
  log(`📦 Download finalizado (${(receivedBytes / (1024 * 1024)).toFixed(1)}MB). Extraindo arquivos...`);

  // Extração rápida usando tar nativo do Windows 10/11 ou JSZip
  let extracted = false;

  // Tentativa 1: tar.exe nativo do Windows (disponível em todas as versões do Win 10 e 11)
  if (isWin) {
    try {
      cp.execSync(`tar -xf "${zipPath}" -C "${targetDir}"`, { stdio: 'ignore', windowsHide: true });
      extracted = true;
      log('✅ Arquivos extraídos com sucesso via tar do sistema.');
    } catch {}
  }

  // Tentativa 2: JSZip integrado
  if (!extracted) {
    try {
      const JSZip = require('jszip');
      const zip = await JSZip.loadAsync(fullBuffer);
      const entries = Object.keys(zip.files);
      for (const entryName of entries) {
        const file = zip.files[entryName];
        const destPath = path.join(targetDir, entryName);
        if (file.dir) {
          fs.mkdirSync(destPath, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          const content = await file.async('nodebuffer');
          fs.writeFileSync(destPath, content);
        }
      }
      extracted = true;
      log('✅ Arquivos extraídos com sucesso via biblioteca integrada.');
    } catch (zipErr: any) {
      log(`⚠️ Falha ao extrair com JSZip: ${zipErr.message}`);
    }
  }

  // Remove o arquivo .zip temporário
  try {
    fs.unlinkSync(zipPath);
  } catch {}

  const finalExe = getDirectDownloadedChromiumPath();
  if (!fileExists(finalExe)) {
    throw new Error(`Extração concluída, mas o executável não foi encontrado em: ${finalExe}`);
  }

  log(`🎉 Navegador Chromium pronto para uso em: ${finalExe}`);
  return finalExe;
}

/**
 * Inicializa o navegador Chromium/Chrome/Edge de forma inteligente com fallback transparente.
 */
export async function launchBrowserWithFallback(options: BrowserLaunchOptions): Promise<Browser> {
  const {
    headless,
    channelPreference = 'auto',
    customExecutablePath,
    onLog = console.log,
  } = options;

  const args = ['--no-sandbox', '--disable-setuid-sandbox'];
  const isWin = process.platform === 'win32';
  const standardPaths = getStandardBrowserPaths();

  // 1. Tentar caminho customizado se informado
  const explicitPath = customExecutablePath || process.env.CHROME_PATH || process.env.BROWSER_PATH;
  if (explicitPath && fileExists(explicitPath)) {
    try {
      onLog(`🌐 Tentando navegador no caminho configurado: ${explicitPath}...`);
      const browser = await chromium.launch({
        executablePath: explicitPath,
        headless,
        args,
      });
      onLog(`✅ Navegador configurado iniciado com sucesso!`);
      return browser;
    } catch (err: any) {
      onLog(`⚠️ Falha ao abrir navegador customizado (${err.message}). Continuando busca...`);
    }
  }

  // 2. Se o usuário solicitou um canal específico (ex: "chrome", "msedge", "chromium")
  if (channelPreference && channelPreference !== 'auto') {
    if (channelPreference === 'chromium') {
      try {
        onLog(`🌐 Tentando Chromium do Playwright...`);
        return await chromium.launch({ headless, args });
      } catch (err: any) {
        onLog(`⚠️ Chromium padrão não disponível (${err.message}).`);
      }
    } else {
      try {
        onLog(`🌐 Tentando canal especificado "${channelPreference}"...`);
        return await chromium.launch({ channel: channelPreference, headless, args });
      } catch (err: any) {
        onLog(`⚠️ Canal "${channelPreference}" falhou (${err.message}).`);
      }
    }
  }

  // 3. Fallback Automático - Monta lista de tentativas ordenadas
  const attempts: Array<{ name: string; launch: () => Promise<Browser> }> = [];

  // A. Se já existe um Chromium baixado pelo LaserWidget
  const directChromium = getDirectDownloadedChromiumPath();
  if (fileExists(directChromium)) {
    attempts.push({
      name: `Chromium Local do LaserWidget (${directChromium})`,
      launch: () => chromium.launch({ executablePath: directChromium, headless, args }),
    });
  }

  if (isWin) {
    // B. Microsoft Edge via caminho direto no Windows (evita falhas de registro do canal)
    const edgePaths = (standardPaths.msedge || []).filter(fileExists);
    for (const ep of edgePaths) {
      attempts.push({
        name: `Microsoft Edge nativo (${ep})`,
        launch: () => chromium.launch({ executablePath: ep, headless, args }),
      });
    }

    // C. Microsoft Edge via canal Playwright
    attempts.push({
      name: 'Microsoft Edge (canal do Windows)',
      launch: () => chromium.launch({ channel: 'msedge', headless, args }),
    });

    // D. Google Chrome via caminho direto
    const chromePaths = (standardPaths.chrome || []).filter(fileExists);
    for (const cp of chromePaths) {
      attempts.push({
        name: `Google Chrome (${cp})`,
        launch: () => chromium.launch({ executablePath: cp, headless, args }),
      });
    }

    // E. Google Chrome via canal Playwright
    attempts.push({
      name: 'Google Chrome (canal do sistema)',
      launch: () => chromium.launch({ channel: 'chrome', headless, args }),
    });

    // F. Brave Browser via caminho direto
    const bravePaths = (standardPaths.brave || []).filter(fileExists);
    for (const bp of bravePaths) {
      attempts.push({
        name: `Brave Browser (${bp})`,
        launch: () => chromium.launch({ executablePath: bp, headless, args }),
      });
    }

    // G. Playwright Chromium em %LOCALAPPDATA%\ms-playwright
    try {
      const pwPath = chromium.executablePath();
      if (fileExists(pwPath)) {
        attempts.push({
          name: 'Chromium do Playwright (%LOCALAPPDATA%)',
          launch: () => chromium.launch({ headless, args }),
        });
      }
    } catch {}
  } else {
    // Linux / macOS
    try {
      const pwPath = chromium.executablePath();
      if (fileExists(pwPath)) {
        attempts.push({
          name: 'Chromium do Playwright',
          launch: () => chromium.launch({ headless, args }),
        });
      }
    } catch {}

    attempts.push({
      name: 'Google Chrome',
      launch: () => chromium.launch({ channel: 'chrome', headless, args }),
    });

    attempts.push({
      name: 'Microsoft Edge',
      launch: () => chromium.launch({ channel: 'msedge', headless, args }),
    });

    const sysChrome = findFirstExistingPath(standardPaths.chrome || []);
    if (sysChrome) {
      attempts.push({
        name: `Binário do sistema (${sysChrome})`,
        launch: () => chromium.launch({ executablePath: sysChrome, headless, args }),
      });
    }
  }

  // Executa as tentativas ordenadas com logging de diagnóstico transparente
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      onLog(`🌐 [${i + 1}/${attempts.length}] Tentando iniciar ${attempt.name}...`);
      const browser = await attempt.launch();
      onLog(`✅ ${attempt.name} iniciado com sucesso!`);
      return browser;
    } catch (err: any) {
      onLog(`ℹ️ ${attempt.name} não pôde ser iniciado: ${err.message.split('\n')[0]}`);
    }
  }

  // 4. Se nenhum navegador instalado foi capaz de abrir, realiza download direto via HTTP
  onLog('⚠️ Nenhum navegador pré-instalado (Chrome/Edge) foi localizado nos caminhos do Windows.');
  onLog('📥 Iniciando download automático do Chromium portátil diretamente do CDN Google/Playwright...');

  try {
    const downloadedPath = await downloadChromiumDirectly(onLog);
    onLog(`🌐 Inicializando Chromium portátil em ${downloadedPath}...`);
    return await chromium.launch({ executablePath: downloadedPath, headless, args });
  } catch (downloadErr: any) {
    onLog(`❌ Falha no download automático do Chromium: ${downloadErr.message}`);
  }

  // 5. Se absolutamente tudo falhou, lança erro explicativo em português
  const errorMsg = isWin
    ? 'Não foi possível encontrar nem iniciar nenhum navegador (Google Chrome ou Microsoft Edge) no seu Windows.\n' +
      'Soluções recomendadas:\n' +
      '1. Certifique-se de que o Microsoft Edge ou o Google Chrome está instalado na máquina.\n' +
      '2. Ou adicione o caminho do executável do seu navegador no arquivo .env (ex: CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe).'
    : 'Não foi possível encontrar nenhum navegador compatível (Chrome/Edge/Chromium).\n' +
      'Por favor, instale o Google Chrome ou verifique sua conexão com a internet.';

  throw new Error(errorMsg);
}
