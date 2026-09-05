// A série: editar uma por uma, acrescentar, tirar, e mudar o exercício inteiro
// de uma vez.
//
// Três decisões mandam neste arquivo:
//
// 1. **Editar uma série planejada é editar o plano, não o histórico.** O que
//    esta tela muda vale do próximo treino em diante, e alcança o treino de
//    hoje só naquilo em que faz sentido alcançar. A tela diz isso em palavras,
//    porque é a única coisa aqui que não dá para adivinhar olhando.
// 2. **A série individual grava a cada toque; a edição em massa tem botão.**
//    O app não tem botão de salvar em lugar nenhum (regra 5 do CONTEXTO), e
//    esta é a única exceção — a única tela que não é um campo, e sim uma ação
//    que muda várias séries de uma vez. Por isso ela mostra, antes, o que vai
//    acontecer com o que já está preenchido, e só então oferece o botão.
// 3. **O que já foi executado não é tocado nunca.** Nem por esta tela, nem por
//    nenhuma outra: quem garante isso é `js/dados.js`, e o que este arquivo faz
//    é contar em português o que aquele garante em código.

import * as dados from '../dados.js';
import { painel } from './painel.js';
import { reguaDeRir } from '../sessao.js';
import {
  el, avisar, confirmar, contar, formatarDescanso, formatarFaixaDeReps,
  campoDeTexto, campoDeInteiro, campoDeDecimal, escolhaEmChips, contadorDeToque,
} from '../ui.js';
import { paraInteiro } from '../util.js';

/** O exercício e a série como estão agora. Relido a cada uso porque estas telas
 *  gravam em silêncio: quem pergunta depois de uma mudança precisa da versão
 *  nova. */
function olhar(rotinaId, exercicioDaRotinaId, serieId = null) {
  const treino = dados.visaoDoTreino(rotinaId);
  const exercicio = treino?.exercicios.find((e) => e.id === exercicioDaRotinaId) ?? null;
  if (!exercicio) return null;
  const serie = serieId === null ? null : exercicio.series.find((s) => s.id === serieId) ?? null;
  if (serieId !== null && !serie) return null;
  return { treino, exercicio, serie };
}

/** A faixa de reps do jeito que cabe no meio de uma frase. */
function faixaEmPalavras(min, max) {
  const texto = formatarFaixaDeReps(min, max);
  return texto === 'reps livres' ? 'sem faixa definida' : texto;
}

/** A frase que explica o que acabou de acontecer, quando existe treino em
 *  andamento. A mesma da tela de editar exercício, pelo mesmo motivo: sem ela,
 *  mudar alguma coisa no meio da série deixaria o Lucca sem saber se valeu para
 *  hoje ou só para a semana que vem. */
function contarOQueAconteceu(base, alcancouASessao) {
  return alcancouASessao
    ? `${base} Vale para o treino de hoje e para as próximas semanas.`
    : `${base} Vale a partir do próximo treino.`;
}

// ------------------------------------------------------- as ações da série

/** Acrescenta uma série planejada no fim do exercício. Serve à tela do treino e
 *  à do treino em andamento — no segundo caso ela entra também no treino de
 *  hoje, pela conta da semana daquela sessão. */
export async function adicionarSerie(rotinaId, exercicioDaRotinaId, { aoTerminar = null } = {}) {
  try {
    const feito = await dados.adicionarSeriePlanejada(rotinaId, exercicioDaRotinaId);
    const agora = olhar(rotinaId, exercicioDaRotinaId);
    const rir = agora?.exercicio.series[feito.total - 1]?.rirProgramado;

    avisar(contarOQueAconteceu(
      `Agora são ${contar(feito.total, 'série', 'séries')}${rir === null || rir === undefined ? '' : `, e a nova entra com RIR ${rir}`}.`,
      feito.entraram > 0));

    if (aoTerminar) aoTerminar(feito);
    return feito;
  } catch (erro) {
    avisar(`Não consegui acrescentar a série: ${erro.message}`);
    return null;
  }
}

/** Tira uma série planejada. Pergunta antes quando ela tem valor dentro — na
 *  série planejada ou na série da mesma posição do treino de hoje. */
