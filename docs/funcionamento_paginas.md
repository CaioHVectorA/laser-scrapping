# 📘 Documentação de Funcionamento das Páginas & Extração de Impressão (`page_id=402`)

Esta documentação descreve o mapeamento completo de páginas, fluxo de navegação, seletores da folha de impressão (`print=Y`), esquema do banco de dados **SQLite (`bun:sqlite`)** e formatos de exportação (CSV/Excel) do sistema MedLaser Brasil.

---

## 📌 1. Mapeamento de Páginas e `page_id`

No sistema MedLaser Brasil, o fluxo de consulta e impressão é estruturado em duas páginas principais:

1. **Central de Ordens de Serviço (Abas / Listagem)**: `https://medlaserbrasil.com.br/?page_id=343`
   - Onde ficam agrupadas as **6 abas / filtros de status** (*Aguardando Análise*, *Aguardando aprovação*, *Em execução*, *Finalizada*, *Entregue*, *Cancelada*).
   - Exibe a tabela simplificada `#tabela_edicao` com os IDs de cada OS.

2. **Folha de Impressão Padrão (Print View)**: `https://medlaserbrasil.com.br/?page_id=402&cod_registro=<OS_ID>&print=Y`
   - O modelo de visualização de impressão de **todas as abas** utiliza o **`page_id=402`**.
   - Ao passar o parâmetro `cod_registro=<OS_ID>` e `print=Y`, a página renderiza o documento impresso completo da Ordem de Serviço.

---

## 📄 2. Estrutura de Dados da Folha de Impressão (`page_id=402`)

A folha de impressão é dividida nas seguintes seções:

### 🏢 Dados do Cliente
- `clienteNome`: Nome / Razão Social do cliente
- `clienteCpfCnpj`: CPF ou CNPJ
- `clienteEndereco`: Logradouro completo, bairro, cidade, UF e CEP
- `clienteTelefones`: Telefones de contato
- `clienteEmail`: E-mail de contato do cliente

### 🔬 Dados do Equipamento
- `equipamentoModelo`: Modelo do aparelho (ex: Wolf Torre, Laser Dornier H15)
- `equipamentoCodigo`: Código / Número de série (ex: LHT04150222)
- `equipamentoLinhaUso`: Linha de utilização (ex: Laser, Estética)
- `equipamentoDimensoes`: Dimensões e peso do aparelho
- `equipamentoDescricao`: Descrição complementar
- `equipamentoAcessorios`: Acessórios acompanhantes (ex: Cabo de Força, Case, Chave, Pedal)

### 🛠️ Dados do Serviço & Orçamento
- `situacao`: Status atual no fluxo (ex: Aguardando Análise, Em execução, Finalizada)
- `dataEntrada`: Data e hora de recepção do equipamento (ex: `18/08/2026 13:35`)
- `servicoTipo`: Tipo de serviço (ex: Manutenção Geral, Certificação)
- `tecnicoResp`: Técnico responsável alocado
- `descricaoProblema`: Relato do defeito fornecido pelo cliente
- `valorOrcamento`: Valor do orçamento aprovado/estimado em R$
- `observacoes`: Observações técnicas e histórico
- `laudoTecnico`: Texto descritivo do laudo emitido pelo laboratório

---

## 🗄️ 3. Esquema do Banco de Dados SQLite (`bun:sqlite`)

Os dados raspados da folha de impressão são salvos de forma otimizada no arquivo SQLite `./output/ordens_servico.sqlite` com a seguinte estrutura de tabela:

```sql
CREATE TABLE IF NOT EXISTS ordens_servico (
  id TEXT PRIMARY KEY,
  situacao TEXT,
  data_entrada TEXT,
  cliente_nome TEXT,
  cliente_cpf_cnpj TEXT,
  cliente_endereco TEXT,
  cliente_telefones TEXT,
  cliente_email TEXT,
  equipamento_modelo TEXT,
  equipamento_codigo TEXT,
  equipamento_linha_uso TEXT,
  equipamento_dimensoes TEXT,
  equipamento_descricao TEXT,
  equipamento_acessorios TEXT,
  servico_tipo TEXT,
  tecnico_responsavel TEXT,
  descricao_problema TEXT,
  valor_orcamento REAL,
  observacoes TEXT,
  laudo_tecnico TEXT,
  scraped_at TEXT
);
```

### Operação de Gravação:
Utiliza a funcionalidade `UPSERT` (`ON CONFLICT(id) DO UPDATE`), garantindo que execuções sucessivas atualizem os registros existentes sem duplicar dados.

---

## 📄 4. Exportação CSV e Excel

Além do banco de dados SQLite, a automação exporta simultaneamente para:

- **`output/ordens_servico.csv`**: Arquivo CSV codificado em **UTF-8 BOM (`\uFEFF`)** com delimitador `;`, permitindo abertura imediata no Microsoft Excel e LibreOffice com formatação correta de caracteres acentuados.
- **`output/ordens_servico.xlsx`**: Planilha Excel com cabeçalhos estilizados em azul corporativo e ajuste automático de largura de colunas.

---

## 🚀 5. Como Executar com Bun

Para rodar o scraper utilizando a runtime **Bun** e o driver **`bun:sqlite`**:

```bash
# Executar a automação completa
bun run start

# Executar exibindo a janela do navegador (headed mode)
bun run start:bun:headed
```
