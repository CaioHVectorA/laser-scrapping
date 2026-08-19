# 📘 Documentação de Funcionamento das Páginas, Banco de Dados & Conversor de Laudos CSV

Esta documentação descreve o mapeamento completo de páginas, fluxo de navegação, seletores da folha de impressão, esquema do banco de dados **SQLite (`bun:sqlite`)**, exportação geral (CSV/Excel) e o **conversor desacoplado de laudos (`src/convert.ts`)**.

---

## 📌 1. Mapeamento de Páginas e `page_id`

No sistema MedLaser Brasil, o fluxo de consulta e impressão é estruturado em duas páginas principais:

1. **Central de Ordens de Serviço (Abas / Listagem)**: `https://medlaserbrasil.com.br/?page_id=343`
   - Onde ficam agrupadas as **6 abas / filtros de status** (*Aguardando Análise*, *Aguardando aprovação*, *Em execução*, *Finalizada*, *Entregue*, *Cancelada*).
   - Exibe os painéis com as listas de OSs no DOM.

2. **Páginas de Impressão por Aba (Print View)**:
   - **Aguardando Análise**: `page_id=402`
   - **Aguardando aprovação**: `page_id=425`
   - **Em execução**: `page_id=440`
   - **Finalizada**: `page_id=460`
   - **Entregue**: `page_id=465`

---

## 📄 2. Estrutura de Dados da Folha de Impressão

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

Os dados raspados das folhas de impressão são salvos de forma otimizada no arquivo SQLite `./output/ordens_servico.sqlite` com o seguinte esquema:

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

---

## 📑 4. Conversor Desacoplado de Laudo de Calibração (`src/convert.ts`)

O módulo `src/convert.ts` opera de forma totalmente independente do navegador (sem scraping). Ele consulta o banco SQLite local (`output/ordens_servico.sqlite`) pelo código da OS e gera o relatório no modelo oficial de 7 seções:

```bash
# Como executar para uma OS específica:
bun src/convert.ts 7596
```

### Estrutura do Laudo Gerado (`output/laudo_OS_<ID>.csv`):
1. **1 - CONTRATANTE**: Preenchido dinamicamente com dados da empresa cliente (`cliente_nome`, `cliente_cpf_cnpj`, `cliente_endereco`, `cliente_telefones`).
2. **2 - LABORATÓRIO E TÉCNICO**: Dados do Laboratório MedLaser e nome do responsável técnico (`tecnico_responsavel`).
3. **3 - EQUIPAMENTOS E PROCEDIMENTOS**: Normas EA-4/02, t-Student, especificações do medidor Coherent e tabela de medições.
4. **4 - CONDIÇÕES DO ENSAIO**: Temperatura (+25°C), Humidade (80%), Pressão, Voltagem e Frequência.
5. **5 - DETALHES DO EQUIPAMENTO**: Tipo, Modelo, Número de Série (`equipamento_codigo`) e Ordem de Serviço (`id`).
6. **6 - ENSAIO**: Medições individuais por frequência (3Hz, 5Hz, 8Hz, 10Hz, 12Hz).
7. **7 - CONSIDERAÇÕES FINAIS**: Declaração de aptidão, assinatura do técnico, data por extenso e checklist de verificação (Carcaça, Pedais, Painel, Cabo, Limpeza interna/externa).

---

## 🚀 5. Como Executar

### Scraping Completo (Popula o Banco SQLite, CSV e Excel):
```bash
# Modo padrão (Headless)
bun run start

# Modo visível (Headed)
bun run start:headed
```

### Gerar Laudo CSV Individual de uma OS (sem navegar):
```bash
bun src/convert.ts 7596
```
