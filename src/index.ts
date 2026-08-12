import { config } from './config.js';
import { runScraper } from './scraper.js';
import { exportToExcel } from './excel.js';

async function main() {
  console.log('----------------------------------------------------');
  console.log('🤖 Iniciando Automação de Web Scraping & Excel');
  console.log('----------------------------------------------------');
  console.log(`📌 URL Alvo: ${config.targetUrl}`);
  console.log(`📁 Arquivo de Saída: ${config.outputFilePath}`);
  console.log('----------------------------------------------------');

  const startTime = Date.now();

  try {
    // 1. Executa a raspagem
    const items = await runScraper({
      url: config.targetUrl,
      headless: config.headless,
    });

    if (items.length === 0) {
      console.warn('⚠️ Nenhum dado foi encontrado durante a raspagem.');
      return;
    }

    // 2. Exporta para Excel
    console.log('📊 Gerando planilha Excel...');
    const savedPath = await exportToExcel(items, config.outputFilePath);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('----------------------------------------------------');
    console.log(`🎉 Processo finalizado com SUCESSO em ${duration}s!`);
    console.log(`💾 Planilha salva em: ${savedPath}`);
    console.log('----------------------------------------------------');
  } catch (err) {
    console.error('💥 Falha na automação:', err);
    process.exit(1);
  }
}

main();
