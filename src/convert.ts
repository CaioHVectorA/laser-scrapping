import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

declare const Bun: any;

interface DbRecord {
  id: string;
  situacao: string;
  data_entrada: string;
  cliente_nome: string;
  cliente_cpf_cnpj: string;
  cliente_endereco: string;
  cliente_telefones: string;
  cliente_email: string;
  equipamento_modelo: string;
  equipamento_codigo: string;
  equipamento_linha_uso: string;
  equipamento_dimensoes: string;
  equipamento_descricao: string;
  equipamento_acessorios: string;
  servico_tipo: string;
  tecnico_responsavel: string;
  descricao_problema: string;
  valor_orcamento: number;
  observacoes: string;
  laudo_tecnico: string;
  scraped_at: string;
}

/**
 * Limpa textos que possam conter quebras de linha ou tabulações brutas vindas da folha de print.
 */
function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .split('\t')[0]
    .split('\n')[0]
    .replace(/^Nome:\s*/i, '')
    .replace(/^Modelo:\s*/i, '')
    .trim();
}

/**
 * Extrai o CNPJ ou CPF limpo.
 */
function cleanCpfCnpj(rawCpfCnpj: string | null | undefined, rawClienteNome: string | null | undefined): string {
  const combined = `${rawCpfCnpj || ''} ${rawClienteNome || ''}`;
  const match = combined.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/);
  return match ? match[0] : (cleanText(rawCpfCnpj) || '');
}

/**
 * Extrai endereço limpo.
 */
function cleanEndereco(rawEndereco: string | null | undefined, rawClienteNome: string | null | undefined): string {
  if (rawEndereco && !rawEndereco.includes('\n')) return rawEndereco.trim();
  const combined = `${rawEndereco || ''}\n${rawClienteNome || ''}`;
  const match = combined.match(/Endereço:\s*([^\n]+)/i);
  return match ? match[1].trim() : cleanText(rawEndereco);
}

/**
 * Extrai telefones limpos.
 */
function cleanTelefones(rawTelefones: string | null | undefined, rawClienteNome: string | null | undefined): string {
  if (rawTelefones && !rawTelefones.includes('\n')) return rawTelefones.trim();
  const combined = `${rawTelefones || ''}\n${rawClienteNome || ''}`;
  const match = combined.match(/Telefones?:\s*([^\n\t]+)/i);
  return match ? match[1].trim() : cleanText(rawTelefones);
}

/**
 * Converte a data da entrada/ensaio para extenso no padrão do laudo.
 * Ex: "18 DE AGOSTO DE 2026"
 */
function formatDateExtenso(dateStr: string): string {
  if (!dateStr) {
    const now = new Date();
    const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    return `${now.getDate()} DE ${meses[now.getMonth()]} DE ${now.getFullYear()}`;
  }

  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthIdx = parseInt(match[2], 10) - 1;
    const year = match[3];
    const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    if (meses[monthIdx]) {
      return `${day} DE ${meses[monthIdx]} DE ${year}`;
    }
  }

  return dateStr.toUpperCase();
}

/**
 * Gera o conteúdo do CSV no formato exato do modelo de 7 seções.
 */
