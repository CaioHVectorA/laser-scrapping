import { config } from './config.js';
import { runScraper } from './scraper.js';
import { exportToExcel } from './excel.js';
import { exportToCsv } from './csv.js';
import { saveToDatabase } from './db.js';

async function main() {
  console.log('----------------------------------------------------');
  console.log('🤖 Iniciando Automação MedLaser (Print, SQLite, CSV & Excel)');
  console.log('----------------------------------------------------');
  console.log(`📌 URL Alvo:  ${config.targetUrl}`);
  console.log(`🗄️  SQLite DB: ${config.dbFilePath}`);
  console.log(`📄 CSV:       ${config.csvOutputFilePath}`);
  console.log(`📊 Excel:     ${config.outputFilePath}`);
  console.log('----------------------------------------------------');

  const startTime = Date.now();

  try {
    // 1. Executa a raspagem de folhas de impressão (page_id=402)
    const items = await runScraper({
      url: config.targetUrl,
      headless: config.headless,
    });

    if (items.length === 0) {
      console.warn('⚠️ Nenhum dado foi encontrado durante a raspagem.');
      return;
    }

    // 2. Persiste no banco de dados SQLite (bun:sqlite)
    console.log('🗄️ Salvando registros no banco de dados SQLite...');
    const dbCount = saveToDatabase(items, config.dbFilePath);
    console.log(`✅ ${dbCount} registros salvos/atualizados na tabela 'ordens_servico' (SQLite).`);

    // 3. Exporta para CSV
    console.log('📄 Gerando arquivo CSV com dados completos...');
    const csvSavedPath = await exportToCsv(items, config.csvOutputFilePath);

    // 4. Exporta para Excel
    console.log('📊 Gerando planilha Excel...');
    const excelSavedPath = await exportToExcel(items, config.outputFilePath);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('----------------------------------------------------');
    console.log(`🎉 Processo finalizado com SUCESSO em ${duration}s!`);
    console.log(`💾 Base SQLite salva em: ${config.dbFilePath}`);
    console.log(`💾 Arquivo CSV salvo em:  ${csvSavedPath}`);
    console.log(`💾 Planilha Excel em:     ${excelSavedPath}`);
    console.log('----------------------------------------------------');
  } catch (err) {
    console.error('💥 Falha na automação:', err);
    process.exit(1);
  }
}

main();
