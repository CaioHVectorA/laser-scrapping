# 🤖 Automação de Web Scraping + Excel em TypeScript

Base de projeto desenvolvida em **TypeScript** utilizando **Playwright** para raspagem de dados web e **ExcelJS** para geração automatizada de planilhas Excel (`.xlsx`).

---

## 📁 Estrutura do Projeto

```text
.
├── src/
│   ├── index.ts          # Ponto de entrada (orquestra o scraper e a geração do Excel)
│   ├── scraper.ts        # Lógica de raspagem e automação de navegador (Playwright)
│   ├── excel.ts          # Gerador e formatador de planilhas (.xlsx)
│   ├── config.ts         # Leitura de variáveis de ambiente (.env)
│   └── types/
│       └── index.ts      # Definição dos tipos dos dados raspados (ScrapedItem)
├── output/               # Pasta onde as planilhas geradas serão salvas
├── .env                  # Arquivo de configuração de ambiente local
├── .env.example          # Modelo de configuração de ambiente
├── package.json          # Dependências e scripts npm
├── tsconfig.json         # Configurações do compilador TypeScript
└── README.md             # Documentação do projeto
```

---

## 🚀 Como Executar

### 1. Instalar as dependências

```bash
npm install
```

### 2. Instalar o navegador Chromium do Playwright

```bash
npx playwright install chromium
```

### 3. Configurar as variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e ajuste os parâmetros conforme necessário:

```bash
cp .env.example .env
```

Conteúdo do `.env`:

```env
TARGET_URL=https://quotes.toscrape.com
HEADLESS=true
OUTPUT_FILE_PATH=./output/dados_raspados.xlsx
SYSTEM_USER=seu_usuario
SYSTEM_PASSWORD=sua_senha
```

- `HEADLESS=false`: Exibe a janela do navegador em tempo real (útil para desenvolvimento e depuração).
- `HEADLESS=true`: Executa em segundo plano sem janela visível (recomendado para produção).

---

## 📜 Scripts Disponíveis

- **`npm start`**: Executa a automação usando `tsx` (sem necessidade de compilar manualmente).
- **`npm run dev`**: Executa a automação no modo de observação (*watch mode*), reagindo a alterações nos arquivos.
- **`npm run check`**: Checa os tipos em TypeScript (`tsc --noEmit`) para garantir que não há erros de tipagem.
- **`npm run build`**: Compila o código fonte de `src/` para Javascript na pasta `dist/`.

---

## 🛠️ Como Personalizar para o Use Case Específico

1. **Definir o Formato dos Dados** (`src/types/index.ts`):
   - Altere a interface `ScrapedItem` para incluir as colunas/campos específicos que seu amigo precisa extrair.

2. **Personalizar a Lógica de Scraping** (`src/scraper.ts`):
   - Ajuste a navegação, seletores CSS/XPath ou requisições no arquivo `src/scraper.ts`.
   - Se o sistema exigir login, descomente/ajuste a função `loginToSystem`.

3. **Personalizar as Colunas do Excel** (`src/excel.ts`):
   - Atualize a propriedade `worksheet.columns` no arquivo `src/excel.ts` para bater exatamente com as chaves definidas em `ScrapedItem`.

---

## 🛡️ Licença

Este projeto é um template livre para automações.
# laser-scrapping
