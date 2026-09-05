// A sessão executada: como ela nasce a partir do treino e o que dá para dizer
// sobre ela depois. Funções puras — nada aqui lê nem grava no aparelho.
//
// A regra que este arquivo existe para cumprir: no instante em que a sessão
// nasce, ela copia para dentro de si tudo que vai precisar mostrar depois (nome
// do exercício, tipo, grupos, faixa de reps, descanso, RIR programado). Daí em
// diante nada que aconteça com a rotina muda o que ficou registrado.

import { novoId, hojeISO, agoraISO, paraNumero, paraInteiro } from './util.js';
import { RIR_MAXIMO } from './periodizacao.js';

/** RIR não passa disso. Um teto só no app inteiro: o número mora nas contas da
 *  periodização e é reexportado aqui para quem já pedia por este caminho. */
export { RIR_MAXIMO };

/** Monta a sessão a partir da visão do treino (que já traz o catálogo juntado e
 *  o RIR programado da semana atual calculado série por série).
 *
 *  Entram só as séries que valem na semana: na semana de deload a periodização
 *  corta séries, e a sessão nasce já cortada. As que ficaram de fora não somem
 *  do treino, só não são cobradas hoje. */
export function montarSessao(treino, { data = hojeISO(), quando = agoraISO() } = {}) {
  return {
    id: novoId('ses'),
    status: 'aberta',
    data,
    iniciadaEm: quando,
    finalizadaEm: null,

    // referência fraca: só serve para agrupar histórico e calcular sugestão
    rotinaId: treino.id,

    // cópia congelada do que estava na tela hoje
    rotinaNome: treino.nome,
    rotinaFoco: treino.foco ?? '',
    bloco: treino.semana.bloco,
    semana: treino.semana.numero,
    // Congelado junto com o resto: saber se aquele dia foi semana leve é o que
    // deixa a sugestão de carga das próximas semanas não usar um deload como
    // base, mesmo que a periodização mude de forma depois (M8).
    deload: treino.semana.deload === true,
    periodizacaoNome: treino.semana.nomeDaPeriodizacao ?? '',
    nota: '',
    descanso: null,

    exercicios: treino.exercicios.map((exercicio, ordem) =>
      montarExercicioDaSessao(exercicio, ordem)),
  };
}

/** Uma série da sessão, nascendo da série planejada.
 *
 *  `rirProgramado` é gravado aqui e nunca mais recalculado: é isso que impede
 *  uma mudança de periodização de reescrever o passado. `sugestao` segue a
 *  mesma regra e pelo mesmo motivo: ela é a conta que estava na tela quando a
 *  série nasceu, com a origem inteira dentro, e nenhuma tela a reescreve.
 *
 *  `carga` continua nascendo `null` mesmo quando existe sugestão, e isso é o
 *  centro da M7: o número aparece no campo, mas só vira dado quando o Lucca
 *  aceita (marcando a série) ou digita outro. Série que ele não fez continua
 *  registrada como não realizada — sugestão nunca inventa treino. */
export function montarSerieDaSessao(serie, posicao) {
  return {
    id: novoId('sse'),
    ordem: posicao,
    carga: null,
    sugestao: serie.sugestao ?? null,
    reps: null,
    repMin: serie.repMin ?? null,
    repMax: serie.repMax ?? null,
    rirProgramado: serie.rirProgramado ?? null,
    rirUsado: serie.rirProgramado ?? null,
    rirReal: null,
    concluida: false,
    concluidaEm: null,
    extra: false,
  };
}

/** Série acrescentada na hora, fora do que estava planejado (M6).
 *
 *  Ela nasce igual a qualquer outra série de sessão — com o RIR da semana
 *  **daquela sessão** congelado em `rirProgramado` — e guarda `extra: true`.
 *
 *  A marca não é enfeite: é ela que deixa o histórico dizer que aquela série
 *  não estava no plano, e é ela que faz uma edição de estrutura não desfazer o
 *  que ele resolveu fazer a mais hoje. A periodização do bloco não muda com
 *  isso: nada aqui escreve no documento `periodizacao`, e as séries que já
 *  nasceram continuam com o RIR que já tinham. */
export function montarSerieExtra(serie, posicao) {
  return { ...montarSerieDaSessao(serie, posicao), extra: true };
}

export const ehExtra = (serie) => serie?.extra === true;

/** Os campos da série executada que a tela pode mudar.
 *
 *  `rirProgramado` não está nesta lista, e essa ausência é a regra 2 do
 *  CONTEXTO escrita em código: não existe caminho de tela que consiga
 *  reescrever o RIR que a periodização mandou naquele dia. `concluida` também
 *  fica de fora — ela tem função própria, porque anda junto com a hora. */
export const CAMPOS_DA_SERIE_DA_SESSAO = {
  carga: paraNumero,
  reps: paraInteiro,
  repMin: paraInteiro,
  repMax: paraInteiro,
  rirUsado: limitarRir,
  rirReal: limitarRir,
};

/** Um exercício da sessão, nascendo do exercício do treino já montado (com o
 *  catálogo juntado e o RIR programado da semana calculado série por série).
 *
 *  Entram só as séries que valem na semana. Serve tanto para a sessão inteira
 *  nascer quanto para um exercício entrar numa sessão que já está aberta: nos
 *  dois casos o exercício copia para dentro de si tudo que vai precisar mostrar
 *  depois, e a partir daí não olha mais para a rotina. */
