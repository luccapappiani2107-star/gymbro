// O módulo de dados. É o único lugar do app que lê e escreve no aparelho.
//
// Nenhuma tela importa js/armazenamento.js. Se uma tela precisar de um dado, ela
// pede aqui; se precisar mudar um dado, ela chama uma função daqui. Todo caminho
// de escrita grava na hora — não existe botão de salvar em lugar nenhum.

import * as armazem from './armazenamento.js';
import * as esquema from './esquema.js';
import * as periodizacao from './periodizacao.js';
import * as rotinasLogica from './rotinas.js';
import * as exerciciosLogica from './exercicios.js';
import * as sugestaoLogica from './sugestao.js';
import { carregarSemente, montarDocumentos } from './semente.js';
import * as sessoesLogica from './sessao.js';
import * as alteracoes from './alteracoes.js';
import * as referenciaLogica from './referencia.js';
import { clonar, agoraISO, hojeISO } from './util.js';

const PREFIXO_SESSAO = 'sessao:';

const estado = {
  pronto: false,
  documentos: {},
  semeou: false,
  migrou: null,
  erroDeVersao: null,
  guardadoDeVerdade: false,
};

const ouvintes = new Set();

/** Avisa as telas que o dado mudou. Elas se redesenham; ninguém guarda cópia. */
export function aoMudar(callback) {
  ouvintes.add(callback);
  return () => ouvintes.delete(callback);
}

function avisar() {
  for (const callback of ouvintes) callback();
}

/** Pede às telas que se redesenhem sem que nenhum dado tenha acabado de mudar.
 *  Quem usa é a tela de editar treino: ela grava em silêncio enquanto está
 *  aberta, para o teclado não sumir no meio da digitação, e ao fechar avisa uma
 *  vez só para o que está embaixo aparecer já com o nome e a ordem novos. */
export function redesenhar() {
  avisar();
}

function ehChaveDeSessao(chave) {
  return chave.startsWith(PREFIXO_SESSAO);
}

// ---------------------------------------------------------------- abertura

// Fila de escrita. Na academia a tela grava a cada toque e a cada tecla; sem
// fila, uma gravação lenta poderia terminar depois de outra mais nova e devolver
// o dado velho para o aparelho. Encadeando, a ordem de chegada é a ordem de
// gravação.
let filaDeEscrita = Promise.resolve();

/** Grava e avisa as telas. `silencioso` existe para a tela da sessão: ela já
 *  sabe o que mudou (foi ela que mudou), e redesenhar a tela inteira no meio da
 *  digitação tiraria o foco do campo de carga na mão do Lucca. */
async function gravarDocumentos(pares, { silencioso = false } = {}) {
  if (estado.erroDeVersao) {
    throw new Error('os dados guardados são de uma versão mais nova do app');
  }
  for (const [chave, valor] of pares) estado.documentos[chave] = valor;

  filaDeEscrita = filaDeEscrita
    .catch(() => {})
    .then(() => armazem.gravarVarios(pares));
  await filaDeEscrita;

  if (!silencioso) avisar();
}

async function apagarDocumentos(chaves) {
  for (const chave of chaves) delete estado.documentos[chave];
  filaDeEscrita = filaDeEscrita.catch(() => {}).then(() => armazem.apagarVarios(chaves));
  await filaDeEscrita;
  avisar();
}

async function semear() {
  const semente = await carregarSemente();
  const documentos = montarDocumentos(semente);

  estado.documentos = {
    ...documentos,
    esquema: {
      versao: esquema.VERSAO_ATUAL,
      criadoEm: agoraISO(),
      atualizadoEm: agoraISO(),
    },
  };
  await armazem.gravarVarios(Object.entries(estado.documentos));
  estado.semeou = true;
}

/** Abre o armazenamento, atualiza o formato se precisar, e semeia se o aparelho
 *  ainda não tiver nada. Chamado uma vez, na abertura do app. */
export async function iniciar() {
  await armazem.abrir();
  estado.guardadoDeVerdade = await armazem.pedirParaNaoApagar();

  const guardados = await armazem.lerTudo();
  const vazio = Object.keys(guardados).length === 0;

  if (vazio) {
    await semear();
  } else {
    try {
      const resultado = esquema.migrar(guardados, guardados.esquema?.versao ?? 0);
      estado.documentos = resultado.documentos;
      if (resultado.migrou) {
        estado.migrou = { de: resultado.de, para: resultado.para };
        estado.documentos.esquema = {
          ...(estado.documentos.esquema ?? { criadoEm: agoraISO() }),
          versao: resultado.para,
          atualizadoEm: agoraISO(),
        };
        await armazem.gravarVarios(Object.entries(estado.documentos));
      }
    } catch (erro) {
      if (erro.name === 'DadosMaisNovosQueOApp') {
        estado.documentos = guardados;
        estado.erroDeVersao = erro;
      } else {
        throw erro;
      }
    }
  }

  estado.pronto = true;

  // Primeira escrita automática de toda abertura: prova, todo dia, que o
  // caminho de gravação está de pé.
  if (!estado.erroDeVersao) {
    await atualizarConfig({ ultimaAbertura: agoraISO() });
  }
  return situacao();
}

// ------------------------------------------------------------------ leitura

export const config = () => clonar(estado.documentos.config ?? {});
export const periodizacaoAtual = () => clonar(estado.documentos.periodizacao ?? null);
export const catalogo = () => clonar(estado.documentos.catalogo ?? []);
export const fabrica = () => clonar(estado.documentos.fabrica ?? null);

function arrumar(lista) {
  lista.sort(rotinasLogica.porOrdem);
  for (const rotina of lista) {
    rotina.exercicios.sort(rotinasLogica.porOrdem);
    for (const exercicio of rotina.exercicios) {
      exercicio.series.sort(rotinasLogica.porOrdem);
    }
  }
  return lista;
}

/** Os treinos que aparecem na lista, já sem o que foi excluído: nem os treinos
 *  excluídos, nem os exercícios excluídos de dentro deles.
 *
 *  Toda tela lê por aqui, então nenhuma precisa lembrar de filtrar. Quem
 *  escreve não usa esta função: as funções de escrita partem sempre da lista
 *  completa, guardada em `estado.documentos.rotinas`, para o que foi excluído
 *  continuar guardado e a M9 ter como trazer de volta. */
export function rotinas() {
  const lista = clonar(estado.documentos.rotinas ?? []).filter((r) => !r.arquivada);
  for (const rotina of lista) {
    rotina.exercicios = (rotina.exercicios ?? []).filter(exerciciosLogica.ehVisivel);
  }
  return arrumar(lista);
}

/** Todos os treinos, inclusive os excluídos. Existe porque excluir um treino é
 *  tirar da lista, não apagar do aparelho: o documento continua guardado para o
 *  histórico dele fazer sentido e para a M9 ter como trazer de volta. */
export function todasAsRotinas() {
  return arrumar(clonar(estado.documentos.rotinas ?? []));
}

export function rotina(id) {
  return rotinas().find((r) => r.id === id) ?? null;
}

export function rotinaMesmoExcluida(id) {
  return todasAsRotinas().find((r) => r.id === id) ?? null;
}

export function sessoes() {
  return Object.entries(estado.documentos)
    .filter(([chave]) => ehChaveDeSessao(chave))
    .map(([, valor]) => clonar(valor))
    .sort((a, b) =>
      String(b.data).localeCompare(String(a.data))
      || String(b.iniciadaEm ?? '').localeCompare(String(a.iniciadaEm ?? '')));
}

export function situacao() {
  return {
    pronto: estado.pronto,
    onde: armazem.nomeDoArmazenamento(),
    guardadoDeVerdade: estado.guardadoDeVerdade,
    versaoEsquema: estado.documentos.esquema?.versao ?? null,
    versaoDoApp: esquema.VERSAO_ATUAL,
    semeou: estado.semeou,
    migrou: estado.migrou,
    erroDeVersao: estado.erroDeVersao ? String(estado.erroDeVersao.message) : null,
    quantidades: contagens(),
  };
}

export function contagens() {
  const lista = rotinas();
  return {
    treinos: lista.length,
    exercicios: lista.reduce((total, r) => total + r.exercicios.length, 0),
    seriesPlanejadas: lista.reduce(
      (total, r) => total + r.exercicios.reduce((soma, e) => soma + e.series.length, 0), 0),
    exerciciosNoCatalogo: catalogo().filter((e) => !e.arquivado).length,
    sessoes: sessoes().length,
  };
}

// ------------------------------------------------- leitura já montada p/ tela

/** O degrau de carga usado quando a semana muda o número sugerido (deload).
 *  Mora em `config` para virar campo de tela na M8; o valor de fábrica está em
 *  `js/sugestao.js`. */
function passoDeCarga() {
  const guardado = Number(estado.documentos.config?.passoDeCarga);
  return Number.isFinite(guardado) && guardado > 0
    ? guardado
    : sugestaoLogica.PASSO_DE_CARGA_PADRAO;
}

/** Quem sabe sugerir a carga das séries de um exercício, série por série.
 *
 *  Devolve uma função, e não um número, porque a sugestão é por série: a
 *  posição decide qual carga do passado serve de base, e a carga alvo (M6) de
 *  cada série ganha do histórico quando existe.
 *
 *  Só lê. Nenhuma sugestão escreve em plano, em periodização ou em sessão:
 *  sugestão é ponto de partida editável (regra 4 do CONTEXTO), e quem grava é
 *  sempre um toque do Lucca.
 *
 *  `registradas` é passado de fora quando quem chama já leu as sessões — a tela
 *  do treino monta sete exercícios de uma vez, e reler o aparelho sete vezes
 *  seria desperdício sem troco. */
function sugeridorDeCarga({
  rotinaExercicioId = null, exercicioId = null, numeroSemana, registradas = null,
} = {}) {
  const p = estado.documentos.periodizacao;

  const historico = sugestaoLogica.historicoDoExercicio(registradas ?? sessoes(), {
    rotinaExercicioId,
    exercicioId,
    // `deload` vem congelado dentro da sessão desde a M7, e a migração 6 da M8
    // escreveu o campo nas sessões antigas que não tinham — justamente para
    // nenhuma sessão precisar perguntar à periodização de hoje o que era a
    // semana dela naquele dia. Depois que o bloco virou editável, essa pergunta
    // mudaria de resposta a cada edição. O reserva abaixo é só rede: sessão
    // recém-chegada de um caminho que não passou pela migração ainda responde
    // alguma coisa, em vez de contar como semana cheia por omissão.
    ehDeload: (sessao) => (typeof sessao.deload === 'boolean'
      ? sessao.deload
      : periodizacao.ehDeload(p, sessao.semana)),
  });

  const fator = periodizacao.fatorDeCarga(p, numeroSemana);
  const deload = periodizacao.ehDeload(p, numeroSemana);
  const passo = passoDeCarga();

  return (serie, indice) => sugestaoLogica.sugerirCarga({
    historico,
    indice,
    cargaAlvo: serie?.cargaAlvo ?? null,
    fator,
    deload,
    passo,
  });
}

/** Tudo que a tela precisa saber sobre a semana atual do bloco.
 *
 *  O número da semana é aparado na leitura, e não só na escrita: um bloco que
 *  encolheu (M8) ou um backup trazido de um aparelho com bloco maior deixariam
 *  `config.semanaAtual` apontando para uma semana que não existe mais. Aparado
 *  aqui, a semana que deixou de existir vira a última que existe em toda tela
 *  do app de uma vez — que é o comportamento definido, e não um erro. */
export function visaoDaSemana() {
  const p = estado.documentos.periodizacao;
  const c = estado.documentos.config ?? {};
  const total = periodizacao.totalDeSemanas(p);
  const pedida = Number(c.semanaAtual) || 1;
  const numero = Math.min(Math.max(pedida, 1), Math.max(total, 1));

  return {
    numero,
    // Quando a semana guardada não existe mais, a tela precisa poder dizer isso
    // em uma frase em vez de mostrar um número que apareceu do nada.
    numeroGuardado: pedida,
    forasteira: pedida !== numero,
    total,
    bloco: Number(c.bloco) || 1,
    rotulo: periodizacao.rotuloDaSemana(p, numero),
    deload: periodizacao.ehDeload(p, numero),
    rirBase: periodizacao.rirBaseDaSemana(p, numero),
    explicacao: periodizacao.explicacaoDaSemana(p, numero),
    nomeDaPeriodizacao: p?.nome ?? '',
  };
}

export function visaoDosTreinos() {
  const semana = visaoDaSemana();
  const p = estado.documentos.periodizacao;

  return rotinas().map((r) => {
    const seriesDaSemana = r.exercicios.reduce(
      (total, exercicio) =>
        total + periodizacao.seriesNaSemana(p, semana.numero, exercicio.series.length), 0);

    return {
      id: r.id,
      nome: rotinasLogica.nomeVisivel(r.nome),
      foco: r.foco,
      diaSemana: r.diaSemana,
      exercicios: r.exercicios.length,
      series: seriesDaSemana,
    };
  });
}

/** O treino inteiro, já com os dados do catálogo juntados e o RIR programado da
 *  semana atual calculado série por série. */
export function visaoDoTreino(rotinaId) {
  const encontrada = rotina(rotinaId);
  if (!encontrada) return null;

  const p = estado.documentos.periodizacao;
  const semana = visaoDaSemana();
  const porId = new Map(catalogo().map((e) => [e.id, e]));
  // Lido uma vez para os exercícios todos: a carga sugerida de cada um sai
  // daqui, e o aparelho não precisa ser lido sete vezes para montar uma tela.
  const registradas = sessoes().filter((s) => s.status === 'finalizada');

  return {
    id: encontrada.id,
    nome: rotinasLogica.nomeVisivel(encontrada.nome),
    foco: encontrada.foco,
    diaSemana: encontrada.diaSemana,
    semana,
    exercicios: encontrada.exercicios.map((exercicio) =>
      montarVisaoDoExercicio(exercicio, porId.get(exercicio.exercicioId), p, semana.numero,
        sugeridorDeCarga({
          rotinaExercicioId: exercicio.id,
          exercicioId: exercicio.exercicioId,
          numeroSemana: semana.numero,
          registradas,
        }))),
  };
}

/** Um exercício do treino, com a identidade do catálogo juntada à prescrição da
 *  rotina e o RIR programado da semana calculado série por série.
 *
 *  Recebe o número da semana em vez de ir buscá-lo: a tela pede a semana atual,
 *  mas quando um exercício entra numa sessão que já está aberta quem manda é a
 *  semana em que aquela sessão nasceu, que pode não ser a de hoje. */
