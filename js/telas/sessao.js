// A tela do treino em andamento. É a tela mais usada do app: de pé, entre
// séries, com pressa e uma mão só.
//
// Duas decisões que mandam no jeito que este arquivo é escrito:
//
// 1. Ela se desenha uma vez e depois muda só o pedaço que mudou. Não existe
//    redesenho a cada tecla, porque redesenhar tiraria o foco do campo de carga
//    no meio da digitação. Quem alterou o dado foi esta tela, então é ela que
//    sabe atualizar o número na tela sem refazer tudo.
// 2. Toda alteração grava na hora, sem esperar nada e sem botão de salvar.
//    Fechar o app aqui não pode perder série nenhuma.

import * as dados from '../dados.js';
import * as descanso from '../descanso.js';
import { editarTreino } from './editor.js';
import { botaoDeEditar } from './exercicio.js';
import { botaoDeAdicionar } from './treino.js';
import { editarSeriesDoExercicio } from './serie.js';
import { resumo, reguaDeRir, sessaoVazia, serieEmBranco, limitarRir } from '../sessao.js';
import { fraseDoExercicio } from '../sugestao.js';
import { paraNumero, paraInteiro } from '../util.js';
import {
  el, cabecalho, etiqueta, confirmar, avisar, estadoVazio, contar,
  formatarCarga, formatarFaixaDeReps, formatarDescanso, formatarDataCurta,
} from '../ui.js';

/** Texto do campo de carga: guardado é número, digitado é vírgula. */
function comoTexto(valor) {
  return valor === null || valor === undefined ? '' : String(valor).replace('.', ',');
}

function campoDeNumero({ rotulo, valor, modo, teste, aoMudar }) {
  const entrada = el('input', {
    classe: 'campo-entrada',
    type: 'text',
    inputmode: modo,
    autocomplete: 'off',
    enterkeyhint: 'done',
    'data-teste': teste,
    'aria-label': rotulo,
    value: comoTexto(valor),
  });

  entrada.addEventListener('input', () => aoMudar(entrada.value));
  // No celular o teclado ocupa meia tela: Enter fecha em vez de ficar no caminho.
  entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') entrada.blur();
  });

  const nome = el('span', { classe: 'campo-rotulo', texto: rotulo });
  const campo = el('label', { classe: 'campo' }, [nome, entrada]);

  // Quem monta o campo continua precisando dele depois: a carga sugerida marca
  // o rótulo enquanto o número for sugestão, e some quando ele digita.
  campo.entrada = entrada;
  campo.rotulo = nome;
  return campo;
}

// ------------------------------------------------------------------ série

