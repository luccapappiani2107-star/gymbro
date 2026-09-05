// Tela do treino: os exercícios na ordem, com as séries planejadas da semana,
// e o botão que começa o treino de verdade.

import * as dados from '../dados.js';
import { editarTreino } from './editor.js';
import { botaoDeEditar, adicionarExercicio } from './exercicio.js';
import { editarSerie, botoesDaSerie } from './serie.js';
import { fraseDoExercicio } from '../sugestao.js';
import {
  el, cabecalho, etiqueta, nomeDoDia, contar,
  formatarCarga, formatarDescanso, formatarFaixaDeReps, formatarDataCurta,
  estadoVazio, escolher, avisar,
} from '../ui.js';

/** Começa (ou retoma) o treino desta rotina.
 *
 *  Nunca nascem duas sessões abertas do mesmo treino no mesmo dia: se já existe
 *  uma de hoje, o app entra nela. Se a que está aberta é de outro dia — ele
 *  esqueceu de finalizar —, quem decide é o Lucca, porque o app não vai nem
 *  jogar fora o treino antigo nem misturar os dois sem perguntar. */
async function comecarTreino(rotinaId) {
  const deOutroDia = dados.sessaoAbertaDoDia(rotinaId)
    ? null
    : dados.sessaoAbertaDeOutroDia(rotinaId);

  if (deOutroDia) {
    const feitas = deOutroDia.exercicios
      .reduce((total, e) => total + e.series.filter((s) => s.concluida).length, 0);

    const escolha = await escolher({
      titulo: 'Este treino ficou em aberto',
      linhas: [
        `Você começou em ${formatarDataCurta(deOutroDia.data)} e não finalizou, com ${contar(feitas, 'série marcada', 'séries marcadas')}.`,
        'Nada se perde nos dois caminhos: o treino antigo continua guardado do jeito que está.',
      ],
      opcoes: [
        { texto: `Continuar o de ${formatarDataCurta(deOutroDia.data)}`, valor: 'antigo', teste: 'continuar-antigo' },
        { texto: 'Começar um novo hoje', valor: 'novo', teste: 'comecar-novo' },
      ],
    });

    if (escolha === null) return;
    if (escolha === 'antigo') {
      location.hash = `#/sessao/${deOutroDia.id}`;
      return;
    }
  }

  try {
    const { sessao, retomada } = await dados.iniciarSessao(rotinaId);
    if (retomada) avisar('Você já tinha começado este treino hoje. Voltando de onde parou.');
    location.hash = `#/sessao/${sessao.id}`;
  } catch (erro) {
    avisar(`Não consegui começar o treino: ${erro.message}`);
  }
}

/** Uma série planejada. A linha inteira é o botão que abre a série para
 *  editar: na academia, alvo de toque grande vale mais que ícone pequeno. */
function linhaDaSerie(rotinaId, exercicio, serie) {
  const segundaLinha = [formatarDescanso(serie.descansoSegundos)];
  if (serie.cargaAlvo !== null) segundaLinha.push(`alvo ${formatarCarga(serie.cargaAlvo)}`);
  // A carga que o campo do treino vai abrir preenchida, dita antes de começar.
  // Quando ela é a própria carga alvo, o "alvo" logo acima já contou.
  if (serie.sugestao && serie.sugestao.carga !== null
    && (serie.cargaAlvo === null || Number(serie.sugestao.carga) !== Number(serie.cargaAlvo))) {
    segundaLinha.push(`sugerido ${formatarCarga(serie.sugestao.carga)}`);
  }
  if (serie.faixaPropria) segundaLinha.push('faixa própria');

  return el('li', { classe: 'serie-item' }, [
    el('button', {
      classe: `serie serie-toque ${serie.naSemana ? '' : 'serie-fora'}`.trim(),
      type: 'button',
      'data-teste': 'serie-planejada',
      'data-serie': serie.id,
      'aria-label': `Editar a ${serie.numero}ª série de ${exercicio.nome}`,
      onclick: () => editarSerie(rotinaId, exercicio.id, serie.id),
    }, [
      el('span', { classe: 'serie-numero', texto: `${serie.numero}ª` }),
      el('span', { classe: 'serie-reps', texto: formatarFaixaDeReps(serie.repMin, serie.repMax) }),
      el('span', { classe: 'serie-descanso', texto: segundaLinha.join(' · ') }),
      el('span', {
        classe: `serie-rir ${serie.rirFixadoAMao ? 'serie-rir-fixo' : ''}`.trim(),
        'data-teste': 'rir-programado',
        texto: serie.rirProgramado === null ? 'RIR —' : `RIR ${serie.rirProgramado}`,
      }),
    ]),
    serie.notas
      ? el('p', { classe: 'serie-nota', 'data-teste': 'nota-da-serie', texto: serie.notas })
      : null,
  ]);
}

