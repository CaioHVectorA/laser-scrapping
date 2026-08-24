import React, { useState, useEffect, useRef } from 'react';
import { startScraper, subscribeScraperStream } from '../api.js';
import { Play, Square, Terminal, Eye, EyeOff } from 'lucide-react';

export const ScraperPanel: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [headless, setHeadless] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const logTerminalRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs]);

  const handleStart = async () => {
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
      await startScraper({ headless });
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Control Card */}
      <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: '600', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Play size={18} color="#fafafa" /> Automação de Coleta
          </h2>
          <p style={{ fontSize: '0.83rem', color: '#a1a1aa' }}>
            Atualizar e sincronizar ordens de serviço com o banco local.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className={`btn ${headless ? 'btn-secondary' : 'btn-amber'}`} onClick={() => setHeadless(!headless)} disabled={running}>
            {headless ? <EyeOff size={15} /> : <Eye size={15} />}
            {headless ? 'Modo Oculto' : 'Modo Visível'}
          </button>

          <button className="btn btn-primary" style={{ padding: '8px 20px' }} onClick={handleStart} disabled={running}>
            {running ? <Square size={16} /> : <Play size={16} />}
            {running ? 'Executando...' : 'Iniciar Automação'}
          </button>
        </div>
      </div>

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
