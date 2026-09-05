// O histórico: o que o Lucca já treinou.
//
// Esta tela só lê. Nada aqui escreve em sessão registrada — histórico é sagrado
// (regra 3 do CONTEXTO). Quem quiser mexer, mexe na sessão enquanto ela está
// aberta; depois de finalizada, o que ficou registrado ficou.

import * as dados from '../dados.js';
import {
  el, cabecalho, etiqueta, estadoVazio, formatarCarga, formatarNumero,
  formatarDataCurta, formatarHora, formatarDuracao, formatarFaixaDeReps,
} from '../ui.js';

function contagemEmPalavras(conta) {
  const partes = [`${conta.concluidas} de ${conta.total} séries`];
  if (conta.emBranco > 0) partes.push(`${conta.emBranco} em branco`);
  return partes.join(' · ');
}

// ------------------------------------------------------------- a lista

function linhaDoHistorico(sessao) {
  const aberta = sessao.status === 'aberta';

  return el('a', {
    classe: `cartao-treino ${aberta ? 'cartao-aberto' : ''}`.trim(),
    href: aberta ? `#/sessao/${sessao.id}` : `#/historico/${sessao.id}`,
    'data-teste': 'linha-historico',
  }, [
    el('div', { classe: 'treino-cabecalho' }, [
      el('h2', { classe: 'treino-nome', texto: sessao.rotinaNome }),
      el('span', { classe: 'treino-seta', texto: '›' }),
    ]),
    el('p', { classe: 'treino-foco', texto: formatarDataCurta(sessao.data) }),
    el('div', { classe: 'treino-rodape' }, [
      aberta ? etiqueta('não finalizado', 'etiqueta-andamento') : null,
      etiqueta(contagemEmPalavras(sessao.resumo)),
      etiqueta(`Semana ${sessao.semana}`),
    ]),
  ]);
}

export function telaDoHistorico() {
  const lista = dados.visaoDoHistorico();

  return el('div', { classe: 'pagina' }, [
    cabecalho('Treinos registrados', { voltarPara: '#/' }),
    lista.length
      ? el('div', { classe: 'lista-treinos', 'data-teste': 'lista-historico' },
        lista.map(linhaDoHistorico))
      : estadoVazio({
        titulo: 'Você ainda não registrou nenhum treino',
        texto: 'Assim que você iniciar e finalizar um treino, ele aparece aqui com carga, reps e RIR de cada série.',
        acaoTexto: 'Ver meus treinos',
        acaoHref: '#/',
      }),
  ]);
}

// ------------------------------------------------------- uma sessão inteira

function serieRegistrada(serie, numero) {
  const feita = serie.concluida;
  const semNada = serie.carga === null && serie.reps === null && serie.rirReal === null;

  const feito = feita || !semNada
    ? `${formatarCarga(serie.carga)} × ${serie.reps === null ? '—' : serie.reps} reps`
    : 'não realizada';

  const rir = (rotulo, valor, classe = '') =>
    el('span', { classe: `rir-lado ${classe}`.trim() }, [
      el('span', { classe: 'rir-lado-rotulo', texto: rotulo }),
      el('span', { classe: 'rir-lado-numero', texto: valor === null || valor === undefined ? '—' : String(valor) }),
    ]);

  const mudouOAlvo = serie.rirUsado !== serie.rirProgramado;

  return el('li', {
    classe: `serie-registrada ${feita ? '' : 'serie-nao-feita'}`.trim(),
    'data-teste': 'serie-registrada',
    'data-concluida': feita ? 'sim' : 'nao',
  }, [
    el('div', { classe: 'registrada-topo' }, [
      el('span', { classe: 'serie-numero', texto: `${numero}ª` }),
      el('span', { classe: 'registrada-feito', 'data-teste': 'registrada-feito', texto: feito }),
      // A série acrescentada fora do planejado fica dita no histórico. Sem a
      // marca, um treino de 4 séries num exercício de 3 pareceria erro.
      serie.extra
        ? el('span', { classe: 'etiqueta etiqueta-extra', 'data-teste': 'extra-registrada', texto: 'extra' })
        : null,
      el('span', {
        classe: `registrada-marca ${feita ? 'marca-sim' : 'marca-nao'}`,
        'aria-label': feita ? 'série concluída' : 'série não realizada',
        texto: feita ? '✓' : '·',
      }),
    ]),
    // Programado e usado lado a lado, sempre: é a promessa do modelo de dados.
    // O programado é o que a periodização mandou naquele dia e ficou gravado;
    // o usado é o alvo que ele escolheu de pé, na academia; o real é quantas
    // reps ele achou que sobraram. Os três moram em campos diferentes, e
    // nenhum deles reescreve o outro — nem aqui, nem em lugar nenhum.
    el('div', { classe: 'rir-lado-a-lado', 'data-teste': 'rir-lado-a-lado' }, [
      rir('programado', serie.rirProgramado),
      rir('usado', serie.rirUsado, mudouOAlvo ? 'rir-mudado' : ''),
      rir('real', serie.rirReal, 'rir-real-registrado'),
    ]),
    // A carga sugerida daquele dia, quando ela existiu e ele preferiu outra.
    // Não é erro dele nem do app: é a sugestão sendo sugestão.
    serie.sugestao && serie.sugestao.carga !== null && serie.carga !== null
      && Number(serie.sugestao.carga) !== Number(serie.carga)
      ? el('p', { classe: 'registrada-sugestao', 'data-teste': 'sugestao-registrada',
        texto: `sugerido ${formatarCarga(serie.sugestao.carga)} · você usou ${formatarCarga(serie.carga)}` })
      : null,
  ]);
}

