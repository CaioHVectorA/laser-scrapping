import React, { useState, useEffect, useRef, useMemo } from 'react';
import { startScraper, subscribeScraperStream, getInstalledBrowsers, type DetectedBrowserInfo } from '../api.js';
import { Play, Square, Terminal, Eye, EyeOff, Globe, Search, Target, Sparkles, Sliders, Zap, CheckCircle2 } from 'lucide-react';

interface ScraperPanelProps {
  onOpenInOperation?: (os: any) => void;
}

export const ScraperPanel: React.FC<ScraperPanelProps> = ({ onOpenInOperation }) => {
  const [running, setRunning] = useState(false);
  const [headless, setHeadless] = useState(true);
  const [targetOs, setTargetOs] = useState('');
  const [selectedBrowser, setSelectedBrowser] = useState<string>('auto');
  const [browserInfo, setBrowserInfo] = useState<DetectedBrowserInfo | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const logTerminalRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Carrega navegadores detectados no SO
    getInstalledBrowsers()
      .then(info => {
        setBrowserInfo(info);
      })
      .catch(() => {});

    return () => { cleanupRef.current?.(); };
  }, []);

  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Procura se há reconhecimento de serviço nos logs recentes
  const lastRecognized = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      const line = logs[i];
      if (line.includes('[Reconhecimento de Serviço]')) {
        return line.replace(/^.*?\[Reconhecimento de Serviço\]:\s*/, '');
      }
    }
    return null;
  }, [logs]);

  const lastExtractedOs = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      const match = logs[i].match(/OS #(\d+) extraída com SUCESSO/i) || logs[i].match(/OS #(\d+) identificada como/i);
      if (match) return match[1];
    }
    return targetOs.trim() || null;
  }, [logs, targetOs]);

  const hasSuccessLog = useMemo(() => {
    return logs.some(l => l.includes('extraída com SUCESSO') || l.includes('Raspagem finalizada!'));
  }, [logs]);

  const handleStart = async () => {
    if (!targetOs.trim()) {
      setLogs((prev) => [...prev, '⚠️ Por favor, informe o número da Ordem de Serviço (OS) a ser extraída (ex: 7588).']);
      return;
    }

    if (running) return;

    setRunning(true);
    setLogs([]);
    setProgress({ current: 0, total: 0, percentage: 0 });

    // Subscribe to SSE stream for real-time logs
    cleanupRef.current?.();
    cleanupRef.current = subscribeScraperStream(
      (msg) => setLogs((prev) => [...prev, msg]),
      (p) => setProgress(p)
    );

    try {
      await startScraper({
        headless,
        browser: selectedBrowser,
        osId: targetOs.trim()
      });
    } catch (err: any) {
      setLogs((prev) => [...prev, `❌ Erro: ${err?.message || String(err)}`]);
    }

    // Keep running state until scraper completes (watch logs for completion)
    const checkInterval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:3001/api/scraper/status');
        const status = await res.json();
        if (!status.running) {
          setRunning(false);
          clearInterval(checkInterval);
        }
      } catch {
        clearInterval(checkInterval);
        setRunning(false);
      }
    }, 2000);
  };

  // Helper para exibir o status do navegador detectado
  const availableBrowsers = browserInfo?.detected?.filter(b => b.available) || [];
  const detectedSummary = availableBrowsers.length > 0
    ? availableBrowsers.map(b => b.name.replace(' (Playwright)', '')).join(' / ')
    : 'Nenhum detectado (auto-download)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Control Card */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: '600', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={18} color="#fafafa" /> Extração Pontual por OS
          </h2>
          <p style={{ fontSize: '0.83rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Pesquisa direta por Ordem de Serviço no sistema MedLaser (sem varredura geral).</span>
            <span style={{ color: '#71717a' }}>•</span>
            <span style={{ fontSize: '0.78rem', color: '#38bdf8', backgroundColor: '#0369a120', padding: '2px 8px', borderRadius: '4px', border: '1px solid #0284c730' }}>
              Detectado: {detectedSummary}
            </span>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Campo de Busca por OS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#27272a', borderRadius: '6px', padding: '6px 12px', border: targetOs.trim() ? '1px solid #0284c7' : '1px solid #3f3f46' }}>
            <Search size={14} color={targetOs.trim() ? '#38bdf8' : '#a1a1aa'} />
            <input
              type="text"
              placeholder="Número da OS (ex: 7588)"
              value={targetOs}
              onChange={(e) => setTargetOs(e.target.value)}
              disabled={running}
              style={{
                backgroundColor: 'transparent',
                color: '#fafafa',
                border: 'none',
                fontSize: '0.84rem',
                outline: 'none',
                width: '180px'
              }}
              title="Digite a OS para pesquisa e extração direta"
            />
            {targetOs && (
              <button
                onClick={() => setTargetOs('')}
                disabled={running}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '12px', padding: 0 }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Seletor de Navegador */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#27272a', borderRadius: '6px', padding: '4px 8px' }}>
            <Globe size={14} color="#a1a1aa" />
            <select
              value={selectedBrowser}
              onChange={(e) => setSelectedBrowser(e.target.value)}
              disabled={running}
              style={{
                backgroundColor: 'transparent',
                color: '#fafafa',
                border: 'none',
                fontSize: '0.82rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="auto" style={{ backgroundColor: '#18181b', color: '#fafafa' }}>
                Auto (Edge / Chrome nativo)
              </option>
              <option value="msedge" style={{ backgroundColor: '#18181b', color: '#fafafa' }}>
                Microsoft Edge
              </option>
              <option value="chrome" style={{ backgroundColor: '#18181b', color: '#fafafa' }}>
                Google Chrome
              </option>
              <option value="chromium" style={{ backgroundColor: '#18181b', color: '#fafafa' }}>
                Chromium (Playwright)
              </option>
            </select>
          </div>

          <button className={`btn ${headless ? 'btn-secondary' : 'btn-amber'}`} onClick={() => setHeadless(!headless)} disabled={running}>
            {headless ? <EyeOff size={15} /> : <Eye size={15} />}
            {headless ? 'Modo Oculto' : 'Modo Visível'}
          </button>

          <button
            className="btn btn-primary"
            style={{
              padding: '8px 18px',
              backgroundColor: targetOs.trim() ? '#0284c7' : '#3f3f46',
              cursor: targetOs.trim() && !running ? 'pointer' : 'not-allowed',
              opacity: targetOs.trim() || running ? 1 : 0.6
            }}
            onClick={handleStart}
            disabled={running || !targetOs.trim()}
          >
            {running ? (
              <Square size={16} />
            ) : (
              <Target size={16} />
            )}
            {running
              ? 'Extraindo...'
              : targetOs.trim()
                ? `Extrair OS #${targetOs.trim()}`
                : 'Informe a OS'}
          </button>
        </div>
      </div>

      {/* Reconhecimento Explícito da OS Extraída */}
      {lastRecognized && (
        <div style={{
          backgroundColor: 'rgba(5, 150, 105, 0.12)',
          border: '1px solid rgba(5, 150, 105, 0.4)',
          borderRadius: '8px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#34d399',
          fontSize: '0.86rem',
          fontWeight: '600'
        }}>
          <Sparkles size={18} color="#34d399" />
          <span>{lastRecognized}</span>
        </div>
      )}

      {/* Botão de Ação Rápida para Abrir na Operação */}
      {hasSuccessLog && lastExtractedOs && !running && (
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          borderRadius: '8px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Zap size={20} color="#fbbf24" />
            <div>
              <div style={{ color: '#fbbf24', fontWeight: '700', fontSize: '0.92rem' }}>
                OS #{lastExtractedOs} extraída e pronta para a Central de Operação!
              </div>
              <div style={{ color: '#a1a1aa', fontSize: '0.78rem' }}>
                Clique para abrir a planilha e preencher automaticamente os dados do certificado.
              </div>
            </div>
          </div>
          {onOpenInOperation && (
            <button
              className="btn btn-primary"
              style={{
                padding: '8px 18px',
                backgroundColor: '#f59e0b',
                color: '#000',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.85rem'
              }}
              onClick={async () => {
                try {
                  const res = await fetch(`http://localhost:3001/api/orders/${lastExtractedOs}`);
                  if (res.ok) {
                    const data = await res.json();
                    onOpenInOperation(data);
                  } else {
                    onOpenInOperation({ id: lastExtractedOs });
                  }
                } catch {
                  onOpenInOperation({ id: lastExtractedOs });
                }
              }}
            >
              <Sliders size={16} /> Abrir OS #{lastExtractedOs} na Operação
            </button>
          )}
        </div>
      )}

      {/* Progress */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#a1a1aa', fontWeight: '500' }}>
          <span>Progresso</span>
          <span>{progress.current} / {progress.total} ({progress.percentage}%)</span>
        </div>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${progress.percentage}%` }}></div>
        </div>
      </div>

      {/* Terminal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: '500', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Terminal size={15} /> Terminal
          </span>
          <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => setLogs([])}>
            Limpar
          </button>
        </div>

        <div className="terminal-window" ref={logTerminalRef}>
          {logs.length === 0 ? (
            <span style={{ color: '#52525b' }}>Clique em "Iniciar Automação" para acompanhar...</span>
          ) : (
            logs.map((l, i) => <div key={i} style={{ marginBottom: '2px' }}>{l}</div>)
          )}
        </div>
      </div>
    </div>
  );
};

