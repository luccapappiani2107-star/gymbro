// Contas da periodização. Funções puras: entram os dados da periodização, sai um
// número. Nenhum valor de RIR, nenhuma quantidade de semanas e nenhuma regra
// moram aqui — tudo vem do documento `periodizacao` guardado no aparelho.
//
// Desde a M8 este arquivo também sabe *mudar* uma periodização: as funções
// `com…` recebem o bloco inteiro e devolvem um bloco novo, sem tocar no que
// entrou. Elas continuam puras de propósito — quem grava é `js/dados.js`, e
// quem grava é o único que sabe que existe um aparelho.

import { clonar } from './util.js';

/** RIR não passa disso. Teto do app inteiro: `js/sessao.js` importa daqui para
 *  não existirem dois tetos diferentes. */
export const RIR_MAXIMO = 10;

/** Os limites da tela, não do treino: é até onde dá para desenhar um bloco
 *  numa tela de celular sem virar rolagem infinita. Nenhum valor de RIR, de
 *  carga ou de série está aqui. */
export const MAXIMO_DE_SEMANAS = 16;
export const MAXIMO_DE_POSICOES = 12;

export function totalDeSemanas(periodizacao) {
  return periodizacao?.semanas?.length ?? 0;
}

/** Devolve a semana pedida. Se o número estiver fora do bloco (o Lucca encurtou
 *  o bloco em M8, por exemplo), devolve a última semana existente em vez de
 *  quebrar a tela. */
export function semanaDoBloco(periodizacao, numeroSemana) {
  const semanas = periodizacao?.semanas ?? [];
  if (semanas.length === 0) return null;
  return semanas.find((s) => s.numero === Number(numeroSemana)) ?? semanas[semanas.length - 1];
}

export function ehDeload(periodizacao, numeroSemana) {
  return semanaDoBloco(periodizacao, numeroSemana)?.deload === true;
}

export function rotuloDaSemana(periodizacao, numeroSemana) {
  const semana = semanaDoBloco(periodizacao, numeroSemana);
  return semana?.rotulo ?? '';
}

/** A lista crua de RIR da semana, do primeiro ao último conjunto, antes das
 *  regras de composto e isolador. É o que a tela inicial mostra como o plano da
 *  semana. */
export function rirBaseDaSemana(periodizacao, numeroSemana) {
  const semana = semanaDoBloco(periodizacao, numeroSemana);
  return Array.isArray(semana?.rirPorSerie) ? semana.rirPorSerie.map(Number) : [];
}

function pisoDoTipo(periodizacao, numeroSemana, indice, tipo, totalSeries) {
  const regras = periodizacao?.regras ?? {};

  if (tipo === 'isolador') return Number(regras.isolador?.pisoRir ?? 0);

  let piso = Number(regras.composto?.pisoRir ?? 0);
  for (const excecao of regras.composto?.excecoes ?? []) {
    const semanaBate = Number(excecao.semana) === Number(numeroSemana);
    const serieBate = !excecao.somenteUltimaSerie || indice === totalSeries - 1;
    if (semanaBate && serieBate) piso = Number(excecao.pisoRir ?? piso);
  }
  return piso;
}

/** O RIR programado de uma série. `indice` conta do zero.
 *  Devolve null quando a periodização não tem o que dizer sobre a semana. */
export function rirDaSerie(periodizacao, numeroSemana, indice, tipo, totalSeries) {
  const semana = semanaDoBloco(periodizacao, numeroSemana);
  const lista = Array.isArray(semana?.rirPorSerie) ? semana.rirPorSerie : [];
  if (lista.length === 0) return null;

  // Série além da lista da semana repete o último valor.
  const posicao = Math.min(Math.max(Number(indice) || 0, 0), lista.length - 1);
  let rir = Number(lista[posicao]);
  if (!Number.isFinite(rir)) return null;

  const aplicarRegrasDeTipo = semana.aplicarRegrasDeTipo !== false;
  const regraIsolador = periodizacao?.regras?.isolador;

  if (aplicarRegrasDeTipo && tipo === 'isolador' && regraIsolador?.aplicarAutomaticamente) {
    rir += Number(regraIsolador.ajusteRir ?? 0);
  }

  // A exceção do composto olha a série de verdade (a última do exercício), não a
  // posição na lista da semana: com 4 séries na semana 5 quem pode ir a 0 é a
  // quarta, não a terceira.
  const piso = aplicarRegrasDeTipo
    ? pisoDoTipo(periodizacao, numeroSemana, Number(indice) || 0, tipo, totalSeries)
    : 0;

  return Math.min(Math.max(rir, piso), RIR_MAXIMO);
}