async function excluirSerie(rotinaId, exercicioDaRotinaId, serie, fechar) {
  let previa;
  try {
    previa = dados.previaDeExcluirSeriePlanejada(rotinaId, exercicioDaRotinaId, serie.id);
  } catch (erro) {
    avisar(`Não consegui tirar a série: ${erro.message}`);
    return;
  }

  const precisaPerguntar = previa.comValor || previa.preenchidaHoje > 0;

  if (precisaPerguntar) {
    const linhas = [];
    if (previa.comValor) {
      linhas.push(`A ${previa.numero}ª série tem coisa que você definiu à mão (carga alvo, faixa própria, RIR fixo ou anotação). Isso sai junto com ela.`);
    }
    if (previa.preenchidaHoje > 0) {
      linhas.push('Você já preencheu essa série no treino de hoje. Ela continua no treino de hoje até você finalizar — sai só do plano das próximas semanas.');
    } else if (previa.saiDeHoje > 0) {
      linhas.push('Ela sai também do treino que está em andamento, onde está em branco.');
    }
    linhas.push('Nenhum treino que você já registrou muda com isso.');

    const temCerteza = await confirmar({
      titulo: `Tirar a ${previa.numero}ª série?`,
      linhas,
      confirmarTexto: 'Tirar a série',
      perigo: true,
    });
    if (!temCerteza) return;
  }

  try {
    const feito = await dados.excluirSeriePlanejada(rotinaId, exercicioDaRotinaId, serie.id, { silencioso: true });
    if (feito.ficouEmHoje > 0) {
      avisar(`A série saiu do treino. A que você já preencheu hoje continua no treino de hoje até você finalizar.`);
    } else {
      avisar(contarOQueAconteceu(
        `Agora são ${contar(feito.total, 'série', 'séries')}.`, feito.saiuDeHoje > 0));
    }
    fechar();
  } catch (erro) {
    avisar(`Não consegui tirar a série: ${erro.message}`);
  }
}

// -------------------------------------------------- o painel de uma série

/** Editar uma série planejada: carga alvo, a faixa de reps só dela, o RIR e a
 *  anotação.
 *
 *  Carga feita, reps feitas, RIR real e "concluída" não estão aqui porque não
 *  existem fora de um treino: elas são o que aconteceu, e o que aconteceu se
 *  registra na tela do treino em andamento. A tela diz isso em uma linha, para
 *  ninguém procurar um campo que não faz sentido existir. */
