/**
 * Interface representando a estrutura genérica de um item extraído da raspagem.
 * Altere ou acrescente campos conforme as necessidades específicas do sistema alvo.
 */
export interface ScrapedItem {
  id: number;
  title: string;
  author: string;
  tags: string[];
  url?: string;
  extraInfo?: string;
  scrapedAt: string;
}

/**
 * Opções de configuração para o processo de extração.
 */
export interface ScraperOptions {
  url: string;
  headless: boolean;
  timeoutMs?: number;
}
