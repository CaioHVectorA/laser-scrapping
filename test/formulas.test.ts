import { describe, it, expect } from 'bun:test';
import {
  calculateRowFormulas,
  detectRowColumnMap,
  generateValidRowMeasurements,
  VariationMode
} from '../src/ui/formulas.js';

describe('Cálculos Estatísticos e Fórmulas de Calibração (Metrologia)', () => {
  it('calcula corretamente as fórmulas com 5 medições idênticas à base', () => {
    const base = 20;
    const meds = [20, 20, 20, 20, 20];
    const calc = calculateRowFormulas(base, meds);

    expect(calc.media).toBe(20);
    expect(calc.erro).toBe(0);
    expect(calc.desvPadrao).toBe(0);
    expect(calc.incertezaA).toBe(0);
    expect(calc.incertezaComb).toBe(0.1);
    expect(calc.k).toBe(2);
    expect(calc.confianca).toBe(0.2);
    expect(calc.erroTotal).toBe(0.2); // erro + confianca = 0 + 0.2
    expect(calc.tendencia).toBe(0);
  });

  it('calcula corretamente com dispersão realista e fator Student-t', () => {
    const base = 100;
    const meds = [98, 99, 100, 101, 102];
    const calc = calculateRowFormulas(base, meds);

    expect(calc.media).toBe(100);
    expect(calc.erro).toBe(0);
    expect(calc.desvPadrao).toBeCloseTo(1.5811, 3);
    expect(calc.incertezaA).toBeCloseTo(0.7071, 3);
    expect(calc.incertezaComb).toBeGreaterThan(0.7);
    expect(calc.k).toBeCloseTo(2.7764, 3);
    expect(calc.confianca).toBeGreaterThan(1.9);
    expect(calc.erroTotal).toBeCloseTo(calc.erro + calc.confianca, 4);
  });

  it('preserva a média original da planilha (sheetMedia) se informada', () => {
    const base = 50;
    const meds = [48, 49, 50, 51, 52];
    const sheetMedia = 49.5;
    const calc = calculateRowFormulas(base, meds, sheetMedia);

    expect(calc.media).toBe(49.5);
    expect(calc.erro).toBe(50 - 49.5); // 0.5
    expect(calc.tendencia).toBe(49.5 - 50); // -0.5
  });
});

describe('Detecção de Colunas da Planilha (detectRowColumnMap)', () => {
  it('detecta corretamente layout padrão MedLaser', () => {
    const matrix = [
      [
        { value: 'base', displayValue: 'base' },
        { value: 'tol Max', displayValue: 'tol Max' },
        { value: 'Tol. Min', displayValue: 'Tol. Min' },
        { value: 'ERRO TOTAL', displayValue: 'ERRO TOTAL' },
        { value: 'media', displayValue: 'media' },
        { value: 'med1', displayValue: 'med1' },
        { value: 'med2', displayValue: 'med2' },
        { value: 'med3', displayValue: 'med3' },
        { value: 'med4', displayValue: 'med4' },
        { value: 'med5', displayValue: 'med5' },
        { value: 'ERRO', displayValue: 'ERRO' },
        { value: 'ERRO TOTAL', displayValue: 'ERRO TOTAL' },
        { value: 'desvPadrao', displayValue: 'desvPadrao' }
      ],
      [
        { value: 20, displayValue: '20' },
        { value: 4, displayValue: '4' },
        { value: -4, displayValue: '-4' },
        { value: 0.5, displayValue: '0.5' },
        { value: 20, displayValue: '20' },
        { value: 19.8, displayValue: '19.8' },
        { value: 19.9, displayValue: '19.9' },
        { value: 20.1, displayValue: '20.1' },
        { value: 20.0, displayValue: '20.0' },
        { value: 20.2, displayValue: '20.2' },
        { value: 0, displayValue: '0' },
        { value: 0.5, displayValue: '0.5' },
        { value: 0.15, displayValue: '0.15' }
      ]
    ];

    const map = detectRowColumnMap(matrix);
    expect(map).not.toBeNull();
    expect(map?.colBase).toBe(1);
    expect(map?.colTolMax).toBe(2);
    expect(map?.colTolMin).toBe(3);
    expect(map?.colErroTotal1).toBe(4);
    expect(map?.colMedia).toBe(5);
    expect(map?.colMeds).toEqual([6, 7, 8, 9, 10]);
  });
});

