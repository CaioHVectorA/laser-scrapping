import React, { useState } from 'react';
import { OSTable } from './components/OSTable.js';
import { ScraperPanel } from './components/ScraperPanel.js';
import { XlsxEditor } from './components/XlsxEditor.js';
import { Table, Play, FileSpreadsheet, Zap } from 'lucide-react';
import './styles.css';

type TabType = 'orders' | 'scraper' | 'xlsx';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('orders');

  return (
    <div id="root">
      {/* Header Limpo */}
      <header className="app-header">
        <div className="brand-title">
          <Zap size={22} color="#fafafa" />
          <span>LaserWidget</span>
        </div>

        {/* Abas com Nomes Simplificados */}
        <nav className="nav-tabs">
          <button
            className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <Table size={16} /> Ordens de Serviço
          </button>
          <button
            className={`tab-btn ${activeTab === 'scraper' ? 'active' : ''}`}
            onClick={() => setActiveTab('scraper')}
          >
            <Play size={16} /> Automação
          </button>
          <button
            className={`tab-btn ${activeTab === 'xlsx' ? 'active' : ''}`}
            onClick={() => setActiveTab('xlsx')}
          >
            <FileSpreadsheet size={16} /> Editor de Planilhas
          </button>
        </nav>
      </header>

      {/* Conteúdo Principal */}
      <main className="app-content">
        {activeTab === 'orders' && <OSTable />}
        {activeTab === 'scraper' && <ScraperPanel />}
        {activeTab === 'xlsx' && <XlsxEditor />}
      </main>
    </div>
  );
};
