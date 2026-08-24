import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Activity } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MeasurementChartProps {
  sheetData: any;
}

export const MeasurementChart: React.FC<MeasurementChartProps> = ({ sheetData }) => {
  if (!sheetData || !sheetData.matrix) return null;

  // Extrai valores numéricos candidatos de medição para plotar no gráfico
  const candidateValues: number[] = [];
  sheetData.matrix.forEach((row: any[]) => {
    row.forEach((cell: any) => {
      if (cell && cell.isMeasurementCandidate && typeof cell.value === 'number') {
        candidateValues.push(cell.value);
      }
    });
  });

  if (candidateValues.length === 0) return null;

  // Agrupa os pontos em curvas por frequência ou fatias de medições (ex: 5 pontos por ensaio)
  const labels = Array.from({ length: Math.min(candidateValues.length, 10) }).map((_, i) => `Ensaio ${i + 1}`);
  const dataPoints = candidateValues.slice(0, 10);

  // Calcula limites superior e inferior (±20% de tolerância do fabricante)
  const upperLimit = dataPoints.map(v => Number((v * 1.2).toFixed(2)));
  const lowerLimit = dataPoints.map(v => Number((v * 0.8).toFixed(2)));

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Limite Superior (+20%)',
        data: upperLimit,
        borderColor: 'rgba(244, 63, 94, 0.6)',
        borderDash: [5, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
      {
        label: 'Potência / Energia Medida (W/J)',
        data: dataPoints,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#ffffff',
        tension: 0.3,
        fill: true,
      },
      {
        label: 'Limite Inferior (-20%)',
        data: lowerLimit,
        borderColor: 'rgba(244, 63, 94, 0.6)',
        borderDash: [5, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#a1a1aa',
          font: { family: 'Inter', size: 12 },
          usePointStyle: true,
        }
      },
      tooltip: {
        backgroundColor: '#18181b',
        titleColor: '#ffffff',
        bodyColor: '#10b981',
        borderColor: '#27272a',
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        grid: { color: '#27272a' },
        ticks: { color: '#a1a1aa', font: { family: 'Inter', size: 11 } }
      },
      y: {
        grid: { color: '#27272a' },
        ticks: { color: '#a1a1aa', font: { family: 'Inter', size: 11 } }
      }
    }
  };

  return (
    <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="#10b981" />
          Gráfico Interativo de Desempenho e Limites de Tolerância (±20%)
        </h4>
        <span style={{ fontSize: '0.75rem', color: '#a1a1aa', backgroundColor: '#09090b', padding: '2px 8px', borderRadius: '4px', border: '1px solid #27272a' }}>
          {candidateValues.length} Pontos de Medição
        </span>
      </div>

      <div style={{ height: '220px', width: '100%' }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};
