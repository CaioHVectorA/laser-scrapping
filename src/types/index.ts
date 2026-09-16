/**
 * Interface representando a estrutura detalhada de uma Ordem de Serviço (OS)
 * extraída diretamente da página de impressão (page_id=402).
 */
export interface ScrapedItem {
  id: string;
  situacao: string;
  dataEntrada: string;
  
  // Dados do Cliente
  clienteNome: string;
  clienteCpfCnpj: string;
  clienteEndereco: string;
  clienteTelefones: string;
  clienteEmail: string;

  // Dados do Equipamento
  equipamentoModelo: string;
  equipamentoCodigo: string;
  equipamentoLinhaUso: string;
  equipamentoDimensoes: string;
  equipamentoDescricao: string;
  equipamentoAcessorios: string;

  // Dados do Serviço
  servicoTipo: string;
  tecnicoResp: string;
  descricaoProblema: string;
  valorOrcamento: number | string;
  observacoes: string;
  laudoTecnico: string;

  categoriaServico?: string;

  // Metadados
  scrapedAt: string;
}

/**
 * Opções de configuração para o processo de extração.
 */
export interface ScraperOptions {
  url: string;
  headless: boolean;
  browserType?: string;
  timeoutMs?: number;
  maxItems?: number;
  targetOsId?: string;
  onItemScraped?: (item: ScrapedItem) => Promise<void> | void;
}

