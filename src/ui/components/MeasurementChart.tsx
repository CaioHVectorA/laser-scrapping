import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Activity } from 'lucide-react';
import { calculateRowFormulas, detectRowColumnMap } from '../formulas.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface MeasurementChartProps {
  sheetData: any;
  frequencyLabel?: string;
}

interface ChartExtractedData {
  labels: string[];
  limiteErroSuperior: number[];
  limiteErroInferior: number[];
  ensaioErro: number[];
  baseValues: number[];
  totalPoints: number;
}

/**
 * Extrai os dados do gráfico "Limite de Erro" com cálculo dinâmico e exato de acordo com as fórmulas:
 *  - Eixo X: Intervalo A9:A13 (Coluna 'base' -> 0,9; 1,8; 3; 4,5; 6)
 *  - Série 1: Intervalo B9:B13 (Coluna 'tol Max' -> Limite Erro Superior: 0,18; 0,36; 0,6; 0,9; 1,2)
 *  - Série 2: Intervalo C9:C13 (Coluna 'Tol. Min' -> Limite de Erro Inferior: -0,18; -0,36; -0,6; -0,9; -1,2)
 *  - Série 3: Intervalo D9:D13 (Coluna 'ERRO TOTAL' -> Ensaio Realizado: -0,1; 0,1059; 0,3039; -0,2755; 0,3867...)
 *    Recalculado dinamicamente com a fórmula exata: D = (base - media) + (k * IncertezaCombinada)
 */
function extractChartData(sheetData: any): ChartExtractedData | null {
  if (!sheetData || !sheetData.matrix || sheetData.matrix.length === 0) return null;

  const matrix = sheetData.matrix;
  const colMap = detectRowColumnMap(matrix);

  const headerRowIdx = colMap ? colMap.headerRow - 1 : 7;
  const colBaseIdx = colMap ? colMap.colBase - 1 : 0;
  const colTolMaxIdx = colMap ? colMap.colTolMax - 1 : 1;
  const colTolMinIdx = colMap ? colMap.colTolMin - 1 : 2;
  const colMeds = colMap ? colMap.colMeds : [6, 7, 8, 9, 10];

  const labels: string[] = [];
  const limiteErroSuperior: number[] = [];
  const limiteErroInferior: number[] = [];
  const ensaioErro: number[] = [];
  const baseValues: number[] = [];
  let totalPointsCount = 0;

  // Itera sobre as linhas de dados (normalmente linhas 9 a 13)
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    const baseCell = row[colBaseIdx];
    if (!baseCell) continue;

    const baseNum = typeof baseCell.value === 'number'
      ? baseCell.value
      : parseFloat(String(baseCell.displayValue || baseCell.value || '').replace(',', '.'));

    if (isNaN(baseNum) || baseNum <= 0 || !isFinite(baseNum)) {
      if (labels.length > 0) break;
      continue;
    }

    baseValues.push(baseNum);

    // Formata o label do eixo X (ex: '0,9', '1,8', '3', '4,5', '6')
    const labelStr = Number.isInteger(baseNum)
      ? String(baseNum)
      : baseNum.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    labels.push(labelStr);

    // Tol Max (Série 1: Limite Erro Superior)
    let tolMax = baseNum * 0.20;
    if (colTolMaxIdx >= 0 && row[colTolMaxIdx]) {
      const v = typeof row[colTolMaxIdx].value === 'number'
        ? row[colTolMaxIdx].value
        : parseFloat(String(row[colTolMaxIdx].displayValue || '').replace(',', '.'));
      if (!isNaN(v) && isFinite(v)) tolMax = v;
    }
    limiteErroSuperior.push(Number(tolMax.toFixed(4)));

    // Tol Min (Série 2: Limite de Erro Inferior)
    let tolMin = baseNum * -0.20;
    if (colTolMinIdx >= 0 && row[colTolMinIdx]) {
      const v = typeof row[colTolMinIdx].value === 'number'
        ? row[colTolMinIdx].value
        : parseFloat(String(row[colTolMinIdx].displayValue || '').replace(',', '.'));
      if (!isNaN(v) && isFinite(v)) tolMin = v;
    }
    limiteErroInferior.push(Number(tolMin.toFixed(4)));

    // Série 3: Ensaio Realizado (ERRO TOTAL recalculado com precisão analítica)
    const medVals: number[] = [];
    for (const c1Based of colMeds) {
      const mCell = row[c1Based - 1];
      if (mCell) {
        const v = typeof mCell.value === 'number'
          ? mCell.value
          : parseFloat(String(mCell.displayValue || mCell.value || '').replace(',', '.'));
        if (!isNaN(v) && isFinite(v)) {
          medVals.push(v);
          totalPointsCount++;
        }
      }
    }

    // Obtém o valor original de média da planilha
    let sheetMedia: number | undefined = undefined;
    if (colMap && colMap.colMedia > 0 && row[colMap.colMedia - 1]) {
      const mCell = row[colMap.colMedia - 1];
      const v = typeof mCell?.value === 'number'
        ? mCell.value
        : parseFloat(String(mCell?.displayValue || '').replace(',', '.'));
      if (!isNaN(v) && v > 0) sheetMedia = v;
    }

    let erroTotalVal = 0;
    if (medVals.length > 0) {
      const calc = calculateRowFormulas(baseNum, medVals, sheetMedia);
      erroTotalVal = calc.erroTotal;
    } else if (colMap && row[colMap.colErroTotal1 - 1]) {
      const dCell = row[colMap.colErroTotal1 - 1];
      const v = typeof dCell.value === 'number' ? dCell.value : parseFloat(String(dCell.displayValue || '').replace(',', '.'));
      if (!isNaN(v)) erroTotalVal = v;
    }

    ensaioErro.push(Number(erroTotalVal.toFixed(4)));

    if (labels.length >= 8) break; // Máximo de ensaios por frequência
  }

  if (labels.length === 0) return null;

  return {
    labels,
    limiteErroSuperior,
    limiteErroInferior,
    ensaioErro,
    baseValues,
    totalPoints: totalPointsCount > 0 ? totalPointsCount : labels.length,
  };
}