function generateLaudoCsv(record: DbRecord): string {
  const osId = record.id || '';

  const clienteNome = cleanText(record.cliente_nome) || 'Cliente Não Informado';
  const clienteCpfCnpj = cleanCpfCnpj(record.cliente_cpf_cnpj, record.cliente_nome);
  const clienteEndereco = cleanEndereco(record.cliente_endereco, record.cliente_nome);
  const clienteTelefone = cleanTelefones(record.cliente_telefones, record.cliente_nome);

  const tecnicoNome = (record.tecnico_responsavel && record.tecnico_responsavel !== 'Em aberto')
    ? record.tecnico_responsavel.trim()
    : 'Roberto Aldilei Favoreto';
  const tecnicoUpper = tecnicoNome.toUpperCase();

  const equipamentoLinha = cleanText(record.equipamento_linha_uso) || 'Laser';
  const equipamentoModelo = cleanText(record.equipamento_modelo) || 'UroPulse';
  const equipamentoSerie = cleanText(record.equipamento_codigo) || '';
  const dataExtenso = formatDateExtenso(record.data_entrada || record.scraped_at);

  const lines: string[] = [
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '1 - CONTRATANTE,,,,,,,,,,,',
    ',,,,,,,,,,,',
    `,${clienteNome} ${clienteCpfCnpj ? 'CNPJ: ' + clienteCpfCnpj : ''}`.trim() + ',,,,,,,,,,',
    `,${clienteEndereco}`.trim() + ',,,,,,,,,,',
    `,Município: Belo horizonte MG Telefone:  ${clienteTelefone}`.trim() + ',,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '2 - LABORATÓRIO E TÉCNICO RESPONSÁVEL,,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',MEDLASER MANUTENÇÃO DE EQUIPAMENTOS MÉDICOS E HOSPITALARES LTDA CNPJ: 30.619.169/0001-95 ,,,,,,,,,,',
    ',"Rua São Francisco Xavier 989, Loj R Loj H - São Francisco Xavier - CEP: 20550-017",,,,,,,,,,',
    ',Município: Rio de Janeiro - RJ Telefone (21) 2146-7627,,,,,,,,,,',
    ',,,,,,,,,,,',
    `,Resposável Ténico: ${tecnicoNome} ,,,,,,,,,,`,
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '3 - EQUIPAMENTOS E PROCEDIMENTOS UTILIZADOS,,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',Equipamento de Medição: ,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',Laser Power and Energy Meter Coherent LABMAX Número do Certificado: C33801\\25,,,,,,,,,,',
    ',ISO 17025 Accreditation,,,,,,,NS: 099E11R//3532 ,,,',
    '"Acurácia: ±1,0%",,,,Precisão: 3 dígitos significativos  ,,,,,,Temperatura de Operação: 5°C to 40°C',
    ',Potência Máxima Mensurável: 150W ,,,,,,,Faixa de Onda: 190 nm to 12 µm,,,',
    ',Frequência Máxima Mensurável: 10 KHz,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',Procedimento:,,,,,,,,,,',
    ',,,,,,,,,,,',
    '"De acordo com a publicação EA-4/02 (1999), para melhorarmos a qualidade de nossa",,,,,,,,,,',
    '"calibração, utilizaremos um fator K para aumentar a confiança da nossa medição. ",,,,,,,,,,',
    ',          Dado que o número de ensaios não é suficientemente grande para nos conferir um grau de ,,,,,,,,,,',
    '"confiança de pelo menos 95%, vamos utilizar o fator K = 2 quando a incerteza associada for menor que a  ",,,,,,,,,,',
    '"metade da incerteza combinada. Na outra hipótese, devemos utilizar a distribuição t-Student. ",,,,,,,,,,',
    '"Utilizaremos a t-Student com 5 graus de liberdade, uma vez que para cada valor a ser verificado, ",,,,,,,,,,',
    ',serão executados 5 ensaios.,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',Recomendações do Fabricante,,,,,,,,,,',
    '"          De acordo com o manual de serviço do fabricante, considera-se que o aparelho ",,,,,,,,,,',
    ', encontra-se calibrado desde que não apresente uma divergência maior que 20% pra mais ou menos  ,,,,,,,,,,',
    ',em relação ao valor que deveria apresentar dentro de determinada faixa de energia e frequência. ,,,,,,,,,,',
    '"Utilizaremos este patamar para cada faixa de ensaio, de modo a verificar se o aparelho está apto pra uso.",,,,,,,,,,',
    ',,,,,,,,,,,',
    ',Condições para o Ensaio,,,,,,,,,,',
    ',,,,,,,,,,,',
    `,Equipamento,,,,,,Laser ${equipamentoModelo},,,,`,
    ',Temperatura do Ambiente,,,,,,+15°C a +30°C,,,,',
    ',Humidade Relativa,,,,,,30% a 85%,,,,',
    ',Pressão Atmosférica,,,,,,700hPA a 1065 hPa,,,,',
    ',Voltagem da Rede,,,,,,115V a 230V,,,,',
    ',Frequência da Rede,,,,,,60Hz,,,,',
    ',,,,,,,,,,,',
    ',          A escolha das faixas de teste será baseada no manual de serviço do fabricante e também por,,,,,,,,,,',
    '"nossa experiência no uso do equipamento. Por tratar-se de um conjunto muito grande de valores, seria ",,,,,,,,,,',
    '"inviável testar todas as combinações de energia  e frequência. Sendo assim, para este aparelho, ",,,,,,,,,,',
    ',utilizaremos o seguinte conjunto de configurações a ser validado:,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,Freq. \\ Ene.,,"0,4J","0,6J",1J,"1,5J",2J,,,',
    ',,3 Hz,,x,x,x,x,x,,,',
    ',,5 Hz,,x,x,x,x,,,,',
    ',,8 Hz,,x,x,x,,,,,',
    ',,10 Hz,,,,,x,x,,,',
    ',,12 Hz,,x,x,,,,,,',
    ',,,,,,,,,,,',
    ',          Para cada faixa de frequência será gerada um gráfico onde verificaremos se a variação de potência,,,,,,,,,,',
    '"apresentada pelo equipamento, encontra-se dentro das faixas de limite do erro. Caso a mesma ",,,,,,,,,,',
    '"fique dentro deste intervalo, o equipamento estará apto a operar dentro da faixa ensaiada.",,,,,,,,,,',
    ', Segue abaixo um exemplo de gráfico com avaliação APROVADA:,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '4 - VERIFICADO AS CONDIÇÕES PARA O ENSAIO,,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',Condições verificadas válidas antes do ensaio,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',Temperatura do Ambiente,,,,,,+25°C,,,,',
    ',Humidade Relativa,,,,,,80%,,,,',
    ',Pressão Atmosférica,,,,,,900hPA,,,,',
    ',Voltagem da Rede,,,,,,216V,,,,',
    ',Frequência da Rede,,,,,,60Hz,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '5 - DETALHES DO EQUIPAMENTO ENSAIADO,,,,,,,,,,,',
    ',,,,,,,,,,,',
    `,Equipamento,,,,${equipamentoLinha},,,,,,`,
    `,Modelo,,,,${equipamentoModelo},,,,,,`,
    ',Fabricante,,,,Dornier,,,,,,',
    `,Número de Série,,,,${equipamentoSerie},,,,,,`,
    `,Ordem de Serviço,,,,${osId},,,,,,`,
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '6 -ENSAIO,,,,,,,,,,,',
    ',,,,,,,,,,,',
    '6.1 - FREQUÊNCIA 3HZ,,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '6.2 - FREQUÊNCIA 5HZ,,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '6 -ENSAIO,,,,,,,,,,,',
    ',,,,,,,,,,,',
    '6.3 - FREQUÊNCIA 8HZ,,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '6.4 - FREQUÊNCIA 10HZ,,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '6 -ENSAIO,,,,,,,,,,,',
    ',,,,,,,,,,,',
    '6.5 - FREQUÊNCIA 12HZ,,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    '7 -CONSIDERAÇÕES FINAIS,,,,,,,,,,,',
    ',,,,,,,,,,,',
    `, ENSAIO  REALIZADO NO DIA ${dataExtenso},,,,,,,,,,`,
    ',,,,,,,,,,,',
    `,       EU ${tecnicoUpper} DECLARO QUE O EQUIPAMENTE EM QUESTÃO ENCONTRA-SE APTO ,,,,,,,,,,`,
    '"PARA USO DENTRO DAS FAIXAS DE ENERGIA E FREQUÊNCIA ENSAIADAS, UMA VEZ QUE APRESENTOU ",,,,,,,,,,',
    ',BOM FUNCIONAENTO EM TODAS AS SITUAÇÕES. ESTE LAUDO TEM VALIDADE DE 12 MESES.,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',___________________________________________________________________________,,,,,,,,,,',
    `,                                       ${tecnicoUpper},,,,,,,,,,`,
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    `,Numero de Serie do Equipamento,,,,,,${equipamentoSerie},,,,,`,
    `,ORDEM DE SERVIÇO,,,,,,${osId},,,,,`,
    ',,,,,,,,,,,',
    ',Atividades Realizadas: ,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,Verificação da carcaça do equipamento,,,,,,,,,OK',
    ',,Verificação dos pedais de acionamento,,,,,,,,,OK',
    ',,Verificação do painel de controle,,,,,,,,,OK',
    ',,Verificação do cabo de força,,,,,,,,,OK',
    ',,Limpeza externa,,,,,,,,,OK',
    ',,Limpeza interna,,,,,,,,,OK',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,Consideração Final,,,,,,,,,',
    ',,Após avaliação o aparelho mostrou-se apto para uso.,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    `,, AVALIAÇÃO  REALIZADA NO DIA ${dataExtenso},,,,,,,,,`,
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,,,,,,,,,,',
    ',,___________________________________________________________________________,,,,,,,,,',
    `,,                                       ${tecnicoUpper},,,,,,,,,`
  ];

  return '\uFEFF' + lines.join('\n');
}

