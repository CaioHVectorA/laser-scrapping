import React, { useState, useEffect } from 'react';
import { getOrders } from '../api.js';
import { Search, RefreshCw, Eye, Calendar, FileText, User, Wrench, ClipboardList, Building2, Hash, Clock, X } from 'lucide-react';

const STATUS_OPTIONS = [
  'Todas',
  'Aguardando Análise',
  'Aguardando aprovação',
  'Em execução',
  'Finalizada',
  'Entregue'
];

export const OSTable: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('Todas');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [laudoOrder, setLaudoOrder] = useState<any | null>(null);
  const [laudoSearch, setLaudoSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getOrders({
        search,
        situacao: selectedStatus === 'Todas' ? '' : selectedStatus,
        limit: 100,
      });
      setOrders(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedStatus]);

  const getStatusBadgeClass = (situacao: string) => {
    const s = (situacao || '').toLowerCase();
    if (s.includes('análise') || s.includes('analise')) return 'badge-analise';
    if (s.includes('aprovação') || s.includes('aprovacao')) return 'badge-aprovacao';
    if (s.includes('execução') || s.includes('execucao')) return 'badge-execucao';
    if (s.includes('finalizada')) return 'badge-finalizada';
    if (s.includes('entregue')) return 'badge-entregue';
    return 'badge-default';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '14px' }}>
      {/* Top Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#a1a1aa' }} />
            <input
              type="text"
              className="input-text"
              placeholder="Buscar por OS, cliente, CPF/CNPJ, modelo ou técnico..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: '36px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
          {STATUS_OPTIONS.map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`btn ${selectedStatus === st ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '5px 10px', fontSize: '0.78rem' }}
            >
              {st}
            </button>
          ))}
        </div>

        <button className="btn btn-secondary" onClick={loadData} title="Atualizar">
          <RefreshCw size={15} />
          Atualizar
        </button>
      </div>

      <div style={{ fontSize: '0.82rem', color: '#a1a1aa' }}>
        Exibindo <strong>{orders.length}</strong> de <strong>{total}</strong> Ordens de Serviço
      </div>

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>OS</th>
              <th>Situação</th>
              <th>Data Entrada</th>
              <th>Cliente</th>
              <th>Equipamento</th>
              <th>Técnico</th>
              <th>Valor (R$)</th>
              <th style={{ textAlign: 'center' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: '#a1a1aa' }}>Carregando...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: '#a1a1aa' }}>Nenhuma Ordem de Serviço encontrada.</td></tr>
            ) : (
              orders.map((os) => (
                <tr key={os.id}>
                  <td style={{ fontWeight: '600', color: '#ffffff' }}>#{os.id}</td>
                  <td>
                    <span className={`badge-status ${getStatusBadgeClass(os.situacao)}`}>
                      {os.situacao || '—'}
                    </span>
                  </td>
                  <td style={{ color: '#a1a1aa' }}>{os.data_entrada || '—'}</td>
                  <td style={{ fontWeight: '500' }}>
                    {os.cliente_nome || '—'}
                    {os.cliente_cpf_cnpj && <div style={{ fontSize: '0.73rem', color: '#a1a1aa', fontWeight: '400' }}>{os.cliente_cpf_cnpj}</div>}
                  </td>
                  <td>
                    {os.equipamento_modelo || '—'}
                    {os.equipamento_codigo && <div style={{ fontSize: '0.73rem', color: '#a1a1aa' }}>Série: {os.equipamento_codigo}</div>}
                  </td>
                  <td style={{ color: '#a1a1aa' }}>{os.tecnico_responsavel || 'Em aberto'}</td>
                  <td style={{ fontWeight: '600', color: '#34d399' }}>
                    {os.valor_orcamento ? `R$ ${Number(os.valor_orcamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '0.75rem' }} onClick={() => setSelectedOrder(os)}>
                      <Eye size={13} /> Detalhes
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', color: '#ffffff' }}>
                <FileText size={18} /> OS #{selectedOrder.id}
              </h3>
              <button className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.75rem' }} onClick={() => setSelectedOrder(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span className={`badge-status ${getStatusBadgeClass(selectedOrder.situacao)}`}>{selectedOrder.situacao}</span>
                <span style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={13} /> {selectedOrder.data_entrada}
                </span>
              </div>

              <div style={{ backgroundColor: '#09090b', padding: '14px', borderRadius: '6px', border: '1px solid #27272a', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <h4 style={{ color: '#a1a1aa', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><User size={13} /> Cliente</h4>
                  <p style={{ fontWeight: '500', color: '#ffffff' }}>{selectedOrder.cliente_nome || '—'}</p>
                  <p style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>CPF/CNPJ: {selectedOrder.cliente_cpf_cnpj || '—'}</p>
                  <p style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Tel: {selectedOrder.cliente_telefones || '—'}</p>
                  <p style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>End: {selectedOrder.cliente_endereco || '—'}</p>
                </div>
                <div>
                  <h4 style={{ color: '#a1a1aa', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Wrench size={13} /> Equipamento</h4>
                  <p style={{ fontWeight: '500', color: '#ffffff' }}>{selectedOrder.equipamento_modelo || '—'}</p>
                  <p style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Série: {selectedOrder.equipamento_codigo || '—'}</p>
                  <p style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Linha: {selectedOrder.equipamento_linha_uso || '—'}</p>
                  <p style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Técnico: {selectedOrder.tecnico_responsavel || '—'}</p>
                </div>
              </div>

              {selectedOrder.descricao_problema && (
                <div>
                  <h4 style={{ color: '#a1a1aa', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px' }}>Problema Relatado</h4>
                  <div style={{ backgroundColor: '#09090b', border: '1px solid #27272a', padding: '10px', borderRadius: '6px', fontSize: '0.83rem' }}>{selectedOrder.descricao_problema}</div>
                </div>
              )}

              {selectedOrder.laudo_tecnico && (
                <div>
                  <h4 style={{ color: '#a1a1aa', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px' }}>Laudo Técnico</h4>
                  <div style={{ backgroundColor: '#09090b', border: '1px solid #27272a', padding: '10px', borderRadius: '6px', fontSize: '0.83rem', whiteSpace: 'pre-wrap' }}>{selectedOrder.laudo_tecnico}</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-amber" onClick={() => { setLaudoOrder(selectedOrder); setSelectedOrder(null); }}>
                <ClipboardList size={15} /> Ver Laudo
              </button>
              <button className="btn btn-secondary" onClick={() => setSelectedOrder(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Laudo Viewer Popup */}
      {laudoOrder && (
        <div className="modal-overlay" onClick={() => setLaudoOrder(null)}>
          <div className="laudo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '2px solid #E8850C' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', color: '#ffffff' }}>
                <ClipboardList size={20} color="#fbbf24" /> Visualizador de Laudo — OS #{laudoOrder.id}
              </h3>
              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setLaudoOrder(null)}>
                <X size={14} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: '0' }}>
              {/* 1 - CONTRATANTE */}
              <div className="laudo-section">
                <div className="laudo-section-header">
                  <Building2 size={16} color="#fbbf24" />
                  <span>1 — CONTRATANTE</span>
                </div>
                <div className="laudo-grid">
                  <div className="laudo-field">
                    <label>Nome / Razão Social</label>
                    <span>{laudoOrder.cliente_nome || '—'}</span>
                  </div>
                  <div className="laudo-field">
                    <label>CPF / CNPJ</label>
                    <span>{laudoOrder.cliente_cpf_cnpj || '—'}</span>
                  </div>
                  <div className="laudo-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Endereço</label>
                    <span>{laudoOrder.cliente_endereco || '—'}</span>
                  </div>
                  <div className="laudo-field">
                    <label>Telefone(s)</label>
                    <span>{laudoOrder.cliente_telefones || '—'}</span>
                  </div>
                  <div className="laudo-field">
                    <label>E-mail</label>
                    <span>{laudoOrder.cliente_email || '—'}</span>
                  </div>
                </div>
              </div>

              {/* 2 - LABORATÓRIO */}
              <div className="laudo-section">
                <div className="laudo-section-header">
                  <Building2 size={16} color="#60a5fa" />
                  <span>2 — LABORATÓRIO E TÉCNICO RESPONSÁVEL</span>
                </div>
                <div className="laudo-grid">
                  <div className="laudo-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Laboratório</label>
                    <span>MEDLASER MANUTENÇÃO DE EQUIPAMENTOS MÉDICOS E HOSPITALARES LTDA</span>
                  </div>
                  <div className="laudo-field">
                    <label>CNPJ</label>
                    <span>30.619.169/0001-95</span>
                  </div>
                  <div className="laudo-field">
                    <label>Telefone</label>
                    <span>(21) 2146-7627</span>
                  </div>
                  <div className="laudo-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Endereço</label>
                    <span>Rua São Francisco Xavier 989, Loj R Loj H — São Francisco Xavier — CEP: 20550-017 — Rio de Janeiro / RJ</span>
                  </div>
                  <div className="laudo-field">
                    <label>Técnico Responsável</label>
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                      {laudoOrder.tecnico_responsavel && laudoOrder.tecnico_responsavel !== 'Em aberto'
                        ? laudoOrder.tecnico_responsavel
                        : 'Roberto Aldilei Favoreto'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5 - DETALHES DO EQUIPAMENTO */}
              <div className="laudo-section">
                <div className="laudo-section-header">
                  <Wrench size={16} color="#34d399" />
                  <span>5 — NÚMEROS DE SÉRIE E EQUIPAMENTO</span>
                </div>
                <div className="laudo-grid">
                  <div className="laudo-field">
                    <label>Equipamento</label>
                    <span>{laudoOrder.equipamento_linha_uso || 'Laser'}</span>
                  </div>
                  <div className="laudo-field">
                    <label>Modelo</label>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>{laudoOrder.equipamento_modelo || '—'}</span>
                  </div>
                  <div className="laudo-field">
                    <label>Número de Série</label>
                    <span style={{ color: '#fbbf24', fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                      {laudoOrder.equipamento_codigo || '—'}
                    </span>
                  </div>
                  <div className="laudo-field">
                    <label>Fabricante</label>
                    <span>Dornier</span>
                  </div>
                </div>
              </div>

              {/* DATAS */}
              <div className="laudo-section">
                <div className="laudo-section-header">
                  <Clock size={16} color="#c084fc" />
                  <span>DATAS</span>
                </div>
                <div className="laudo-grid">
                  <div className="laudo-field">
                    <label>Data de Entrada</label>
                    <span>{laudoOrder.data_entrada || '—'}</span>
                  </div>
                  <div className="laudo-field">
                    <label>Data do Ensaio</label>
                    <span>{laudoOrder.data_entrada || new Date().toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              </div>

              {/* ORDEM DE SERVIÇO */}
              <div className="laudo-section">
                <div className="laudo-section-header">
                  <Hash size={16} color="#f43f5e" />
                  <span>ORDEM DE SERVIÇO</span>
                </div>
                <div className="laudo-grid">
                  <div className="laudo-field">
                    <label>Nº da OS</label>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                      #{laudoOrder.id}
                    </span>
                  </div>
                  <div className="laudo-field">
                    <label>Situação</label>
                    <span className={`badge-status ${getStatusBadgeClass(laudoOrder.situacao)}`}>{laudoOrder.situacao || '—'}</span>
                  </div>
                  <div className="laudo-field">
                    <label>Tipo de Serviço</label>
                    <span>{laudoOrder.servico_tipo || 'Calibração / Certificação'}</span>
                  </div>
                  <div className="laudo-field">
                    <label>Valor (R$)</label>
                    <span style={{ color: '#34d399', fontWeight: 600 }}>
                      {laudoOrder.valor_orcamento
                        ? `R$ ${Number(laudoOrder.valor_orcamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : 'R$ 0,00'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Laudo Técnico */}
              {laudoOrder.laudo_tecnico && (
                <div className="laudo-section">
                  <div className="laudo-section-header">
                    <FileText size={16} color="#38bdf8" />
                    <span>LAUDO TÉCNICO</span>
                  </div>
                  <div style={{ backgroundColor: '#09090b', border: '1px solid #27272a', padding: '12px', borderRadius: '6px', fontSize: '0.83rem', whiteSpace: 'pre-wrap', color: '#d4d4d8', lineHeight: '1.6' }}>
                    {laudoOrder.laudo_tecnico}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setLaudoOrder(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
