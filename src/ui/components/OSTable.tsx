import React, { useState, useEffect, useMemo } from 'react';
import { getOrders } from '../api.js';
import {
  Search,
  RefreshCw,
  Eye,
  Calendar,
  FileText,
  User,
  Wrench,
  ClipboardList,
  Building2,
  Hash,
  Clock,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  UserCheck,
  SlidersHorizontal,
  CaseSensitive
} from 'lucide-react';

const STATUS_OPTIONS = [
  'Todas',
  'Aguardando Análise',
  'Aguardando aprovação',
  'Em execução',
  'Finalizada',
  'Entregue'
];

type SortField = 'id' | 'situacao' | 'data_entrada' | 'cliente_nome' | 'equipamento_modelo' | 'tecnico_responsavel';
type SortDirection = 'asc' | 'desc';

export const OSTable: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('Todas');
  const [selectedTechnician, setSelectedTechnician] = useState('Todos');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [laudoOrder, setLaudoOrder] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getOrders({
        search: '', // Buscamos a lista e aplicamos filtros avançados client-side
        situacao: selectedStatus === 'Todas' ? '' : selectedStatus,
        limit: 150,
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
  }, [selectedStatus]);

  // Lista de técnicos únicos presentes nas OSs
  const uniqueTechnicians = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => {
      if (o.tecnico_responsavel && o.tecnico_responsavel.trim() !== '') {
        set.add(o.tecnico_responsavel.trim());
      }
    });
    return ['Todos', ...Array.from(set).sort()];
  }, [orders]);

  const normalizeStr = (str: string, isCaseSensitive: boolean): string => {
    if (!str) return '';
    let res = str;
    if (!isCaseSensitive) {
      res = res.toLowerCase();
    }
    // Remove diacríticos/acentos
    return res.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={13} color="#fbbf24" />
      : <ArrowDown size={13} color="#fbbf24" />;
  };

  // Filtros combinados e ordenação
  const filteredAndSortedOrders = useMemo(() => {
    let list = [...orders];

    // Filtro por Técnico
    if (selectedTechnician !== 'Todos') {
      list = list.filter(os => (os.tecnico_responsavel || 'Em aberto') === selectedTechnician);
    }

    // Busca textual inteligente (com suporte a maiúsculas/minúsculas e acentos)
    if (search.trim()) {
      const q = normalizeStr(search.trim(), caseSensitive);
      list = list.filter(os => {
        const idStr = normalizeStr(String(os.id || ''), caseSensitive);
        const cliStr = normalizeStr(String(os.cliente_nome || ''), caseSensitive);
        const docStr = normalizeStr(String(os.cliente_cpf_cnpj || ''), caseSensitive);
        const eqStr = normalizeStr(String(os.equipamento_modelo || ''), caseSensitive);
        const snStr = normalizeStr(String(os.equipamento_codigo || ''), caseSensitive);
        const tecStr = normalizeStr(String(os.tecnico_responsavel || ''), caseSensitive);
        const sitStr = normalizeStr(String(os.situacao || ''), caseSensitive);

        return idStr.includes(q) ||
          cliStr.includes(q) ||
          docStr.includes(q) ||
          eqStr.includes(q) ||
          snStr.includes(q) ||
          tecStr.includes(q) ||
          sitStr.includes(q);
      });
    }

    // Ordenação
    list.sort((a, b) => {
      const valA = a[sortField] ?? '';
      const valB = b[sortField] ?? '';

      if (sortField === 'id') {
        const numA = parseInt(String(valA), 10) || 0;
        const numB = parseInt(String(valB), 10) || 0;
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }

      const strA = normalizeStr(String(valA), false);
      const strB = normalizeStr(String(valB), false);
      const cmp = strA.localeCompare(strB, 'pt-BR');
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [orders, selectedTechnician, search, caseSensitive, sortField, sortDirection]);

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
        
        {/* Barra de Pesquisa com Filtro de Maiúsculo/Minúsculo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '320px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#a1a1aa' }} />
            <input
              type="text"
              className="input-text"
              placeholder="Buscar por OS, cliente, CPF/CNPJ, modelo ou técnico..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: '36px', paddingRight: '40px' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', padding: '2px' }}
                title="Limpar busca"
              >
                ✕
              </button>
            )}
          </div>

          {/* Toggle Maiúsculas/Minúsculas */}
          <button
            className={`btn ${caseSensitive ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCaseSensitive(!caseSensitive)}
            style={{ padding: '6px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
            title={caseSensitive ? 'Filtro: Diferenciando Maiúsculas/Minúsculas (Ativo)' : 'Filtro: Ignorando Maiúsculas/Minúsculas (Inativo)'}
          >
            <CaseSensitive size={16} color={caseSensitive ? '#ffffff' : '#a1a1aa'} />
            <span style={{ fontSize: '0.74rem' }}>{caseSensitive ? 'Exato (Aa)' : 'Qualquer (aA)'}</span>
          </button>
        </div>

        {/* Dropdown Filtro por Técnico */}
        {uniqueTechnicians.length > 2 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.76rem', color: '#a1a1aa', whiteSpace: 'nowrap' }}>Técnico:</span>
            <select
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
              style={{ backgroundColor: '#18181b', color: '#f4f4f5', border: '1px solid #27272a', borderRadius: '6px', padding: '6px 10px', fontSize: '0.78rem', outline: 'none' }}
            >
              {uniqueTechnicians.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        {/* Botão Atualizar */}
        <button className="btn btn-secondary" onClick={loadData} title="Atualizar dados da base">
          <RefreshCw size={15} />
          Atualizar
        </button>
      </div>

      {/* Seletor de Situação */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
          {STATUS_OPTIONS.map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`btn ${selectedStatus === st ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '5px 12px', fontSize: '0.78rem' }}
            >
              {st}
            </button>
          ))}
        </div>

        <div style={{ fontSize: '0.82rem', color: '#a1a1aa' }}>
          Exibindo <strong>{filteredAndSortedOrders.length}</strong> de <strong>{total}</strong> Ordens de Serviço
        </div>
      </div>

      {/* Tabela de Ordens de Serviço */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer', userSelect: 'none', width: '90px' }} onClick={() => handleSort('id')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Hash size={14} color="#a1a1aa" /> OS {renderSortIcon('id')}
                </div>
              </th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('situacao')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Situação {renderSortIcon('situacao')}
                </div>
              </th>
              <th style={{ cursor: 'pointer', userSelect: 'none', width: '130px' }} onClick={() => handleSort('data_entrada')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} color="#a1a1aa" /> Entrada {renderSortIcon('data_entrada')}
                </div>
              </th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('cliente_nome')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} color="#a1a1aa" /> Cliente {renderSortIcon('cliente_nome')}
                </div>
              </th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('equipamento_modelo')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wrench size={14} color="#a1a1aa" /> Equipamento {renderSortIcon('equipamento_modelo')}
                </div>
              </th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('tecnico_responsavel')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserCheck size={14} color="#60a5fa" /> Técnico Responsável {renderSortIcon('tecnico_responsavel')}
                </div>
              </th>
              <th style={{ textAlign: 'center', width: '170px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#a1a1aa' }}>Carregando ordens de serviço...</td></tr>
            ) : filteredAndSortedOrders.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#a1a1aa' }}>Nenhuma Ordem de Serviço encontrada com os filtros selecionados.</td></tr>
            ) : (
              filteredAndSortedOrders.map((os) => {
                const hasTech = os.tecnico_responsavel && os.tecnico_responsavel !== 'Em aberto' && os.tecnico_responsavel.trim() !== '';
                return (
                  <tr key={os.id}>
                    <td style={{ fontWeight: '700', color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                      #{os.id}
                    </td>
                    <td>
                      <span className={`badge-status ${getStatusBadgeClass(os.situacao)}`}>
                        {os.situacao || '—'}
                      </span>
                    </td>
                    <td style={{ color: '#a1a1aa', fontSize: '0.8rem' }}>{os.data_entrada || '—'}</td>
                    <td style={{ fontWeight: '500' }}>
                      <span style={{ color: '#ffffff' }}>{os.cliente_nome || '—'}</span>
                      {os.cliente_cpf_cnpj && <div style={{ fontSize: '0.73rem', color: '#71717a', fontWeight: '400' }}>{os.cliente_cpf_cnpj}</div>}
                    </td>
                    <td>
                      <span style={{ color: '#f4f4f5' }}>{os.equipamento_modelo || '—'}</span>
                      {os.equipamento_codigo && <div style={{ fontSize: '0.73rem', color: '#71717a' }}>Série: {os.equipamento_codigo}</div>}
                    </td>
                    
                    {/* TÉCNICO DESTACADO */}
                    <td>
                      {hasTech ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          backgroundColor: 'rgba(59, 130, 246, 0.15)',
                          color: '#93c5fd',
                          border: '1px solid rgba(59, 130, 246, 0.35)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                        }}>
                          <UserCheck size={14} color="#60a5fa" />
                          {os.tecnico_responsavel}
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '0.74rem',
                          fontWeight: '500',
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.25)'
                        }}>
                          <Clock size={12} /> Em aberto
                        </span>
                      )}
                    </td>

                    {/* AÇÕES REFORÇADAS */}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          className="btn btn-amber"
                          style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => setLaudoOrder(os)}
                          title="Visualizar Laudo Técnico Completo"
                        >
                          <ClipboardList size={13} /> Laudo
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => setSelectedOrder(os)}
                          title="Ver Detalhes do Registro"
                        >
                          <Eye size={13} /> Detalhes
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
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
                  <p style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: '600' }}>Técnico: {selectedOrder.tecnico_responsavel || 'Em aberto'}</p>
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
                    <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.95rem' }}>
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
                  <div className="laudo-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Tipo de Serviço</label>
                    <span style={{ fontWeight: 600, color: '#e4e4e7' }}>{laudoOrder.servico_tipo || 'Calibração / Certificação'}</span>
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