export function montarVisaoDoExercicio(exercicio, doCatalogoBruto, p, numeroSemana, sugerir = () => null) {
  const doCatalogo = doCatalogoBruto ?? {};
  const tipo = doCatalogo.tipo ?? 'composto';
  const total = exercicio.series.length;
  const valemNaSemana = periodizacao.seriesNaSemana(p, numeroSemana, total);

  return {
    id: exercicio.id,
    exercicioId: exercicio.exercicioId,
    nome: exerciciosLogica.nomeVisivel(doCatalogo.nome),
    tipo,
    grupoPrincipal: doCatalogo.grupoPrincipal ?? null,
    grupoSecundario: doCatalogo.grupoSecundario ?? null,
    unilateral: doCatalogo.unilateral === true,
    // Duas anotações diferentes, de propósito: a do catálogo vale em todos os
    // treinos ("pegada na marca de fora"), a da rotina vale só neste treino.
    notas: exercicio.notas ?? '',
    notasDoCatalogo: doCatalogo.notas ?? '',
    repMin: exercicio.repMin,
    repMax: exercicio.repMax,
    descansoSegundos: exercicio.descansoSegundos,
    seriesForaDaSemana: total - valemNaSemana,
    series: exercicio.series.map((serie, indice) => ({
      id: serie.id,
      numero: indice + 1,
      repMin: serie.repMin ?? exercicio.repMin,
      repMax: serie.repMax ?? exercicio.repMax,
      // A faixa própria da série, sem a herança, para a tela de editar série
      // conseguir mostrar o campo em branco quando ele está em branco de
      // verdade — em branco quer dizer "segue o exercício".
      repMinProprio: serie.repMin ?? null,
      repMaxProprio: serie.repMax ?? null,
      faixaPropria: serie.repMin !== null && serie.repMin !== undefined
        || serie.repMax !== null && serie.repMax !== undefined,
      cargaAlvo: serie.cargaAlvo ?? null,
      // A carga sugerida da M7: ponto de partida editável, com a origem inteira
      // dentro dela. `null` quer dizer "ainda não tem de onde tirar", e o campo
      // abre em branco — nunca em zero.
      sugestao: sugerir(serie, indice),
      notas: serie.notas ?? '',
      descansoSegundos: exercicio.descansoSegundos,
      rirProgramado:
        serie.rirManual ?? periodizacao.rirDaSerie(p, numeroSemana, indice, tipo, total),
      rirDaSemana: periodizacao.rirDaSerie(p, numeroSemana, indice, tipo, total),
      rirManual: serie.rirManual ?? null,
      rirFixadoAMao: serie.rirManual !== null && serie.rirManual !== undefined,
      naSemana: indice < valemNaSemana,
    })),
  };
}

// --------------------------------------------------- desfazer e refazer
//
// A M9. Toda escrita do app já passava por este arquivo — nenhuma tela importa
// `js/armazenamento.js` —, e é isso que deixa "desfazer" existir num lugar só,
// sem cada tela ter de lembrar de guardar o caminho de volta.
//
// **O que desfazer alcança: a configuração. Nunca o treino registrado.**
//
// A foto que um passo guarda tem os quatro documentos de estrutura (`rotinas`,
// `catalogo`, `periodizacao`, `config`) e mais as sessões **abertas**. Sessão
// finalizada não entra na foto, e por isso não existe caminho de código, nem
// por engano, que faça desfazer reescrever um treino já registrado: o que não
// foi fotografado não tem como ser gravado de volta.
//
// A sessão aberta entra porque ela não é histórico — é o treino de hoje, e
// desde a M4 ela acompanha a edição de estrutura (mudar o nome do treino no
// meio da série muda o nome na tela). Se ela ficasse de fora, desfazer
// devolveria o treino ao que era e deixaria o de hoje com a mudança na cara.
//
// Só que ela também é o único documento da foto em que o Lucca pode ter escrito
// treino de verdade entre a edição e o toque em "Desfazer" — uma carga, umas
// reps, uma série marcada. Então a sessão aberta tem três portas antes de ser
// tocada, em `aplicarFoto`, e basta uma fechada para ela ficar como está:
//
//   1. ela ainda existe no aparelho (desfazer nunca ressuscita sessão);
//   2. ela ainda está aberta (virou histórico, não se toca mais);
//   3. ela está, campo a campo, como ficou logo depois da edição — fora o
//      cronômetro de descanso, que não é treino.
//
// Quando uma porta fecha, a estrutura volta assim mesmo e a tela conta que o
// treino de hoje ficou como está. Perder série registrada para desfazer uma
// mudança de nome seria o pior negócio possível.

const DOCUMENTOS_DE_ESTRUTURA = ['config', 'rotinas', 'catalogo', 'periodizacao'];

let pilhaDeAlteracoes = alteracoes.pilhaVazia();

/** Sobe de um a cada alteração guardada, e nunca desce. É por ele que a barra
 *  de desfazer sabe que apareceu coisa nova: escondida com o "×", ela volta na
 *  alteração seguinte, mesmo quando a frase é a mesma de antes. */
let seloDeAlteracao = 0;

/** A foto do que uma edição estrutural pode ter mexido. */
function fotoDaEstrutura() {
  const foto = {};

  for (const chave of DOCUMENTOS_DE_ESTRUTURA) {
    if (chave in estado.documentos) foto[chave] = clonar(estado.documentos[chave]);
  }
  for (const [chave, documento] of Object.entries(estado.documentos)) {
    if (ehChaveDeSessao(chave) && documento?.status === 'aberta') {
      foto[chave] = clonar(documento);
    }
  }
  return foto;
}

/** Das duas fotos, só os documentos que mudaram de verdade. Um passo de
 *  desfazer que guardasse os quatro documentos inteiros a cada tecla encheria a
 *  memória do celular com vinte cópias de coisa que ninguém mexeu. */
function soOQueMudou(antes, depois) {
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  const deAntes = {};
  const deDepois = {};

  for (const chave of chaves) {
    if (alteracoes.saoIguais(antes[chave], depois[chave])) continue;
    deAntes[chave] = antes[chave];
    deDepois[chave] = depois[chave];
  }
  return { antes: deAntes, depois: deDepois, mudou: Object.keys(deAntes).length > 0 };
}

/** Roda uma edição estrutural guardando o caminho de volta.
 *
 *  `montarDescricao` recebe o resultado da edição e devolve `{ frase, chave }`:
 *  a frase que a tela diz antes de desfazer e a chave que agrupa teclas
 *  seguidas do mesmo campo num passo só (`chave: null` nunca agrupa). */
async function comDesfazer(tarefa, montarDescricao) {
  const antes = fotoDaEstrutura();
  const resultado = await tarefa();
  const diferenca = soOQueMudou(antes, fotoDaEstrutura());
  if (!diferenca.mudou) return resultado;

  const descricao = montarDescricao(resultado) ?? {};
  if (!descricao.frase) return resultado;

  pilhaDeAlteracoes = alteracoes.registrar(pilhaDeAlteracoes, {
    frase: descricao.frase,
    chave: 'chave' in descricao ? descricao.chave : descricao.frase,
    em: Date.now(),
    antes: diferenca.antes,
    depois: diferenca.depois,
  });
  seloDeAlteracao += 1;
  return resultado;
}

/** A sessão sem o cronômetro de descanso. O descanso corre sozinho, grava
 *  sozinho e não é treino registrado: contá-lo como mudança faria desfazer
 *  desistir do treino de hoje só porque um relógio andou. */
function sessaoSemODescanso(sessao) {
  if (!sessao) return null;
  const { descanso, ...resto } = sessao;
  return resto;
}

/** Transforma uma foto na lista de pares para gravar.
 *
 *  `referencia` é a foto de como o aparelho deveria estar agora. Ela só é usada
 *  para as sessões abertas — as três portas explicadas no alto deste bloco. */
function aplicarFoto(foto, referencia) {
  const pares = [];
  const sessoesPuladas = [];

  for (const [chave, valor] of Object.entries(foto)) {
    if (valor === undefined) continue;

    if (!ehChaveDeSessao(chave)) {
      // A hora da última abertura é de hoje, não do passo: desfazer não anda
      // com o relógio para trás na tela de informações.
      pares.push(chave === 'config'
        ? ['config', { ...clonar(valor), ultimaAbertura: estado.documentos.config?.ultimaAbertura ?? valor.ultimaAbertura }]
        : [chave, clonar(valor)]);
      continue;
    }

    const agora = estado.documentos[chave];
    if (!agora || agora.status !== 'aberta') { sessoesPuladas.push(chave); continue; }
    if (!alteracoes.saoIguais(sessaoSemODescanso(agora), sessaoSemODescanso(referencia[chave]))) {
      sessoesPuladas.push(chave);
      continue;
    }

    // O cronômetro que está correndo agora continua correndo: ele é do minuto,
    // não da edição.
    pares.push([chave, { ...clonar(valor), status: 'aberta', descanso: clonar(agora.descanso ?? null) }]);
  }

  return { pares, sessoesPuladas };
}

async function andarNaPilha(passo) {
  if (!passo) return null;

  const { pares, sessoesPuladas } = aplicarFoto(passo.alvo, passo.referencia);
  await gravarDocumentos(pares, { silencioso: true });
  pilhaDeAlteracoes = passo.pilha;
  avisar();

  return {
    frase: passo.passo.frase,
    treinoDeHojeFicouComoEstava: sessoesPuladas.length > 0,
    ...alteracoes.olhar(pilhaDeAlteracoes),
  };
}

/** Desfaz a última alteração estrutural. Devolve o que foi desfeito, em
 *  português, ou `null` quando não havia nada para desfazer. */
export function desfazer() {
  return andarNaPilha(alteracoes.desfazer(pilhaDeAlteracoes));
}

/** Refaz o que acabou de ser desfeito. */
export function refazer() {
  return andarNaPilha(alteracoes.refazer(pilhaDeAlteracoes));
}

/** O que a barra de desfazer desenha. */
export function visaoDoDesfazer() {
  return { ...alteracoes.olhar(pilhaDeAlteracoes), selo: seloDeAlteracao };
}

/** Joga fora o caminho de volta. Chamado quando o chão inteiro muda debaixo
 *  dele — abrir um backup, apagar tudo —, porque a partir daí as fotos falam de
 *  documentos que não existem mais. */
function esquecerAlteracoes() {
  pilhaDeAlteracoes = alteracoes.pilhaVazia();
}

// ------------------------------------------------------------------ escrita

export async function atualizarConfig(mudancas, { silencioso = false } = {}) {
  await gravarDocumentos(
    [['config', { ...(estado.documentos.config ?? {}), ...mudancas }]], { silencioso });
  return config();
}

/** Grava a lista de treinos inteira.
 *
 *  Interna de propósito: o que ela recebe tem que ser a lista completa, com os
 *  treinos excluídos dentro. Gravar aqui o resultado de `rotinas()` — que já vem
 *  sem eles — apagaria os excluídos do aparelho de verdade e levaria junto o
 *  caminho de volta da M9. Quem escreve treino usa as funções com nome do que
 *  fazem, logo abaixo. */
async function gravarRotinas(listaCompleta, { silencioso = false } = {}) {
  await gravarDocumentos([['rotinas', clonar(listaCompleta)]], { silencioso });
}

export async function salvarCatalogo(lista) {
  return comDesfazer(
    () => gravarDocumentos([['catalogo', clonar(lista)]]),
    () => ({ frase: 'mudar a lista de exercícios', chave: null }));
}

/** Grava a periodização inteira.
 *
 *  É o único caminho de escrita do bloco, e ele carrega três garantias:
 *
 *  1. **Passa pelo portão.** `normalizar` arruma o que chegou, então nunca é
 *     gravado bloco sem semana, RIR fora da faixa ou exceção apontando para uma
 *     semana que não existe.
 *  2. **A semana atual é acertada na mesma escrita.** Encurtar o bloco enquanto
 *     o Lucca está na semana 6 de 6 o deixa na última semana que sobrou, no
 *     mesmo bloco — não em erro na tela e não em bloco novo, que seria inventar
 *     um avanço que ele não fez.
 *  3. **Nenhuma sessão é tocada.** Só as chaves `periodizacao` e `config` são
 *     escritas aqui. Não existe caminho daqui até um documento `sessao:*`.
 *
 *  Devolve o que mudou, para a tela contar em uma frase. `silencioso` existe
 *  pelo mesmo motivo da tela da sessão: os painéis desta tela gravam a cada
 *  toque e a cada tecla, e redesenhar a página de trás no meio da digitação
 *  tiraria o teclado da tela na metade do número. */
async function gravarPeriodizacao(nova, { silencioso = false } = {}) {
  const arrumada = periodizacao.normalizar(nova);
  const total = arrumada.semanas.length;

  const c = estado.documentos.config ?? {};
  const semanaAntes = Math.max(Number(c.semanaAtual) || 1, 1);
  const semanaDepois = Math.min(semanaAntes, total);

  const pares = [['periodizacao', clonar(arrumada)]];
  if (semanaDepois !== semanaAntes) {
    pares.push(['config', { ...c, semanaAtual: semanaDepois }]);
  }
  await gravarDocumentos(pares, { silencioso });

  return { total, semanaAntes, semanaDepois, mudouASemana: semanaDepois !== semanaAntes };
}

/** A frase de desfazer de uma mudança de bloco, lida do que de fato mudou.
 *
 *  Ela também é a chave que agrupa: os painéis desta tela gravam a cada toque,
 *  e mexer três vezes no RIR da semana 3 tem de ser um passo de desfazer só —
 *  mas mexer na semana 3 e depois na semana 5 tem de ser dois. */
function fraseDaPeriodizacao(antes, depois) {
  if (!antes) return 'mudar a periodização';

  const semanasAntes = antes.semanas ?? [];
  const semanasDepois = depois.semanas ?? [];
  if (semanasAntes.length !== semanasDepois.length) {
    return `mudar o bloco para ${semanasDepois.length} semanas`;
  }

  const mexida = semanasDepois.findIndex((semana, i) => !alteracoes.saoIguais(semana, semanasAntes[i]));
  if (mexida >= 0) return `mudar a semana ${semanasDepois[mexida].numero ?? mexida + 1} do bloco`;
  if (!alteracoes.saoIguais(antes.regras, depois.regras)) return 'mudar as regras do bloco';
  if (antes.regraSeriesExtras !== depois.regraSeriesExtras) return 'mudar as regras do bloco';
  if (antes.nome !== depois.nome) return 'mudar o nome da periodização';
  return 'mudar a periodização';
}

export async function salvarPeriodizacao(nova, { silencioso = false } = {}) {
  const antes = clonar(estado.documentos.periodizacao);
  return comDesfazer(
    () => gravarPeriodizacao(nova, { silencioso }),
    () => {
      const frase = fraseDaPeriodizacao(antes, estado.documentos.periodizacao);
      return { frase, chave: frase };
    });
}

