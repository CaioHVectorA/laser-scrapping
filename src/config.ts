import dotenv from 'dotenv';
import path from 'node:path';

// Carrega as variáveis do arquivo .env
dotenv.config();

export const config = {
  targetUrl: process.env.TARGET_URL || 'https://quotes.toscrape.com',
  headless: process.env.HEADLESS !== 'false',
  outputFilePath: path.resolve(process.cwd(), process.env.OUTPUT_FILE_PATH || './output/dados_raspados.xlsx'),
  systemUser: process.env.SYSTEM_USER || '',
  systemPassword: process.env.SYSTEM_PASSWORD || '',
};