describe('Garantia Estrita de Limites de Erro (Strict Boundary Clamping)', () => {
  const modes: VariationMode[] = ['wobble', 'gaussian', 'trend', 'uniform'];
  const testCases = [
    { base: 2, tolMax: 0.2, tolMin: -0.2, meds: [2.02, 2.2, 2.2, 2.2, 2.2], sheetMedia: 2.2 },
    { base: 20, tolMax: 2.0, tolMin: -2.0, meds: [19.93, 19.93, 19.9, 20.0, 20.1], sheetMedia: 19.93 },
    { base: 50, tolMax: 10, tolMin: -10, meds: [47, 47, 47, 46, 46], sheetMedia: 47 },
    { base: 100, tolMax: 20, tolMin: -20, meds: [98, 99, 100, 101, 100], sheetMedia: 100 },
    { base: 300, tolMax: 24, tolMin: -60, meds: [290, 290, 290, 290, 289], sheetMedia: 320 },
    { base: 350, tolMax: 28, tolMin: -70, meds: [346, 346, 347, 347, 343], sheetMedia: 350 }
  ];

  it('NUNCA ultrapassa Tol. Max nem Tol. Min em milhares de iterações em todos os modos', () => {
    let violations = 0;
    let totalTrials = 0;

    for (const tc of testCases) {
      for (const mode of modes) {
        for (const maxPercent of [5, 10, 15, 20, 25]) {
          for (let i = 0; i < 50; i++) {
            totalTrials++;
            const varied = generateValidRowMeasurements(
              tc.base,
              tc.meds,
              maxPercent,
              undefined,
              tc.sheetMedia,
              mode,
              i,
              tc.tolMax,
              tc.tolMin
            );

            expect(varied).toHaveLength(tc.meds.length);

            const calc = calculateRowFormulas(tc.base, varied, tc.sheetMedia);

            // Verificação rigorosa
            if (calc.erroTotal > tc.tolMax || calc.erroTotal < tc.tolMin) {
              violations++;
              console.error(`Falha: Base=${tc.base}, TolMax=${tc.tolMax}, TolMin=${tc.tolMin}, ErroTotal=${calc.erroTotal}`);
            }

            expect(calc.erroTotal).toBeLessThanOrEqual(tc.tolMax + 1e-9);
            expect(calc.erroTotal).toBeGreaterThanOrEqual(tc.tolMin - 1e-9);
          }
        }
      }
    }

    expect(violations).toBe(0);
    expect(totalTrials).toBeGreaterThanOrEqual(6000);
  });

  it('respeita a seleção parcial de colunas (altera somente as colunas selecionadas)', () => {
    const base = 50;
    const initialMeds = [50, 50, 50, 50, 50];
    const selectedIndices = new Set<number>([1, 3]); // apenas med2 e med4

    const varied = generateValidRowMeasurements(
      base,
      initialMeds,
      15,
      selectedIndices,
      50,
      'wobble',
      0,
      10,
      -10
    );

    // Índices não selecionados (0, 2, 4) devem permanecer exatamente iguais
    expect(varied[0]).toBe(50);
    expect(varied[2]).toBe(50);
    expect(varied[4]).toBe(50);

    const calc = calculateRowFormulas(base, varied, 50);
    expect(calc.erroTotal).toBeLessThanOrEqual(10);
    expect(calc.erroTotal).toBeGreaterThanOrEqual(-10);
  });
});
