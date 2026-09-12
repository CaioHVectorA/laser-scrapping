import { describe, it, expect } from 'bun:test';
import { detectInstalledBrowsers, launchBrowserWithFallback } from '../src/browserLauncher.js';

describe('Detecção e Inicialização Inteligente de Navegadores (browserLauncher)', () => {
  it('detectInstalledBrowsers deve listar os navegadores esperados com status booleano', () => {
    const list = detectInstalledBrowsers();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(3);

    const ids = list.map(b => b.id);
    expect(ids).toContain('chromium');
    expect(ids).toContain('chrome');
    expect(ids).toContain('msedge');

    for (const b of list) {
      expect(typeof b.id).toBe('string');
      expect(typeof b.name).toBe('string');
      expect(typeof b.available).toBe('boolean');
    }
  });

  it('launchBrowserWithFallback deve iniciar com sucesso em modo auto no ambiente atual', async () => {
    const logs: string[] = [];
    const browser = await launchBrowserWithFallback({
      headless: true,
      channelPreference: 'auto',
      onLog: (msg) => logs.push(msg),
    });

    expect(browser).toBeDefined();
    expect(browser.isConnected()).toBe(true);
    expect(logs.some(l => l.includes('iniciado com sucesso'))).toBe(true);

    await browser.close();
  });

  it('launchBrowserWithFallback deve ignorar caminho customizado inexistente e realizar fallback', async () => {
    const logs: string[] = [];
    const browser = await launchBrowserWithFallback({
      headless: true,
      customExecutablePath: '/caminho/completamente/invalido/chrome.exe',
      channelPreference: 'auto',
      onLog: (msg) => logs.push(msg),
    });

    expect(browser).toBeDefined();
    expect(browser.isConnected()).toBe(true);

    await browser.close();
  });
});