/** O RIR programado de todas as séries de um exercício, na ordem. */
export function rirDoExercicio(periodizacao, numeroSemana, tipo, totalSeries) {
  return Array.from({ length: totalSeries }, (_, i) =>
    rirDaSerie(periodizacao, numeroSemana, i, tipo, totalSeries));
}

/** Quantas séries valem nesta semana. Fora do deload é o que está planejado;
 *  na semana de deload, a fração definida na periodização. */
export function seriesNaSemana(periodizacao, numeroSemana, totalSeries) {
  const semana = semanaDoBloco(periodizacao, numeroSemana);
  const fator = Number(semana?.seriesFator);
  if (!semana?.deload || !Number.isFinite(fator) || fator <= 0) return totalSeries;

  const bruto = totalSeries * fator;
  const modo = semana.seriesArredondamento ?? 'cima';
  const arredondado =
    modo === 'baixo' ? Math.floor(bruto) : modo === 'normal' ? Math.round(bruto) : Math.ceil(bruto);

  return Math.min(Math.max(arredondado, 1), totalSeries);
}

/** Quanto da carga da última semana cheia a semana atual pede. 1 fora do
 *  deload. Quem usa isso de verdade é a sugestão de carga da M7. */
export function fatorDeCarga(periodizacao, numeroSemana) {
  const semana = semanaDoBloco(periodizacao, numeroSemana);
  const fator = Number(semana?.cargaFator);
  return semana?.deload && Number.isFinite(fator) && fator > 0 ? fator : 1;
}

/** Frase curta explicando de onde vêm os números da semana, para nenhum RIR
 *  aparecer na tela sem origem. */
export function explicacaoDaSemana(periodizacao, numeroSemana) {
  const semana = semanaDoBloco(periodizacao, numeroSemana);
  if (!semana) return '';

  if (semana.deload) {
    const partes = [`RIR ${rirBaseDaSemana(periodizacao, numeroSemana)[0]} em tudo`];
    if (Number(semana.seriesFator) > 0 && Number(semana.seriesFator) < 1) {
      partes.push('menos séries');
    }
    if (Number(semana.cargaFator) > 0 && Number(semana.cargaFator) < 1) {
      partes.push(`carga em torno de ${Math.round(Number(semana.cargaFator) * 100)}%`);
    }
    return `Semana leve: ${partes.join(', ')}.`;
  }

  const regraIsolador = periodizacao?.regras?.isolador;
  const ajuste = Number(regraIsolador?.ajusteRir ?? 0);
  if (regraIsolador?.aplicarAutomaticamente && ajuste < 0) {
    return `Nos exercícios isoladores o RIR fica ${Math.abs(ajuste)} abaixo desse.`;
  }
  return '';
}

// ----------------------------------------------------- mudar a periodização
//
// Daqui para baixo é a M8: as funções que recebem um bloco e devolvem outro.
// Três regras mandam neste pedaço:
//
// 1. **Nada aqui grava.** Estas funções não sabem que existe aparelho. Quem
//    grava é `js/dados.js`, e é lá que a semana atual é acertada junto, na
//    mesma escrita.
// 2. **Nada aqui olha para sessão.** Mudar a periodização é mudar o plano das
//    próximas semanas. O RIR programado de uma série que já nasceu está
//    gravado dentro da sessão dela e nenhuma função deste arquivo o alcança.
// 3. **O que sai daqui já está arrumado.** `normalizar` é o portão: número
//    fora da faixa vira número dentro da faixa, semana sem lista ganha uma
//    lista, e exceção apontando para semana que não existe mais é descartada.
//    Assim nenhuma tela precisa desconfiar do que leu.

