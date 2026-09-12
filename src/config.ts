import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Procura o arquivo .env em múltiplos locais possíveis (cwd, resources, appdata, raiz do projeto)
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  process.env.APPDATA ? path.join(process.env.APPDATA, 'laser-widget-scraper', '.env') : '',
  (process as any).resourcesPath ? path.join((process as any).resourcesPath, '.env') : '',
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
].filter(Boolean);

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

export const config = {
  targetUrl: process.env.TARGET_URL || 'https://medlaserbrasil.com.br/?page_id=142',
  headless: process.env.HEADLESS !== 'false',
  browserChannel: process.env.BROWSER_CHANNEL || 'auto',
  chromePath: process.env.CHROME_PATH || process.env.BROWSER_PATH || '',
  outputFilePath: path.resolve(process.cwd(), process.env.OUTPUT_FILE_PATH || './output/dados_raspados.xlsx'),
  csvOutputFilePath: path.resolve(process.cwd(), process.env.CSV_OUTPUT_FILE_PATH || './output/dados_raspados.csv'),
  dbFilePath: path.resolve(process.cwd(), process.env.DB_FILE_PATH || './output/ordens_servico.sqlite'),
  systemUser: process.env.SYSTEM_USER || 'iury',
  systemPassword: process.env.SYSTEM_PASSWORD || 'Iur!3291',
};