export const MeasurementChart: React.FC<MeasurementChartProps> = ({ sheetData, frequencyLabel }) => {
  const chartInfo = useMemo(() => extractChartData(sheetData), [sheetData]);

  if (!chartInfo) return null;

  const { labels, limiteErroSuperior, limiteErroInferior, ensaioErro } = chartInfo;

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Limite Erro Superior',
        data: limiteErroSuperior,
        borderColor: '#E8850C',
        backgroundColor: '#E8850C',
        borderWidth: 2,
        pointRadius: 6,
        pointStyle: 'rect' as const,
        pointBackgroundColor: '#E8850C',
        pointBorderColor: '#E8850C',
        tension: 0.1,
        fill: false,
      },
      {
        label: 'Limite de Erro Inferior',
        data: limiteErroInferior,
        borderColor: '#9E9E9E',
        backgroundColor: '#9E9E9E',
        borderWidth: 2,
        pointRadius: 6,
        pointStyle: 'triangle' as const,
        pointBackgroundColor: '#9E9E9E',
        pointBorderColor: '#9E9E9E',
        tension: 0.1,
        fill: false,
      },
      {
        label: 'Ensaio Realizado',
        data: ensaioErro,
        borderColor: '#EAB308',
        backgroundColor: '#EAB308',
        borderWidth: 2,
        pointRadius: 7,
        pointStyle: 'crossRot' as const,
        pointBackgroundColor: '#EAB308',
        pointBorderColor: '#EAB308',
        pointBorderWidth: 2.5,
        tension: 0.1,
        fill: false,
      }
    ]
  };

  // Determina o range do eixo Y (padrão -1.5 a +1.5 com step de 0.5)
  const allY = [...limiteErroSuperior, ...limiteErroInferior, ...ensaioErro];
  const maxAbsY = Math.max(...allY.map(Math.abs), 1.2);
  const yLimit = Math.ceil(maxAbsY * 2) / 2; // Múltiplos de 0.5 (ex: 1.5, 2.0, etc.)
  const finalYLimit = Math.max(yLimit, 1.5);

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 10,
        right: 20,
        bottom: 10,
        left: 10,
      }
    },
    plugins: {
      title: {
        display: true,
        text: 'Limite de erro',
        color: '#4B5563',
        font: { family: 'Arial, sans-serif', size: 16, weight: 'bold' as const },
        padding: { top: 6, bottom: 16 },
      },
      legend: {
        position: 'right' as const,
        align: 'start' as const,
        labels: {
          color: '#374151',
          font: { family: 'Arial, sans-serif', size: 11 },
          usePointStyle: true,
          pointStyleWidth: 14,
          padding: 16,
          boxWidth: 10,
          boxHeight: 10,
        }
      },
      tooltip: {
        backgroundColor: '#1F2937',
        titleColor: '#F9FAFB',
        bodyColor: '#F3F4F6',
        borderColor: '#374151',
        borderWidth: 1,
        padding: 10,
        titleFont: { family: 'Arial, sans-serif', weight: 'bold' as const },
        bodyFont: { family: 'Arial, sans-serif' },
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(4).replace('.', ',')}`,
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: '#E5E7EB',
          lineWidth: 1,
        },
        ticks: {
          color: '#1E40AF',
          font: { family: 'Arial, sans-serif', size: 11, weight: 'bold' as const },
          padding: 6,
        },
        border: {
          color: '#9CA3AF',
          width: 1,
        },
      },
      y: {
        min: -finalYLimit,
        max: finalYLimit,
        ticks: {
          stepSize: 0.5,
          color: '#4B5563',
          font: { family: 'Arial, sans-serif', size: 11 },
          padding: 8,
          callback: (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(value) ? 0 : 1 }),
        },
        grid: {
          color: (context: any) => (context.tick && context.tick.value === 0 ? '#111827' : '#E5E7EB'),
          lineWidth: (context: any) => (context.tick && context.tick.value === 0 ? 1.5 : 1),
        },
        border: {
          color: '#9CA3AF',
          width: 1,
        },
      }
    }
  };

  return (
    <div className="chart-container-gsheets">
      <div className="chart-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="#E8850C" />
          <span className="chart-label">
            Gráfico — {frequencyLabel || 'Limite de erro'} (Intervalo A9:A13, B9:B13, C9:C13, D9:D13)
          </span>
        </div>
        <span className="chart-points-badge">
          {chartInfo.labels.length} Pontos de Ensaio ({chartInfo.totalPoints} Medições)
        </span>
      </div>

      <div className="chart-canvas-wrapper" style={{ height: '320px', padding: '12px 20px' }}>
        <Line data={chartData} options={options} />
      </div>

      <div className="chart-footer-note">
        ✨ <strong>Eixo X:</strong> [ {labels.join(' | ')} ] &nbsp;•&nbsp; <strong>Série 1 (+20%):</strong> [ {limiteErroSuperior.join(', ')} ] &nbsp;•&nbsp; <strong>Série 2 (-20%):</strong> [ {limiteErroInferior.join(', ')} ] &nbsp;•&nbsp; <strong>Série 3 (Ensaio Realizado):</strong> [ {ensaioErro.join(', ')} ]
      </div>
    </div>
  );
};
