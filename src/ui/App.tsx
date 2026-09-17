import React, { useState } from 'react';
import { OSTable } from './components/OSTable.js';
import { ScraperPanel } from './components/ScraperPanel.js';
import { OperationPanel } from './components/OperationPanel.js';
import { XlsxEditor } from './components/XlsxEditor.js';
import { Table, Play, FileSpreadsheet, Zap, Sliders } from 'lucide-react';
import { DbOrder } from './osSubstitution.js';
import './styles.css';

type TabType = 'orders' | 'scraper' | 'operation' | 'xlsx';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('operation');
  const [selectedOsForOperation, setSelectedOsForOperation] = useState<DbOrder | null>(null);

  const handleOpenInOperation = (os: DbOrder) => {
    setSelectedOsForOperation(os);
    setActiveTab('operation');
  };

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
            className={`tab-btn ${activeTab === 'operation' ? 'active' : ''}`}
            onClick={() => setActiveTab('operation')}
          >
            <Sliders size={16} /> Operação
            {selectedOsForOperation && (
              <span style={{
                marginLeft: '6px',
                fontSize: '0.7rem',
                backgroundColor: '#f59e0b',
                color: '#000',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: '700'
              }}>
                #{selectedOsForOperation.id}
              </span>
            )}
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
        {activeTab === 'orders' && <OSTable onOpenInOperation={handleOpenInOperation} />}
        {activeTab === 'scraper' && <ScraperPanel onOpenInOperation={handleOpenInOperation} />}
        {activeTab === 'operation' && (
          <OperationPanel
            selectedOsProp={selectedOsForOperation}
            onClearSelectedOsProp={() => setSelectedOsForOperation(null)}
          />
        )}
        {activeTab === 'xlsx' && <XlsxEditor />}
      </main>
    </div>
  );
};