const ARREDONDAMENTOS = ['cima', 'normal', 'baixo'];

/** Lê um inteiro dentro de uma faixa. Vale para RIR, para piso e para ajuste:
 *  campo em branco cai no reserva, e não em zero. */
function inteiroEntre(valor, minimo, maximo, reserva) {
  const numero = Math.trunc(Number(valor));
  if (!Number.isFinite(numero)) return reserva;
  return Math.min(Math.max(numero, minimo), maximo);
}

/** Lê uma fração de 0 a 1: a fatia de séries do deload, o pedaço da carga. */
function fracaoAte(valor, reserva) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return reserva;
  return Math.min(numero, 1);
}

const rotuloPadrao = (numero) => `Semana ${numero}`;

/** O rótulo depois de a semana mudar de posição.
 *
 *  "Semana 6 — deload" virando a oitava semana precisa virar "Semana 8 —
 *  deload", senão o bloco passa a mentir o número de cada semana na tela. O que
 *  o Lucca escreveu do travessão para a frente é dele e fica. */
function rotuloRenumerado(rotulo, numero) {
  const texto = String(rotulo ?? '').trim();
  if (!texto) return rotuloPadrao(numero);
  return /^Semana\s+\d+/.test(texto)
    ? texto.replace(/^Semana\s+\d+/, rotuloPadrao(numero))
    : texto;
}

/** Uma semana inteira, arrumada. `posicao` conta a partir de 1 e vira o número
 *  dela: o número da semana é a posição no bloco, nunca um dado à parte que
 *  pode discordar da lista. */
function normalizarSemana(bruta, posicao) {
  const semana = bruta ?? {};
  const deload = semana.deload === true;

  const lista = (Array.isArray(semana.rirPorSerie) ? semana.rirPorSerie : [])
    .slice(0, MAXIMO_DE_POSICOES)
    .map((rir) => inteiroEntre(rir, 0, RIR_MAXIMO, 0));

  const arrumada = {
    numero: posicao,
    rotulo: rotuloRenumerado(semana.rotulo, posicao),
    // Semana sem nenhum RIR não é semana: ela deixaria a tela inicial sem
    // número e a sessão nasceria sem programação nenhuma.
    rirPorSerie: lista.length ? lista : [0],
    deload,
    aplicarRegrasDeTipo: semana.aplicarRegrasDeTipo !== false,
  };

  // Fator de séries, arredondamento e fator de carga só existem na semana leve.
  // Guardá-los numa semana cheia seria dado morto esperando confundir depois.
  if (deload) {
    arrumada.seriesFator = fracaoAte(semana.seriesFator, 1);
    arrumada.seriesArredondamento = ARREDONDAMENTOS.includes(semana.seriesArredondamento)
      ? semana.seriesArredondamento
      : 'cima';
    arrumada.cargaFator = fracaoAte(semana.cargaFator, 1);
  }

  return arrumada;
}

/** A frase que descreve a regra do composto, escrita a partir dos números que
 *  estão valendo. Fica guardada dentro do dado, como estava na semente, para o
 *  backup continuar se explicando sozinho depois de qualquer edição. */
function descreverComposto(regra) {
  const excecoes = regra.excecoes.map((excecao) => {
    const onde = excecao.somenteUltimaSerie ? 'a última série' : 'toda série';
    return `na semana ${excecao.semana}, onde ${onde} pode ir a ${excecao.pisoRir}`;
  });

  const base = `Composto nunca abaixo de ${regra.pisoRir} RIR`;
  return excecoes.length ? `${base}, exceto ${excecoes.join('; ')}.` : `${base}.`;
}

