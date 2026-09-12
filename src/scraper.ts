import { type Browser, type Page } from 'playwright';
import { config } from './config.js';
import { launchBrowserWithFallback } from './browserLauncher.js';
import type { ScrapedItem, ScraperOptions } from './types/index.js';

/**
 * Autentica no sistema MedLaser Brasil.
 */
export async function loginToSystem(page: Page, user: string, pass: string): Promise<boolean> {
  if (!user || !pass) {
    console.warn('⚠️ Usuário ou senha não informados no .env');
    return false;
  }

  console.log('🔑 Autenticando no sistema MedLaser Brasil...');

  try {
    const userField = page.locator('#rc_user_login, input[name="log"]');
    const passField = page.locator('#rc_user_pass, input[name="pwd"]');
    const submitBtn = page.locator('#rc_login_submit, input[type="submit"]');

    if (await userField.isVisible({ timeout: 5000 })) {
      await userField.fill(user);
      await passField.fill(pass);

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
        submitBtn.click()
      ]);

      console.log('✅ Autenticado com sucesso. URL atual:', page.url());
      return true;
    } else {
      console.log('ℹ️ Formulário de login não detectado na página atual.');
      return false;
    }
  } catch (error) {
    console.error('⚠️ Erro ao tentar autenticar:', error);
    return false;
  }
}

/**
 * Extrai todos os campos de uma folha de impressão específica (402, 425, 440, 460, 465).
 */