function exercicioRegistrado(exercicio, posicao) {
  const grupos = [exercicio.grupoPrincipal, exercicio.grupoSecundario].filter(Boolean).join(' · ');
  const feitas = exercicio.series.filter((s) => s.concluida).length;

  return el('article', { classe: 'cartao-exercicio', 'data-teste': 'exercicio-registrado' }, [
    el('div', { classe: 'exercicio-cabecalho' }, [
      el('span', { classe: 'exercicio-ordem', texto: String(posicao) }),
      el('h3', { classe: 'exercicio-nome', texto: exercicio.nome }),
      el('span', {
        classe: `exercicio-contagem ${feitas === exercicio.series.length ? 'completo' : ''}`.trim(),
        texto: `${feitas}/${exercicio.series.length}`,
      }),
    ]),
    el('div', { classe: 'exercicio-etiquetas' }, [
      etiqueta(formatarFaixaDeReps(exercicio.repMin, exercicio.repMax)),
      grupos ? etiqueta(grupos) : null,
    ]),
    el('ul', { classe: 'lista-series-sessao' },
      exercicio.series.map((serie, indice) => serieRegistrada(serie, indice + 1))),
    exercicio.nota
      ? el('p', { classe: 'exercicio-nota', texto: exercicio.nota })
      : null,
  ]);
}

function cartaoDoResumo(sessao) {
  const conta = sessao.resumo;
  const aberta = sessao.status === 'aberta';

  const linha = (rotulo, valor) =>
    el('div', { classe: 'linha-info' }, [
      el('span', { classe: 'info-rotulo', texto: rotulo }),
      el('span', { classe: 'info-valor', texto: valor }),
    ]);

  return el('section', { classe: 'cartao' }, [
    el('div', { classe: 'treino-rodape' }, [
      etiqueta(formatarDataCurta(sessao.data)),
      etiqueta(`Bloco ${sessao.bloco} · Semana ${sessao.semana}`),
      sessao.deload ? etiqueta('semana leve', 'etiqueta-deload') : null,
      aberta ? etiqueta('não finalizado', 'etiqueta-andamento') : null,
    ]),
    sessao.rotinaFoco ? el('p', { classe: 'treino-foco', texto: sessao.rotinaFoco }) : null,
    linha('Séries concluídas', `${conta.concluidas} de ${conta.total}`),
    conta.preenchidasSemMarcar > 0
      ? linha('Preenchidas sem marcar', String(conta.preenchidasSemMarcar))
      : null,
    linha('Séries em branco', conta.emBranco === 0 ? 'nenhuma' : `${conta.emBranco} (não realizadas)`),
    conta.alvoMudado > 0
      ? linha('RIR usado diferente do programado', `${conta.alvoMudado} de ${conta.total}`)
      : null,
    conta.comSugestao > 0
      ? linha('Séries que abriram com carga sugerida', `${conta.comSugestao} de ${conta.total}`)
      : null,
    conta.extras > 0
      ? linha('Séries extras', `${conta.extras} (fora do planejado)`)
      : null,
    linha('Exercícios com série feita', `${conta.exerciciosTocados} de ${conta.exercicios.length}`),
    conta.volume !== null ? linha('Peso total levantado', `${formatarNumero(conta.volume)} kg`) : null,
    conta.repsTotais > 0 ? linha('Reps somadas', String(conta.repsTotais)) : null,
    linha('Começou', formatarHora(sessao.iniciadaEm)),
    aberta ? null : linha('Terminou', formatarHora(sessao.finalizadaEm)),
    aberta ? null : linha('Duração', formatarDuracao(conta.duracaoSegundos)),
    conta.emBranco > 0
      ? el('p', { classe: 'cartao-nota', texto: 'Série em branco fica registrada como não realizada. Ela não conta como zero em lugar nenhum.' })
      : null,
    conta.alvoMudado > 0
      ? el('p', { classe: 'cartao-nota', 'data-teste': 'nota-rir-mudado',
        texto: 'Onde você mudou o RIR usado, o RIR programado daquele dia continua guardado do lado. Os dois ficam, para sempre.' })
      : null,
  ]);
}

export function telaDaSessaoRegistrada(sessaoId) {
  const sessao = dados.visaoDaSessao(sessaoId);

  if (!sessao) {
    return el('div', { classe: 'pagina' }, [
      cabecalho('Treino registrado', { voltarPara: '#/historico' }),
      estadoVazio({
        titulo: 'Não achei esse treino',
        texto: 'Ele pode ter sido apagado neste aparelho.',
        acaoTexto: 'Ver o histórico',
        acaoHref: '#/historico',
      }),
    ]);
  }

  return el('div', { classe: 'pagina' }, [
    cabecalho(sessao.rotinaNome, { voltarPara: '#/historico' }),
    cartaoDoResumo(sessao),
    sessao.nota
      ? el('section', { classe: 'cartao' }, [
        el('h2', { classe: 'cartao-titulo', texto: 'Sua anotação' }),
        el('p', { classe: 'cartao-nota', 'data-teste': 'nota-registrada', texto: sessao.nota }),
      ])
      : null,
    el('div', { classe: 'lista-exercicios' },
      sessao.exercicios.map((exercicio, indice) => exercicioRegistrado(exercicio, indice + 1))),
    sessao.status === 'aberta'
      ? el('a', {
        classe: 'botao botao-primario', href: `#/sessao/${sessao.id}`,
        'data-teste': 'voltar-para-sessao', texto: 'Continuar este treino',
      })
      : null,
  ]);
}