// ------------------------------------------------------------ periodização
//
// A M8. Três coisas mandam neste bloco, e nenhuma delas é opinião:
//
// 1. **Mudança de periodização vale de agora para frente.** Nenhuma função
//    daqui escreve em `sessao:*`. O RIR programado de toda série que já nasceu
//    está gravado dentro da sessão dela desde a M3, e desde a M6 ele não está
//    em `CAMPOS_DA_SERIE_DA_SESSAO` — não existe caminho de código, nem por
//    engano, que faça uma edição de bloco reescrever o passado.
// 2. **O treino que está acontecendo agora também não muda.** As séries dele
//    nasceram com o RIR daquele dia congelado. Só a série que nascer depois da
//    mudança nasce com o número novo, e isso vale inclusive dentro de uma
//    sessão aberta: série nova nasce sob a regra que está valendo na hora em
//    que ela nasce. É a mesma regra da M6.
// 3. **Semana que deixou de existir tem resposta, não erro.** Encolher o bloco
//    apara `config.semanaAtual` na escrita (`salvarPeriodizacao`) e na leitura
//    (`visaoDaSemana`). Os dois, de propósito: o primeiro conserta, o segundo
//    aguenta backup que chegou de fora já torto.

/** O bloco inteiro, do jeito que a tela de periodização precisa dele: cada
 *  semana já com as regras aplicadas, mais o que está em volta (onde ele está,
 *  quantas sessões existem, se isto ainda é o padrão de fábrica). */
export function visaoDaPeriodizacao() {
  const p = estado.documentos.periodizacao;
  const c = estado.documentos.config ?? {};
  const semana = visaoDaSemana();
  const daFabrica = estado.documentos.fabrica?.periodizacao ?? null;
  const todas = sessoes();

  return {
    nome: p?.nome ?? '',
    total: periodizacao.totalDeSemanas(p),
    semanaAtual: semana.numero,
    bloco: semana.bloco,
    inicioDoBloco: c.inicioDoBloco ?? null,
    passoDeCarga: passoDeCarga(),
    regraSeriesExtras: p?.regraSeriesExtras ?? 'repetir_ultimo',
    regras: clonar(p?.regras ?? {}),
    semanas: periodizacao.visaoDoBloco(p),
    // O botão de voltar ao padrão precisa poder dizer "já está no padrão" em
    // vez de gravar por cima do que já é igual.
    temPadraoDeFabrica: daFabrica !== null,
    ehOPadraoDeFabrica: daFabrica !== null && periodizacao.saoIguais(p, daFabrica),
    // Quantos treinos a mudança não vai tocar, para a tela dizer o número.
    sessoesRegistradas: todas.filter((s) => s.status === 'finalizada').length,
    sessoesAbertas: todas.filter((s) => s.status === 'aberta').length,
    limiteDeSemanas: periodizacao.MAXIMO_DE_SEMANAS,
    limiteDePosicoes: periodizacao.MAXIMO_DE_POSICOES,
  };
}

/** O degrau da carga sugerida. Mora em `config` desde a M7 e vira campo de tela
 *  aqui: é o único número da sugestão que o Lucca ajusta à mão. */
export async function definirPassoDeCarga(valor, { silencioso = false } = {}) {
  const numero = Number(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error('o degrau da carga precisa ser um número maior que zero');
  }
  return comDesfazer(
    async () => {
      await atualizarConfig({ passoDeCarga: numero }, { silencioso });
      return passoDeCarga();
    },
    () => ({ frase: 'mudar o degrau da carga', chave: 'config:passoDeCarga' }));
}

// ------------------------------------------------- a semana atual do bloco

/** Põe o Lucca numa semana do bloco, à mão. Fora da faixa, apara: pedir a
 *  semana 9 de um bloco de 6 é pedir a 6, não é erro. */
export async function definirSemanaAtual(numero) {
  const total = Math.max(periodizacao.totalDeSemanas(estado.documentos.periodizacao), 1);
  const alvo = Math.min(Math.max(Math.trunc(Number(numero)) || 1, 1), total);
  await atualizarConfig({ semanaAtual: alvo });
  return { semana: alvo, total, bloco: Number(config().bloco) || 1, virouBloco: false };
}

/** Passa para a próxima semana. Terminar a última semana começa um bloco novo:
 *  a semana volta para a 1, o número do bloco sobe e a data de início do bloco
 *  vira hoje.
 *
 *  Nada é apagado com isso. Bloco é um número em `config`, e cada sessão já
 *  guarda dentro de si o bloco e a semana em que aconteceu — o histórico dos
 *  blocos anteriores continua exatamente onde estava. */
export async function avancarSemana() {
  const total = Math.max(periodizacao.totalDeSemanas(estado.documentos.periodizacao), 1);
  const c = config();
  const atual = visaoDaSemana().numero;
  const bloco = Number(c.bloco) || 1;

  if (atual < total) {
    await atualizarConfig({ semanaAtual: atual + 1 });
    return { semana: atual + 1, total, bloco, virouBloco: false };
  }

  await atualizarConfig({ semanaAtual: 1, bloco: bloco + 1, inicioDoBloco: hojeISO() });
  return { semana: 1, total, bloco: bloco + 1, virouBloco: true };
}

/** Volta uma semana. Para na semana 1 e nunca desfaz um bloco: o bloco anterior
 *  já aconteceu, e voltar o contador diria que ele não aconteceu. */
export async function voltarSemana() {
  const total = Math.max(periodizacao.totalDeSemanas(estado.documentos.periodizacao), 1);
  const atual = visaoDaSemana().numero;
  const bloco = Number(config().bloco) || 1;

  if (atual <= 1) return { semana: 1, total, bloco, virouBloco: false, jaEraAPrimeira: true };

  await atualizarConfig({ semanaAtual: atual - 1 });
  return { semana: atual - 1, total, bloco, virouBloco: false };
}

/** Devolve a periodização como ela veio de fábrica, sem encostar em nada mais.
 *
 *  A cópia de fábrica é congelada na semeadura e nunca mais escrita, então
 *  restaurar é copiar `fabrica.periodizacao` por cima de `periodizacao`. O
 *  aparelho que ainda não tem essa cópia (dado antigo, backup de antes) cai no
 *  arquivo da semente, que é de onde ela teria saído.
 *
 *  Nada de histórico é tocado: nem uma sessão, nem um treino, nem o catálogo.
 *  O bloco e a semana em que ele está continuam onde estavam — só aparados,
 *  se o padrão for mais curto que o bloco que estava valendo. */
export async function restaurarPeriodizacaoPadrao() {
  const daFabrica = estado.documentos.fabrica?.periodizacao;
  const padrao = daFabrica ?? (await carregarSemente()).periodizacao;
  if (!padrao) throw new Error('não achei a periodização de fábrica neste aparelho');

  const jaEra = periodizacao.saoIguais(estado.documentos.periodizacao, padrao);
  return comDesfazer(
    async () => {
      const feito = await gravarPeriodizacao(padrao);
      return { ...feito, jaEra, deOndeVeio: daFabrica ? 'fabrica' : 'semente' };
    },
    () => ({ frase: 'voltar a periodização para o padrão de fábrica', chave: null }));
}

// ------------------------------------------------------------------ sessão

export function sessao(id) {
  return clonar(estado.documentos[PREFIXO_SESSAO + id] ?? null);
}

/** Sessões que o Lucca começou e não finalizou, da mais recente para a mais
 *  antiga. Sessão aberta nunca é apagada nem finalizada sozinha: se ele esqueceu
 *  de encerrar um treino de outro dia, o app mostra e ele decide. */
export function sessoesAbertas() {
  return sessoes().filter((s) => s.status === 'aberta');
}

export function sessaoAbertaDoDia(rotinaId, data = hojeISO()) {
  return sessoesAbertas().find((s) => s.rotinaId === rotinaId && s.data === data) ?? null;
}

export function sessaoAbertaDeOutroDia(rotinaId, data = hojeISO()) {
  return sessoesAbertas().find((s) => s.rotinaId === rotinaId && s.data !== data) ?? null;
}

/** Começa o treino. Se já existe sessão aberta desta rotina hoje, devolve
 *  aquela: nunca nascem duas sessões abertas do mesmo treino no mesmo dia. */
export async function iniciarSessao(rotinaId) {
  const deHoje = sessaoAbertaDoDia(rotinaId);
  if (deHoje) return { sessao: deHoje, retomada: true };

  const treino = visaoDoTreino(rotinaId);
  if (!treino) throw new Error('não achei esse treino');

  const nova = sessoesLogica.montarSessao(treino);
  await gravarDocumentos([[PREFIXO_SESSAO + nova.id, nova]]);
  return { sessao: clonar(nova), retomada: false };
}

/** Mexe numa sessão guardada e grava o resultado. Grava em silêncio por padrão:
 *  quem chama é a tela da sessão, que já se atualizou sozinha. */
async function mexerNaSessao(id, mudar, { silencioso = true } = {}) {
  const chave = PREFIXO_SESSAO + id;
  const guardada = estado.documentos[chave];
  if (!guardada) throw new Error('não achei esse treino registrado');

  const copia = clonar(guardada);
  mudar(copia);
  await gravarDocumentos([[chave, copia]], { silencioso });
  return clonar(copia);
}

function exigirAberta(sessao) {
  if (sessao.status !== 'aberta') {
    throw new Error('este treino já foi finalizado e não muda mais');
  }
}

function acharSerie(sessao, exercicioId, serieId) {
  const exercicio = sessao.exercicios.find((e) => e.id === exercicioId);
  const serie = exercicio?.series.find((s) => s.id === serieId);
  if (!serie) throw new Error('não achei essa série');
  return serie;
}

/** Muda um campo da série (carga, reps, RIR alvo, RIR real). Campo apagado vira
 *  null, não zero: branco quer dizer "não fiz", zero é um valor de treino.
 *
 *  Só os campos de `CAMPOS_DA_SERIE_DA_SESSAO` passam. `rirProgramado` não está
 *  na lista, e é essa ausência que faz a regra 2 do CONTEXTO ser garantia de
 *  código: nenhuma tela consegue reescrever o RIR que a periodização mandou
 *  naquele dia, nem por engano nem por campo errado. */
export function atualizarSerie(sessaoId, exercicioId, serieId, mudancas) {
  return mexerNaSessao(sessaoId, (sessao) => {
    exigirAberta(sessao);
    const serie = acharSerie(sessao, exercicioId, serieId);
    for (const [campo, arrumar] of Object.entries(sessoesLogica.CAMPOS_DA_SERIE_DA_SESSAO)) {
      if (campo in mudancas) serie[campo] = arrumar(mudancas[campo]);
    }
  });
}

export function marcarSerie(sessaoId, exercicioId, serieId, concluida) {
  return mexerNaSessao(sessaoId, (sessao) => {
    exigirAberta(sessao);
    const serie = acharSerie(sessao, exercicioId, serieId);
    serie.concluida = concluida === true;
    serie.concluidaEm = serie.concluida ? agoraISO() : null;
  });
}

export function anotarExercicio(sessaoId, exercicioId, nota) {
  return mexerNaSessao(sessaoId, (sessao) => {
    exigirAberta(sessao);
    const exercicio = sessao.exercicios.find((e) => e.id === exercicioId);
    if (!exercicio) throw new Error('não achei esse exercício');
    exercicio.nota = String(nota ?? '');
  });
}

export function anotarSessao(sessaoId, nota) {
  return mexerNaSessao(sessaoId, (sessao) => {
    exigirAberta(sessao);
    sessao.nota = String(nota ?? '');
  });
}

/** Guarda o cronômetro de descanso dentro da própria sessão, para o app poder
 *  ser fechado no meio do descanso e voltar com o tempo certo. */
export function salvarDescanso(sessaoId, descanso) {
  return mexerNaSessao(sessaoId, (sessao) => {
    // Cronômetro nunca encosta em treino já finalizado: histórico não se mexe.
    exigirAberta(sessao);
    sessao.descanso = descanso ? clonar(descanso) : null;
  });
}

/** Encerra o treino. A partir daqui a sessão é histórico: nada mais a altera. */
export function finalizarSessao(sessaoId) {
  return mexerNaSessao(sessaoId, (sessao) => {
    exigirAberta(sessao);
    sessao.status = 'finalizada';
    sessao.finalizadaEm = agoraISO();
    sessao.descanso = null;
  }, { silencioso: false });
}

/** Joga fora um treino começado por engano. Só funciona se nada foi preenchido:
 *  histórico é sagrado, e o que tem dado dentro não se apaga por atalho. */
export async function descartarSessaoVazia(sessaoId) {
  const guardada = estado.documentos[PREFIXO_SESSAO + sessaoId];
  if (!guardada) throw new Error('não achei esse treino');
  if (guardada.status !== 'aberta' || !sessoesLogica.sessaoVazia(guardada)) {
    throw new Error('este treino já tem coisa preenchida e não dá para jogar fora');
  }
  await apagarDocumentos([PREFIXO_SESSAO + sessaoId]);
}

// ----------------------------------------------------------- editar treino

// Duas regras mandam neste bloco:
//
// 1. **Sessão finalizada não se toca.** Toda escrita em `sessao:*` continua
//    passando por `mexerNaSessao`, que exige `status === "aberta"`. Renomear,
//    reordenar ou excluir um treino não tem caminho de código para alcançar um
//    treino já registrado.
// 2. **Sessão aberta é hoje, não é histórico.** O treino que está acontecendo
//    agora acompanha a edição: mudar o nome no meio do treino muda o nome na
//    tela do treino. Só o que é rótulo acompanha — nome, subtítulo e a ordem
//    dos exercícios. Carga, reps, RIR e o que já foi marcado como feito não são
//    alcançados por nenhuma dessas funções.

const CAMPOS_EDITAVEIS = {
  nome: (valor) => String(valor ?? ''),
  foco: (valor) => String(valor ?? ''),
  diaSemana: (valor) => {
    const numero = Math.trunc(Number(valor));
    return Number.isFinite(numero) && numero >= 1 && numero <= 7 ? numero : null;
  },
};

/** Roda uma mudança em cada sessão da lista. Só entra sessão aberta: quem monta
 *  a lista filtra por `sessoesAbertas()`, e `mexerNaSessao` recusaria sessão
 *  finalizada de qualquer jeito. Este é o único caminho pelo qual uma edição de
 *  estrutura chega a um documento de sessão. */
async function espelharNasAbertas(abertas, mudar) {
  for (const aberta of abertas) {
    await mexerNaSessao(aberta.id, (sessao) => {
      exigirAberta(sessao);
      mudar(sessao);
    }, { silencioso: true });
  }
  return abertas.length;
}

/** Roda uma mudança em toda sessão aberta deste treino. */
async function espelharNasSessoesAbertas(rotinaId, mudar) {
  return espelharNasAbertas(sessoesAbertas().filter((s) => s.rotinaId === rotinaId), mudar);
}

