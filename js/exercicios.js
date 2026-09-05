// O exercício: o que ele é no catálogo e como ele entra num treino.
// Funções puras — nada aqui lê nem grava no aparelho.
//
// Duas coisas diferentes moram neste arquivo, e a diferença entre elas é a
// espinha do modelo:
//
// - **O exercício do catálogo** é a identidade: nome, grupos, composto ou
//   isolador, um lado por vez. Existe uma vez só e serve a todos os treinos.
// - **O exercício da rotina** é a prescrição: quantas séries, que faixa de
//   reps, quanto descanso, a anotação daquele treino. Existe uma vez por
//   treino e aponta para o do catálogo.
//
// Renomear muda a identidade em todo lugar; mudar o descanso muda a prescrição
// de um treino só. É por isso que os dois não são o mesmo registro.

import { novoId, agoraISO, clonar } from './util.js';
import { ordenar, renumerar } from './rotinas.js';
import { limitarRir } from './sessao.js';

/** Texto que pode ser vazio de verdade. Grupo secundário em branco é `null`,
 *  não string vazia: quem não tem segundo grupo não tem, e a tela precisa
 *  saber a diferença para não desenhar uma etiqueta sem nada dentro. */
export function textoOuNulo(valor) {
  const limpo = String(valor ?? '').trim();
  return limpo === '' ? null : limpo;
}

/** Nome que a tela mostra. Igual ao dos treinos: nome em branco continua sendo
 *  dado válido enquanto ele digita, mas a lista precisa mostrar alguma coisa. */
export function nomeVisivel(nome) {
  const limpo = String(nome ?? '').trim();
  return limpo === '' ? 'Exercício sem nome' : limpo;
}

export const arrumarTipo = (tipo) => (tipo === 'isolador' ? 'isolador' : 'composto');

// ------------------------------------------------------------- catálogo

export function itemDoCatalogo({
  nome = '', grupoPrincipal = null, grupoSecundario = null, tipo = 'composto',
  unilateral = false, notas = '', quando = agoraISO(),
} = {}) {
  return {
    id: novoId('ex'),
    nome: String(nome ?? ''),
    grupoPrincipal: textoOuNulo(grupoPrincipal),
    grupoSecundario: textoOuNulo(grupoSecundario),
    tipo: arrumarTipo(tipo),
    unilateral: unilateral === true,
    notas: String(notas ?? ''),
    arquivado: false,
    arquivadoEm: null,
    criadoEm: quando,
  };
}

/** Os campos do catálogo que a tela pode mudar, cada um com o jeito de arrumar
 *  o que veio do campo de texto. O que não estiver aqui não se altera. */
export const CAMPOS_DO_CATALOGO = {
  nome: (valor) => String(valor ?? ''),
  grupoPrincipal: textoOuNulo,
  grupoSecundario: textoOuNulo,
  tipo: arrumarTipo,
  unilateral: (valor) => valor === true,
  notas: (valor) => String(valor ?? ''),
};

export const ehVisivelNoCatalogo = (item) => !item.arquivado;

/** Achar um exercício pelo que o Lucca digitou na busca. Sem acento e sem
 *  maiúscula: na academia ele digita "triceps" e precisa achar "Tríceps". */
