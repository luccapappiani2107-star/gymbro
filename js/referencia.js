// A configuração original de um treino: o que "Restaurar" traz de volta.
// Funções puras — nada aqui lê nem grava no aparelho.
//
// **O que é "original".** O app guarda dois pontos de volta para cada treino, e
// os dois são a mesma coisa em forma: uma cópia congelada da estrutura.
//
//   1. **A configuração de fábrica.** Nasce em `js/semente.js`, no documento
//      `fabrica`, no dia em que o app abriu pela primeira vez neste aparelho.
//      Nunca é reescrita. É o treino como ele veio da ficha inicial.
//   2. **A referência que o Lucca marcou.** Fica dentro da própria rotina, em
//      `rotina.referencia`, e é ele quem decide quando gravá-la: "este treino
//      está do jeito que eu quero, guarde assim". Marcar de novo troca a
//      anterior.
//
//  Treino criado depois — do zero ou copiado — não tem configuração de fábrica,
//  porque ele nunca esteve na ficha inicial. Para esse, o único caminho de volta
//  é a referência que ele marcar. A tela diz isso com todas as letras.
//
// **O que a referência guarda: só estrutura.** Nome, foco, dia da semana e os
// exercícios com as séries planejadas dentro. Não guarda sessão nenhuma, nem
// aberta nem registrada, e restaurar não tem por onde alcançar uma: quem aplica
// uma referência escreve no documento `rotinas` e mais nada.

import { clonar } from './util.js';
import { ordenar } from './rotinas.js';
import { visiveis } from './exercicios.js';

export const DE_FABRICA = 'fabrica';
export const MARCADA = 'marcada';

/** Congela a estrutura de um treino do jeito que ela está agora. */
export function deRotina(rotina, { origem = MARCADA, marcadaEm = null } = {}) {
  return {
    origem,
    marcadaEm,
    nome: rotina?.nome ?? '',
    foco: rotina?.foco ?? '',
    diaSemana: rotina?.diaSemana ?? null,
    exercicios: clonar(rotina?.exercicios ?? []),
  };
}

export const exerciciosVisiveis = (ref) => visiveis(ref?.exercicios ?? []);

/** Quantos exercícios e quantas séries planejadas a referência tem. É o que a
 *  confirmação mostra, para o aviso falar de número e não de "tem certeza?". */
export function contar(ref) {
  const lista = exerciciosVisiveis(ref);
  return {
    exercicios: lista.length,
    series: lista.reduce((total, e) => total + (e.series?.length ?? 0), 0),
  };
}

/** A estrutura em forma comparável: a ordem gravada manda, não a posição no
 *  array. Sem isso, uma lista renumerada pareceria diferente de uma igual. */
function assinatura(exercicios) {
  return JSON.stringify(ordenar(exercicios ?? []).map((exercicio) => ({
    ...exercicio,
    series: ordenar(exercicio.series ?? []),
  })));
}

/** O treino já está exatamente como a referência? É o que deixa o botão dizer
 *  "já está assim" em vez de gravar por cima do que já é igual. */
export function saoIguais(rotina, ref) {
  if (!rotina || !ref) return false;
  return String(rotina.nome ?? '') === String(ref.nome ?? '')
    && String(rotina.foco ?? '') === String(ref.foco ?? '')
    && (rotina.diaSemana ?? null) === (ref.diaSemana ?? null)
    && assinatura(rotina.exercicios) === assinatura(ref.exercicios);
}

/** Devolve o treino com a estrutura da referência dentro.
 *
 *  O que volta: nome, foco, dia da semana e a lista inteira de exercícios, com
 *  as séries planejadas, as faixas de reps e os descansos que estavam
 *  congelados.
 *
 *  O que fica onde estava, de propósito:
 *   - `id`, `ordem` e `criadoEm`: é o mesmo treino, no mesmo lugar da lista;
 *   - `arquivada`: restaurar não é o mesmo que trazer de volta um treino
 *     excluído, e misturar as duas coisas faria um botão fazer duas;
 *   - `referencia`: o ponto de volta continua valendo depois de usado. Voltar
 *     para ele não pode gastá-lo. */
export function aplicar(rotina, ref) {
  return {
    ...rotina,
    nome: ref.nome ?? '',
    foco: ref.foco ?? '',
    diaSemana: ref.diaSemana ?? null,
    exercicios: clonar(ref.exercicios ?? []),
  };
}