/** A frase do isolador.
 *
 *  O detalhe que ela existe para não esconder: o piso do isolador é dele,
 *  sempre, mesmo quando o ajuste está desligado. Desligar o ajuste faz o
 *  isolador seguir o RIR cru da semana — não faz ele copiar o composto, que
 *  tem piso próprio e pode estar mais alto. Dizer "igual ao composto" seria
 *  mentir num número que aparece em toda tela do app. */
function descreverIsolador(regra) {
  if (!regra.aplicarAutomaticamente || regra.ajusteRir === 0) {
    return `Isolador segue o RIR da semana, com piso em ${regra.pisoRir}.`;
  }
  const lado = regra.ajusteRir < 0 ? 'abaixo' : 'acima';
  return `Isolador pode ficar ${Math.abs(regra.ajusteRir)} RIR ${lado} do composto na mesma semana, com piso em ${regra.pisoRir}.`;
}

/** O portão. Toda periodização que vai ser gravada passa por aqui.
 *
 *  Devolve uma periodização nova, sempre com semanas numeradas de 1 em diante,
 *  RIR dentro da faixa, regras completas e exceções apontando só para semanas
 *  que existem. Não inventa semana: bloco sem nenhuma semana volta com uma. */
export function normalizar(bruta) {
  const entrada = bruta ?? {};
  const semanasBrutas = Array.isArray(entrada.semanas) ? entrada.semanas : [];

  const semanas = semanasBrutas
    .slice(0, MAXIMO_DE_SEMANAS)
    .map((semana, posicao) => normalizarSemana(semana, posicao + 1));

  if (semanas.length === 0) semanas.push(normalizarSemana(null, 1));

  const numerosQueExistem = new Set(semanas.map((s) => s.numero));
  const compostoBruto = entrada.regras?.composto ?? {};
  const isoladorBruto = entrada.regras?.isolador ?? {};

  const composto = {
    pisoRir: inteiroEntre(compostoBruto.pisoRir, 0, RIR_MAXIMO, 0),
    // Uma exceção por semana: duas na mesma semana só deixariam a última
    // valendo, e um dado que guarda a que não vale é um dado que mente.
    excecoes: [],
  };
  for (const crua of Array.isArray(compostoBruto.excecoes) ? compostoBruto.excecoes : []) {
    const semana = Math.trunc(Number(crua?.semana));
    if (!numerosQueExistem.has(semana)) continue;
    const arrumada = {
      semana,
      somenteUltimaSerie: crua.somenteUltimaSerie !== false,
      pisoRir: inteiroEntre(crua.pisoRir, 0, RIR_MAXIMO, composto.pisoRir),
    };
    const jaTem = composto.excecoes.findIndex((e) => e.semana === semana);
    if (jaTem >= 0) composto.excecoes[jaTem] = arrumada;
    else composto.excecoes.push(arrumada);
  }
  composto.excecoes.sort((a, b) => a.semana - b.semana);

  const isolador = {
    aplicarAutomaticamente: isoladorBruto.aplicarAutomaticamente === true,
    ajusteRir: inteiroEntre(isoladorBruto.ajusteRir, -RIR_MAXIMO, RIR_MAXIMO, 0),
    pisoRir: inteiroEntre(isoladorBruto.pisoRir, 0, RIR_MAXIMO, 0),
  };

  return {
    nome: String(entrada.nome ?? '').trim()
      || `Bloco de ${semanas.length} ${semanas.length === 1 ? 'semana' : 'semanas'}`,
    // Só existe um jeito de tratar série além da lista da semana, e é repetir o
    // último valor (`rirDaSerie`, lá em cima). O campo continua no dado porque
    // é ele que deixa outro jeito entrar um dia sem migração.
    regraSeriesExtras: entrada.regraSeriesExtras ?? 'repetir_ultimo',
    semanas,
    regras: {
      composto: { descricao: descreverComposto(composto), ...composto },
      isolador: { descricao: descreverIsolador(isolador), ...isolador },
    },
  };
}

