// O histórico de alterações: a pilha que "Desfazer" e "Refazer" andam.
// Funções puras — nada aqui lê nem grava no aparelho.
//
// Um passo guarda duas fotos dos documentos que a edição mexeu: como estavam
// **antes** e como ficaram **depois**. Desfazer grava a foto de antes; refazer
// grava a de depois. Quem tira as fotos e quem grava é o js/dados.js — aqui só
// mora a regra de quando um passo nasce, quando ele se junta ao anterior e
// quantos cabem.
//
// **Quantos passos ficam guardados: 20.** O número não é chute. Uma passada de
// edição inteira num treino — trocar o nome, o dia, subir e descer os sete
// exercícios, mexer em duas ou três séries — cabe em menos de vinte passos,
// então "desfazer tudo que eu acabei de fazer neste treino" funciona até o
// fim. Passar disso guardaria cópia de documento na memória sem que nenhuma
// tela oferecesse caminho para chegar lá.
//
// **A pilha mora só na memória, e some quando o app fecha.** Ela não é treino,
// é o caminho de volta de uma sessão de edição. Guardá-la no aparelho a faria
// entrar no arquivo de backup e no formato dos dados, e faria um "desfazer"
// aparecer de manhã oferecendo desfazer uma coisa da noite anterior — que é
// exatamente o que "Restaurar configuração original" existe para resolver, com
// confirmação e falando o nome do que volta.

/** Quantos passos de alteração cabem na pilha. */
export const PASSOS_GUARDADOS = 20;

/** Quanto tempo parado fecha um grupo de edição.
 *
 *  Os painéis do app gravam a cada tecla (não existe botão de salvar). Sem
 *  agrupar, digitar "Push A" viraria seis passos de desfazer e o Lucca teria de
 *  tocar seis vezes para voltar uma palavra. Com agrupamento, escrever um nome
 *  é um passo; voltar vinte segundos depois e escrever de novo é outro. */
export const JANELA_DE_AGRUPAMENTO_MS = 20000;

export function pilhaVazia() {
  return { feitos: [], desfeitos: [] };
}

/** Duas fotos são a mesma coisa?
 *
 *  `JSON.stringify` direto, sem ordenar chave: todo documento comparado aqui é
 *  cópia de um documento escrito por este app, então a ordem das chaves é a
 *  mesma dos dois lados. E o erro possível desta comparação só cai para o lado
 *  seguro — ela pode dizer "mudou" para coisas iguais (e aí nasce um passo de
 *  desfazer que não faz nada), nunca "igual" para coisas diferentes. */
export const saoIguais = (uma, outra) => JSON.stringify(uma) === JSON.stringify(outra);

/** Guarda um passo novo na pilha.
 *
 *  O passo chega com `{ frase, chave, em, antes, depois }`:
 *   - `frase` é o que a tela diz antes de desfazer, em português;
 *   - `chave` identifica o alvo da edição (qual treino, qual campo). Dois
 *     passos seguidos com a mesma chave, dentro da janela, viram um só. `null`
 *     quer dizer "nunca junte este com nada" — é o que usam as ações de um
 *     toque só, como excluir, duplicar ou restaurar;
 *   - `antes` e `depois` são só os documentos que mudaram de verdade.
 *
 *  Qualquer passo novo apaga o que havia para refazer: depois de desfazer, uma
 *  edição nova faz o caminho da frente deixar de existir. */
export function registrar(pilha, passo, {
  limite = PASSOS_GUARDADOS,
  janela = JANELA_DE_AGRUPAMENTO_MS,
} = {}) {
  const topo = pilha.feitos[pilha.feitos.length - 1] ?? null;

  const continuaOAnterior = topo !== null
    && pilha.desfeitos.length === 0
    && passo.chave !== null && passo.chave !== undefined
    && topo.chave === passo.chave
    && passo.em - topo.em <= janela;

  // Juntando, o "antes" que vale é o mais velho dos dois: desfazer tem de
  // voltar para antes de ele começar a digitar, não para a letra anterior.
  const juntado = continuaOAnterior
    ? { ...passo, antes: topo.antes, depois: passo.depois }
    : passo;

  // Digitou e apagou: os dois lados voltaram a ser iguais e o passo deixou de
  // existir. Some da pilha em vez de virar um "Desfazer" que não faz nada.
  if (saoIguais(juntado.antes, juntado.depois)) {
    return {
      feitos: continuaOAnterior ? pilha.feitos.slice(0, -1) : pilha.feitos,
      desfeitos: [],
    };
  }

  const feitos = continuaOAnterior
    ? [...pilha.feitos.slice(0, -1), juntado]
    : [...pilha.feitos, juntado];

  return { feitos: feitos.slice(-limite), desfeitos: [] };
}

/** O passo de volta: qual foto gravar (`alvo`), qual foto o aparelho deveria
 *  estar mostrando agora (`referencia`, para quem quiser conferir antes de
 *  encostar em alguma coisa) e como a pilha fica depois. */
export function desfazer(pilha) {
  const passo = pilha.feitos[pilha.feitos.length - 1];
  if (!passo) return null;

  return {
    passo,
    alvo: passo.antes,
    referencia: passo.depois,
    pilha: { feitos: pilha.feitos.slice(0, -1), desfeitos: [...pilha.desfeitos, passo] },
  };
}

/** O passo para a frente, espelho de `desfazer`. */
export function refazer(pilha) {
  const passo = pilha.desfeitos[pilha.desfeitos.length - 1];
  if (!passo) return null;

  return {
    passo,
    alvo: passo.depois,
    referencia: passo.antes,
    pilha: { feitos: [...pilha.feitos, passo], desfeitos: pilha.desfeitos.slice(0, -1) },
  };
}

/** O que a barra de desfazer precisa saber para se desenhar. */
export function olhar(pilha) {
  const paraDesfazer = pilha.feitos[pilha.feitos.length - 1] ?? null;
  const paraRefazer = pilha.desfeitos[pilha.desfeitos.length - 1] ?? null;

  return {
    podeDesfazer: paraDesfazer !== null,
    podeRefazer: paraRefazer !== null,
    fraseParaDesfazer: paraDesfazer?.frase ?? null,
    fraseParaRefazer: paraRefazer?.frase ?? null,
    guardados: pilha.feitos.length,
    limite: PASSOS_GUARDADOS,
  };
}
