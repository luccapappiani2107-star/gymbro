// A carga sugerida: de onde ela vem, e o que ela nunca faz.
//
// Três regras mandam neste arquivo, e as três vêm do CONTEXTO:
//
// 1. **Sugestão nunca vira trava** (regra 4). Tudo aqui devolve número para um
//    campo editável. Nada aqui escreve em lugar nenhum — nem no plano, nem na
//    periodização, nem na sessão.
// 2. **Nenhum número aparece sem origem.** Toda sugestão sai daqui com a conta
//    inteira dentro dela: de qual dia veio, de qual série, qual era a carga
//    antes do fator da semana e qual fator foi aplicado. É isso que deixa a
//    tela dizer, em uma frase curta, de onde saiu o número.
// 3. **Sem base, campo em branco.** Quando não existe sessão anterior para
//    olhar, a resposta é `null` — nunca zero. Zero é uma carga de verdade
//    (barra vazia, peso do corpo), e chutar zero seria mentir com número.
//
// A frase de tela mora aqui junto com a regra, e não em `js/ui.js`, de
// propósito: quem mudar a conta lê a explicação na linha de baixo.

import { formatarCarga, formatarDataCurta, formatarNumero } from './ui.js';

/** O menor degrau de carga que faz sentido pôr na barra. Só é usado quando a
 *  semana muda a carga (deload): fora disso a sugestão é, ao quilo, a carga que
 *  ele mesmo registrou. Dá para trocar sem mexer em código pelo `passoDeCarga`
 *  do documento `config`. */
export const PASSO_DE_CARGA_PADRAO = 0.5;

const ehNumero = (valor) => valor !== null && valor !== undefined && Number.isFinite(Number(valor));

/** Arredonda para o degrau de carga mais próximo, sem deixar sobra de conta
 *  binária na tela (0,6 × 42,5 daria 25,500000000000004). */
export function arredondarNoPasso(valor, passo = PASSO_DE_CARGA_PADRAO) {
  if (!ehNumero(valor)) return null;
  const degrau = Number(passo);
  const bruto = Number(valor);
  if (!Number.isFinite(degrau) || degrau <= 0) return Number(bruto.toFixed(3));
  return Number((Math.round(bruto / degrau) * degrau).toFixed(3));
}

/** As sessões já registradas em que este exercício aparece, da mais recente
 *  para a mais antiga.
 *
 *  Dois vínculos, nesta ordem de preferência:
 *
 *  - `treino`: o mesmo exercício **deste treino** (`rotinaExercicioId`). É o
 *    vínculo forte: mesma prescrição, mesmo dia da semana, mesma história.
 *  - `movimento`: o mesmo exercício do catálogo (`exercicioId`) em outro
 *    treino. Serve para o supino que aparece na segunda e na sexta não começar
 *    do zero num dos dois dias. A tela diz quando a sugestão veio daqui.
 *
 *  Trocar um exercício por outro (M5) não mistura os dois históricos, porque a
 *  troca cria um `rex_` novo **e** aponta para outro item do catálogo: nenhum
 *  dos dois vínculos casa com o exercício que saiu.
 *
 *  Sessão aberta fica de fora: base é o que já foi registrado. O treino de hoje
 *  vira base do próximo, quando ele for finalizado. */
export function historicoDoExercicio(sessoes, {
  rotinaExercicioId = null,
  exercicioId = null,
  ehDeload = () => false,
} = {}) {
  const encontrados = [];

  for (const sessao of sessoes ?? []) {
    if (sessao?.status !== 'finalizada') continue;

    for (const exercicio of sessao.exercicios ?? []) {
      const porTreino = rotinaExercicioId !== null && rotinaExercicioId !== undefined
        && exercicio.rotinaExercicioId === rotinaExercicioId;
      const porMovimento = exercicioId !== null && exercicioId !== undefined
        && exercicio.exercicioId === exercicioId;
      if (!porTreino && !porMovimento) continue;

      encontrados.push({
        sessaoId: sessao.id,
        data: sessao.data ?? null,
        semana: sessao.semana ?? null,
        deload: ehDeload(sessao) === true,
        vinculo: porTreino ? 'treino' : 'movimento',
        series: [...(exercicio.series ?? [])].sort(
          (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0)),
      });
    }
  }

  return encontrados.sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')));
}

/** A carga registrada que serve de base dentro de uma sessão antiga.
 *
 *  Primeiro a série da **mesma posição** — é assim que o app casa plano e
 *  execução desde a M5, e é a única correspondência que se sustenta quando a
 *  semana de deload corta séries. Se aquela posição não existir naquele dia, ou
 *  tiver ficado em branco, vale a última série daquele exercício que tem carga:
 *  ele fez o exercício, só não fez aquela série. */
function baseNaSessao(registro, indice) {
  const naPosicao = registro.series[indice];
  if (naPosicao && ehNumero(naPosicao.carga)) {
    return { carga: Number(naPosicao.carga), serie: indice + 1, mesmaSerie: true };
  }

  for (let i = registro.series.length - 1; i >= 0; i -= 1) {
    if (ehNumero(registro.series[i].carga)) {
      return { carga: Number(registro.series[i].carga), serie: i + 1, mesmaSerie: false };
    }
  }
  return null;
}