function cartaoDoExercicio(rotinaId, exercicio, posicao) {
  const grupos = [exercicio.grupoPrincipal, exercicio.grupoSecundario].filter(Boolean).join(' · ');

  return el('article', {
    classe: 'cartao-exercicio', 'data-teste': 'exercicio', 'data-exercicio': exercicio.id,
  }, [
    el('div', { classe: 'exercicio-cabecalho' }, [
      el('span', { classe: 'exercicio-ordem', texto: String(posicao) }),
      el('h3', { classe: 'exercicio-nome', texto: exercicio.nome }),
      botaoDeEditar(rotinaId, exercicio.id, exercicio.nome),
    ]),
    el('div', { classe: 'exercicio-etiquetas' }, [
      etiqueta(exercicio.tipo, `etiqueta-${exercicio.tipo}`),
      grupos ? etiqueta(grupos) : null,
      exercicio.unilateral ? etiqueta('um lado por vez') : null,
    ]),
    el('ul', { classe: 'lista-series' },
      exercicio.series.map((serie) => linhaDaSerie(rotinaId, exercicio, serie))),
    // De onde vem a carga que o treino vai sugerir. Fica aqui, e não só dentro
    // do treino em andamento, para ele poder conferir antes de sair de casa.
    el('p', { classe: 'exercicio-sugestao', 'data-teste': 'origem-sugestao',
      texto: fraseDoExercicio(exercicio.series) }),
    botoesDaSerie(rotinaId, exercicio.id),
    exercicio.seriesForaDaSemana > 0
      ? el('p', {
        classe: 'exercicio-nota',
        texto: `Na semana leve valem só as ${exercicio.series.length - exercicio.seriesForaDaSemana} primeiras séries. As outras ficam de fora sem sumir do treino.`,
      })
      : null,
    exercicio.notas ? el('p', { classe: 'exercicio-nota', texto: exercicio.notas }) : null,
    exercicio.notasDoCatalogo
      ? el('p', { classe: 'exercicio-nota', 'data-teste': 'nota-do-catalogo',
        texto: exercicio.notasDoCatalogo })
      : null,
  ]);
}

/** O botão de acrescentar exercício, igual na tela do treino e na do treino em
 *  andamento. */
export function botaoDeAdicionar(rotinaId, { dentroDaSessao = false } = {}) {
  return el('button', {
    classe: 'botao botao-neutro',
    type: 'button',
    'data-teste': dentroDaSessao ? 'adicionar-exercicio-na-sessao' : 'adicionar-exercicio',
    texto: '+ Adicionar exercício',
    onclick: () => adicionarExercicio(rotinaId),
  });
}

export function telaDoTreino(rotinaId) {
  const treino = dados.visaoDoTreino(rotinaId);

  if (!treino) {
    return el('div', { classe: 'pagina' }, [
      cabecalho('Treino', { voltarPara: '#/' }),
      estadoVazio({
        titulo: 'Não encontrei esse treino',
        texto: 'Ele pode ter sido excluído neste aparelho.',
        acaoTexto: 'Ver meus treinos',
        acaoHref: '#/',
      }),
    ]);
  }

  const totalDeSeries = treino.exercicios.reduce((t, e) => t + e.series.length, 0);
  const seriesDeHoje = treino.exercicios.reduce(
    (t, e) => t + e.series.filter((s) => s.naSemana).length, 0);
  const emAberto = dados.sessaoAbertaDoDia(treino.id);

  return el('div', { classe: 'pagina' }, [
    cabecalho(treino.nome, { voltarPara: '#/' }),
    el('section', { classe: 'resumo-treino' }, [
      treino.foco ? el('p', { classe: 'treino-foco', texto: treino.foco }) : null,
      el('div', { classe: 'treino-rodape' }, [
        etiqueta(nomeDoDia(treino.diaSemana)),
        etiqueta(`${treino.exercicios.length} exercícios`),
        etiqueta(`${totalDeSeries} séries`),
      ]),
      el('p', {
        classe: 'treino-semana',
        texto: `${treino.semana.rotulo} · RIR programado ${treino.semana.rirBase.join(', ')}`,
      }),
      treino.semana.explicacao
        ? el('p', { classe: 'semana-nota', texto: treino.semana.explicacao })
        : null,
      treino.exercicios.length
        ? el('button', {
          classe: 'botao botao-primario botao-comecar',
          type: 'button',
          'data-teste': 'iniciar-treino',
          texto: emAberto
            ? 'Continuar o treino de hoje'
            : `Iniciar treino · ${seriesDeHoje} séries`,
          onclick: () => comecarTreino(treino.id),
        })
        : null,
      el('button', {
        classe: 'botao botao-neutro',
        type: 'button',
        'data-teste': 'editar-treino',
        texto: 'Editar treino',
        onclick: () => editarTreino(treino.id),
      }),
    ]),
    treino.exercicios.length
      ? el('div', { classe: 'lista-exercicios' },
        treino.exercicios.map((exercicio, indice) =>
          cartaoDoExercicio(treino.id, exercicio, indice + 1)))
      : estadoVazio({
        titulo: 'Esse treino está sem exercícios',
        texto: 'Toque em "Adicionar exercício" aqui embaixo para escolher um do seu catálogo ou criar um agora.',
      }),
    botaoDeAdicionar(treino.id),
  ]);
}