export function editarSerie(rotinaId, exercicioDaRotinaId, serieId, { dentroDaSessao = false } = {}) {
  const visto = olhar(rotinaId, exercicioDaRotinaId, serieId);
  if (!visto) {
    avisar('Não achei essa série no treino.');
    return;
  }

  const { treino, exercicio, serie } = visto;
  const temSessaoAberta = dados.sessoesAbertas().some((s) => s.rotinaId === rotinaId);

  const guardar = (mudancas) => dados
    .editarSeriePlanejada(rotinaId, exercicioDaRotinaId, serieId, mudancas, { silencioso: true })
    .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`));

  // ---- RIR: seguir a semana ou fixar um número
  const legendaDoRir = el('p', { classe: 'campo-dica', 'data-teste': 'rir-da-serie-legenda' });

  const pintarLegendaDoRir = () => {
    const agora = olhar(rotinaId, exercicioDaRotinaId, serieId)?.serie;
    if (!agora) return;
    legendaDoRir.textContent = agora.rirFixadoAMao
      ? `Fixo em ${agora.rirProgramado}. Esta série não acompanha mais a periodização; as outras continuam acompanhando.`
      : `Seguindo a periodização: ${agora.rirDaSemana === null ? 'sem programação nesta semana' : `RIR ${agora.rirDaSemana} nesta semana`}. Muda sozinho a cada semana do bloco.`;
  };

  const opcoesDeRir = [
    { valor: null, texto: serie.rirDaSemana === null ? 'Seguir a semana' : `Seguir a semana (${serie.rirDaSemana})` },
    ...reguaDeRir({ rirProgramado: serie.rirDaSemana, rirUsado: serie.rirManual, rirReal: null })
      .map((numero) => ({ valor: numero, texto: `RIR ${numero}` })),
  ];

  // ---- faixa de reps só desta série
  const dicaDaFaixa = `Em branco segue o exercício: ${faixaEmPalavras(exercicio.repMin, exercicio.repMax)}.`;

  painel({
    titulo: 'Editar série',
    teste: 'editor-serie',
    nota: 'Tudo aqui salva sozinho. Não existe botão de salvar.',
    montar: (fechar) => [
      el('p', { classe: 'painel-titulo painel-titulo-solto', 'data-teste': 'serie-editada',
        texto: `${serie.numero}ª de ${exercicio.series.length} · ${exercicio.nome} · ${treino.nome}` }),

      el('p', { classe: 'painel-nota painel-nota-alta', 'data-teste': 'alcance-da-serie',
        texto: 'Isto é o plano desta série. Carga feita, reps feitas, RIR real e marcar como concluída são o que aconteceu no dia, e você preenche na tela do treino em andamento.' }),

      dentroDaSessao || temSessaoAberta
        ? el('p', { classe: 'painel-aviso', 'data-teste': 'aviso-serie-na-sessao',
          texto: 'Você tem um treino deste em andamento. A faixa de reps nova vale para esta série no treino de hoje, se ela ainda não estiver concluída. O RIR de hoje você muda direto na tela do treino, com um toque — mudar aqui não mexe no que você já escolheu lá.' })
        : null,

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Esta série' }),

        campoDeDecimal({
          rotulo: 'Carga alvo (kg)',
          dica: 'Pode ficar em branco. É um ponto de partida, nunca uma trava.',
          valor: serie.cargaAlvo, teste: 'campo-carga-alvo',
          aoMudar: (texto) => guardar({ cargaAlvo: texto }),
        }),

        el('div', { classe: 'linha-de-campos' }, [
          campoDeInteiro({
            rotulo: 'Reps, de', valor: serie.repMinProprio, teste: 'campo-serie-rep-min',
            aoMudar: (texto) => guardar({ repMin: texto }),
          }),
          campoDeInteiro({
            rotulo: 'até', valor: serie.repMaxProprio, teste: 'campo-serie-rep-max',
            aoMudar: (texto) => guardar({ repMax: texto }),
          }),
        ]),
        el('p', { classe: 'campo-dica', texto: dicaDaFaixa }),

        el('div', { classe: 'campo-empilhado' }, [
          escolhaEmChips({
            rotulo: 'RIR desta série', valor: serie.rirManual, opcoes: opcoesDeRir,
            teste: 'campo-rir-da-serie',
            aoMudar: (valor) => guardar({ rirManual: valor }).then(pintarLegendaDoRir),
          }),
          legendaDoRir,
        ]),

        campoDeTexto({
          rotulo: 'Anotação desta série',
          dica: 'Aparece embaixo da série, só nesta.',
          valor: serie.notas ?? '', teste: 'campo-notas-serie', linhas: 2,
          aoMudar: (texto) => guardar({ notas: texto }),
        }),
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Esta série no treino' }),
        el('button', {
          classe: 'botao botao-neutro', type: 'button', 'data-teste': 'adicionar-serie-no-painel',
          texto: '+ Série',
          onclick: () => adicionarSerie(rotinaId, exercicioDaRotinaId, { aoTerminar: () => fechar() }),
        }),
        el('p', { classe: 'painel-nota', texto: 'A série nova entra no fim, seguindo a periodização da semana. Você muda o RIR dela na hora, se quiser.' }),

        el('button', {
          classe: 'botao botao-perigo', type: 'button', 'data-teste': 'excluir-serie',
          texto: 'Excluir série',
          onclick: () => excluirSerie(rotinaId, exercicioDaRotinaId, serie, fechar),
        }),
        el('p', { classe: 'painel-nota', texto: 'Ela sai do plano deste exercício. Os treinos que você já registrou não mudam.' }),
      ]),
    ],
  });

  pintarLegendaDoRir();
}

// ------------------------------------------------------ a edição em massa

const OPCOES_DE_MEXER = [
  { valor: false, texto: 'Deixar como está' },
  { valor: true, texto: 'Mudar também' },
];

/** As frases que a tela mostra antes de aplicar.
 *
 *  A primeira conta o que vai acontecer, em uma frase simples. As outras só
 *  aparecem quando têm o que avisar, e cada uma fala de coisa concreta e
 *  contada: quantas séries saem com valor dentro, quantas já foram feitas hoje,
 *  quantas entram no treino em andamento. */
function frasesDaPrevia(previa, antes, depois, alvo) {
  const partes = [
    `Este exercício passa de ${contar(previa.antes, 'série', 'séries')} de ${faixaEmPalavras(antes.repMin, antes.repMax)} para ${contar(previa.depois, 'série', 'séries')} de ${faixaEmPalavras(depois.repMin, depois.repMax)}.`,
  ];
  if ('descansoSegundos' in alvo) {
    partes.push(`O descanso passa de ${formatarDescanso(antes.descansoSegundos)} para ${formatarDescanso(paraInteiro(alvo.descansoSegundos))}.`);
  }
  if ('rirManual' in alvo) {
    partes.push(alvo.rirManual === null
      ? 'Todas as séries voltam a seguir o RIR da periodização da semana.'
      : `Todas as séries passam a ter RIR ${alvo.rirManual} fixo, sem acompanhar a periodização.`);
  }

  const avisos = [];
  if (previa.removidasComValor > 0) {
    avisos.push(`${contar(previa.removidasComValor, 'das séries que saem tinha', 'das séries que saem tinham')} coisa definida por você (carga alvo, faixa própria, RIR fixo ou anotação), e isso sai junto.`);
  }
  if (previa.faixasProprias > 0) {
    avisos.push(`${contar(previa.faixasProprias, 'série tinha', 'séries tinham')} faixa de reps própria e passa${previa.faixasProprias === 1 ? '' : 'm'} a seguir a faixa nova.`);
  }
  if (previa.rirFixados > 0) {
    avisos.push(`${contar(previa.rirFixados, 'série tinha', 'séries tinham')} RIR fixo, e o número novo entra no lugar.`);
  }
  if (previa.naSessao.sessoes > 0) {
    const daSessao = [];
    if (previa.naSessao.entram > 0) daSessao.push(`${contar(previa.naSessao.entram, 'série entra', 'séries entram')}`);
    if (previa.naSessao.saem > 0) daSessao.push(`${contar(previa.naSessao.saem, 'série em branco sai', 'séries em branco saem')}`);
    avisos.push(daSessao.length
      ? `No treino que está em andamento, ${daSessao.join(' e ')}.`
      : 'O treino que está em andamento não muda de tamanho.');

    if (previa.naSessao.presas > 0) {
      avisos.push(`${contar(previa.naSessao.presas, 'série já preenchida continua', 'séries já preenchidas continuam')} no treino de hoje até você finalizar.`);
    }
    if (previa.naSessao.concluidas > 0) {
      avisos.push(`${contar(previa.naSessao.concluidas, 'série já concluída hoje não muda', 'séries já concluídas hoje não mudam')}: nem a carga, nem as reps, nem o RIR.`);
    }
  }

  return { frase: partes.join(' '), avisos };
}

/** "Editar séries do exercício": muda o exercício inteiro de uma vez.
 *
 *  É a única ação do app que altera muitos registros de uma vez, e por isso a
 *  única com botão de aplicar: a frase de cima conta o que vai acontecer antes
 *  de qualquer coisa mudar, e se alguma coisa preenchida for embora junto, a
 *  janela de confirmação repete isso em voz alta. */
export function editarSeriesDoExercicio(rotinaId, exercicioDaRotinaId, { dentroDaSessao = false } = {}) {
  const visto = olhar(rotinaId, exercicioDaRotinaId);
  if (!visto) {
    avisar('Não achei esse exercício no treino.');
    return;
  }

  const { treino, exercicio } = visto;
  const antes = {
    series: exercicio.series.length,
    repMin: exercicio.repMin,
    repMax: exercicio.repMax,
    descansoSegundos: exercicio.descansoSegundos,
  };

  const escolha = {
    series: antes.series,
    repMin: antes.repMin,
    repMax: antes.repMax,
    mexerNoDescanso: false,
    descansoSegundos: antes.descansoSegundos,
    mexerNoRir: false,
    rirManual: null,
  };

  /** O que vai ser mandado para o módulo de dados. Séries e faixa vão sempre;
   *  descanso e RIR só quando ele pedir. */
  const montarAlvo = () => {
    const alvo = { series: escolha.series, repMin: escolha.repMin, repMax: escolha.repMax };
    if (escolha.mexerNoDescanso) alvo.descansoSegundos = escolha.descansoSegundos;
    if (escolha.mexerNoRir) alvo.rirManual = escolha.rirManual;
    return alvo;
  };

  const frase = el('p', { classe: 'previa-frase', 'data-teste': 'previa-frase' });
  const listaDeAvisos = el('ul', { classe: 'previa-avisos', 'data-teste': 'previa-avisos' });

  const repintarPrevia = () => {
    const alvo = montarAlvo();
    const previa = dados.previaDaEdicaoEmMassa(rotinaId, exercicioDaRotinaId, alvo);
    const dito = frasesDaPrevia(previa, antes, { repMin: escolha.repMin, repMax: escolha.repMax }, alvo);

    frase.textContent = dito.frase;
    listaDeAvisos.replaceChildren(...dito.avisos.map((texto) =>
      el('li', { classe: 'previa-aviso', texto })));
    return { previa, dito };
  };

  const aplicar = async (fechar) => {
    const { previa, dito } = repintarPrevia();

    // Só pergunta quando alguma coisa preenchida vai embora junto. Confirmar o
    // que não perde nada seria só mais um toque no caminho.
    const perdeAlgo = previa.removidasComValor > 0 || previa.rirFixados > 0
      || previa.faixasProprias > 0 || previa.naSessao.saem > 0;

    if (perdeAlgo) {
      const temCerteza = await confirmar({
        titulo: 'Aplicar em todas as séries?',
        linhas: [dito.frase, ...dito.avisos, 'Nenhum treino que você já registrou muda com isso.'],
        confirmarTexto: 'Aplicar',
      });
      if (!temCerteza) return;
    }

    try {
      const feito = await dados.editarSeriesDoExercicio(
        rotinaId, exercicioDaRotinaId, montarAlvo(), { silencioso: true });

      const recado = `${exercicio.nome}: ${contar(feito.depois, 'série', 'séries')} de ${faixaEmPalavras(escolha.repMin, escolha.repMax)}.`;
      if (feito.presas > 0) {
        avisar(`${recado} ${contar(feito.presas, 'série já preenchida continua', 'séries já preenchidas continuam')} no treino de hoje até você finalizar.`);
      } else {
        avisar(contarOQueAconteceu(recado, feito.entraram > 0 || feito.sairam > 0 || feito.sessoesAlcancadas > 0));
      }
      fechar();
    } catch (erro) {
      avisar(`Não consegui aplicar: ${erro.message}`);
    }
  };

  // ---- descanso: só aparece quando ele escolhe mexer
  const campoDoDescanso = campoDeInteiro({
    rotulo: 'Descanso entre séries (segundos)', valor: escolha.descansoSegundos,
    teste: 'campo-descanso-em-massa',
    aoMudar: (texto) => {
      escolha.descansoSegundos = texto;
      repintarPrevia();
    },
  });
  campoDoDescanso.classList.add('escondido');

  // ---- RIR: seguir a periodização ou fixar o mesmo número em todas
  const chipsDeRir = escolhaEmChips({
    rotulo: 'RIR de todas as séries', valor: null,
    opcoes: [
      { valor: null, texto: 'Seguir a periodização' },
      ...reguaDeRir({ rirProgramado: treino.semana.rirBase[0] ?? null, rirUsado: null, rirReal: null })
        .map((numero) => ({ valor: numero, texto: `RIR ${numero}` })),
    ],
    teste: 'campo-rir-em-massa',
    aoMudar: (valor) => {
      escolha.rirManual = valor;
      repintarPrevia();
    },
  });
  chipsDeRir.classList.add('escondido');

  painel({
    titulo: 'Editar séries do exercício',
    teste: 'editor-series',
    nota: 'Esta é a única tela do app com botão: ela muda várias séries de uma vez, então conta antes o que vai acontecer.',
    montar: (fechar) => [
      el('p', { classe: 'painel-titulo painel-titulo-solto', 'data-teste': 'exercicio-em-massa',
        texto: `${exercicio.nome} · ${treino.nome}` }),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Séries e reps' }),

        contadorDeToque({
          rotulo: 'Número de séries', valor: escolha.series, minimo: 1, maximo: 20,
          teste: 'contador-series-em-massa',
          aoMudar: (quantidade) => {
            escolha.series = quantidade;
            repintarPrevia();
          },
        }),

        el('div', { classe: 'linha-de-campos' }, [
          campoDeInteiro({
            rotulo: 'Reps, de', valor: escolha.repMin, teste: 'campo-rep-min-em-massa',
            aoMudar: (texto) => {
              escolha.repMin = paraInteiro(texto);
              repintarPrevia();
            },
          }),
          campoDeInteiro({
            rotulo: 'até', valor: escolha.repMax, teste: 'campo-rep-max-em-massa',
            aoMudar: (texto) => {
              escolha.repMax = paraInteiro(texto);
              repintarPrevia();
            },
          }),
        ]),
        el('p', { classe: 'campo-dica', texto: 'A faixa vale para todas as séries. A que tiver faixa própria volta a seguir esta.' }),
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Descanso' }),
        escolhaEmChips({
          rotulo: 'Mudar o descanso deste exercício?', valor: false,
          opcoes: OPCOES_DE_MEXER, teste: 'mexer-no-descanso',
          aoMudar: (valor) => {
            escolha.mexerNoDescanso = valor;
            campoDoDescanso.classList.toggle('escondido', !valor);
            repintarPrevia();
          },
        }),
        campoDoDescanso,
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'RIR' }),
        escolhaEmChips({
          rotulo: 'Mudar o RIR de todas as séries?', valor: false,
          opcoes: OPCOES_DE_MEXER, teste: 'mexer-no-rir',
          aoMudar: (valor) => {
            escolha.mexerNoRir = valor;
            chipsDeRir.classList.toggle('escondido', !valor);
            repintarPrevia();
          },
        }),
        chipsDeRir,
        el('p', { classe: 'painel-nota', texto: 'Fixar o RIR tira estas séries da periodização até você mandar seguir de novo. O RIR das séries que você já treinou não muda com isso, em caso nenhum.' }),
      ]),

      el('section', { classe: 'painel-bloco painel-bloco-previa' }, [
        el('h3', { classe: 'painel-titulo', texto: 'O que vai acontecer' }),
        frase,
        listaDeAvisos,
        el('button', {
          classe: 'botao botao-primario', type: 'button', 'data-teste': 'aplicar-em-massa',
          texto: 'Aplicar a todas as séries',
          onclick: () => aplicar(fechar),
        }),
        el('p', { classe: 'painel-nota', texto: 'Nada do que você já registrou muda. Série que você já concluiu hoje fica com a carga, as reps e o RIR que ela tem.' }),
      ]),
    ],
  });

  repintarPrevia();
}

// -------------------------------------------------------------- os botões

/** "+ Série" e "Editar séries", os dois embaixo da lista de séries de cada
 *  exercício — na tela do treino e na do treino em andamento. */
export function botoesDaSerie(rotinaId, exercicioDaRotinaId, { dentroDaSessao = false } = {}) {
  return el('div', { classe: 'serie-acoes' }, [
    el('button', {
      classe: 'botao-serie', type: 'button', 'data-teste': 'adicionar-serie',
      'data-exercicio': exercicioDaRotinaId,
      texto: '+ Série',
      onclick: () => adicionarSerie(rotinaId, exercicioDaRotinaId, { aoTerminar: () => dados.redesenhar() }),
    }),
    el('button', {
      classe: 'botao-serie', type: 'button', 'data-teste': 'editar-series-do-exercicio',
      'data-exercicio': exercicioDaRotinaId,
      texto: 'Editar séries',
      onclick: () => editarSeriesDoExercicio(rotinaId, exercicioDaRotinaId, { dentroDaSessao }),
    }),
  ]);
}