/** A carga sugerida para uma série, com a conta inteira dentro.
 *
 *  Devolve `null` quando não há base nenhuma — e aí o campo abre em branco e a
 *  tela diz que ainda não tem de onde tirar. Nunca devolve zero por falta de
 *  dado; zero só sai daqui se ele mesmo tiver registrado zero.
 *
 *  A ordem em que a base é procurada:
 *
 *  1. a **carga alvo** que ele definiu à mão para esta série (M6). É o número
 *     que ele escreveu no plano; ele ganha do histórico, e a tela diz isso;
 *  2. a última sessão registrada **deste exercício neste treino**, fora de
 *     semana leve;
 *  3. a mesma coisa, aceitando semana leve, quando só existe isso;
 *  4. o mesmo exercício **em outro treino**, na mesma ordem.
 *
 *  Depois disso entra a semana: em semana de deload a periodização pede uma
 *  fração da carga cheia (`cargaFator`), e é ela que decide o número — não este
 *  arquivo. Fora do deload o fator é 1 e a sugestão é, ao quilo, a carga que ele
 *  usou: arredondar aqui mudaria um número que é dele. */
export function sugerirCarga({
  historico = [],
  indice = 0,
  cargaAlvo = null,
  fator = 1,
  deload = false,
  passo = PASSO_DE_CARGA_PADRAO,
} = {}) {
  const posicao = Math.max(Number(indice) || 0, 0);
  const fatorDaSemana = Number.isFinite(Number(fator)) && Number(fator) > 0 ? Number(fator) : 1;

  const fechar = (base, extras) => {
    const carga = fatorDaSemana === 1
      ? Number(Number(base).toFixed(3))
      : arredondarNoPasso(Number(base) * fatorDaSemana, passo);
    return {
      carga,
      base: Number(Number(base).toFixed(3)),
      fator: fatorDaSemana,
      deload: deload === true,
      ...extras,
    };
  };

  if (ehNumero(cargaAlvo)) {
    return fechar(cargaAlvo, { de: 'carga-alvo', data: null, serie: posicao + 1, mesmaSerie: true });
  }

  const doTreino = historico.filter((h) => h.vinculo === 'treino');
  const deOutroTreino = historico.filter((h) => h.vinculo === 'movimento');
  const naoLeve = (h) => !h.deload;
  const leve = (h) => h.deload;

  // Semana leve não serve de base enquanto existir semana cheia para olhar: a
  // carga de um deload é 60% de outra coisa, e sugerir 60% de 60% encolheria a
  // barra sozinha, semana após semana.
  const candidatos = [
    ...doTreino.filter(naoLeve),
    ...doTreino.filter(leve),
    ...deOutroTreino.filter(naoLeve),
    ...deOutroTreino.filter(leve),
  ];

  for (const registro of candidatos) {
    const base = baseNaSessao(registro, posicao);
    if (!base) continue;

    return fechar(base.carga, {
      de: registro.vinculo === 'treino' ? 'ultima-sessao' : 'outro-treino',
      data: registro.data,
      serie: base.serie,
      mesmaSerie: base.mesmaSerie,
      baseEraLeve: registro.deload,
    });
  }

  return null;
}

// ------------------------------------------------------------- as frases

/** De onde veio o número, em uma frase curta. É o que impede uma carga de
 *  aparecer na tela sem explicação.
 *
 *  A frase é escrita para vir logo depois da palavra "Carga": "Carga sugerida a
 *  partir da última sessão (seg, 01/09), mesma série." */
export function fraseDaSugestao(sugestao) {
  if (!sugestao) return 'sem base ainda: você não registrou este exercício.';

  const dia = sugestao.data ? formatarDataCurta(sugestao.data) : null;
  const partes = [];

  if (sugestao.de === 'carga-alvo') {
    partes.push('sugerida a partir da carga alvo que você definiu para esta série');
  } else if (sugestao.de === 'outro-treino') {
    partes.push(`sugerida a partir deste exercício em outro treino (${dia})`);
  } else if (sugestao.mesmaSerie) {
    partes.push(`sugerida a partir da última sessão (${dia}), mesma série`);
  } else {
    partes.push(`sugerida a partir da última sessão (${dia}), ${sugestao.serie}ª série`);
  }

  if (sugestao.baseEraLeve) partes.push('a única registrada foi em semana leve');

  if (sugestao.fator !== 1) {
    partes.push(`semana leve: ${formatarNumero(sugestao.fator * 100, 0)}% de ${formatarCarga(sugestao.base)}`);
  }

  return `${partes.join(' · ')}.`;
}

/** A frase do exercício inteiro, para a tela do treino e a do treino em
 *  andamento dizerem de onde vem a carga que já está nos campos. */
export function fraseDoExercicio(series = []) {
  const comSugestao = series.map((s) => s.sugestao ?? null).filter(Boolean);

  if (comSugestao.length === 0) {
    return 'Sem carga sugerida: você ainda não registrou este exercício. Os campos começam em branco.';
  }

  const frase = fraseDaSugestao(comSugestao[0]);
  const faltando = series.length - comSugestao.length;
  const sobra = faltando > 0
    ? ` ${faltando === 1 ? '1 série ficou sem base e abre' : `${faltando} séries ficaram sem base e abrem`} em branco.`
    : '';

  return `Carga ${frase}${sobra}`;
}