/**
 * Função principal do script convert.ts.
 */
async function main() {
  const args = process.argv.slice(2);
  const targetOsId = args[0] ? args[0].replace(/^--os=/, '').trim() : null;

  if (!targetOsId) {
    console.error('❌ Por favor, informe o número da Ordem de Serviço (OS ID).');
    console.log('📌 Exemplo de uso:');
    console.log('   bun src/convert.ts 7596');
    console.log('   ou');
    console.log('   bun run convert 7229');
    process.exit(1);
  }

  const dbPath = config.dbFilePath;
  console.log(`🗄️ Abrindo banco de dados SQLite: ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Banco de dados SQLite não localizado em: ${dbPath}`);
    console.error('👉 Execute o scraper antes para criar a base SQLite.');
    process.exit(1);
  }

  let record: DbRecord | undefined;
  let dbClose: (() => void) | undefined;

  if (typeof (globalThis as any).Bun !== 'undefined' || (process as any).versions?.bun) {
    try {
      const packageName = 'bun:sqlite';
      const sqliteModule = await import(packageName);
      const db = new sqliteModule.Database(dbPath);
      record = db.query('SELECT * FROM ordens_servico WHERE id = ?').get(targetOsId) as DbRecord | undefined;
      dbClose = () => db.close();
    } catch {}
  }

  if (!dbClose) {
    const sqliteModule = await import('node:sqlite');
    const db = new sqliteModule.DatabaseSync(dbPath);
    const stmt = db.prepare('SELECT * FROM ordens_servico WHERE id = ?');
    record = stmt.get(targetOsId) as DbRecord | undefined;
    dbClose = () => db.close();
  }

  if (!record) {
    console.warn(`⚠️ Nenhuma Ordem de Serviço encontrada no banco para a OS: #${targetOsId}`);
    if (dbClose) dbClose();
    process.exit(1);
  }

  console.log(`✅ Registro encontrado para a OS #${targetOsId}:`);
  console.log(`   - Cliente: ${cleanText(record.cliente_nome)} (${cleanCpfCnpj(record.cliente_cpf_cnpj, record.cliente_nome)})`);
  console.log(`   - Equipamento: ${cleanText(record.equipamento_modelo)} (Série: ${cleanText(record.equipamento_codigo)})`);
  console.log(`   - Técnico: ${record.tecnico_responsavel}`);

  const csvContent = generateLaudoCsv(record);

  const outputDir = path.dirname(config.csvOutputFilePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.resolve(outputDir, `laudo_OS_${targetOsId}.csv`);
  await fs.promises.writeFile(outputPath, csvContent, 'utf-8');

  console.log('----------------------------------------------------');
  console.log(`🎉 Laudo CSV gerado com SUCESSO!`);
  console.log(`💾 Salvo em: ${outputPath}`);
  console.log('----------------------------------------------------');

  if (dbClose) dbClose();
}

main();