/** Muda nome, subtítulo de foco ou dia da semana. Grava na hora: não existe
 *  botão de salvar. `silencioso` é para a tela de edição, que grava a cada
 *  tecla e não pode se redesenhar no meio da digitação. */
/** O nome do treino, para as frases da tela e as de desfazer. Lê a lista
 *  completa: o treino excluído continua tendo nome. */
export function nomeDaRotina(rotinaId) {
  const achada = (estado.documentos.rotinas ?? []).find((r) => r.id === rotinaId);
  return rotinasLogica.nomeVisivel(achada?.nome);
}

/** A frase de desfazer de uma edição de treino, e a chave que agrupa as teclas
 *  do mesmo campo num passo só. Um campo por vez tem nome próprio; dois de uma
 *  vez, que só acontece por chamada de código, cai na frase geral. */
function descricaoDaEdicaoDeRotina(id, mudancas, nomeDepois) {
  const campos = Object.keys(CAMPOS_EDITAVEIS).filter((campo) => campo in mudancas);
  const nome = rotinasLogica.nomeVisivel(nomeDepois);

  if (campos.length === 1 && campos[0] === 'nome') {
    return { frase: `renomear o treino para "${nome}"`, chave: `rotina:${id}:nome` };
  }
  if (campos.length === 1 && campos[0] === 'foco') {
    return { frase: `mudar o foco de "${nome}"`, chave: `rotina:${id}:foco` };
  }
  if (campos.length === 1 && campos[0] === 'diaSemana') {
    return { frase: `mudar o dia de "${nome}"`, chave: `rotina:${id}:diaSemana` };
  }
  return { frase: `mudar o treino "${nome}"`, chave: `rotina:${id}:campos` };
}

export async function editarRotina(id, mudancas, { silencioso = false } = {}) {
  return comDesfazer(async () => {
    const lista = clonar(estado.documentos.rotinas ?? []);
    const alvo = lista.find((r) => r.id === id);
    if (!alvo) throw new Error('não achei esse treino');

    for (const [campo, arrumar] of Object.entries(CAMPOS_EDITAVEIS)) {
      if (campo in mudancas) alvo[campo] = arrumar(mudancas[campo]);
    }

    await gravarRotinas(lista, { silencioso: true });
    await espelharNasSessoesAbertas(id, (sessao) => {
      sessao.rotinaNome = alvo.nome;
      sessao.rotinaFoco = alvo.foco;
    });
    if (!silencioso) avisar();
    return clonar(alvo);
  }, (alvo) => descricaoDaEdicaoDeRotina(id, mudancas, alvo.nome));
}

/** Sobe (passo −1) ou desce (passo +1) um exercício dentro do treino. Devolve a
 *  posição em que ele ficou, contando a partir de 1. */
export async function moverExercicioDaRotina(rotinaId, exercicioId, passo, { silencioso = false } = {}) {
  return comDesfazer(async () => {
    const lista = clonar(estado.documentos.rotinas ?? []);
    const alvo = lista.find((r) => r.id === rotinaId);
    if (!alvo) throw new Error('não achei esse treino');

    // Só os exercícios que aparecem na tela entram na conta: um exercício
    // excluído continua guardado, e se ele contasse posição, descer trocaria de
    // lugar com um item que ninguém vê.
    const daTela = exerciciosLogica.visiveis(alvo.exercicios);
    const resultado = rotinasLogica.mover(daTela, exercicioId, passo);
    alvo.exercicios = exerciciosLogica.renumerarVisiveis(
      [...resultado.lista, ...exerciciosLogica.arquivados(alvo.exercicios)]);

    await gravarRotinas(lista, { silencioso: true });
    await espelharOrdemNasSessoesAbertas(rotinaId, resultado.lista);
    if (!silencioso) avisar();
    return { ...resultado, nomeDoTreino: nomeDaRotina(rotinaId) };
    // Subir e descer seguidos, no mesmo treino, viram um passo só: ele está
    // procurando a ordem certa, não fazendo uma edição por toque.
  }, (feito) => ({
    frase: `mudar a ordem dos exercícios de "${feito.nomeDoTreino}"`,
    chave: `rotina:${rotinaId}:ordem`,
  }));
}

/** Leva a nova ordem para dentro do treino que está acontecendo agora.
 *
 *  Move o exercício inteiro de lugar, com as séries dentro dele: o que já foi
 *  marcado como feito continua marcado, com a mesma carga, as mesmas reps e o
 *  mesmo RIR. Muda só a ordem em que os exercícios aparecem na tela. */
async function espelharOrdemNasSessoesAbertas(rotinaId, exerciciosDaRotina) {
  const porExercicioDaRotina = new Map(exerciciosDaRotina.map((e, i) => [e.id, i]));
  const porExercicioDoCatalogo = new Map(exerciciosDaRotina.map((e, i) => [e.exercicioId, i]));

  // Sessão nascida antes da M4 não guarda o vínculo com o exercício da rotina;
  // aí o vínculo do catálogo serve. O que não casar com nada — o exercício que
  // ele tirou do treino mas já tinha feito série hoje — fica logo depois de
  // quem ele seguia, e nunca some da tela.
  return espelharNasSessoesAbertas(rotinaId, (sessao) => {
    let ultimoConhecido = -1;

    sessao.exercicios = sessao.exercicios
      .map((exercicio, indice) => {
        const achado = porExercicioDaRotina.get(exercicio.rotinaExercicioId)
          ?? porExercicioDoCatalogo.get(exercicio.exercicioId);
        if (achado !== undefined) ultimoConhecido = achado;
        return { exercicio, lugar: achado ?? ultimoConhecido + 0.5, indice };
      })
      .sort((a, b) => a.lugar - b.lugar || a.indice - b.indice)
      .map(({ exercicio }, posicao) => ({ ...exercicio, ordem: posicao }));
  });
}

export async function criarRotina({ nome = 'Novo treino', foco = '', diaSemana = null } = {}) {
  return comDesfazer(async () => {
    const lista = clonar(estado.documentos.rotinas ?? []);
    const nova = rotinasLogica.rotinaVazia({
      nome, foco, diaSemana, ordem: rotinasLogica.proximaOrdem(lista),
    });

    lista.push(nova);
    await gravarRotinas(lista);
    return clonar(nova);
  }, (nova) => ({
    frase: `criar o treino "${rotinasLogica.nomeVisivel(nova.nome)}"`,
    chave: null,
  }));
}

/** Copia a estrutura de um treino: exercícios, séries planejadas, faixas de
 *  reps e descansos. Nunca copia sessão nenhuma — a cópia nasce com
 *  identificadores novos, então nenhum treino já registrado passa a apontar
 *  para ela, e ela nasce sem histórico. */
export async function duplicarRotina(id) {
  return comDesfazer(async () => {
    const lista = rotinasLogica.ordenar(clonar(estado.documentos.rotinas ?? []));
    const posicao = lista.findIndex((r) => r.id === id);
    if (posicao < 0) throw new Error('não achei esse treino');

    const copia = rotinasLogica.duplicar(lista[posicao]);
    lista.splice(posicao + 1, 0, copia);
    rotinasLogica.renumerar(lista);

    await gravarRotinas(lista);
    return clonar(copia);
  }, (copia) => ({
    frase: `duplicar o treino "${rotinasLogica.nomeVisivel(copia.nome)}"`,
    chave: null,
  }));
}

/** Tira o treino da lista.
 *
 *  Não apaga nada: marca o documento como excluído e grava só em `rotinas`.
 *  Nenhum documento de sessão é lido ou escrito aqui, e é por isso que os
 *  treinos já registrados com ele continuam inteiros no histórico — eles
 *  guardam dentro de si o nome, o foco e cada exercício do dia em que foram
 *  feitos, e não vão buscar nada nesta lista para se mostrar. */
export async function excluirRotina(id) {
  return comDesfazer(async () => {
    const lista = clonar(estado.documentos.rotinas ?? []);
    const alvo = lista.find((r) => r.id === id);
    if (!alvo) throw new Error('não achei esse treino');

    alvo.arquivada = true;
    alvo.arquivadaEm = agoraISO();

    await gravarRotinas(lista);
    return clonar(alvo);
  }, (alvo) => ({
    frase: `excluir o treino "${rotinasLogica.nomeVisivel(alvo.nome)}"`,
    chave: null,
  }));
}

/** Quantos treinos já foram feitos com esta rotina. É o que a confirmação de
 *  excluir mostra, para o aviso falar de coisa concreta. */
export function contagemDeSessoes(rotinaId) {
  const lista = sessoes().filter((s) => s.rotinaId === rotinaId);
  return {
    total: lista.length,
    registradas: lista.filter((s) => s.status === 'finalizada').length,
    abertas: lista.filter((s) => s.status === 'aberta').length,
  };
}

// ------------------------------------------------------- editar exercício

// O terceiro bloco de escrita do app, e o que mais precisa de disciplina,
// porque um exercício tem duas metades que moram em documentos diferentes:
//
// - a **identidade** (nome, grupos, composto ou isolador, um lado por vez) mora
//   no `catalogo` e é a mesma em todos os treinos;
// - a **prescrição** (quantas séries, faixa de reps, descanso, anotação) mora
//   no exercício da rotina e vale só naquele treino.
//
// As três regras que mandam aqui:
//
// 1. **Sessão finalizada não se toca.** Continua valendo o de sempre: toda
//    escrita em `sessao:*` passa por `mexerNaSessao`, que exige sessão aberta.
// 2. **`rirProgramado` de série que já nasceu nunca é recalculado.** Nem
//    quando o exercício vira isolador, nem quando o número de séries muda, nem
//    quando o exercício é trocado por outro. Série nova nasce com o RIR da
//    semana **daquela sessão**, não da semana de hoje.
// 3. **Trocar um exercício por outro nunca funde os dois históricos.** Ver a
//    explicação inteira em `substituirExercicioDaRotina`.

/** Abre a lista completa de treinos, mexe num treino e grava. A lista que chega
 *  em `mudar` tem tudo dentro, inclusive o que foi excluído.
 *
 *  Grava sempre em silêncio: quem chama espelha na sessão aberta logo depois e
 *  só então chama `avisar()`. Redesenhar entre uma coisa e outra mostraria o
 *  treino já mudado com o treino de hoje ainda velho — na tela da sessão, o
 *  exercício novo apareceria só na próxima vez que alguma coisa mudasse. */
async function mexerNaRotina(rotinaId, mudar) {
  const lista = clonar(estado.documentos.rotinas ?? []);
  const alvo = lista.find((r) => r.id === rotinaId);
  if (!alvo) throw new Error('não achei esse treino');

  const resultado = mudar(alvo);
  await gravarRotinas(lista, { silencioso: true });
  return resultado;
}

function acharExercicio(rotina, exercicioDaRotinaId) {
  const achado = (rotina.exercicios ?? []).find((e) => e.id === exercicioDaRotinaId);
  if (!achado) throw new Error('não achei esse exercício no treino');
  return achado;
}

/** O nome do exercício, para as frases da tela. */
export function nomeDoExercicio(exercicioId) {
  const achado = catalogo().find((e) => e.id === exercicioId);
  return exerciciosLogica.nomeVisivel(achado?.nome);
}

// ----------------------------------------------------------- o catálogo

/** Os exercícios que existem, já sem os excluídos, com quantos treinos usam
 *  cada um. `busca` é o que ele digitou: sem acento e sem maiúscula. */
export function visaoDoCatalogo(busca = '') {
  const usos = new Map();
  for (const rotina of rotinas()) {
    for (const exercicio of rotina.exercicios) {
      usos.set(exercicio.exercicioId, (usos.get(exercicio.exercicioId) ?? 0) + 1);
    }
  }

  return catalogo()
    .filter(exerciciosLogica.ehVisivelNoCatalogo)
    .filter((item) => exerciciosLogica.combina(item, busca))
    .sort(exerciciosLogica.porNome)
    .map((item) => ({ ...item, treinos: usos.get(item.id) ?? 0 }));
}

export function catalogoExcluido() {
  return catalogo().filter((e) => e.arquivado).sort(exerciciosLogica.porNome);
}

export function exercicioDoCatalogo(id) {
  return catalogo().find((e) => e.id === id) ?? null;
}

/** Os grupos musculares que já existem no aparelho, para o campo sugerir em vez
 *  de exigir que ele digite "quadríceps" de novo, sempre igual. Nenhum grupo
 *  está escrito no código: a lista sai do que o próprio catálogo tem. */