async function scrapePrintPage(page: Page, printPageId: string, osId: string, statusTabName: string): Promise<ScrapedItem> {
  const printUrl = `https://medlaserbrasil.com.br/?page_id=${printPageId}&cod_registro=${osId}&print=Y`;
  await page.goto(printUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const scrapedAt = new Date().toLocaleString('pt-BR');

  const details = await page.evaluate((defaultStatus) => {
    const result: Record<string, string> = {};
    const bodyText = document.body.innerText || '';

    // Situação & Data Entrada
    const sitMatch = bodyText.match(/Situação:\s*([^\n]+)/i);
    const dataMatch = bodyText.match(/(?:Data Entrada|Entrada):\s*([\d\/\s:]+)/i);

    // Percorre todas as células da tabela para encontrar rótulo/valor
    const tds = Array.from(document.querySelectorAll<HTMLElement>('td, th'));
    for (let i = 0; i < tds.length; i++) {
      const text = tds[i].innerText ? tds[i].innerText.trim() : '';

      if (text.includes(':')) {
        const colonIdx = text.indexOf(':');
        const key = text.substring(0, colonIdx).replace(/^[\s\-•]+/, '').trim();
        const inlineVal = text.substring(colonIdx + 1).trim();

        if (inlineVal.length > 0 && !inlineVal.includes('\n')) {
          if (key && !result[key]) result[key] = inlineVal;
        } else {
          let nextVal = '';
          if (tds[i + 1]) {
            const nextText = tds[i + 1].innerText ? tds[i + 1].innerText.trim() : '';
            if (!nextText.endsWith(':') && nextText !== text) {
              nextVal = nextText;
            }
          }
          if (key && !result[key]) {
            result[key] = nextVal || inlineVal;
          }
        }
      }
    }

    const laudoTextarea = document.querySelector('textarea') as HTMLTextAreaElement | null;
    const laudoTecnico = laudoTextarea && laudoTextarea.value.trim() ? laudoTextarea.value.trim() : (result['Laudo Técnico'] || '');

    const valorStr = result['Valor do Orçamento (R$)'] || result['Valor do Orçamento'] || result['Valor total serviço (R$)'] || '0';
    const valorOrcamento = parseFloat(valorStr.replace(/\./g, '').replace(',', '.')) || 0;

    return {
      situacao: sitMatch ? sitMatch[1].trim() : defaultStatus,
      dataEntrada: dataMatch ? dataMatch[1].trim() : (result['Data Entrada'] || ''),
      clienteNome: result['Nome'] || '',
      clienteCpfCnpj: result['CPF/CNPJ'] || '',
      clienteEndereco: result['Endereço'] || '',
      clienteTelefones: result['Telefones'] || '',
      clienteEmail: result['email'] || '',
      equipamentoModelo: result['Modelo'] || '',
      equipamentoCodigo: result['Código'] || '',
      equipamentoLinhaUso: result['Linha de uso'] || '',
      equipamentoDimensoes: result['Dimensões'] || '',
      equipamentoDescricao: result['Descrição'] || '',
      equipamentoAcessorios: result['Acessórios'] || '',
      servicoTipo: result['Tipo de Serviço'] || '',
      tecnicoResp: result['Técnico Responsável'] || '',
      descricaoProblema: result['Descrição do Problema'] || '',
      valorOrcamento,
      observacoes: result['Observações'] || '',
      laudoTecnico
    };
  }, statusTabName);

  return {
    id: osId,
    ...details,
    scrapedAt
  };
}

/**
 * Mapeamento das Abas ativas e seus respectivos page_id de impressão.
 * Cancelada não conta conforme especificado pelo usuário.
 */
const STATUS_PAGE_MAP = [
  { tabName: 'Aguardando Análise', printPageId: '402' },
  { tabName: 'Aguardando aprovação', printPageId: '425' },
  { tabName: 'Em execução', printPageId: '440' },
  { tabName: 'Finalizada', printPageId: '460' },
  { tabName: 'Entregue', printPageId: '465' }
];

/**
 * Executa o fluxo principal de extração mapeando o DOM de page_id=343 para extrair as OSs de cada aba.
 */
export async function runScraper(options: ScraperOptions): Promise<ScrapedItem[]> {
  const { url, headless, timeoutMs = 30000, maxItems, browserType } = options;

  console.log(`🌐 Inicializando navegador (Headless: ${headless})...`);

  const browser: Browser = await launchBrowserWithFallback({
    headless,
    channelPreference: browserType || config.browserChannel,
    customExecutablePath: config.chromePath,
    onLog: (msg) => console.log(msg),
    timeoutMs,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (Chrome/120.0.0.0 Safari/537.36)'
  });

  const page: Page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  const scrapedItems: ScrapedItem[] = [];

  try {
    console.log(`🚀 Navegando para o sistema: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await loginToSystem(page, config.systemUser, config.systemPassword);

    await page.goto('https://medlaserbrasil.com.br/?page_id=343', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Mapeia todas as OSs agrupadas por painel de aba no DOM de page_id=343
    const tabData = await page.evaluate((statusList) => {
      const result: { tabName: string; printPageId: string; osIds: string[] }[] = [];
      const tabLinks = Array.from(document.querySelectorAll<HTMLElement>('a[id*="-tab"]'));

      for (const statusItem of statusList) {
        const link = tabLinks.find(l => l.innerText.includes(statusItem.tabName));
        if (link) {
          const href = link.getAttribute('href');
          const pane = href ? document.querySelector(href) : null;
          const osIds: string[] = [];
          if (pane) {
            const rows = Array.from(pane.querySelectorAll<HTMLTableRowElement>('tr'));
            for (const r of rows) {
              const cells = Array.from(r.querySelectorAll<HTMLTableCellElement>('td')).map(c => c.innerText.trim());
              if (cells.length >= 2 && /^\d+$/.test(cells[1])) {
                osIds.push(cells[1]);
              }
            }
          }
          result.push({ tabName: statusItem.tabName, printPageId: statusItem.printPageId, osIds });
        }
      }

      return result;
    }, STATUS_PAGE_MAP);

    let totalToProcess = 0;
    for (const group of tabData) {
      totalToProcess += maxItems ? Math.min(group.osIds.length, maxItems) : group.osIds.length;
      console.log(`📌 Aba "${group.tabName}" (page_id=${group.printPageId}): ${group.osIds.length} OSs identificadas.`);
    }

    console.log(`\n📄 Iniciando coleta das folhas de impressão de ${totalToProcess} OSs...`);

    let processedCount = 0;

    for (const group of tabData) {
      console.log(`\n========================================`);
      console.log(`📂 Processando ${group.osIds.length} OSs da aba "${group.tabName}" (page_id=${group.printPageId})...`);

      const idsToProcess = maxItems ? group.osIds.slice(0, maxItems) : group.osIds;

      for (const id of idsToProcess) {
        processedCount++;
        console.log(`⏳ [${processedCount}/${totalToProcess}] Extraindo OS #${id} (Aba: "${group.tabName}", page_id=${group.printPageId})...`);
        try {
          const item = await scrapePrintPage(page, group.printPageId, id, group.tabName);
          scrapedItems.push(item);
          if (options.onItemScraped) {
            try {
              await Promise.resolve(options.onItemScraped(item));
            } catch (saveErr) {
              console.warn(`⚠️ Erro ao salvar OS #${id} incrementalmente:`, saveErr);
            }
          }
        } catch (err) {
          console.error(`❌ Erro ao extrair folha de impressão da OS #${id}:`, err);
        }
      }
    }

    console.log(`\n========================================`);
    console.log(`✅ Raspagem finalizada com SUCESSO! Total de folhas de impressão extraídas: ${scrapedItems.length}`);
  } catch (error) {
    console.error('❌ Erro durante a execução da raspagem:', error);
    throw error;
  } finally {
    try {
      if (context) await context.close();
    } catch {}
    try {
      if (browser) await browser.close();
    } catch {}
  }

  return scrapedItems;
}
