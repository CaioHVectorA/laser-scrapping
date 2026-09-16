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
async function scrapePrintPage(page: Page, printPageIdOrUrl: string, osId: string, statusTabName: string): Promise<ScrapedItem> {
  const printUrl = printPageIdOrUrl.startsWith('http')
    ? printPageIdOrUrl.replace(/^http:/, 'https:')
    : `https://medlaserbrasil.com.br/?page_id=${printPageIdOrUrl}&cod_registro=${osId}&print=Y`;
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
  const { url, headless, timeoutMs = 30000, browserType } = options;

  const rawTarget = options.targetOsId?.trim() || '';
  if (!rawTarget) {
    throw new Error('Nenhuma Ordem de Serviço informada. O modo de varredura geral foi desativado. Por favor, informe a OS desejada.');
  }

  const targetIds = rawTarget
    .split(/[,\s]+/)
    .map(s => s.trim().replace(/^#/, ''))
    .filter(Boolean);

  if (targetIds.length === 0) {
    throw new Error('Nenhum número de OS válido foi identificado. Por favor, informe ao menos uma OS (ex: 7588).');
  }

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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page: Page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  const scrapedItems: ScrapedItem[] = [];

  try {
    console.log(`🚀 Navegando para o sistema: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await loginToSystem(page, config.systemUser, config.systemPassword);

    console.log(`🎯 Modo focado por OS ativado. Total de OSs a pesquisar: ${targetIds.length} (${targetIds.join(', ')})...`);

    let processedCount = 0;
    const totalToProcess = targetIds.length;

    for (const targetId of targetIds) {
      processedCount++;
      console.log(`\n⏳ [${processedCount}/${totalToProcess}] Pesquisando OS #${targetId} no sistema MedLaser...`);

      // 1. Navega para a página de ordens de serviço
      await page.goto('https://medlaserbrasil.com.br/?page_id=343', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      // 2. Garante que o checkbox 'apenas_num_os' esteja marcado
      await page.evaluate(() => {
        const cb = document.querySelector<HTMLInputElement>('#apenas_num_os');
        if (cb && !cb.checked) {
          cb.checked = true;
        }
      });

      // 3. Preenche o campo de filtro com a OS desejada
      const filtroInput = page.locator('#filtro_page');
      await filtroInput.waitFor({ state: 'visible', timeout: 5000 });
      await filtroInput.fill('');
      await filtroInput.fill(targetId);

      // 4. Submete a pesquisa via Enter e aguarda navegação completa
      console.log(`🔍 Enviando formulário de pesquisa para a OS #${targetId}...`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        filtroInput.press('Enter')
      ]);
      await page.waitForTimeout(1500);

      // 5. Avalia os resultados da busca nas tabelas retornadas
      const searchResult = await page.evaluate((osToFind) => {
        const rows = Array.from(document.querySelectorAll('tr')).filter(r => {
          const t = r.innerText || '';
          return t.includes(osToFind);
        });

        for (const r of rows) {
          // Procura link direto de impressão
          const printLink = r.querySelector<HTMLAnchorElement>('a[href*="print=Y"], a[href*="imprimir_os"]');
          const pane = r.closest('.tab-pane, [id^="tab-"]');
          const paneId = pane ? pane.id : '';
          const tabLink = paneId ? document.querySelector<HTMLElement>(`a[href="#${paneId}"]`) : null;
          return {
            found: true,
            printUrl: printLink ? printLink.href : null,
            tabName: tabLink ? tabLink.innerText.trim() : null
          };
        }

        return { found: false, printUrl: null, tabName: null };
      }, targetId);

      let item: ScrapedItem | null = null;

      // Se encontrou link direto no resultado da pesquisa:
      if (searchResult.found && searchResult.printUrl) {
        console.log(`📌 Link de impressão localizado diretamente para OS #${targetId}: ${searchResult.printUrl}`);
        try {
          item = await scrapePrintPage(page, searchResult.printUrl, targetId, searchResult.tabName || 'Geral');
        } catch (err) {
          console.warn(`⚠️ Falha ao abrir link direto, tentando rotas alternativas...`, err);
        }
      } else if (searchResult.found && searchResult.tabName) {
        // Encontrou na aba mas sem link direto no <tr>
        const foundTab = STATUS_PAGE_MAP.find(s => searchResult.tabName?.includes(s.tabName));
        const printPageId = foundTab ? foundTab.printPageId : '465';
        console.log(`📌 Aba identificada: "${searchResult.tabName}" (page_id=${printPageId}) para a OS #${targetId}.`);
        try {
          item = await scrapePrintPage(page, printPageId, targetId, searchResult.tabName);
        } catch {}
      }

      // Se não encontrou ou falhou, tenta as páginas de impressão das abas (fallback robusto para OSs antigas)
      if (!item || (!item.clienteNome && !item.equipamentoModelo)) {
        console.log(`ℹ️ Testando páginas de impressão padrão para a OS #${targetId}...`);
        const fallbackStatusList = [
          { printPageId: '465', tabName: 'Entregue' },
          { printPageId: '460', tabName: 'Finalizada' },
          { printPageId: '440', tabName: 'Em execução' },
          { printPageId: '425', tabName: 'Aguardando aprovação' },
          { printPageId: '402', tabName: 'Aguardando Análise' }
        ];

        for (const fb of fallbackStatusList) {
          try {
            const candidate = await scrapePrintPage(page, fb.printPageId, targetId, fb.tabName);
            if (candidate.clienteNome || candidate.equipamentoModelo) {
              item = candidate;
              console.log(`✅ OS #${targetId} recuperada com sucesso na aba "${fb.tabName}" (page_id=${fb.printPageId})!`);
              break;
            }
          } catch {}
        }
      }

      if (item && (item.clienteNome || item.equipamentoModelo)) {
        scrapedItems.push(item);
        if (options.onItemScraped) {
          try {
            await Promise.resolve(options.onItemScraped(item));
          } catch (saveErr) {
            console.warn(`⚠️ Erro ao salvar OS #${targetId} incrementalmente:`, saveErr);
          }
        }
        console.log(`✅ OS #${targetId} extraída com SUCESSO: ${item.clienteNome || 'Cliente'} - ${item.equipamentoModelo || 'Equipamento'} (${item.situacao})`);
      } else {
        console.warn(`⚠️ Não foi possível encontrar dados válidos para a OS #${targetId}.`);
      }
    }

    console.log(`\n========================================`);
    console.log(`🎉 Raspagem finalizada! Total extraído: ${scrapedItems.length}`);
    return scrapedItems;
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
}
