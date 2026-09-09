const API_BASE = 'http://localhost:3001';

// ─── Database ───────────────────────────────────────────────────────────
export async function getOrders(filters: {
  search?: string;
  situacao?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: any[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.situacao) params.set('situacao', filters.situacao);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));

  const res = await fetch(`${API_BASE}/api/orders?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getOrderById(id: string) {
  const res = await fetch(`${API_BASE}/api/orders/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Scraper ────────────────────────────────────────────────────────────
export async function startScraper(options: { headless: boolean }) {
  const res = await fetch(`${API_BASE}/api/scraper/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return res.json();
}

export function subscribeScraperStream(
  onLog: (msg: string) => void,
  onProgress: (p: { current: number; total: number; percentage: number }) => void
): () => void {
  const es = new EventSource(`${API_BASE}/api/scraper/stream`);

  es.addEventListener('log', (e) => {
    try {
      const data = JSON.parse(e.data);
      onLog(data.message);
    } catch {}
  });

  es.addEventListener('progress', (e) => {
    try {
      onProgress(JSON.parse(e.data));
    } catch {}
  });

  es.onerror = () => {
    // Will auto-reconnect
  };

  return () => es.close();
}

export async function getScraperStatus() {
  const res = await fetch(`${API_BASE}/api/scraper/status`);
  return res.json();
}

// ─── XLSX ───────────────────────────────────────────────────────────────
export async function parseXlsx(filePath: string) {
  const res = await fetch(`${API_BASE}/api/xlsx/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function randomizeXlsx(options: {
  filePath: string;
  outputPath: string;
  maxPercent: number;
}) {
  const res = await fetch(`${API_BASE}/api/xlsx/randomize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listXlsxFiles(): Promise<{ name: string; path: string }[]> {
  const res = await fetch(`${API_BASE}/api/xlsx/files`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveXlsxToServer(fileName: string, fileBase64: string): Promise<{ success: boolean; name: string; path: string }> {
  const res = await fetch(`${API_BASE}/api/xlsx/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, fileBase64 }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
