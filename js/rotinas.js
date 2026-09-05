// A estrutura de um treino: criar, duplicar e mudar a ordem dos exercícios.
// Funções puras — nada aqui lê nem grava no aparelho.
//
// A ordem é dado gravado no campo `ordem`, não a posição no array. Estas
// funções mexem no número e devolvem a lista já renumerada, para nunca sobrarem
// dois exercícios disputando a mesma posição.

import { novoId, agoraISO, clonar } from './util.js';

export const porOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0);

export function ordenar(lista) {
  return [...(lista ?? [])].sort(porOrdem);
}

/** Renumera `ordem` a partir da posição de cada item na lista. */
export function renumerar(lista) {
  lista.forEach((item, posicao) => { item.ordem = posicao; });
  return lista;
}

/** Sobe (passo −1) ou desce (passo +1) um item.
 *
 *  Devolve a lista nova e a posição em que o item ficou, contando a partir de
 *  1: é isso que a tela precisa falar em voz alta depois do toque, porque quem
 *  usa lente de aumento ou leitor de tela não vê a lista inteira se mexer. */
export function mover(lista, id, passo) {
  const ordenada = ordenar(lista);
  const de = ordenada.findIndex((item) => item.id === id);
  if (de < 0) throw new Error('não achei esse exercício no treino');

  const para = de + passo;
  if (para < 0 || para >= ordenada.length) {
    return { lista: renumerar(ordenada), posicao: de + 1, mudou: false };
  }

  const [item] = ordenada.splice(de, 1);
  ordenada.splice(para, 0, item);
  return { lista: renumerar(ordenada), posicao: para + 1, mudou: true };
}

export function rotinaVazia({ nome, foco = '', diaSemana = null, ordem = 0, quando = agoraISO() }) {
  return {
    id: novoId('rot'),
    nome,
    foco,
    diaSemana,
    ordem,
    arquivada: false,
    arquivadaEm: null,
    criadoEm: quando,
    exercicios: [],
  };
}

/** Cópia da estrutura, nunca do histórico.
 *
 *  Identificador novo na rotina, em cada exercício e em cada série planejada.
 *  É isso que garante que nenhuma sessão já registrada — que guarda o
 *  identificador da rotina de quando foi feita — passe a apontar para a cópia:
 *  duplicar um treino não pode fazer o histórico aparecer em dobro.
 *
 *  Os exercícios excluídos do original não vêm junto: a cópia é um começo
 *  limpo, e trazer o que ele já tirou da tela só encheria o aparelho de
 *  registro invisível — e deixaria `substituidoPor` apontando para um
 *  exercício que não existe na cópia. */
export function duplicar(rotina, { nome = null, ordem = null, quando = agoraISO() } = {}) {
  const copia = clonar(rotina);

  return {
    ...copia,
    id: novoId('rot'),
    nome: nome ?? `${nomeVisivel(rotina.nome)} (cópia)`,
    ordem: ordem ?? rotina.ordem ?? 0,
    arquivada: false,
    arquivadaEm: null,
    criadoEm: quando,
    exercicios: ordenar(copia.exercicios).filter((e) => !e.arquivado).map((exercicio, posicao) => ({
      ...exercicio,
      id: novoId('rex'),
      ordem: posicao,
      arquivado: false,
      arquivadoEm: null,
      substituidoPor: null,
      series: ordenar(exercicio.series).map((serie, lugar) => ({
        ...serie,
        id: novoId('ser'),
        ordem: lugar,
      })),
    })),
  };
}

/** Nome que a tela mostra. Nome em branco continua sendo dado válido — ele pode
 *  estar no meio de apagar para digitar outro, e nada aqui tem botão de salvar
 *  para esperar —, mas a lista de treinos precisa mostrar alguma coisa. */
export function nomeVisivel(nome) {
  const limpo = String(nome ?? '').trim();
  return limpo === '' ? 'Treino sem nome' : limpo;
}

/** A ordem que um treino novo recebe: depois de todos, inclusive dos excluídos,
 *  para nenhum número ser reaproveitado enquanto a M9 não devolver os de volta. */
export function proximaOrdem(lista) {
  return (lista ?? []).reduce((maior, r) => Math.max(maior, Number(r.ordem) || 0), -1) + 1;
}
