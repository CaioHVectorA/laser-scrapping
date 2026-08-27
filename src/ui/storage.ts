export interface RecentItem {
  id: string;
  fileName: string;
  osId?: string;
  clienteNome?: string;
  dateUpdated: string;
  sheetsCount: number;
}

export interface TemplateItem {
  id: string;
  name: string;
  description: string;
  dateCreated: string;
  sheetNames: string[];
}

const RECENTS_KEY = 'laser_widget_recents_v1';
const TEMPLATES_KEY = 'laser_widget_templates_v1';

export function getRecentFiles(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Erro ao ler recentes:', e);
    return [];
  }
}

export function saveRecentFile(item: Omit<RecentItem, 'id' | 'dateUpdated'> & { id?: string }): RecentItem[] {
  try {
    const recents = getRecentFiles();
    const nowStr = new Date().toLocaleString('pt-BR');
    const existingIdx = recents.findIndex((r) => r.fileName === item.fileName);

    const newItem: RecentItem = {
      id: item.id || `rec_${Date.now()}`,
      fileName: item.fileName,
      osId: item.osId,
      clienteNome: item.clienteNome,
      dateUpdated: nowStr,
      sheetsCount: item.sheetsCount,
    };

    if (existingIdx >= 0) {
      recents[existingIdx] = newItem;
    } else {
      recents.unshift(newItem);
    }

    // Mantém no máximo 15 recentes
    const trimmed = recents.slice(0, 15);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch (e) {
    console.error('Erro ao salvar recente:', e);
    return getRecentFiles();
  }
}

export function removeRecentFile(id: string): RecentItem[] {
  try {
    const recents = getRecentFiles().filter((r) => r.id !== id);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
    return recents;
  } catch (e) {
    return getRecentFiles();
  }
}

export function getTemplates(): TemplateItem[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (raw) return JSON.parse(raw);

    // Modelos padrão iniciais se a lista estiver vazia
    const defaultTemplates: TemplateItem[] = [
      {
        id: 'tmpl_uropulse_std',
        name: 'Modelo UROPULSE Padrão (3-12 Hz)',
        description: 'Laudo de calibração padrão para laser UroPulse com abas 3Hz, 5Hz, 8Hz, 10Hz e 12Hz',
        dateCreated: new Date().toLocaleDateString('pt-BR'),
        sheetNames: ['Relatório', '3HZ', '5HZ', '8HZ', '10HZ', '12HZ', 'T_Student']
      },
      {
        id: 'tmpl_holmium_std',
        name: 'Modelo Holmium Laser Genérico',
        description: 'Laudo completo com medições de energia (0.4J a 2.0J) e fator k de confiança t-Student',
        dateCreated: new Date().toLocaleDateString('pt-BR'),
        sheetNames: ['Relatório', '5HZ', '10HZ', '15HZ', '20HZ']
      }
    ];
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(defaultTemplates));
    return defaultTemplates;
  } catch (e) {
    console.error('Erro ao ler modelos:', e);
    return [];
  }
}

export function saveTemplate(name: string, description: string, sheetNames: string[]): TemplateItem[] {
  try {
    const templates = getTemplates();
    const newTmpl: TemplateItem = {
      id: `tmpl_${Date.now()}`,
      name: name.trim() || 'Novo Modelo',
      description: description.trim() || 'Modelo salvo pelo usuário',
      dateCreated: new Date().toLocaleDateString('pt-BR'),
      sheetNames: sheetNames || []
    };
    templates.unshift(newTmpl);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    return templates;
  } catch (e) {
    console.error('Erro ao salvar modelo:', e);
    return getTemplates();
  }
}

export function removeTemplate(id: string): TemplateItem[] {
  try {
    const templates = getTemplates().filter((t) => t.id !== id);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    return templates;
  } catch (e) {
    return getTemplates();
  }
}
