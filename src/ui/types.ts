export interface DbOrder {
  id: string;
  situacao?: string;
  data_entrada?: string;
  cliente_nome?: string;
  cliente_cpf_cnpj?: string;
  cliente_endereco?: string;
  cliente_telefones?: string;
  cliente_email?: string;
  equipamento_modelo?: string;
  equipamento_codigo?: string;
  equipamento_linha_uso?: string;
  equipamento_dimensoes?: string;
  equipamento_descricao?: string;
  equipamento_acessorios?: string;
  servico_tipo?: string;
  tecnico_responsavel?: string;
  descricao_problema?: string;
  valor_orcamento?: number;
  observacoes?: string;
  laudo_tecnico?: string;
  scraped_at?: string;
}

export interface XlsxCellData {
  address: string;
  row: number;
  col: number;
  colLetter: string;
  value: any;
  displayValue: string;
  isNumeric: boolean;
  isMeasurementCandidate: boolean;
  isSelectedForVariation: boolean;
  formula?: string;
}

export interface XlsxSheet {
  name: string;
  rowCount: number;
  colCount: number;
  cells: Record<string, XlsxCellData>;
  matrix: (XlsxCellData | null)[][];
  columnsWithCandidates: string[];
}

export interface XlsxParsed {
  filePath: string;
  fileName: string;
  sheets: XlsxSheet[];
  measurementCellsCount: number;
}

export interface ElectronAPI {
  getOrders: (filters: { search?: string; situacao?: string; limit?: number; offset?: number }) => Promise<{ items: DbOrder[]; total: number }>;
  getOrderById: (id: string) => Promise<DbOrder | null>;
  runScraper: (options: { headless: boolean; maxItems?: number }) => Promise<any[]>;
  onScraperLog: (callback: (log: string) => void) => () => void;
  onScraperProgress: (callback: (progress: { current: number; total: number; percentage: number }) => void) => () => void;
  parseXlsx: (filePath: string) => Promise<XlsxParsed>;
  randomizeXlsx: (options: { filePath: string; outputPath: string; maxPercent: number; targetAddresses?: string[] }) => Promise<{ outputPath: string; changes: any[] }>;
  updateXlsxCells: (options: { filePath: string; outputPath: string; updates: any[] }) => Promise<string>;
  openFile: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  saveFile: (options?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