/** O bloco inteiro, semana por semana, com as regras já aplicadas — é o que a
 *  tela de periodização mostra "de uma olhada".
 *
 *  Cada semana é lida com o tamanho da própria lista dela: uma semana de três
 *  RIR é mostrada como três séries, e é nessa terceira que a exceção da última
 *  série do composto aparece. */
export function visaoDoBloco(periodizacao) {
  const semanas = periodizacao?.semanas ?? [];

  return semanas.map((semana) => {
    const posicoes = (semana.rirPorSerie ?? []).length;
    const excecao = (periodizacao?.regras?.composto?.excecoes ?? [])
      .find((e) => Number(e.semana) === Number(semana.numero)) ?? null;

    return {
      numero: semana.numero,
      rotulo: semana.rotulo,
      deload: semana.deload === true,
      aplicarRegrasDeTipo: semana.aplicarRegrasDeTipo !== false,
      rirPorSerie: (semana.rirPorSerie ?? []).map(Number),
      composto: rirDoExercicio(periodizacao, semana.numero, 'composto', posicoes),
      isolador: rirDoExercicio(periodizacao, semana.numero, 'isolador', posicoes),
      seriesFator: semana.deload ? Number(semana.seriesFator ?? 1) : 1,
      seriesArredondamento: semana.deload ? (semana.seriesArredondamento ?? 'cima') : 'cima',
      cargaFator: semana.deload ? Number(semana.cargaFator ?? 1) : 1,
      excecaoDoComposto: excecao ? { ...excecao } : null,
      explicacao: explicacaoDaSemana(periodizacao, semana.numero),
    };
  });
}

/** Troca uma semana inteira. `mudancas` é fundido em cima da semana que está
 *  lá; o resto do bloco não é tocado. */
export function comSemana(periodizacao, numeroSemana, mudancas) {
  const copia = clonar(periodizacao) ?? {};
  copia.semanas = (copia.semanas ?? []).map((semana) =>
    (Number(semana.numero) === Number(numeroSemana) ? { ...semana, ...mudancas } : semana));
  return normalizar(copia);
}

/** Troca as regras de composto e de isolador. */
export function comRegras(periodizacao, mudancas) {
  const copia = clonar(periodizacao) ?? {};
  const regras = copia.regras ?? {};
  copia.regras = {
    composto: { ...(regras.composto ?? {}), ...(mudancas.composto ?? {}) },
    isolador: { ...(regras.isolador ?? {}), ...(mudancas.isolador ?? {}) },
  };
  return normalizar(copia);
}

/** Liga ou desliga a exceção do composto de uma semana ("nesta semana a última
 *  série pode ir a 0"). `pisoRir` em null tira a exceção. */
export function comExcecaoDoComposto(periodizacao, numeroSemana, pisoRir) {
  const copia = clonar(periodizacao) ?? {};
  const composto = copia.regras?.composto ?? {};
  const semana = Number(numeroSemana);
  const outras = (composto.excecoes ?? []).filter((e) => Number(e.semana) !== semana);

  copia.regras = {
    ...(copia.regras ?? {}),
    composto: {
      ...composto,
      excecoes: pisoRir === null || pisoRir === undefined
        ? outras
        : [...outras, { semana, somenteUltimaSerie: true, pisoRir: Number(pisoRir) }],
    },
  };
  return normalizar(copia);
}

/** Muda quantas posições a lista de RIR da semana tem. Crescendo, a posição
 *  nova repete o último RIR — que é exatamente o que a periodização já faz com
 *  a série além da lista, então o número que estava na tela não muda de valor
 *  ao virar posição de verdade. */
export function comPosicoesNaSemana(periodizacao, numeroSemana, quantidade) {
  const semana = semanaDoBloco(periodizacao, numeroSemana);
  const lista = [...(semana?.rirPorSerie ?? [])];
  const alvo = Math.min(Math.max(Math.trunc(Number(quantidade)) || 1, 1), MAXIMO_DE_POSICOES);

  while (lista.length > alvo) lista.pop();
  while (lista.length < alvo) lista.push(lista[lista.length - 1] ?? 0);

  return comSemana(periodizacao, numeroSemana, { rirPorSerie: lista });
}