export function semAcento(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function combina(item, busca) {
  const procurado = semAcento(busca);
  if (procurado === '') return true;
  const palheiro = semAcento(
    [item.nome, item.grupoPrincipal, item.grupoSecundario].filter(Boolean).join(' '));
  return procurado.split(/\s+/).every((pedaco) => palheiro.includes(pedaco));
}

export function porNome(a, b) {
  return nomeVisivel(a.nome).localeCompare(nomeVisivel(b.nome), 'pt-BR');
}

// --------------------------------------------------- exercício da rotina

export function serieVazia(ordem) {
  return {
    id: novoId('ser'),
    ordem,
    rirManual: null,
    repMin: null,
    repMax: null,
    cargaAlvo: null,
    notas: '',
  };
}

/** Campo com alguma coisa dentro. Branco continua sendo `null`, nunca zero:
 *  RIR 0 é falha, e carga alvo 0 seria uma prescrição de verdade. */
const definido = (valor) => valor !== null && valor !== undefined && valor !== '';

/** Uma série planejada em que o Lucca definiu alguma coisa à mão.
 *
 *  É a pergunta que decide se excluir a série precisa de confirmação e se a
 *  edição em massa tem o que avisar antes de aplicar. Série intocada é a que
 *  segue inteirinha o exercício e a periodização: faixa herdada, RIR da semana,
 *  sem carga alvo e sem anotação. */
export function seriePlanejadaComValor(serie) {
  return definido(serie?.rirManual)
    || definido(serie?.repMin)
    || definido(serie?.repMax)
    || definido(serie?.cargaAlvo)
    || String(serie?.notas ?? '').trim() !== '';
}

/** Os campos de uma série planejada que a tela pode mudar.
 *
 *  `rirManual` em branco quer dizer "segue a periodização", e é por isso que
 *  ele é `null` e não um número: o RIR programado de uma série planejada é
 *  derivado da semana toda vez que a tela mostra, e fixar um número aqui é
 *  justamente o jeito de sair dessa conta para aquela série só. */
export const CAMPOS_DA_SERIE_PLANEJADA = {
  repMin: inteiroOuNulo,
  repMax: inteiroOuNulo,
  rirManual: (valor) => (definido(valor) ? limitarRir(valor) : null),
  cargaAlvo: numeroOuNulo,
  notas: (valor) => String(valor ?? ''),
};

/** Acrescenta uma série no fim do exercício.
 *
 *  Sempre no fim, e isso não é preguiça: o RIR programado de uma série
 *  planejada vem da posição dela na lista da semana, então enfiar uma série no
 *  meio mudaria o RIR de todas as que vêm depois. No fim, a primeira continua
 *  sendo a primeira. */
export function comSerieNova(exercicio) {
  const series = ordenar(exercicio.series ?? []);
  const nova = serieVazia(series.length);
  series.push(nova);
  return { series: renumerar(series), nova };
}

/** Tira uma série do exercício, de qualquer posição.
 *
 *  Tirar do meio é permitido aqui (o Lucca pode ter posto uma série a mais no
 *  lugar errado) e não falsifica nada: o RIR programado da série planejada é
 *  derivado na hora de mostrar, então as que ficam simplesmente recalculam. É o
 *  oposto da sessão, onde o RIR está congelado e continua com cada série. */
export function semASerie(exercicio, serieId) {
  const series = ordenar(exercicio.series ?? []);
  const posicao = series.findIndex((s) => s.id === serieId);
  if (posicao < 0) throw new Error('não achei essa série no treino');
  const [removida] = series.splice(posicao, 1);
  return { series: renumerar(series), removida, posicao };
}

export function exercicioDaRotina({
  exercicioId, ordem = 0, series = 3,
  repMin = null, repMax = null, descansoSegundos = null, notas = '',
}) {
  return {
    id: novoId('rex'),
    exercicioId,
    ordem,
    repMin,
    repMax,
    descansoSegundos,
    notas: String(notas ?? ''),
    arquivado: false,
    arquivadoEm: null,
    substituidoPor: null,
    series: Array.from({ length: Math.max(0, Math.trunc(series)) }, (_, i) => serieVazia(i)),
  };
}

/** Os campos de prescrição que a tela pode mudar. Faixa de reps e descanso em
 *  branco viram `null`: campo apagado nunca vira zero, porque zero segundo de
 *  descanso é uma prescrição de verdade e branco é "não defini". */
export const CAMPOS_DO_EXERCICIO_DA_ROTINA = {
  repMin: inteiroOuNulo,
  repMax: inteiroOuNulo,
  descansoSegundos: inteiroOuNulo,
  notas: (valor) => String(valor ?? ''),
};

/** Número com casa decimal (carga em quilos: 42,5 é valor válido). Branco vira
 *  `null`, nunca zero. */
function numeroOuNulo(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(String(valor).replace(',', '.'));
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

function inteiroOuNulo(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Math.trunc(Number(valor));
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

export const ehVisivel = (exercicio) => !exercicio.arquivado;
export const visiveis = (lista) => ordenar(lista ?? []).filter(ehVisivel);
export const arquivados = (lista) => ordenar(lista ?? []).filter((e) => !ehVisivel(e));

/** A lista pronta para renumerar: os que aparecem, na ordem gravada, e depois
 *  os excluídos. */
export const emOrdem = (lista) => [...visiveis(lista), ...arquivados(lista)];

/** Renumera só os que aparecem na tela e joga os excluídos para depois deles.
 *
 *  Existe porque `ordem` é dado gravado: se um exercício excluído continuasse
 *  no meio da numeração, subir e descer trocariam de lugar com um item que
 *  ninguém vê. Os excluídos ficam no fim, na ordem em que já estavam, para a
 *  M9 saber de onde vieram.
 *
 *  **A ordem da lista que chega é a ordem que vale.** Esta função não ordena
 *  nada: quem acabou de pôr um exercício numa posição já disse onde ele fica, e
 *  reordenar aqui pelo `ordem` antigo desfaria isso — o exercício acrescentado
 *  no fim voltaria para o meio da lista. Quem passa uma lista fora de ordem
 *  passa por `emOrdem` antes. */
export function renumerarVisiveis(lista) {
  const daTela = (lista ?? []).filter(ehVisivel);
  const foraDaTela = (lista ?? []).filter((e) => !ehVisivel(e));
  renumerar(daTela);
  foraDaTela.forEach((item, posicao) => { item.ordem = daTela.length + posicao; });
  return [...daTela, ...foraDaTela];
}

/** Muda quantas séries planejadas o exercício tem.
 *
 *  Acrescentar põe séries novas no fim: elas nascem seguindo a periodização
 *  (`rirManual: null`) e herdando a faixa do exercício (`repMin`/`repMax`
 *  nulos), então o RIR programado da semana já vale para elas sem ninguém
 *  precisar digitar nada.
 *
 *  Cortar tira do fim, que é a única ponta em que tirar não muda o significado
 *  das outras: a primeira série continua sendo a primeira. */
export function ajustarSeries(exercicio, quantidade) {
  const alvo = Math.max(0, Math.trunc(Number(quantidade) || 0));
  const series = ordenar(exercicio.series ?? []);

  while (series.length > alvo) series.pop();
  while (series.length < alvo) series.push(serieVazia(series.length));

  return { ...exercicio, series: renumerar(series) };
}

/** Cópia do exercício dentro do mesmo treino: identificador novo nele e em cada
 *  série. Sem identificador novo, uma sessão já registrada passaria a apontar
 *  para a cópia pelo `rotinaExercicioId` e o histórico apareceria em dobro. */
export function duplicarExercicio(exercicio, { quando = agoraISO() } = {}) {
  const copia = clonar(exercicio);
  return {
    ...copia,
    id: novoId('rex'),
    arquivado: false,
    arquivadoEm: null,
    substituidoPor: null,
    criadoEm: quando,
    series: ordenar(copia.series ?? []).map((serie, posicao) => ({
      ...serie,
      id: novoId('ser'),
      ordem: posicao,
    })),
  };
}
