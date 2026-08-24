import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Banco de Dados
  getOrders: (filters: { search?: string; situacao?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('db:get-orders', filters),
  
  getOrderById: (id: string) =>
    ipcRenderer.invoke('db:get-order-by-id', id),

  // Scraper
  runScraper: (options: { headless: boolean; maxItems?: number }) =>
    ipcRenderer.invoke('scraper:run', options),
  
  onScraperLog: (callback: (log: string) => void) => {
    const handler = (_event: any, message: string) => callback(message);
    ipcRenderer.on('scraper:log', handler);
    return () => ipcRenderer.removeListener('scraper:log', handler);
  },

  onScraperProgress: (callback: (progress: { current: number; total: number; percentage: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('scraper:progress', handler);
    return () => ipcRenderer.removeListener('scraper:progress', handler);
  },

  // Editor XLSX
  parseXlsx: (filePath: string) =>
    ipcRenderer.invoke('xlsx:parse', filePath),

  randomizeXlsx: (options: { filePath: string; outputPath: string; maxPercent: number; targetAddresses?: string[] }) =>
    ipcRenderer.invoke('xlsx:randomize', options),

  updateXlsxCells: (options: { filePath: string; outputPath: string; updates: any[] }) =>
    ipcRenderer.invoke('xlsx:update-cells', options),

  // Diálogos de arquivo
  openFile: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:open-file', options),

  saveFile: (options?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:save-file', options),
});