/** O mesmo RIR em todas as posições da semana. É o "RIR da semana inteira" da
 *  tela: um toque em vez de um por série. */
export function comRirEmTodaASemana(periodizacao, numeroSemana, rir) {
  const semana = semanaDoBloco(periodizacao, numeroSemana);
  const quantas = (semana?.rirPorSerie ?? [0]).length;
  return comSemana(periodizacao, numeroSemana, {
    rirPorSerie: Array.from({ length: quantas }, () => Number(rir)),
  });
}

/** Muda quantas semanas o bloco tem.
 *
 *  A decisão de produto que mora aqui: **quando a última semana é a leve, ela
 *  continua sendo a última.** Encurtar um bloco de 6 para 4 tira semanas
 *  cheias do fim e mantém o deload no lugar dele, porque tirar o deload seria
 *  mudar o desenho do bloco quando ele só pediu um bloco mais curto. Semana
 *  nova nasce como cópia da última semana cheia — o jeito mais previsível de
 *  crescer sem inventar RIR nenhum.
 *
 *  Encurtar até uma semana só é o único caso em que o deload cai: um bloco de
 *  uma semana é a primeira semana, não a leve. */
export function comQuantidadeDeSemanas(periodizacao, quantidade) {
  const copia = clonar(periodizacao) ?? {};
  const semanas = copia.semanas ?? [];
  const alvo = Math.min(Math.max(Math.trunc(Number(quantidade)) || 1, 1), MAXIMO_DE_SEMANAS);
  if (semanas.length === alvo) return normalizar(copia);

  const ultimaEDeload = semanas.length > 0 && semanas[semanas.length - 1].deload === true;
  const guardarODeload = ultimaEDeload && alvo >= 2;
  const deload = guardarODeload ? semanas[semanas.length - 1] : null;
  const cheias = guardarODeload ? semanas.slice(0, -1) : semanas;

  const quantasCheias = alvo - (deload ? 1 : 0);
  const novas = cheias.slice(0, quantasCheias);
  const molde = novas[novas.length - 1] ?? cheias[cheias.length - 1] ?? deload ?? { rirPorSerie: [0] };

  while (novas.length < quantasCheias) {
    const nova = clonar(molde);
    // A semana nova nunca nasce leve, nem quando o molde era: o deload é uma
    // escolha do Lucca, não efeito colateral de aumentar o bloco.
    delete nova.seriesFator;
    delete nova.seriesArredondamento;
    delete nova.cargaFator;
    delete nova.numero;
    novas.push({ ...nova, deload: false, aplicarRegrasDeTipo: true, rotulo: '' });
  }
  if (deload) novas.push(deload);

  // As semanas vão ser renumeradas por posição, e a exceção do composto aponta
  // para número de semana: sem este mapa, "a última série pode ir a 0 na semana
  // 5" continuaria na 5 depois de a semana 5 virar a 7.
  const deParaNumero = new Map();
  novas.forEach((semana, posicao) => {
    if (semana.numero !== undefined) deParaNumero.set(Number(semana.numero), posicao + 1);
  });

  const composto = copia.regras?.composto ?? {};
  copia.regras = {
    ...(copia.regras ?? {}),
    composto: {
      ...composto,
      excecoes: (composto.excecoes ?? [])
        .filter((e) => deParaNumero.has(Number(e.semana)))
        .map((e) => ({ ...e, semana: deParaNumero.get(Number(e.semana)) })),
    },
  };
  copia.semanas = novas;
  return normalizar(copia);
}

/** Duas periodizações são a mesma coisa? Compara as duas já arrumadas, para
 *  diferença de forma (campo a mais, número escrito como texto) não passar por
 *  diferença de conteúdo. Quem usa é o botão de voltar ao padrão, para dizer
 *  quando não há nada a restaurar. */
export function saoIguais(uma, outra) {
  return JSON.stringify(normalizar(uma)) === JSON.stringify(normalizar(outra));
}