function blocoDaSerie({ sessao, exercicio, serie, numero, aoMudarAlgo, aoConcluir, aoExcluir }) {
  // A posição muda quando uma série sai do meio da lista, então ela é
  // guardada aqui e repintada, em vez de ficar presa no texto de nascença.
  let posicao = numero;

  const salvar = (mudancas) => {
    Object.assign(serie, mudancas);
    dados.atualizarSerie(sessao.id, exercicio.id, serie.id, mudancas)
      .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`));
    aoMudarAlgo();
  };

  // ---- linha de cima: carga, reps e o botão de concluir
  const marcar = el('button', {
    classe: 'marcar', type: 'button', 'data-teste': 'marcar-serie',
    'aria-pressed': String(serie.concluida),
    'aria-label': `Concluir a ${posicao}ª série`,
    texto: '✓',
  });

  const numeroNaTela = el('span', { classe: 'serie-numero', texto: `${posicao}ª` });

  // ---- a carga sugerida (M7)
  //
  // O número aparece dentro do campo, já pronto para ele confirmar, mas **o
  // dado continua em branco** até ele aceitar ou digitar outro. É essa
  // distância entre o que está na tela e o que está guardado que faz a
  // sugestão não virar treino inventado: série que ele não fez continua
  // registrada como não realizada.
  //
  // Aceitar é marcar a série como feita com o número à vista. Digitar outro
  // valor também vale — e a partir do primeiro toque no campo a sugestão sai
  // do caminho: se ele apagar tudo, o campo fica vazio, e não volta sozinho a
  // mostrar o que o app achava.
  const sugerida = serie.sugestao?.carga ?? null;
  let tocouNaCarga = false;

  const marcaDaSugestao = el('span', {
    classe: 'campo-marca', 'data-teste': 'carga-sugerida', texto: ' · sugerido',
  });

  const pintarMarca = () => {
    const mostrando = sugerida !== null && !tocouNaCarga && serie.carga === null;
    marcaDaSugestao.hidden = !mostrando;
    // Quem ouve a tela precisa saber a mesma coisa que quem lê: aquele número
    // é sugestão, não coisa que ele digitou.
    campoDeCarga.entrada.setAttribute(
      'aria-label', mostrando ? `Carga em quilos, sugerido ${sugerida}` : 'Carga (kg)');
  };

  const campoDeCarga = campoDeNumero({
    rotulo: 'Carga (kg)', valor: serie.carga ?? sugerida, modo: 'decimal', teste: 'campo-carga',
    aoMudar: (texto) => {
      tocouNaCarga = true;
      salvar({ carga: paraNumero(texto) });
      pintarMarca();
    },
  });

  if (sugerida !== null) {
    campoDeCarga.rotulo.append(marcaDaSugestao);
    campoDeCarga.entrada.dataset.sugerida = String(sugerida);
  }
  pintarMarca();

  const linhaDeCima = el('div', { classe: 'serie-topo' }, [
    numeroNaTela,
    campoDeCarga,
    campoDeNumero({
      rotulo: 'Reps', valor: serie.reps, modo: 'numeric', teste: 'campo-reps',
      aoMudar: (texto) => salvar({ reps: paraInteiro(texto) }),
    }),
    marcar,
  ]);

  // ---- RIR usado: o número que ele decidiu usar hoje, com o programado do
  // lado. Os dois aparecem sempre, iguais ou diferentes (regra 2 do CONTEXTO):
  // o programado é o que a periodização mandou naquele dia e não é reescrito
  // por nada; o usado nasce igual a ele e é o único que este ± muda.
  const alvo = el('span', {
    classe: 'passo-valor', 'data-teste': 'rir-usado',
    texto: serie.rirUsado === null ? '—' : String(serie.rirUsado),
  });

  const programado = el('span', {
    classe: 'rir-programado', 'data-teste': 'rir-programado',
    texto: serie.rirProgramado === null ? 'sem programação' : `programado ${serie.rirProgramado}`,
  });

  const pintarAlvo = () => {
    alvo.textContent = serie.rirUsado === null ? '—' : String(serie.rirUsado);
    // O programado aparece sempre, igual ou diferente: o Lucca precisa ver de
    // onde veio o número antes de decidir mudar.
    const mudou = serie.rirUsado !== serie.rirProgramado && serie.rirProgramado !== null;
    programado.classList.toggle('rir-mudado', mudou);
    programado.textContent = serie.rirProgramado === null
      ? 'sem programação'
      : mudou ? `programado ${serie.rirProgramado} · mudado por você`
        : `programado ${serie.rirProgramado}`;
  };

  const mexerNoAlvo = (passo) => {
    const base = serie.rirUsado ?? serie.rirProgramado ?? 0;
    const novo = limitarRir(base + passo);
    salvar({ rirUsado: novo });
    pintarAlvo();
  };

  // Tirar a série fica na segunda linha, longe do ✓ e dos campos de carga e
  // reps: o toque errado aqui custaria caro, e a linha de cima é a que ele
  // usa ofegante, entre uma série e outra.
  const tirar = el('button', {
    classe: 'botao-tirar-serie', type: 'button', 'data-teste': 'excluir-serie-da-sessao',
    'data-serie': serie.id,
    'aria-label': `Tirar a ${posicao}ª série do treino de hoje`,
    texto: 'Tirar',
    onclick: () => aoExcluir(serie, posicao),
  });

  const linhaDoAlvo = el('div', { classe: 'serie-linha' }, [
    el('span', { classe: 'serie-etiqueta', texto: 'RIR usado' }),
    el('div', { classe: 'passo' }, [
      el('button', {
        classe: 'passo-botao', type: 'button', 'data-teste': 'rir-usado-menos',
        'aria-label': 'Diminuir o RIR usado hoje', texto: '−', onclick: () => mexerNoAlvo(-1),
      }),
      alvo,
      el('button', {
        classe: 'passo-botao', type: 'button', 'data-teste': 'rir-usado-mais',
        'aria-label': 'Aumentar o RIR usado hoje', texto: '+', onclick: () => mexerNoAlvo(1),
      }),
    ]),
    programado,
    tirar,
  ]);

  // ---- RIR real: quantas reps ele achou que sobraram. Um toque, sem digitar.
  const fichas = el('div', { classe: 'fichas', 'data-teste': 'rir-real' });

  const pintarFichas = () => {
    const opcoes = [null, ...reguaDeRir(serie)];
    fichas.replaceChildren(...opcoes.map((valor) =>
      el('button', {
        classe: `ficha ${valor === null ? 'ficha-branco' : ''} ${serie.rirReal === valor ? 'ficha-ligada' : ''}`.replace(/\s+/g, ' ').trim(),
        type: 'button',
        'data-teste': valor === null ? 'rir-real-limpar' : 'rir-real-opcao',
        'data-valor': valor === null ? 'branco' : String(valor),
        'aria-pressed': String(serie.rirReal === valor),
        'aria-label': valor === null ? 'Não informar o RIR real' : `RIR real ${valor}`,
        texto: valor === null ? '—' : String(valor),
        onclick: () => {
          salvar({ rirReal: valor });
          pintarFichas();
        },
      })));
  };
  pintarFichas();

  const linhaDoReal = el('div', { classe: 'serie-linha serie-linha-empilhada' }, [
    el('span', { classe: 'serie-etiqueta', texto: 'RIR real — quantas reps sobraram' }),
    fichas,
  ]);

  // ---- a série montada
  const bloco = el('li', {
    classe: 'serie-sessao',
    'data-teste': 'serie-sessao',
    'data-serie': serie.id,
    'data-concluida': serie.concluida ? 'sim' : 'nao',
  }, [
    // A marca só aparece na série que foi acrescentada fora do planejado. Ela
    // acompanha a série até o histórico: o que foi feito a mais fica dito.
    serie.extra
      ? el('p', { classe: 'serie-extra', 'data-teste': 'serie-extra',
        texto: 'série extra — fora do planejado' })
      : null,
    linhaDeCima, linhaDoAlvo, linhaDoReal,
  ]);

  const pintarConcluida = () => {
    bloco.dataset.concluida = serie.concluida ? 'sim' : 'nao';
    bloco.classList.toggle('feita', serie.concluida);
    marcar.setAttribute('aria-pressed', String(serie.concluida));
    marcar.setAttribute(
      'aria-label',
      `${serie.concluida ? 'Desmarcar' : 'Concluir'} a ${posicao}ª série`);
  };

  /** A série mudou de lugar porque uma de cima saiu. Repinta o número e o
   *  que os leitores de tela leem — sem refazer a série, que pode estar com
   *  o teclado aberto no campo de carga. */
  bloco.renumerar = (novaPosicao) => {
    posicao = novaPosicao;
    numeroNaTela.textContent = `${posicao}ª`;
    tirar.setAttribute('aria-label', `Tirar a ${posicao}ª série do treino de hoje`);
    pintarConcluida();
  };

  marcar.addEventListener('click', () => {
    const virou = !serie.concluida;
    serie.concluida = virou;
    pintarConcluida();

    // Aceitar a sugestão é isto: marcar a série como feita com o número
    // sugerido à vista, sem ter mexido nele. Só aqui ele deixa de ser um
    // número na tela e vira carga registrada. Se ele tiver tocado no campo —
    // inclusive para apagar —, o que vale é o que ele deixou lá.
    if (virou && !tocouNaCarga && serie.carga === null && sugerida !== null) {
      salvar({ carga: sugerida });
      pintarMarca();
    }

    // O cronômetro começa aqui, dentro do toque, sem esperar a gravação: é o
    // toque que dá ao navegador permissão de tocar som.
    if (virou) {
      descanso.iniciar({
        sessaoId: sessao.id,
        serieId: serie.id,
        rotulo: `${exercicio.nome} · ${posicao}ª série`,
        segundos: exercicio.descansoSegundos,
      });
    } else {
      descanso.limparSeFor(serie.id);
    }

    dados.marcarSerie(sessao.id, exercicio.id, serie.id, virou)
      .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`));

    aoMudarAlgo();
    if (virou) aoConcluir();
  });

  pintarAlvo();
  pintarConcluida();
  return bloco;
}