export function gruposConhecidos() {
  const todos = new Set();
  for (const item of catalogo()) {
    if (item.grupoPrincipal) todos.add(item.grupoPrincipal);
    if (item.grupoSecundario) todos.add(item.grupoSecundario);
  }
  return [...todos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Onde este exercício aparece: em que treinos e em quantos treinos já feitos.
 *  É o que a confirmação de excluir mostra, para o aviso falar de coisa
 *  concreta em vez de "tem certeza?". */
export function ondeOExercicioEUsado(exercicioId) {
  const treinos = rotinas()
    .filter((r) => r.exercicios.some((e) => e.exercicioId === exercicioId))
    .map((r) => ({ id: r.id, nome: rotinasLogica.nomeVisivel(r.nome) }));

  const comEle = sessoes().filter((s) =>
    (s.exercicios ?? []).some((e) => e.exercicioId === exercicioId));

  return {
    treinos,
    registradas: comEle.filter((s) => s.status === 'finalizada').length,
    abertas: comEle.filter((s) => s.status === 'aberta').length,
  };
}

export async function criarExercicioNoCatalogo(campos) {
  return comDesfazer(async () => {
    const novo = exerciciosLogica.itemDoCatalogo(campos);
    await gravarDocumentos([['catalogo', [...catalogo(), novo]]]);
    return clonar(novo);
  }, (novo) => ({
    frase: `criar o exercício "${exerciciosLogica.nomeVisivel(novo.nome)}"`,
    chave: null,
  }));
}

/** Muda a identidade de um exercício. Vale em todos os treinos que usam ele —
 *  é isso que "catálogo" quer dizer — e a tela avisa quando é mais de um.
 *
 *  Chega na sessão aberta como rótulo: renomear no meio do treino muda o nome
 *  na tela do treino de hoje. Não chega em nenhum número: o `rirProgramado` das
 *  séries que já nasceram fica exatamente como está, mesmo quando o exercício
 *  passa de composto para isolador. */
export async function editarExercicioDoCatalogo(id, mudancas, { silencioso = false } = {}) {
  const campo = Object.keys(exerciciosLogica.CAMPOS_DO_CATALOGO)
    .filter((nome) => nome in mudancas);

  return comDesfazer(
    () => mudarExercicioDoCatalogo(id, mudancas, { silencioso }),
    (feito) => ({
      frase: campo.length === 1 && campo[0] === 'nome'
        ? `renomear o exercício para "${exerciciosLogica.nomeVisivel(feito.exercicio.nome)}"`
        : `mudar o exercício "${exerciciosLogica.nomeVisivel(feito.exercicio.nome)}"`,
      chave: `catalogo:${id}:${campo.join(',')}`,
    }));
}

async function mudarExercicioDoCatalogo(id, mudancas, { silencioso = false } = {}) {
  const lista = catalogo();
  const alvo = lista.find((e) => e.id === id);
  if (!alvo) throw new Error('não achei esse exercício');

  for (const [campo, arrumar] of Object.entries(exerciciosLogica.CAMPOS_DO_CATALOGO)) {
    if (campo in mudancas) alvo[campo] = arrumar(mudancas[campo]);
  }

  await gravarDocumentos([['catalogo', lista]], { silencioso });

  const rotulos = {
    nome: exerciciosLogica.nomeVisivel(alvo.nome),
    tipo: alvo.tipo,
    grupoPrincipal: alvo.grupoPrincipal,
    grupoSecundario: alvo.grupoSecundario,
    unilateral: alvo.unilateral,
  };
  const abertas = sessoesAbertas()
    .filter((s) => (s.exercicios ?? []).some((e) => e.exercicioId === id));

  await espelharNasAbertas(abertas, (sessao) => {
    for (const exercicio of sessao.exercicios) {
      if (exercicio.exercicioId === id) Object.assign(exercicio, rotulos);
    }
  });

  return { exercicio: clonar(alvo), sessoesAlcancadas: abertas.length };
}

/** Excluir do catálogo é tirar da lista, não apagar.
 *
 *  O documento continua guardado inteiro, e é isso que faz um treino que ainda
 *  usa o exercício continuar mostrando o nome dele, e um treino já registrado
 *  continuar fazendo sentido. Quem lê o catálogo para mostrar um treino
 *  (`montarVisaoDoExercicio`) lê a lista completa de propósito: exercício
 *  excluído do catálogo não pode virar "Exercício sem nome" numa rotina. */
export async function excluirExercicioDoCatalogo(id) {
  return comDesfazer(async () => {
    const lista = catalogo();
    const alvo = lista.find((e) => e.id === id);
    if (!alvo) throw new Error('não achei esse exercício');

    alvo.arquivado = true;
    alvo.arquivadoEm = agoraISO();
    await gravarDocumentos([['catalogo', lista]]);
    return clonar(alvo);
  }, (alvo) => ({
    frase: `excluir o exercício "${exerciciosLogica.nomeVisivel(alvo.nome)}" do catálogo`,
    chave: null,
  }));
}

export async function trazerExercicioDeVolta(id) {
  return comDesfazer(async () => {
    const lista = catalogo();
    const alvo = lista.find((e) => e.id === id);
    if (!alvo) throw new Error('não achei esse exercício');

    alvo.arquivado = false;
    alvo.arquivadoEm = null;
    await gravarDocumentos([['catalogo', lista]]);
    return clonar(alvo);
  }, (alvo) => ({
    frase: `trazer "${exerciciosLogica.nomeVisivel(alvo.nome)}" de volta ao catálogo`,
    chave: null,
  }));
}

// ------------------------------------------- a prescrição dentro do treino

/** Os exercícios de uma sessão que nasceram deste exercício da rotina. */
function exerciciosDaSessaoDe(sessao, exercicioDaRotinaId) {
  return (sessao.exercicios ?? []).filter((e) => e.rotinaExercicioId === exercicioDaRotinaId);
}

const seriesEmOrdem = (exercicio) => [...exercicio.series].sort(rotinasLogica.porOrdem);

/** Nada preenchido e nada marcado neste exercício da sessão. É a pergunta que
 *  decide se dá para tirar o exercício do treino de hoje ou se o que já foi
 *  feito tem que continuar lá. */
function exercicioIntocado(exercicioDaSessao) {
  return (exercicioDaSessao.series ?? []).every(sessoesLogica.serieEmBranco);
}

function renumerarSessao(sessao) {
  sessao.exercicios.forEach((exercicio, posicao) => { exercicio.ordem = posicao; });
}

/** Muda faixa de reps, descanso ou a anotação deste exercício neste treino.
 *
 *  Na sessão aberta, a faixa nova vale para as séries que ainda não foram
 *  concluídas. As já concluídas guardam a faixa que valia na hora em que ele as
 *  fez: mudar isso seria reescrever o alvo depois do tiro. */
export async function editarExercicioDaRotina(rotinaId, exercicioDaRotinaId, mudancas, { silencioso = false } = {}) {
  const campos = Object.keys(exerciciosLogica.CAMPOS_DO_EXERCICIO_DA_ROTINA)
    .filter((campo) => campo in mudancas);

  return comDesfazer(
    () => mudarExercicioDaRotina(rotinaId, exercicioDaRotinaId, mudancas, { silencioso }),
    (feito) => ({
      frase: `mudar ${rotuloDosCampos(campos)} de "${nomeDoExercicio(feito.exercicio.exercicioId)}"`,
      chave: `exercicio:${exercicioDaRotinaId}:${campos.join(',')}`,
    }));
}

/** Os campos da prescrição em português, para a frase de desfazer. */
function rotuloDosCampos(campos) {
  const nomes = {
    repMin: 'a faixa de reps',
    repMax: 'a faixa de reps',
    descansoSegundos: 'o descanso',
    notas: 'a anotação',
  };
  const escolhidos = [...new Set(campos.map((campo) => nomes[campo] ?? 'a prescrição'))];
  return escolhidos.length === 1 ? escolhidos[0] : 'a prescrição';
}

async function mudarExercicioDaRotina(rotinaId, exercicioDaRotinaId, mudancas, { silencioso = false } = {}) {
  const alterado = await mexerNaRotina(rotinaId, (rotina) => {
    const alvo = acharExercicio(rotina, exercicioDaRotinaId);
    for (const [campo, arrumar] of Object.entries(exerciciosLogica.CAMPOS_DO_EXERCICIO_DA_ROTINA)) {
      if (campo in mudancas) alvo[campo] = arrumar(mudancas[campo]);
    }
    return clonar(alvo);
  });

  const mexeNaFaixa = 'repMin' in mudancas || 'repMax' in mudancas;

  const abertas = sessoesAbertas().filter((s) => s.rotinaId === rotinaId
    && exerciciosDaSessaoDe(s, exercicioDaRotinaId).length > 0);

  await espelharNasAbertas(abertas, (sessao) => {
    for (const exercicio of exerciciosDaSessaoDe(sessao, exercicioDaRotinaId)) {
      if ('repMin' in mudancas) exercicio.repMin = alterado.repMin;
      if ('repMax' in mudancas) exercicio.repMax = alterado.repMax;
      if ('descansoSegundos' in mudancas) exercicio.descansoSegundos = alterado.descansoSegundos;
      if (!mexeNaFaixa) continue;

      for (const serie of exercicio.series) {
        if (serie.concluida) continue;
        if ('repMin' in mudancas) serie.repMin = alterado.repMin;
        if ('repMax' in mudancas) serie.repMax = alterado.repMax;
      }
    }
  });

  if (!silencioso) avisar();
  return { exercicio: alterado, sessoesAlcancadas: abertas.length };
}

/** As séries de um exercício da sessão separadas em duas listas.
 *
 *  As extras (M6) ficam de fora de toda conta de plano. Elas foram uma decisão
 *  do dia — ele resolveu fazer uma a mais depois de já ter começado —, e uma
 *  edição de estrutura não desfaz isso. Elas também ficam sempre no fim, que é
 *  onde nasceram. */
function separarExtras(exercicio) {
  const series = seriesEmOrdem(exercicio);
  return {
    doPlano: series.filter((s) => !sessoesLogica.ehExtra(s)),
    extras: series.filter(sessoesLogica.ehExtra),
  };
}

function renumerarSeries(exercicio, series) {
  series.forEach((serie, posicao) => { serie.ordem = posicao; });
  exercicio.series = series;
}

/** Leva para dentro das sessões abertas o que uma edição de prescrição mudou:
 *  quantas séries o exercício tem, a faixa de reps e o descanso.
 *
 *  É o único caminho pelo qual mudar o plano alcança o treino de hoje, e ele
 *  obedece a quatro regras, todas verificáveis aqui embaixo:
 *
 *  1. **Quantas séries valem é a conta da semana daquela sessão**, não a de
 *     hoje: a sessão pode ter começado em outra semana do bloco.
 *  2. **Série só sai se estiver em branco.** Série com carga, reps ou RIR real
 *     preenchido é coisa que ele fez, e nenhuma edição de estrutura apaga isso.
 *     O que não coube fica, e a tela diz quantas ficaram.
 *  3. **`rirProgramado` de série que já nasceu não é recalculado nunca.** Série
 *     que entra agora nasce com o RIR da semana daquela sessão, congelado na
 *     hora, como toda série de sessão.
 *  4. **A faixa nova não alcança série concluída.** A série guarda a faixa que
 *     valia quando ele a fez; reescrever isso seria mudar o alvo depois do
 *     tiro.
 *
 *  E as séries extras ficam de fora da conta de quantidade: elas foram decisão
 *  do dia, e mudar o plano não desfaz o que ele já fez a mais hoje. A faixa
 *  nova alcança elas, porque elas também são séries de hoje que ainda não
 *  foram feitas.
 *
 *  `quantidade` só vem ligado quando a quantidade de séries do plano mudou de
 *  verdade. Sem esse cuidado, mudar só a faixa de reps devolveria ao treino de
 *  hoje uma série que ele tinha acabado de tirar dele — pela conta, faltaria
 *  uma para bater com o plano. */
async function espelharPrescricaoNasAbertas(rotinaId, exercicioDaRotinaId, exercicioAlterado, { quantidade = true, faixa = false, descanso = false } = {}) {
  const p = estado.documentos.periodizacao;
  const doCatalogo = exercicioDoCatalogo(exercicioAlterado.exercicioId) ?? {};
  const total = exercicioAlterado.series.length;

  const abertas = sessoesAbertas().filter((s) => s.rotinaId === rotinaId
    && exerciciosDaSessaoDe(s, exercicioDaRotinaId).length > 0);

  let entraram = 0;
  let sairam = 0;
  let presas = 0;

  await espelharNasAbertas(abertas, (sessao) => {
    for (const exercicio of exerciciosDaSessaoDe(sessao, exercicioDaRotinaId)) {
      if (faixa) {
        exercicio.repMin = exercicioAlterado.repMin ?? null;
        exercicio.repMax = exercicioAlterado.repMax ?? null;
      }
      if (descanso) exercicio.descansoSegundos = exercicioAlterado.descansoSegundos ?? null;

      const alvoNaSemana = periodizacao.seriesNaSemana(p, sessao.semana, total);
      const { doPlano, extras } = separarExtras(exercicio);
      const tipo = exercicio.tipo ?? doCatalogo.tipo ?? 'composto';

      if (quantidade) {
        // Série que entra agora nasce com a carga sugerida da semana daquela
        // sessão, igual ao RIR: os dois são conta feita uma vez, no
        // nascimento. Montado aqui dentro porque só serve para série nova —
        // mudar faixa ou descanso não faz nascer nenhuma.
        const sugerir = sugeridorDeCarga({
          rotinaExercicioId: exercicioDaRotinaId,
          exercicioId: exercicioAlterado.exercicioId,
          numeroSemana: sessao.semana,
        });

        while (doPlano.length > alvoNaSemana) {
          if (!sessoesLogica.serieEmBranco(doPlano[doPlano.length - 1])) {
            presas += doPlano.length - alvoNaSemana;
            break;
          }
          doPlano.pop();
          sairam += 1;
        }

        while (doPlano.length < alvoNaSemana) {
          const indice = doPlano.length;
          doPlano.push(sessoesLogica.montarSerieDaSessao({
            repMin: exercicioAlterado.repMin ?? null,
            repMax: exercicioAlterado.repMax ?? null,
            rirProgramado: periodizacao.rirDaSerie(p, sessao.semana, indice, tipo, total),
            sugestao: sugerir(exercicioAlterado.series?.[indice] ?? null, indice),
          }, indice));
          entraram += 1;
        }
      }

      const todas = [...doPlano, ...extras];

      if (faixa) {
        for (const serie of todas) {
          if (serie.concluida) continue;
          serie.repMin = exercicioAlterado.repMin ?? null;
          serie.repMax = exercicioAlterado.repMax ?? null;
        }
      }

      renumerarSeries(exercicio, todas);
    }
  });

  return { sessoesAlcancadas: abertas.length, entraram, sairam, presas };
}

/** O que uma mudança de quantidade de séries faria com os treinos em andamento,
 *  sem mudar nada. É o que a edição em massa mostra antes de aplicar.
 *
 *  A conta é a mesma de `espelharPrescricaoNasAbertas`, na mesma ordem, para o
 *  número que a tela promete ser o número que acontece. */
function contarEfeitoNasAbertas(rotinaId, exercicioDaRotinaId, novoTotal) {
  const p = estado.documentos.periodizacao;
  let sessoes = 0;
  let entram = 0;
  let saem = 0;
  let presas = 0;
  let concluidas = 0;

  for (const sessao of sessoesAbertas().filter((s) => s.rotinaId === rotinaId)) {
    const meus = exerciciosDaSessaoDe(sessao, exercicioDaRotinaId);
    if (meus.length === 0) continue;
    sessoes += 1;

    for (const exercicio of meus) {
      const { doPlano } = separarExtras(exercicio);
      concluidas += doPlano.filter((s) => s.concluida).length;

      const alvoNaSemana = periodizacao.seriesNaSemana(p, sessao.semana, novoTotal);
      let quantas = doPlano.length;
      while (quantas > alvoNaSemana && sessoesLogica.serieEmBranco(doPlano[quantas - 1])) {
        quantas -= 1;
        saem += 1;
      }
      if (quantas > alvoNaSemana) presas += quantas - alvoNaSemana;
      if (quantas < alvoNaSemana) entram += alvoNaSemana - quantas;
    }
  }

  return { sessoes, entram, saem, presas, concluidas };
}

/** Muda quantas séries planejadas o exercício tem.
 *
 *  Na estrutura é direto: séries novas entram no fim e seguem a periodização,
 *  então o RIR programado da semana já vale para elas. Na sessão aberta quem
 *  manda é `espelharPrescricaoNasAbertas`, logo acima. */
export async function definirQuantidadeDeSeries(rotinaId, exercicioDaRotinaId, quantidade, { silencioso = false } = {}) {
  return comDesfazer(async () => {
    const alterado = await mexerNaRotina(rotinaId, (rotina) => {
      const alvo = acharExercicio(rotina, exercicioDaRotinaId);
      const antes = alvo.series.length;
      alvo.series = exerciciosLogica.ajustarSeries(alvo, quantidade).series;
      return { antes, depois: alvo.series.length, exercicio: clonar(alvo) };
    });

    const naSessao = await espelharPrescricaoNasAbertas(
      rotinaId, exercicioDaRotinaId, alterado.exercicio);

    if (!silencioso) avisar();
    return { ...alterado, ...naSessao };
  }, (feito) => ({
    frase: `deixar "${nomeDoExercicio(feito.exercicio.exercicioId)}" com ${feito.depois} séries`,
    chave: `exercicio:${exercicioDaRotinaId}:quantidade`,
  }));
}

// ----------------------------------------------------- a série, uma por uma

// A M6 abriu a série. Até aqui a série planejada só existia em bloco — o
// contador de séries do exercício — e a série da sessão só se editava nos
// campos que a tela do treino desenha. Agora cada uma se edita, entra e sai
// sozinha, e o bloco inteiro se edita de uma vez.
//
// Duas coisas que valem estar escritas antes do código:
//
// **Série planejada e série executada não têm vínculo gravado.** O que liga uma
// à outra é a posição, e isso é escolha, não esquecimento: na semana de deload a
// sessão nasce com menos séries que o plano, e uma série extra nasce sem par
// nenhum do lado do plano. Guardar um `serieId` dentro da sessão daria a ilusão
// de um vínculo que a própria periodização desfaz toda semana leve.
//
// **Excluir série planejada apaga de verdade**, e é a única exclusão do app que
// faz isso. Treino e exercício viram arquivo porque as sessões guardam
// `rotinaId` e `rotinaExercicioId`; nenhuma sessão guarda identificador de série
// planejada, então tirar uma série do plano não deixa histórico órfão nem tira
// caminho de volta de ninguém. O contador de séries já apagava assim desde a M5
// — o que a M6 acrescenta é a confirmação quando tem valor dentro.

function acharSeriePlanejada(exercicio, serieId) {
  const achada = (exercicio.series ?? []).find((s) => s.id === serieId);
  if (!achada) throw new Error('não achei essa série no treino');
  return achada;
}

function exigirMaisDeUmaSerie(quantas) {
  if (quantas <= 1) {
    throw new Error('um exercício precisa de pelo menos uma série. Para tirar o exercício inteiro, use "Tirar do treino"');
  }
}

/** Muda um campo de uma série planejada: carga alvo, faixa de reps só dela, RIR
 *  fixo e a anotação.
 *
 *  Da faixa, a regra é a mesma do exercício inteiro: a faixa nova alcança a
 *  série da mesma posição no treino de hoje, e só se ela ainda não tiver sido
 *  concluída.
 *
 *  O RIR **não** atravessa, e isso é decisão de desenho: `rirProgramado` da
 *  sessão está congelado desde o nascimento dela, e `rirUsado` é o alvo que ele
 *  escolheu para hoje, com um toque, na tela do treino. Reescrever o alvo de
 *  hoje a partir do plano apagaria uma escolha que ele fez de pé, na academia. */
export async function editarSeriePlanejada(rotinaId, exercicioDaRotinaId, serieId, mudancas, { silencioso = false } = {}) {
  const campos = Object.keys(exerciciosLogica.CAMPOS_DA_SERIE_PLANEJADA)
    .filter((campo) => campo in mudancas);

  return comDesfazer(
    () => mudarSeriePlanejada(rotinaId, exercicioDaRotinaId, serieId, mudancas, { silencioso }),
    (feito) => ({
      frase: `mudar a ${feito.posicao + 1}ª série de "${nomeDoExercicio(feito.exercicio.exercicioId)}"`,
      chave: `serie:${serieId}:${campos.join(',')}`,
    }));
}

async function mudarSeriePlanejada(rotinaId, exercicioDaRotinaId, serieId, mudancas, { silencioso = false } = {}) {
  const alterada = await mexerNaRotina(rotinaId, (rotina) => {
    const exercicio = acharExercicio(rotina, exercicioDaRotinaId);
    const serie = acharSeriePlanejada(exercicio, serieId);

    for (const [campo, arrumar] of Object.entries(exerciciosLogica.CAMPOS_DA_SERIE_PLANEJADA)) {
      if (campo in mudancas) serie[campo] = arrumar(mudancas[campo]);
    }

    return {
      serie: clonar(serie),
      posicao: rotinasLogica.ordenar(exercicio.series).findIndex((s) => s.id === serieId),
      exercicio: clonar(exercicio),
    };
  });

  const mexeNaFaixa = 'repMin' in mudancas || 'repMax' in mudancas;
  const abertas = mexeNaFaixa
    ? sessoesAbertas().filter((s) => s.rotinaId === rotinaId
      && exerciciosDaSessaoDe(s, exercicioDaRotinaId).length > 0)
    : [];

  let seriesAlcancadas = 0;

  await espelharNasAbertas(abertas, (sessao) => {
    for (const exercicio of exerciciosDaSessaoDe(sessao, exercicioDaRotinaId)) {
      const naMesmaPosicao = separarExtras(exercicio).doPlano[alterada.posicao];
      if (!naMesmaPosicao || naMesmaPosicao.concluida) continue;

      if ('repMin' in mudancas) {
        naMesmaPosicao.repMin = alterada.serie.repMin ?? alterada.exercicio.repMin ?? null;
      }
      if ('repMax' in mudancas) {
        naMesmaPosicao.repMax = alterada.serie.repMax ?? alterada.exercicio.repMax ?? null;
      }
      seriesAlcancadas += 1;
    }
  });

  if (!silencioso) avisar();
  return { ...alterada, sessoesAlcancadas: abertas.length, seriesAlcancadas };
}

/** Acrescenta uma série planejada no fim do exercício.
 *
 *  Ela nasce seguindo a periodização (`rirManual: null`) e herdando a faixa do
 *  exercício, então o RIR programado da semana já vale para ela sem ninguém
 *  digitar nada. No treino de hoje ela entra pela conta da semana daquela
 *  sessão, igual a qualquer mudança de quantidade. */
export async function adicionarSeriePlanejada(rotinaId, exercicioDaRotinaId, { silencioso = false } = {}) {
  return comDesfazer(async () => {
    const feito = await mexerNaRotina(rotinaId, (rotina) => {
      const exercicio = acharExercicio(rotina, exercicioDaRotinaId);
      const { series, nova } = exerciciosLogica.comSerieNova(exercicio);
      exercicio.series = series;
      return { nova: clonar(nova), total: series.length, exercicio: clonar(exercicio) };
    });

    const naSessao = await espelharPrescricaoNasAbertas(
      rotinaId, exercicioDaRotinaId, feito.exercicio);

    if (!silencioso) avisar();
    return { ...feito, ...naSessao };
  }, (feito) => ({
    frase: `acrescentar a ${feito.total}ª série em "${nomeDoExercicio(feito.exercicio.exercicioId)}"`,
    chave: null,
  }));
}

/** O que excluir esta série planejada vai encontrar pela frente, sem mudar
 *  nada. É o que a confirmação mostra, para o aviso falar de coisa concreta em
 *  vez de um "tem certeza?". */
export function previaDeExcluirSeriePlanejada(rotinaId, exercicioDaRotinaId, serieId) {
  const rotina = todasAsRotinas().find((r) => r.id === rotinaId);
  const exercicio = (rotina?.exercicios ?? []).find((e) => e.id === exercicioDaRotinaId);
  if (!exercicio) throw new Error('não achei esse exercício no treino');

  const series = rotinasLogica.ordenar(exercicio.series ?? []);
  const posicao = series.findIndex((s) => s.id === serieId);
  if (posicao < 0) throw new Error('não achei essa série no treino');

  let preenchidaHoje = 0;
  let saiDeHoje = 0;

  for (const sessao of sessoesAbertas().filter((s) => s.rotinaId === rotinaId)) {
    for (const daSessao of exerciciosDaSessaoDe(sessao, exercicioDaRotinaId)) {
      const alvo = separarExtras(daSessao).doPlano[posicao];
      if (!alvo) continue;
      if (sessoesLogica.serieEmBranco(alvo)) saiDeHoje += 1;
      else preenchidaHoje += 1;
    }
  }

  return {
    numero: posicao + 1,
    total: series.length,
    comValor: exerciciosLogica.seriePlanejadaComValor(series[posicao]),
    preenchidaHoje,
    saiDeHoje,
  };
}

/** Tira uma série planejada do exercício.
 *
 *  No treino de hoje sai a série da mesma posição, e só se ela estiver em
 *  branco: série com carga, reps ou RIR real preenchido é trabalho feito e
 *  continua lá até ele finalizar. Nenhum treino já registrado é lido ou escrito
 *  aqui. */
export async function excluirSeriePlanejada(rotinaId, exercicioDaRotinaId, serieId, { silencioso = false } = {}) {
  return comDesfazer(
    () => tirarSeriePlanejada(rotinaId, exercicioDaRotinaId, serieId, { silencioso }),
    (feito) => ({
      frase: `tirar a ${feito.posicao + 1}ª série de "${nomeDoExercicio(feito.exercicio.exercicioId)}"`,
      chave: null,
    }));
}

async function tirarSeriePlanejada(rotinaId, exercicioDaRotinaId, serieId, { silencioso = false } = {}) {
  const feito = await mexerNaRotina(rotinaId, (rotina) => {
    const exercicio = acharExercicio(rotina, exercicioDaRotinaId);
    exigirMaisDeUmaSerie((exercicio.series ?? []).length);
    const { series, removida, posicao } = exerciciosLogica.semASerie(exercicio, serieId);
    exercicio.series = series;
    return { removida: clonar(removida), posicao, total: series.length, exercicio: clonar(exercicio) };
  });

  const abertas = sessoesAbertas().filter((s) => s.rotinaId === rotinaId
    && exerciciosDaSessaoDe(s, exercicioDaRotinaId).length > 0);

  let saiuDeHoje = 0;
  let ficouEmHoje = 0;

  await espelharNasAbertas(abertas, (sessao) => {
    for (const exercicio of exerciciosDaSessaoDe(sessao, exercicioDaRotinaId)) {
      const { doPlano, extras } = separarExtras(exercicio);
      const alvo = doPlano[feito.posicao];
      if (!alvo) continue;

      if (!sessoesLogica.serieEmBranco(alvo)) {
        ficouEmHoje += 1;
        continue;
      }
      renumerarSeries(exercicio, [...doPlano.filter((s) => s !== alvo), ...extras]);
      saiuDeHoje += 1;
    }
  });

  if (!silencioso) avisar();
  return { ...feito, sessoesAlcancadas: abertas.length, saiuDeHoje, ficouEmHoje };
}

// ------------------------------------------------- a série do treino de hoje

/** Acrescenta uma série ao treino que está acontecendo agora, e só a ele.
 *
 *  Esta é a série extra: ele decidiu, de pé, fazer uma a mais. Ela entra no
 *  histórico como parte da sessão, marcada como fora do planejado, e não muda
 *  nem o treino das próximas semanas nem a periodização do bloco — nada aqui
 *  escreve em `rotinas` nem em `periodizacao`.
 *
 *  O RIR dela é sugestão, não trava (regra 4 do CONTEXTO): sai da periodização
 *  da semana **daquela sessão**, congela em `rirProgramado` como toda série de
 *  sessão, e nasce em `rirUsado` para ele mudar com um toque. As séries que já
 *  existiam continuam com o RIR que já tinham: nada é recalculado. */
export async function adicionarSerieNaSessao(sessaoId, exercicioDaSessaoId) {
  const p = estado.documentos.periodizacao;
  let criada = null;

  await mexerNaSessao(sessaoId, (sessao) => {
    exigirAberta(sessao);
    const exercicio = (sessao.exercicios ?? []).find((e) => e.id === exercicioDaSessaoId);
    if (!exercicio) throw new Error('não achei esse exercício no treino de hoje');

    const series = seriesEmOrdem(exercicio);
    const indice = series.length;

    const nova = sessoesLogica.montarSerieExtra({
      repMin: exercicio.repMin ?? null,
      repMax: exercicio.repMax ?? null,
      rirProgramado: periodizacao.rirDaSerie(
        p, sessao.semana, indice, exercicio.tipo ?? 'composto', indice + 1),
      // A carga da série extra também é sugerida, pela mesma conta das outras:
      // ela nasce na posição em que entrou, e a base é o que ele já registrou
      // neste exercício. Sem base, campo em branco.
      sugestao: sugeridorDeCarga({
        rotinaExercicioId: exercicio.rotinaExercicioId ?? null,
        exercicioId: exercicio.exercicioId ?? null,
        numeroSemana: sessao.semana,
      })(null, indice),
    }, indice);

    renumerarSeries(exercicio, [...series, nova]);
    criada = clonar(nova);
  });

  return criada;
}

/** Tira uma série do treino que está acontecendo agora.
 *
 *  Vale para qualquer série da sessão, extra ou não — e é por isso que quem
 *  chama pergunta antes quando tem valor dentro. Só alcança sessão aberta:
 *  `mexerNaSessao` com `exigirAberta` é o mesmo portão de sempre, e treino já
 *  finalizado não tem caminho de código que chegue nele. */
export async function excluirSerieDaSessao(sessaoId, exercicioDaSessaoId, serieId) {
  await mexerNaSessao(sessaoId, (sessao) => {
    exigirAberta(sessao);
    const exercicio = (sessao.exercicios ?? []).find((e) => e.id === exercicioDaSessaoId);
    if (!exercicio) throw new Error('não achei esse exercício no treino de hoje');

    const series = seriesEmOrdem(exercicio);
    exigirMaisDeUmaSerie(series.length);

    const restantes = series.filter((s) => s.id !== serieId);
    if (restantes.length === series.length) throw new Error('não achei essa série');
    renumerarSeries(exercicio, restantes);
  });
}

// ------------------------------------------------------- a edição em massa

/** O que a edição em massa vai fazer, dita antes de fazer.
 *
 *  Esta é a função que a missão pediu em primeiro lugar, e ela é read-only de
 *  propósito: a tela chama a cada toque enquanto ele monta a mudança, e o botão
 *  de aplicar só aparece embaixo de uma frase que já contou o que vai
 *  acontecer. O risco desta ação é apagar em silêncio coisa que ele já
 *  preencheu; a resposta do app é nunca ficar em silêncio. */
export function previaDaEdicaoEmMassa(rotinaId, exercicioDaRotinaId, alvo) {
  const rotina = todasAsRotinas().find((r) => r.id === rotinaId);
  const exercicio = (rotina?.exercicios ?? []).find((e) => e.id === exercicioDaRotinaId);
  if (!exercicio) throw new Error('não achei esse exercício no treino');

  const series = rotinasLogica.ordenar(exercicio.series ?? []);
  const antes = series.length;
  const depois = 'series' in alvo ? Math.max(1, Math.trunc(Number(alvo.series) || 1)) : antes;

  const removidas = series.slice(depois);
  const ficam = series.slice(0, depois);
  const temFaixaPropria = (s) => (s.repMin !== null && s.repMin !== undefined)
    || (s.repMax !== null && s.repMax !== undefined);

  return {
    antes,
    depois,
    removidas: removidas.length,
    removidasComValor: removidas.filter(exerciciosLogica.seriePlanejadaComValor).length,
    faixasProprias: 'repMin' in alvo || 'repMax' in alvo ? ficam.filter(temFaixaPropria).length : 0,
    rirFixados: 'rirManual' in alvo
      ? ficam.filter((s) => s.rirManual !== null && s.rirManual !== undefined).length
      : 0,
    naSessao: contarEfeitoNasAbertas(rotinaId, exercicioDaRotinaId, depois),
  };
}

/** Muda o exercício inteiro de uma vez: quantas séries, a faixa de reps e, se
 *  ele pedir, o descanso e o RIR.
 *
 *  Três garantias, e as três estão no código logo abaixo:
 *
 *  1. **Nenhuma série já executada muda.** Sessão finalizada não é lida nem
 *     escrita aqui, e na sessão aberta a faixa nova pula as séries concluídas.
 *  2. **`rirProgramado` de sessão não é tocado.** O RIR desta tela grava
 *     `rirManual` na série *planejada*; a sessão continua com o número que
 *     congelou no dia em que nasceu.
 *  3. **Reduzir tira do fim.** É a única ponta em que cortar não muda o
 *     significado das outras: a primeira série continua sendo a primeira. E
 *     quem chama já contou, antes, se alguma das que saem tinha valor dentro.
 *
 *  A faixa em massa limpa a faixa própria de cada série de propósito: "todas as
 *  séries de 6 a 10" só é verdade se a série que tinha faixa própria voltar a
 *  seguir a do exercício. A prévia diz quantas são antes de aplicar. */
export async function editarSeriesDoExercicio(rotinaId, exercicioDaRotinaId, alvo, { silencioso = false } = {}) {
  return comDesfazer(
    () => mudarSeriesDoExercicio(rotinaId, exercicioDaRotinaId, alvo, { silencioso }),
    (feito) => ({
      frase: `a edição em massa das séries de "${nomeDoExercicio(feito.exercicio.exercicioId)}"`,
      chave: null,
    }));
}

async function mudarSeriesDoExercicio(rotinaId, exercicioDaRotinaId, alvo, { silencioso = false } = {}) {
  const mexeNaFaixa = 'repMin' in alvo || 'repMax' in alvo;
  const mexeNoDescanso = 'descansoSegundos' in alvo;

  const alterado = await mexerNaRotina(rotinaId, (rotina) => {
    const exercicio = acharExercicio(rotina, exercicioDaRotinaId);
    const antes = (exercicio.series ?? []).length;

    for (const campo of ['repMin', 'repMax', 'descansoSegundos']) {
      if (campo in alvo) {
        exercicio[campo] = exerciciosLogica.CAMPOS_DO_EXERCICIO_DA_ROTINA[campo](alvo[campo]);
      }
    }

    const series = 'series' in alvo
      ? exerciciosLogica.ajustarSeries(
        exercicio, Math.max(1, Math.trunc(Number(alvo.series) || 1))).series
      : rotinasLogica.ordenar(exercicio.series ?? []);

    for (const serie of series) {
      if ('repMin' in alvo) serie.repMin = null;
      if ('repMax' in alvo) serie.repMax = null;
      if ('rirManual' in alvo) {
        serie.rirManual = exerciciosLogica.CAMPOS_DA_SERIE_PLANEJADA.rirManual(alvo.rirManual);
      }
    }

    exercicio.series = rotinasLogica.renumerar(series);
    return { antes, depois: series.length, exercicio: clonar(exercicio) };
  });

  const naSessao = await espelharPrescricaoNasAbertas(
    rotinaId, exercicioDaRotinaId, alterado.exercicio,
    { quantidade: alterado.antes !== alterado.depois, faixa: mexeNaFaixa, descanso: mexeNoDescanso });

  if (!silencioso) avisar();
  return { ...alterado, ...naSessao };
}

/** A prescrição que um exercício novo herda: a do vizinho de onde ele entra.
 *
 *  Nenhum número de treino nasce escrito no código. Num treino que já tem
 *  exercício, o novo entra com a faixa, o descanso e a quantidade de séries do
 *  vizinho, que é o palpite mais perto de certo e é editável na mesma tela. Num
 *  treino vazio não há de quem herdar: aí a quantidade de séries vem do tamanho
 *  da lista de RIR da semana (a periodização é dado, não código) e a faixa e o
 *  descanso ficam em branco, para a tela pedir. */
function prescricaoHerdada(rotina, vizinhoId = null) {
  const daTela = exerciciosLogica.visiveis(rotina.exercicios ?? []);
  const vizinho = daTela.find((e) => e.id === vizinhoId) ?? daTela[daTela.length - 1] ?? null;

  if (vizinho) {
    return {
      series: vizinho.series.length,
      repMin: vizinho.repMin ?? null,
      repMax: vizinho.repMax ?? null,
      descansoSegundos: vizinho.descansoSegundos ?? null,
      herdadaDe: vizinho.id,
    };
  }

  const daSemana = periodizacao.rirBaseDaSemana(
    estado.documentos.periodizacao, visaoDaSemana().numero).length;

  return {
    series: Math.max(1, daSemana),
    repMin: null,
    repMax: null,
    descansoSegundos: null,
    herdadaDe: null,
  };
}

/** Põe o exercício da rotina dentro da sessão aberta, no lugar certo.
 *
 *  A sessão sempre nasce e cresce com cópia: o exercício entra com nome, tipo,
 *  grupos, faixa e descanso copiados, e cada série entra com o RIR programado
 *  da semana daquela sessão congelado. Depois disso ele não olha mais para a
 *  rotina. */
function entrarNaSessao(sessao, exercicioDaRotina, depoisDe = null) {
  const p = estado.documentos.periodizacao;
  const doCatalogo = exercicioDoCatalogo(exercicioDaRotina.exercicioId);
  const visao = montarVisaoDoExercicio(exercicioDaRotina, doCatalogo, p, sessao.semana,
    sugeridorDeCarga({
      rotinaExercicioId: exercicioDaRotina.id,
      exercicioId: exercicioDaRotina.exercicioId,
      numeroSemana: sessao.semana,
    }));
  const novo = sessoesLogica.montarExercicioDaSessao(visao, 0);

  const posicao = depoisDe === null
    ? -1
    : sessao.exercicios.findIndex((e) => e.rotinaExercicioId === depoisDe);

  if (posicao < 0) sessao.exercicios.push(novo);
  else sessao.exercicios.splice(posicao + 1, 0, novo);

  renumerarSessao(sessao);
  return novo;
}

/** Acrescenta um exercício ao treino, do catálogo. */
export async function adicionarExercicioNaRotina(rotinaId, exercicioId, { depoisDe = null } = {}) {
  if (!exercicioDoCatalogo(exercicioId)) throw new Error('não achei esse exercício no catálogo');

  return comDesfazer(
    () => porExercicioNaRotina(rotinaId, exercicioId, { depoisDe }),
    () => ({
      frase: `acrescentar "${nomeDoExercicio(exercicioId)}" em "${nomeDaRotina(rotinaId)}"`,
      chave: null,
    }));
}

async function porExercicioNaRotina(rotinaId, exercicioId, { depoisDe = null } = {}) {
  const novo = await mexerNaRotina(rotinaId, (rotina) => {
    const herdada = prescricaoHerdada(rotina, depoisDe);
    const criado = exerciciosLogica.exercicioDaRotina({
      exercicioId,
      series: herdada.series,
      repMin: herdada.repMin,
      repMax: herdada.repMax,
      descansoSegundos: herdada.descansoSegundos,
    });

    const daTela = exerciciosLogica.visiveis(rotina.exercicios ?? []);
    const posicao = depoisDe === null ? -1 : daTela.findIndex((e) => e.id === depoisDe);
    const lista = [...daTela];
    if (posicao < 0) lista.push(criado);
    else lista.splice(posicao + 1, 0, criado);

    rotina.exercicios = exerciciosLogica.renumerarVisiveis(
      [...lista, ...exerciciosLogica.arquivados(rotina.exercicios ?? [])]);
    return { criado: clonar(criado), herdadaDe: herdada.herdadaDe };
  });

  const abertas = sessoesAbertas().filter((s) => s.rotinaId === rotinaId);
  await espelharNasAbertas(abertas, (sessao) => {
    entrarNaSessao(sessao, novo.criado, depoisDe);
  });

  avisar();
  return { ...novo, sessoesAlcancadas: abertas.length };
}

/** Copia um exercício dentro do mesmo treino, logo abaixo do original, com a
 *  mesma prescrição e identificadores novos. */
export async function duplicarExercicioDaRotina(rotinaId, exercicioDaRotinaId, { silencioso = false } = {}) {
  return comDesfazer(
    () => copiarExercicioDaRotina(rotinaId, exercicioDaRotinaId, { silencioso }),
    (feito) => ({
      frase: `duplicar "${nomeDoExercicio(feito.copia.exercicioId)}" dentro de "${nomeDaRotina(rotinaId)}"`,
      chave: null,
    }));
}

async function copiarExercicioDaRotina(rotinaId, exercicioDaRotinaId, { silencioso = false } = {}) {
  const copia = await mexerNaRotina(rotinaId, (rotina) => {
    const original = acharExercicio(rotina, exercicioDaRotinaId);
    const nova = exerciciosLogica.duplicarExercicio(original);

    const daTela = exerciciosLogica.visiveis(rotina.exercicios);
    const posicao = daTela.findIndex((e) => e.id === exercicioDaRotinaId);
    daTela.splice(posicao + 1, 0, nova);

    rotina.exercicios = exerciciosLogica.renumerarVisiveis(
      [...daTela, ...exerciciosLogica.arquivados(rotina.exercicios)]);
    return clonar(nova);
  });

  const abertas = sessoesAbertas().filter((s) => s.rotinaId === rotinaId);
  await espelharNasAbertas(abertas, (sessao) => {
    entrarNaSessao(sessao, copia, exercicioDaRotinaId);
  });

  if (!silencioso) avisar();
  return { copia, sessoesAlcancadas: abertas.length };
}

/** Tira o exercício do treino.
 *
 *  Na estrutura, marca como excluído e some da tela — o documento continua
 *  guardado, igual ao que a M4 fez com o treino inteiro, para a M9 ter um
 *  caminho de volta.
 *
 *  Na sessão aberta, o exercício só sai se ele ainda não fez nada nele hoje. Se
 *  já tem carga, reps, RIR real ou série marcada, ele fica no treino de hoje
 *  até o fim: o que foi feito, foi feito. A tela diz qual das duas coisas
 *  aconteceu.
 *
 *  Nenhum treino já registrado é lido ou escrito aqui. */
export async function excluirExercicioDaRotina(rotinaId, exercicioDaRotinaId, { silencioso = false } = {}) {
  return comDesfazer(
    () => tirarExercicioDaRotina(rotinaId, exercicioDaRotinaId, { silencioso }),
    (feito) => ({
      frase: `tirar "${nomeDoExercicio(feito.excluido.exercicioId)}" de "${nomeDaRotina(rotinaId)}"`,
      chave: null,
    }));
}

async function tirarExercicioDaRotina(rotinaId, exercicioDaRotinaId, { silencioso = false } = {}) {
  const excluido = await mexerNaRotina(rotinaId, (rotina) => {
    const alvo = acharExercicio(rotina, exercicioDaRotinaId);
    alvo.arquivado = true;
    alvo.arquivadoEm = agoraISO();
    rotina.exercicios = exerciciosLogica.renumerarVisiveis(
      exerciciosLogica.emOrdem(rotina.exercicios));
    return clonar(alvo);
  });

  const abertas = sessoesAbertas().filter((s) => s.rotinaId === rotinaId
    && exerciciosDaSessaoDe(s, exercicioDaRotinaId).length > 0);

  let saiuDeHoje = 0;
  let ficouEmHoje = 0;

  await espelharNasAbertas(abertas, (sessao) => {
    const restantes = [];
    for (const exercicio of sessao.exercicios) {
      const eOAlvo = exercicio.rotinaExercicioId === exercicioDaRotinaId;
      if (eOAlvo && exercicioIntocado(exercicio)) {
        saiuDeHoje += 1;
        continue;
      }
      if (eOAlvo) ficouEmHoje += 1;
      restantes.push(exercicio);
    }
    sessao.exercicios = restantes;
    renumerarSessao(sessao);
  });

  if (!silencioso) avisar();
  return { excluido, sessoesAlcancadas: abertas.length, saiuDeHoje, ficouEmHoje };
}

/** Troca um exercício por outro dentro do treino.
 *
 *  ESTA É A DECISÃO DE DESENHO DA MISSÃO, e ela é conservadora de propósito.
 *
 *  Trocar supino reto por supino na máquina na segunda-feira muda a estrutura
 *  de hoje para frente. O que já foi treinado continua sendo do supino reto,
 *  porque cada sessão guarda dentro de si o nome do exercício que ela executou
 *  e o vínculo `exercicioId` com o exercício do catálogo que foi de fato feito.
 *  Nada aqui lê nem escreve documento de sessão finalizada.
 *
 *  A troca **não reaproveita o mesmo registro de exercício da rotina**: o que
 *  sai é marcado como excluído (guardando em `substituidoPor` quem entrou no
 *  lugar) e o que entra nasce com identificador novo. Isso não é detalhe. Se o
 *  registro fosse reaproveitado, o `rotinaExercicioId` gravado nas sessões
 *  antigas passaria a apontar para um exercício diferente, e a sugestão de
 *  carga da M7 juntaria numa conta só o supino reto de antes e o supino na
 *  máquina de agora. Com identificador novo, os dois históricos não têm por
 *  onde se encontrar: nem pelo catálogo, nem pela rotina.
 *
 *  A prescrição (quantas séries, faixa de reps, descanso) vem junto, porque o
 *  que ele está trocando é o movimento, não o plano — e tudo isso continua
 *  editável na mesma tela. A anotação não vem: ela falava do exercício antigo.
 *
 *  Na sessão aberta, o novo entra no lugar do antigo. O antigo só sai se ele
 *  ainda não tiver feito nada nele hoje; se já fez, as séries feitas continuam
 *  no treino de hoje, com o nome do exercício que ele realmente executou. */
export async function substituirExercicioDaRotina(rotinaId, exercicioDaRotinaId, novoExercicioId, { silencioso = false } = {}) {
  if (!exercicioDoCatalogo(novoExercicioId)) throw new Error('não achei esse exercício no catálogo');

  return comDesfazer(
    () => trocarExercicioDaRotina(rotinaId, exercicioDaRotinaId, novoExercicioId, { silencioso }),
    (feito) => ({
      frase: `trocar "${feito.nomeAntigo}" por "${feito.nomeNovo}" em "${nomeDaRotina(rotinaId)}"`,
      chave: null,
    }));
}

async function trocarExercicioDaRotina(rotinaId, exercicioDaRotinaId, novoExercicioId, { silencioso = false } = {}) {
  const troca = await mexerNaRotina(rotinaId, (rotina) => {
    const saindo = acharExercicio(rotina, exercicioDaRotinaId);

    const entrando = exerciciosLogica.exercicioDaRotina({
      exercicioId: novoExercicioId,
      series: saindo.series.length,
      repMin: saindo.repMin ?? null,
      repMax: saindo.repMax ?? null,
      descansoSegundos: saindo.descansoSegundos ?? null,
    });

    // A posição é lida antes de marcar o antigo como excluído: depois disso
    // ele já não está entre os visíveis, e o novo cairia no começo da lista em
    // vez de entrar no lugar dele.
    const daTela = exerciciosLogica.visiveis(rotina.exercicios);
    const posicao = Math.max(0, daTela.findIndex((e) => e.id === exercicioDaRotinaId));

    saindo.arquivado = true;
    saindo.arquivadoEm = agoraISO();
    saindo.substituidoPor = entrando.id;

    const lista = daTela.filter((e) => e.id !== exercicioDaRotinaId);
    lista.splice(posicao, 0, entrando);

    rotina.exercicios = exerciciosLogica.renumerarVisiveis(
      [...lista, ...exerciciosLogica.arquivados(rotina.exercicios)]);

    return { saindo: clonar(saindo), entrando: clonar(entrando) };
  });

  const abertas = sessoesAbertas().filter((s) => s.rotinaId === rotinaId);
  let saiuDeHoje = 0;
  let ficouEmHoje = 0;

  await espelharNasAbertas(abertas, (sessao) => {
    entrarNaSessao(sessao, troca.entrando, exercicioDaRotinaId);

    const restantes = [];
    for (const exercicio of sessao.exercicios) {
      const eOAntigo = exercicio.rotinaExercicioId === exercicioDaRotinaId;
      if (eOAntigo && exercicioIntocado(exercicio)) {
        saiuDeHoje += 1;
        continue;
      }
      if (eOAntigo) ficouEmHoje += 1;
      restantes.push(exercicio);
    }
    sessao.exercicios = restantes;
    renumerarSessao(sessao);
  });

  if (!silencioso) avisar();
  return {
    ...troca,
    nomeAntigo: nomeDoExercicio(troca.saindo.exercicioId),
    nomeNovo: nomeDoExercicio(novoExercicioId),
    sessoesAlcancadas: abertas.length,
    saiuDeHoje,
    ficouEmHoje,
  };
}

// ------------------- restaurar a configuração original de um treino (M9)
//
// **Restaurar mexe só em estrutura.** As duas funções de escrita deste bloco
// gravam em `rotinas` e, quando um exercício precisa voltar para a lista do
// catálogo, em `catalogo`. Não existe daqui até um documento `sessao:*` nenhum
// caminho de código: nem para sessão registrada, nem para a que está aberta.
//
// A sessão aberta ficar de fora é decisão, não esquecimento. Restaurar troca a
// lista inteira de exercícios de uma vez; levar isso para dentro de um treino
// que está acontecendo agora derrubaria séries que ele já marcou, com carga e
// reps dentro. O treino de hoje termina do jeito que começou, e a configuração
// nova vale do próximo em diante. A confirmação diz isso em uma frase.

/** A configuração de fábrica deste treino, se ele veio da ficha inicial.
 *
 *  `fabrica` é congelada na semeadura com os mesmos identificadores das
 *  rotinas, então achar a de um treino é procurar pelo `id`. Treino criado
 *  depois — do zero ou copiado — não está lá, e é isso que a tela precisa
 *  saber para não oferecer um botão que não tem para onde voltar. */
function referenciaDeFabrica(rotinaId) {
  const daFabrica = (estado.documentos.fabrica?.rotinas ?? []).find((r) => r.id === rotinaId);
  if (!daFabrica) return null;
  return referenciaLogica.deRotina(daFabrica, {
    origem: referenciaLogica.DE_FABRICA,
    marcadaEm: estado.documentos.fabrica?.criadaEm ?? null,
  });
}

/** A referência que o Lucca marcou para este treino, se ele marcou alguma. */
function referenciaMarcada(rotinaId) {
  const guardada = (estado.documentos.rotinas ?? []).find((r) => r.id === rotinaId)?.referencia;
  return guardada ? clonar(guardada) : null;
}

function referenciaPorOrigem(rotinaId, origem) {
  return origem === referenciaLogica.DE_FABRICA
    ? referenciaDeFabrica(rotinaId)
    : referenciaMarcada(rotinaId);
}

/** Quantos exercícios da referência estão hoje fora da lista do catálogo.
 *  Restaurar traz esses de volta à lista, senão o treino restaurado voltaria
 *  com um exercício que ele não consegue mais achar em lugar nenhum. */
function forasDoCatalogo(ref) {
  const arquivados = new Set(catalogo().filter((e) => e.arquivado).map((e) => e.id));
  return [...new Set(referenciaLogica.exerciciosVisiveis(ref)
    .map((e) => e.exercicioId)
    .filter((id) => arquivados.has(id)))];
}

/** Tudo que a tela de restaurar precisa dizer antes de restaurar: o que existe
 *  como ponto de volta, o que volta em números e o que não é tocado. */
export function visaoDaRestauracao(rotinaId) {
  const rotina = (estado.documentos.rotinas ?? []).find((r) => r.id === rotinaId);
  if (!rotina) return null;

  const conta = contagemDeSessoes(rotinaId);

  const descrever = (ref) => (ref ? {
    origem: ref.origem,
    nome: rotinasLogica.nomeVisivel(ref.nome),
    marcadaEm: ref.marcadaEm ?? null,
    ...referenciaLogica.contar(ref),
    jaEstaAssim: referenciaLogica.saoIguais(rotina, ref),
    voltamAoCatalogo: forasDoCatalogo(ref).length,
  } : null);

  return {
    nome: rotinasLogica.nomeVisivel(rotina.nome),
    agora: referenciaLogica.contar({ exercicios: rotina.exercicios }),
    fabrica: descrever(referenciaDeFabrica(rotinaId)),
    referencia: descrever(referenciaMarcada(rotinaId)),
    sessoesRegistradas: conta.registradas,
    sessoesAbertas: conta.abertas,
  };
}

/** Guarda a configuração de hoje como o ponto de volta deste treino.
 *
 *  Marcar de novo troca a anterior — é um marcador, não uma pilha. A de fábrica
 *  continua onde estava e não é afetada: os dois pontos de volta convivem. */
export async function marcarReferenciaDoTreino(rotinaId) {
  return comDesfazer(async () => {
    const lista = clonar(estado.documentos.rotinas ?? []);
    const alvo = lista.find((r) => r.id === rotinaId);
    if (!alvo) throw new Error('não achei esse treino');

    alvo.referencia = referenciaLogica.deRotina(alvo, {
      origem: referenciaLogica.MARCADA,
      marcadaEm: agoraISO(),
    });

    await gravarRotinas(lista);
    return {
      nome: rotinasLogica.nomeVisivel(alvo.nome),
      ...referenciaLogica.contar(alvo.referencia),
      marcadaEm: alvo.referencia.marcadaEm,
    };
  }, (feito) => ({
    frase: `marcar a configuração de "${feito.nome}" como referência`,
    chave: null,
  }));
}

/** Recria a estrutura do treino a partir do ponto de volta escolhido.
 *
 *  Escreve em `rotinas` e, se algum exercício da referência estiver fora da
 *  lista do catálogo, em `catalogo`. Mais nada. Nenhuma sessão é lida para
 *  escrever nem escrita: o histórico atravessa isto inteiro sem saber que
 *  aconteceu. */
export async function restaurarTreino(rotinaId, origem = referenciaLogica.MARCADA) {
  return comDesfazer(async () => {
    const ref = referenciaPorOrigem(rotinaId, origem);
    if (!ref) {
      throw new Error(origem === referenciaLogica.DE_FABRICA
        ? 'este treino não veio de fábrica, então não existe configuração de fábrica dele'
        : 'você ainda não marcou nenhuma configuração deste treino como referência');
    }

    const lista = clonar(estado.documentos.rotinas ?? []);
    const posicao = lista.findIndex((r) => r.id === rotinaId);
    if (posicao < 0) throw new Error('não achei esse treino');

    const antes = referenciaLogica.contar({ exercicios: lista[posicao].exercicios });
    const jaEstavaAssim = referenciaLogica.saoIguais(lista[posicao], ref);
    lista[posicao] = referenciaLogica.aplicar(lista[posicao], ref);

    const pares = [['rotinas', clonar(lista)]];

    const voltando = forasDoCatalogo(ref);
    if (voltando.length) {
      const doCatalogo = catalogo();
      for (const item of doCatalogo) {
        if (!voltando.includes(item.id)) continue;
        item.arquivado = false;
        item.arquivadoEm = null;
      }
      pares.push(['catalogo', doCatalogo]);
    }

    await gravarDocumentos(pares);

    return {
      origem,
      nome: rotinasLogica.nomeVisivel(ref.nome),
      antes,
      depois: referenciaLogica.contar(ref),
      voltaramAoCatalogo: voltando.length,
      jaEstavaAssim,
      marcadaEm: ref.marcadaEm ?? null,
      sessoesIntocadas: contagemDeSessoes(rotinaId).registradas,
    };
  }, (feito) => ({
    frase: feito.origem === referenciaLogica.DE_FABRICA
      ? `restaurar "${feito.nome}" como veio de fábrica`
      : `restaurar "${feito.nome}" para a configuração de referência`,
    chave: null,
  }));
}

/** Quantos treinos já registrados têm este exercício da rotina dentro. É o que
 *  a confirmação de excluir e a de trocar mostram. */
export function contagemDeSessoesDoExercicio(exercicioDaRotinaId) {
  const comEle = sessoes().filter((s) =>
    (s.exercicios ?? []).some((e) => e.rotinaExercicioId === exercicioDaRotinaId));
  return {
    registradas: comEle.filter((s) => s.status === 'finalizada').length,
    abertas: comEle.filter((s) => s.status === 'aberta').length,
  };
}

// ------------------------------------------- leitura de sessão já montada

export function visaoDaSessao(id) {
  const encontrada = sessao(id);
  if (!encontrada) return null;
  return { ...encontrada, resumo: sessoesLogica.resumo(encontrada) };
}

/** A sessão aberta mais recente, para a tela inicial oferecer "continuar". */
export function visaoDaSessaoEmAndamento() {
  const aberta = sessoesAbertas()[0];
  return aberta ? { ...aberta, resumo: sessoesLogica.resumo(aberta) } : null;
}

export function visaoDoHistorico() {
  return sessoes().map((s) => ({
    id: s.id,
    data: s.data,
    status: s.status,
    rotinaNome: s.rotinaNome,
    rotinaFoco: s.rotinaFoco,
    bloco: s.bloco,
    semana: s.semana,
    iniciadaEm: s.iniciadaEm,
    finalizadaEm: s.finalizadaEm,
    resumo: sessoesLogica.resumo(s),
  }));
}

// ------------------------------------------------------- backup e limpeza

export function exportar() {
  return {
    app: 'GYMBRO',
    formato: 'backup',
    versaoEsquema: estado.documentos.esquema?.versao ?? esquema.VERSAO_ATUAL,
    exportadoEm: agoraISO(),
    documentos: clonar(estado.documentos),
  };
}

/** Lê um arquivo de backup e diz, em números, o que tem dentro dele — para o
 *  aviso antes de substituir mostrar coisa concreta, e não um "tem certeza?". */
export function resumirBackup(conteudo) {
  if (!conteudo || typeof conteudo !== 'object' || !conteudo.documentos) {
    throw new Error('esse arquivo não parece um backup do GYMBRO');
  }
  const docs = conteudo.documentos;
  // Conta o que ele veria na tela, e não o que está guardado: treino e
  // exercício excluídos continuam dentro do arquivo (é assim que a M9 vai
  // trazer de volta), mas dizer "12 treinos" para quem tem 4 na lista faria o
  // aviso mentir na hora de decidir se substitui tudo.
  const listaDeRotinas = (Array.isArray(docs.rotinas) ? docs.rotinas : [])
    .filter((r) => !r.arquivada);
  const exerciciosDe = (rotina) => (rotina.exercicios ?? []).filter((e) => !e.arquivado);

  return {
    versaoEsquema: Number(conteudo.versaoEsquema ?? docs.esquema?.versao ?? 0),
    exportadoEm: conteudo.exportadoEm ?? null,
    treinos: listaDeRotinas.length,
    exercicios: listaDeRotinas.reduce((t, r) => t + exerciciosDe(r).length, 0),
    seriesPlanejadas: listaDeRotinas.reduce(
      (t, r) => t + exerciciosDe(r).reduce((s, e) => s + (e.series?.length ?? 0), 0), 0),
    sessoes: Object.keys(docs).filter(ehChaveDeSessao).length,
  };
}

/** Troca tudo que está no aparelho pelo conteúdo do backup. Backup de versão
 *  antiga é atualizado na entrada; de versão mais nova que o app é recusado. */
export async function importar(conteudo) {
  const resumo = resumirBackup(conteudo);
  const resultado = esquema.migrar(clonar(conteudo.documentos), resumo.versaoEsquema);

  const documentos = resultado.documentos;
  documentos.esquema = {
    ...(documentos.esquema ?? { criadoEm: agoraISO() }),
    versao: esquema.VERSAO_ATUAL,
    atualizadoEm: agoraISO(),
  };

  // Troca de uma vez só. Antes eram duas operações — apagar tudo e depois
  // gravar tudo — e entre as duas existia um instante em que o aparelho estava
  // vazio. Fechar o app naquele instante apagava o histórico de verdade.
  await armazem.substituirTudo(Object.entries(documentos));

  estado.documentos = documentos;
  estado.erroDeVersao = null;
  // O caminho de volta falava dos documentos que acabaram de sair do aparelho.
  esquecerAlteracoes();
  avisar();
  return { ...resumo, migrou: resultado.migrou };
}

/** Apaga tudo do aparelho e semeia de novo, para o app nunca ficar sem chão. */
export async function apagarTudo() {
  await armazem.limparTudo();
  estado.documentos = {};
  estado.erroDeVersao = null;
  await semear();
  esquecerAlteracoes();
  avisar();
}
