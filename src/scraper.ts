import { chromium, type Browser, type Page } from 'playwright';
import { config } from './config.js';
import type { ScrapedItem, ScraperOptions } from './types/index.js';

/**
 * Função de login no sistema MedLaser Brasil.
 * Seletores mapeados:
 * - Usuário: #rc_user_login
 * - Senha: #rc_user_pass
 * - Botão Login: #rc_login_submit ou input[type="submit"]
 */
export async function loginToSystem(page: Page, user: string, pass: string): Promise<boolean> {
  if (!user || !pass) {
    console.warn('⚠️ Usuário ou senha não informados no .env');
    return false;
  }

  console.log('🔑 Preenchendo credenciais de acesso para MedLaser Brasil...');

  try {
    const userField = page.locator('#rc_user_login, input[name="log"]');
    const passField = page.locator('#rc_user_pass, input[name="pwd"]');
    const submitBtn = page.locator('#rc_login_submit, input[type="submit"]');

    if (await userField.isVisible({ timeout: 5000 })) {
      await userField.fill(user);
      await passField.fill(pass);
      console.log('👆 Clicando no botão de Login...');

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
        submitBtn.click()
      ]);

      console.log('✅ Formulário enviado. URL atual:', page.url());
      return true;
    } else {
      console.log('ℹ️ Formulário de login não detectado na página atual (pode já estar autenticado).');
      return false;
    }
  } catch (error) {
    console.error('⚠️ Erro ao tentar autenticar:', error);
    return false;
  }
}

/**
 * Executa o fluxo principal de raspagem de dados no site MedLaser Brasil.
 */
export async function runScraper(options: ScraperOptions): Promise<ScrapedItem[]> {
  const { url, headless, timeoutMs = 30000 } = options;

  console.log(`🌐 Inicializando navegador (Headless: ${headless})...`);

  const browser: Browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page: Page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  const scrapedItems: ScrapedItem[] = [];

  try {
    console.log(`🚀 Navegando para o sistema MedLaser: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Executa autenticação caso esteja no formulário de login
    await loginToSystem(page, config.systemUser, config.systemPassword);

    // Após login, aguarda carregamento de tabelas/conteúdo restrito
    await page.waitForTimeout(2000);

    // Captura screenshot para conferência da área logada
    await page.screenshot({ path: './output/pagina_medlaser.png', fullPage: true });
    console.log('📸 Screenshot da página salva em: ./output/pagina_medlaser.png');

    // Tenta extrair tabelas ou listas presentes no painel logado
    const rows = await page.locator('table tr, .data-row, .entry-content p').all();
    console.log(`🔍 Encontradas ${rows.length} linhas/elementos de conteúdo.`);

    let index = 1;
    for (const row of rows) {
      const text = (await row.innerText()).trim();
      if (text) {
        scrapedItems.push({
          id: index++,
          title: text.slice(0, 100),
          author: 'MedLaser Brasil',
          tags: ['MedLaser', 'Sistema'],
          url: page.url(),
          extraInfo: text,
          scrapedAt: new Date().toLocaleString('pt-BR')
        });
      }
    }

    console.log(`✅ Raspagem concluída com sucesso! Total de itens extraídos: ${scrapedItems.length}`);
  } catch (error) {
    console.error('❌ Erro durante a execução da raspagem:', error);
    await page.screenshot({ path: './output/erro-medlaser.png', fullPage: true }).catch(() => {});
    throw error;
  } finally {
    console.log('🧹 Fechando navegador...');
    await context.close();
    await browser.close();
  }

  return scrapedItems;
}