// --------------------------------------------------------------- exercício

function cartaoDoExercicio({ sessao, exercicio, posicao, aoMudarAlgo, aoConcluir }) {
  // Regra 7 do CONTEXTO: o que dá para editar fora da sessão tem que dar para
  // editar dentro dela. `rotinaExercicioId` é o vínculo com o exercício do
  // treino; sem ele (sessão nascida antes da M4, ou exercício que ele já tirou
  // do treino) não há o que editar na estrutura, e o botão não aparece.
  const podeEditar = Boolean(sessao.rotinaId && exercicio.rotinaExercicioId
    && dados.rotina(sessao.rotinaId)?.exercicios.some((e) => e.id === exercicio.rotinaExercicioId));

  const contador = el('span', { classe: 'exercicio-contagem', 'data-teste': 'contagem-exercicio' });
  const atualizarContagem = () => {
    const feitas = exercicio.series.filter((s) => s.concluida).length;
    contador.textContent = `${feitas}/${exercicio.series.length}`;
    contador.classList.toggle('completo', feitas === exercicio.series.length);
  };

  const anotacao = el('input', {
    classe: 'campo-nota',
    type: 'text',
    'data-teste': 'nota-exercicio',
    'aria-label': `Anotação de ${exercicio.nome}`,
    placeholder: 'Anotação deste exercício',
    value: exercicio.nota ?? '',
  });
  anotacao.addEventListener('input', () => {
    exercicio.nota = anotacao.value;
    dados.anotarExercicio(sessao.id, exercicio.id, anotacao.value)
      .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`));
  });

  const grupos = [exercicio.grupoPrincipal, exercicio.grupoSecundario].filter(Boolean).join(' · ');
  const faixa = formatarFaixaDeReps(exercicio.repMin, exercicio.repMax);

  // De onde saiu a carga que já está nos campos. Nenhum número aparece nesta
  // tela sem uma frase curta dizendo de onde ele veio — e quando não veio de
  // lugar nenhum, a frase diz isso também, com os campos em branco.
  const origemDaCarga = el('p', {
    classe: 'exercicio-sugestao', 'data-teste': 'origem-sugestao',
    texto: fraseDoExercicio(exercicio.series),
  });

  // A lista de séries cresce e encolhe no meio do treino, então ela é montada
  // uma vez e mexida por dentro: refazer o cartão inteiro tiraria o teclado da
  // mão dele e perderia a rolagem.
  const listaDeSeries = el('ul', { classe: 'lista-series-sessao' });

  const montarSerie = (serie, indice) => blocoDaSerie({
    sessao,
    exercicio,
    serie,
    numero: indice + 1,
    aoMudarAlgo: () => {
      atualizarContagem();
      aoMudarAlgo();
    },
    aoConcluir,
    aoExcluir: (alvo, numero) => tirarSerie(alvo, numero),
  });

  const renumerarNaTela = () => {
    [...listaDeSeries.children].forEach((bloco, indice) => bloco.renumerar?.(indice + 1));
  };

  /** Tira uma série do treino de hoje. Pergunta antes se ela tem coisa
   *  preenchida: o que foi feito é trabalho, e some daqui para sempre. */
  const tirarSerie = async (alvo, numero) => {
    if (!serieEmBranco(alvo)) {
      const temCerteza = await confirmar({
        titulo: `Tirar a ${numero}ª série do treino de hoje?`,
        linhas: [
          `Ela tem coisa preenchida: ${formatarCarga(alvo.carga)} × ${alvo.reps === null ? '—' : alvo.reps} reps${alvo.concluida ? ', e está marcada como concluída' : ''}.`,
          'Isso sai do treino de hoje e não vai para o histórico.',
          alvo.extra
            ? 'Ela é uma série extra, então o plano das próximas semanas continua como está.'
            : 'O plano das próximas semanas não muda: a série continua lá, para o próximo treino.',
        ],
        confirmarTexto: 'Tirar a série',
        perigo: true,
      });
      if (!temCerteza) return;
    }

    try {
      await dados.excluirSerieDaSessao(sessao.id, exercicio.id, alvo.id);
      exercicio.series = exercicio.series.filter((s) => s.id !== alvo.id);
      listaDeSeries.querySelector(`[data-serie="${alvo.id}"]`)?.remove();
      renumerarNaTela();
      descanso.limparSeFor(alvo.id);
      atualizarContagem();
      aoMudarAlgo();
      avisar(`Agora são ${contar(exercicio.series.length, 'série', 'séries')} em ${exercicio.nome} hoje.`);
    } catch (erro) {
      avisar(`Não consegui tirar a série: ${erro.message}`);
    }
  };

  /** Acrescenta uma série extra ao treino de hoje. O RIR dela vem da
   *  periodização da semana desta sessão e é ponto de partida, não trava: os
   *  botões de − e + estão logo ali. */
  const acrescentar = async () => {
    try {
      const nova = await dados.adicionarSerieNaSessao(sessao.id, exercicio.id);
      exercicio.series.push(nova);
      listaDeSeries.append(montarSerie(nova, exercicio.series.length - 1));
      atualizarContagem();
      aoMudarAlgo();
      avisar(`${exercicio.series.length}ª série entrou no treino de hoje, marcada como extra${nova.rirProgramado === null ? '' : `, com RIR ${nova.rirProgramado}`}. O plano das próximas semanas não muda.`);
      listaDeSeries.lastElementChild?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (erro) {
      avisar(`Não consegui acrescentar a série: ${erro.message}`);
    }
  };

  listaDeSeries.replaceChildren(...exercicio.series.map(montarSerie));

  const cartao = el('article', {
    classe: 'cartao-exercicio cartao-exercicio-sessao', 'data-teste': 'exercicio-sessao',
  }, [
    el('div', { classe: 'exercicio-cabecalho' }, [
      el('span', { classe: 'exercicio-ordem', texto: String(posicao) }),
      el('h3', { classe: 'exercicio-nome', texto: exercicio.nome }),
      contador,
      podeEditar
        ? botaoDeEditar(sessao.rotinaId, exercicio.rotinaExercicioId, exercicio.nome,
          { dentroDaSessao: true })
        : null,
    ]),
    el('div', { classe: 'exercicio-etiquetas' }, [
      etiqueta(faixa),
      etiqueta(formatarDescanso(exercicio.descansoSegundos)),
      grupos ? etiqueta(grupos) : null,
      exercicio.unilateral ? etiqueta('um lado por vez') : null,
    ]),
    origemDaCarga,
    listaDeSeries,
    // "+ Série" no meio do treino é decisão do dia: entra só aqui, marcada como
    // extra, e o plano das próximas semanas fica como estava. Mudar o plano
    // também dá — é o "Editar" do exercício, logo acima.
    el('div', { classe: 'serie-acoes serie-acoes-sessao' }, [
      el('button', {
        classe: 'botao-serie', type: 'button', 'data-teste': 'adicionar-serie-na-sessao',
        'data-exercicio': exercicio.id,
        texto: '+ Série',
        onclick: acrescentar,
      }),
      // Regra 7 do CONTEXTO: mudar o plano das próximas semanas também dá, sem
      // sair do treino. Este é o outro botão, e ele diz qual é qual.
      podeEditar
        ? el('button', {
          classe: 'botao-serie', type: 'button', 'data-teste': 'editar-series-do-exercicio',
          'data-exercicio': exercicio.rotinaExercicioId,
          texto: 'Editar séries',
          onclick: () => editarSeriesDoExercicio(
            sessao.rotinaId, exercicio.rotinaExercicioId, { dentroDaSessao: true }),
        })
        : null,
      el('span', { classe: 'serie-acoes-nota', texto: '"+ Série" entra só no treino de hoje, marcada como extra. "Editar séries" muda o plano.' }),
    ]),
    anotacao,
  ]);

  atualizarContagem();
  return cartao;
}

// ------------------------------------------------------------- finalização

async function finalizar(sessao) {
  const conta = resumo(sessao);
  const linhas = [
    `${conta.concluidas} de ${conta.total} séries concluídas.`,
  ];
  if (conta.preenchidasSemMarcar > 0) {
    linhas.push(`${contar(conta.preenchidasSemMarcar, 'série você preencheu', 'séries você preencheu')} mas não marcou como feita.`);
  }
  if (conta.emBranco > 0) {
    linhas.push(`${contar(conta.emBranco, 'série ficou em branco', 'séries ficaram em branco')}. Elas entram no histórico como não realizadas, e não como zero.`);
  }
  linhas.push('Depois de finalizar, este treino vira histórico e não muda mais.');

  const querFinalizar = await confirmar({
    titulo: 'Finalizar este treino?',
    linhas,
    confirmarTexto: 'Finalizar treino',
  });
  if (!querFinalizar) return;

  try {
    descanso.limpar();
    await dados.finalizarSessao(sessao.id);
    avisar(`Treino guardado: ${contar(conta.concluidas, 'série', 'séries')}.`);
    location.hash = `#/historico/${sessao.id}`;
  } catch (erro) {
    avisar(`Não consegui finalizar: ${erro.message}`);
  }
}

async function descartar(sessao) {
  if (!sessaoVazia(sessao)) {
    avisar('Este treino já tem coisa preenchida. Finalize para guardar no histórico.');
    return;
  }

  const temCerteza = await confirmar({
    titulo: 'Jogar fora este treino?',
    linhas: [
      'Nada foi preenchido nele, então nada se perde.',
      'Ele some da lista de treino em andamento e não entra no histórico.',
    ],
    confirmarTexto: 'Jogar fora',
    perigo: true,
  });
  if (!temCerteza) return;

  try {
    descanso.limpar();
    await dados.descartarSessaoVazia(sessao.id);
    avisar('Treino descartado.');
    location.hash = '#/';
  } catch (erro) {
    avisar(erro.message);
  }
}

// ------------------------------------------------------------------- tela

export function telaDaSessao(sessaoId) {
  // Cópia própria da tela: ela mexe aqui e manda gravar, sem esperar redesenho.
  const sessao = dados.sessao(sessaoId);

  if (!sessao) {
    return el('div', { classe: 'pagina' }, [
      cabecalho('Treino', { voltarPara: '#/' }),
      estadoVazio({
        titulo: 'Não achei esse treino em andamento',
        texto: 'Ele pode ter sido finalizado ou apagado neste aparelho.',
        acaoTexto: 'Ver meus treinos',
        acaoHref: '#/',
      }),
    ]);
  }

  if (sessao.status !== 'aberta') {
    location.replace(`#/historico/${sessao.id}`);
    return el('div', { classe: 'pagina' }, [
      el('p', { classe: 'carregando', texto: 'Abrindo o treino registrado…' }),
    ]);
  }

  const contagem = el('p', { classe: 'sessao-contagem', 'data-teste': 'progresso-sessao' });
  const barra = el('div', { classe: 'progresso-cheio' });

  // O placar da carga sugerida, dito na tela e não só prometido: quantas séries
  // abriram com número no campo e quantas ficaram em branco por não ter de onde
  // tirar. Ele é contado uma vez, no começo, porque é isso que ele mede — como
  // o treino abriu.
  const contaInicial = resumo(sessao);
  // Treino que começou antes da carga sugerida existir não tem o que contar, e
  // dizer "você ainda não registrou estes exercícios" seria falar do que não
  // sabe: a sessão é que é velha, não o histórico que falta.
  const nasceuSemSugestao = sessao.exercicios
    .every((e) => e.series.every((s) => s.sugestao === undefined));

  const placarDaSugestao = nasceuSemSugestao
    ? 'Este treino começou antes da carga sugerida existir. Os campos ficam como você deixou.'
    : contaInicial.comSugestao === 0
      ? 'Nenhuma série abriu com carga sugerida: você ainda não registrou estes exercícios.'
      : `${contaInicial.comSugestao} de ${contaInicial.total} séries abriram com carga sugerida${contaInicial.semSugestao > 0 ? `, ${contaInicial.semSugestao} em branco` : ''}. Todas são editáveis.`;

  const atualizarProgresso = () => {
    const conta = resumo(sessao);
    contagem.textContent = `${conta.concluidas} de ${conta.total} séries concluídas`;
    barra.style.width = conta.total ? `${Math.round((conta.concluidas / conta.total) * 100)}%` : '0%';
  };

  const rolarParaProxima = () => {
    const proxima = pagina.querySelector('[data-teste="serie-sessao"][data-concluida="nao"]');
    proxima?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const notaDaSessao = el('textarea', {
    classe: 'campo-nota campo-nota-grande',
    rows: '2',
    'data-teste': 'nota-sessao',
    'aria-label': 'Anotação do treino',
    placeholder: 'Como foi o treino de hoje?',
  });
  notaDaSessao.value = sessao.nota ?? '';
  notaDaSessao.addEventListener('input', () => {
    sessao.nota = notaDaSessao.value;
    dados.anotarSessao(sessao.id, notaDaSessao.value)
      .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`));
  });

  const pagina = el('div', { classe: 'pagina' }, [
    cabecalho(sessao.rotinaNome, { voltarPara: '#/' }),

    el('section', { classe: 'cartao cartao-sessao' }, [
      el('div', { classe: 'treino-rodape' }, [
        etiqueta(formatarDataCurta(sessao.data)),
        etiqueta(`Bloco ${sessao.bloco} · Semana ${sessao.semana}`),
        sessao.deload ? etiqueta('semana leve', 'etiqueta-deload') : null,
        etiqueta('em andamento', 'etiqueta-andamento'),
      ]),
      contagem,
      el('div', { classe: 'progresso' }, [barra]),
      el('p', { classe: 'cartao-nota', 'data-teste': 'placar-sugestao', texto: placarDaSugestao }),
      sessao.deload
        ? el('p', { classe: 'cartao-nota cartao-nota-baixa', 'data-teste': 'aviso-deload',
          texto: 'Semana leve: a carga sugerida vem menor de propósito, pela conta da periodização. Você pode mudar em qualquer série.' })
        : null,
      el('p', { classe: 'cartao-nota cartao-nota-baixa', texto: 'O RIR usado nasce igual ao programado. Mudar aqui não muda o plano, e os dois ficam registrados.' }),
      el('p', { classe: 'cartao-nota', texto: 'Tudo que você preencher aqui já fica guardado. Pode fechar o app e voltar depois.' }),
      // Regra 7 do CONTEXTO: o que dá para editar fora da sessão tem que dar
      // para editar dentro dela. O painel abre por cima — o treino continua
      // aqui atrás, com o cronômetro correndo e a rolagem onde estava.
      el('button', {
        classe: 'botao botao-neutro', type: 'button', 'data-teste': 'editar-treino-na-sessao',
        texto: 'Editar treino',
        onclick: () => editarTreino(sessao.rotinaId, { dentroDaSessao: true }),
      }),
    ]),

    el('div', { classe: 'lista-exercicios' },
      sessao.exercicios.map((exercicio, indice) => cartaoDoExercicio({
        sessao,
        exercicio,
        posicao: indice + 1,
        aoMudarAlgo: atualizarProgresso,
        aoConcluir: rolarParaProxima,
      }))),

    // Adicionar exercício no meio do treino: entra no treino de hoje já com o
    // RIR programado desta semana, e fica no treino para as próximas.
    dados.rotina(sessao.rotinaId)
      ? el('section', { classe: 'cartao' }, [
        botaoDeAdicionar(sessao.rotinaId, { dentroDaSessao: true }),
        el('p', { classe: 'cartao-nota cartao-nota-baixa', texto: 'O exercício entra no treino de hoje e fica no treino para as próximas semanas.' }),
      ])
      : null,

    el('section', { classe: 'cartao' }, [
      el('h2', { classe: 'cartao-titulo', texto: 'Anotação do treino' }),
      notaDaSessao,
    ]),

    el('section', { classe: 'cartao' }, [
      el('h2', { classe: 'cartao-titulo', texto: 'Terminar' }),
      el('p', { classe: 'cartao-nota', texto: 'Finalizar guarda este treino no histórico. Série em branco fica registrada como não realizada — nunca vira zero.' }),
      el('button', {
        classe: 'botao botao-primario', type: 'button', 'data-teste': 'finalizar-sessao',
        texto: 'Finalizar treino', onclick: () => finalizar(sessao),
      }),
      el('a', {
        classe: 'botao botao-neutro', href: '#/', 'data-teste': 'sair-sessao',
        texto: 'Sair sem finalizar',
      }),
      el('button', {
        classe: 'botao botao-neutro', type: 'button', 'data-teste': 'descartar-sessao',
        texto: 'Jogar fora este treino', onclick: () => descartar(sessao),
      }),
    ]),
  ]);

  atualizarProgresso();

  // Retomar é chegar onde parou, não no topo. E se o descanso estava correndo
  // quando o app fechou, ele volta com o tempo certo.
  requestAnimationFrame(() => {
    descanso.retomarDaSessao(sessao);
    const proxima = pagina.querySelector('[data-teste="serie-sessao"][data-concluida="nao"]');
    if (proxima && resumo(sessao).concluidas > 0) {
      proxima.scrollIntoView({ block: 'center' });
    }
  });

  return pagina;
}