export function montarExercicioDaSessao(exercicio, ordem) {
  return {
    id: novoId('sex'),
    exercicioId: exercicio.exercicioId ?? null,
    // Vínculo fraco com o exercício desta rotina, do mesmo jeito que
    // `rotinaId` é vínculo fraco com a rotina: não é usado para mostrar nada
    // (o que a tela mostra está copiado logo abaixo), só para reconhecer o
    // mesmo exercício quando a ordem do treino muda no meio da sessão.
    rotinaExercicioId: exercicio.id ?? null,
    nome: exercicio.nome,
    tipo: exercicio.tipo,
    grupoPrincipal: exercicio.grupoPrincipal ?? null,
    grupoSecundario: exercicio.grupoSecundario ?? null,
    unilateral: exercicio.unilateral === true,
    repMin: exercicio.repMin ?? null,
    repMax: exercicio.repMax ?? null,
    descansoSegundos: exercicio.descansoSegundos ?? null,
    ordem,
    nota: '',
    series: exercicio.series
      .filter((serie) => serie.naSemana !== false)
      .map(montarSerieDaSessao),
  };
}

/** Série sem nada preenchido. Não é a mesma coisa que série com zero: branco é
 *  "não fiz", zero é um valor de treino. */
const semValor = (v) => v === null || v === undefined || v === '';

export function serieEmBranco(serie) {
  return !serie.concluida
    && semValor(serie.carga)
    && semValor(serie.reps)
    && semValor(serie.rirReal);
}

export function todasAsSeries(sessao) {
  return (sessao?.exercicios ?? []).flatMap((exercicio) =>
    exercicio.series.map((serie) => ({ exercicio, serie })));
}

/** O que foi feito nesta sessão, em números. Três estados por série, porque
 *  "não concluída" não conta a mesma história para uma série em branco e para
 *  uma que ele preencheu mas esqueceu de marcar. */
export function resumo(sessao) {
  let total = 0;
  let concluidas = 0;
  let emBranco = 0;
  let preenchidasSemMarcar = 0;
  let volume = 0;
  let repsTotais = 0;
  let seriesComVolume = 0;
  let extras = 0;
  // O placar da M7: quantas séries abriram com carga já preenchida e quantas
  // ficaram em branco por não ter de onde tirar.
  let comSugestao = 0;
  let alvoMudado = 0;

  const exercicios = (sessao?.exercicios ?? []).map((exercicio) => {
    let feitas = 0;
    for (const serie of exercicio.series) {
      total += 1;
      if (ehExtra(serie)) extras += 1;
      if (serie.sugestao && serie.sugestao.carga !== null && serie.sugestao.carga !== undefined) {
        comSugestao += 1;
      }
      if (serie.rirProgramado !== null && serie.rirUsado !== serie.rirProgramado) alvoMudado += 1;
      if (serie.concluida) {
        concluidas += 1;
        feitas += 1;
      } else if (serieEmBranco(serie)) {
        emBranco += 1;
      } else {
        preenchidasSemMarcar += 1;
      }

      if (serie.concluida && Number.isFinite(serie.carga) && Number.isFinite(serie.reps)) {
        volume += serie.carga * serie.reps;
        repsTotais += serie.reps;
        seriesComVolume += 1;
      }
    }
    return {
      id: exercicio.id,
      nome: exercicio.nome,
      feitas,
      total: exercicio.series.length,
      tocado: feitas > 0 || exercicio.series.some((s) => !serieEmBranco(s)),
    };
  });

  return {
    total,
    concluidas,
    emBranco,
    preenchidasSemMarcar,
    extras,
    comSugestao,
    semSugestao: total - comSugestao,
    alvoMudado,
    volume: seriesComVolume > 0 ? Math.round(volume * 10) / 10 : null,
    repsTotais,
    exercicios,
    exerciciosTocados: exercicios.filter((e) => e.tocado).length,
    duracaoSegundos: duracaoEmSegundos(sessao),
  };
}

export function duracaoEmSegundos(sessao) {
  const inicio = Date.parse(sessao?.iniciadaEm ?? '');
  const fim = sessao?.finalizadaEm ? Date.parse(sessao.finalizadaEm) : Date.now();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) return null;
  return Math.round((fim - inicio) / 1000);
}

/** A primeira série que ainda não foi marcada. É para onde a tela rola quando o
 *  Lucca volta ao treino: retomar é chegar onde parou, não no topo. */
export function proximaSerie(sessao) {
  for (const { exercicio, serie } of todasAsSeries(sessao)) {
    if (!serie.concluida) return { exercicioId: exercicio.id, serieId: serie.id, exercicio, serie };
  }
  return null;
}

/** Nada preenchido em lugar nenhum: dá para descartar sem perder treino. */
export function sessaoVazia(sessao) {
  return todasAsSeries(sessao).every(({ serie }) => serieEmBranco(serie));
}

/** Os números de RIR que a tela oferece com um toque só. Cresce sozinho se o
 *  valor programado, o alvo ou o que ele registrou passarem do fim da régua —
 *  nenhum número de RIR fica preso no código. */
export function reguaDeRir(serie, minimoDeOpcoes = 5) {
  const candidatos = [minimoDeOpcoes, serie.rirProgramado, serie.rirUsado, serie.rirReal]
    .map(Number)
    .filter(Number.isFinite);
  const maior = Math.min(Math.max(...candidatos, 0), RIR_MAXIMO);
  return Array.from({ length: maior + 1 }, (_, i) => i);
}

export function limitarRir(valor) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return null;
  return Math.min(Math.max(Math.trunc(Number(valor)), 0), RIR_MAXIMO);
}
