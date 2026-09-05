// Editar treino: nome, subtítulo de foco, dia da semana e a ordem dos
// exercícios.
//
// Três decisões mandam neste arquivo:
//
// 1. **Ela abre por cima, sem trocar de endereço.** É isso que faz a mesma tela
//    servir para editar um treino da lista e para editar o treino que está
//    acontecendo agora: aberta no meio da sessão, a sessão continua montada
//    atrás, com o cronômetro correndo e a rolagem onde estava. Fechar devolve o
//    Lucca exatamente onde ele estava.
// 2. **Ela grava em silêncio e cuida do próprio pedaço de tela.** A cada tecla,
//    sem botão de salvar. Redesenhar o app inteiro a cada letra tiraria o
//    teclado da mão dele no meio da palavra — o mesmo motivo que a tela da
//    sessão já tinha na M3. Ao fechar, ela avisa uma vez só.
// 3. **Reordenar é por botão de subir e descer.** Nada de arrastar: alvo de
//    toque grande, uma mão, e cada toque diz em voz alta onde o exercício
//    ficou.

import * as dados from '../dados.js';
import { nomeVisivel } from '../rotinas.js';
import { adicionarExercicio } from './exercicio.js';
import { painel } from './painel.js';
import {
  el, DIAS_DA_SEMANA, avisar, confirmar, escolher, contar, campoDeTexto, formatarDataCurta,
} from '../ui.js';

// ------------------------------------------------------------ as peças

/** Os sete dias e o "sem dia", cada um um botão do tamanho de um dedo. Um
 *  seletor de lista rolante seria menor na tela e pior na mão suada. */
function escolhaDoDia({ valor, aoMudar }) {
  const numero = Number(valor);
  let atual = Number.isFinite(numero) && numero >= 1 && numero <= 7 ? numero : null;

  const grade = el('div', {
    classe: 'grade-dias',
    role: 'group',
    'aria-label': 'Dia da semana',
    'data-teste': 'dias-da-semana',
  });

  const opcoes = [...DIAS_DA_SEMANA, { numero: null, nome: 'Sem dia definido', curto: 'Sem dia' }];

  const pintar = () => {
    grade.replaceChildren(...opcoes.map((dia) => el('button', {
      classe: `chip-dia ${atual === dia.numero ? 'chip-ligado' : ''}`.trim(),
      type: 'button',
      'data-teste': dia.numero === null ? 'dia-nenhum' : 'dia',
      'data-dia': dia.numero === null ? 'nenhum' : String(dia.numero),
      'aria-pressed': String(atual === dia.numero),
      'aria-label': dia.nome,
      texto: dia.curto,
      onclick: () => {
        atual = dia.numero;
        pintar();
        aoMudar(dia.numero);
      },
    })));
  };

  pintar();
  return grade;
}

/** A ordem dos exercícios. A lista se redesenha sozinha depois de cada toque e
 *  devolve o foco ao mesmo botão, para dar para subir um exercício três
 *  posições sem tirar o dedo do lugar. */
function ordemDosExercicios(rotinaId) {
  const aviso = el('p', {
    classe: 'ordem-aviso', role: 'status', 'aria-live': 'polite', 'data-teste': 'ordem-aviso',
  });
  const lista = el('ol', { classe: 'ordem-lista', 'data-teste': 'ordem-exercicios' });

  const mover = async (exercicio, passo) => {
    try {
      const resultado = await dados.moverExercicioDaRotina(
        rotinaId, exercicio.id, passo, { silencioso: true });
      if (!resultado.mudou) return;

      pintar({ id: exercicio.id, direcao: passo < 0 ? 'cima' : 'baixo' });
      aviso.textContent = `${exercicio.nome} agora é o ${resultado.posicao}º exercício.`;
    } catch (erro) {
      avisar(`Não consegui mover: ${erro.message}`);
    }
  };

  const botaoDeMover = (exercicio, passo, desligado) => el('button', {
    classe: 'botao-mover',
    type: 'button',
    disabled: desligado,
    'data-teste': passo < 0 ? 'subir-exercicio' : 'descer-exercicio',
    'data-exercicio': exercicio.id,
    'data-direcao': passo < 0 ? 'cima' : 'baixo',
    'aria-label': `${passo < 0 ? 'Subir' : 'Descer'} ${exercicio.nome}`,
    texto: passo < 0 ? '↑' : '↓',
    onclick: () => mover(exercicio, passo),
  });

  const linha = (exercicio, indice, total) => el('li', {
    classe: 'ordem-item', 'data-teste': 'ordem-item',
  }, [
    el('span', { classe: 'exercicio-ordem', texto: String(indice + 1) }),
    el('span', { classe: 'ordem-nome', 'data-teste': 'ordem-nome', texto: exercicio.nome }),
    el('div', { classe: 'ordem-botoes' }, [
      botaoDeMover(exercicio, -1, indice === 0),
      botaoDeMover(exercicio, +1, indice === total - 1),
    ]),
  ]);


  function pintar(focar = null) {
    const exercicios = dados.visaoDoTreino(rotinaId)?.exercicios ?? [];
    lista.replaceChildren(...exercicios.map((e, i) => linha(e, i, exercicios.length)));

    if (!focar) return;
    const daMesmaDirecao = `[data-exercicio="${focar.id}"][data-direcao="${focar.direcao}"]`;
    const botao = lista.querySelector(`${daMesmaDirecao}:not([disabled])`)
      ?? lista.querySelector(`[data-exercicio="${focar.id}"]:not([disabled])`);
    botao?.focus();
  }

  pintar();

  const exercicios = dados.visaoDoTreino(rotinaId)?.exercicios ?? [];

  return el('section', { classe: 'painel-bloco' }, [
    el('h3', { classe: 'painel-titulo', texto: 'Ordem dos exercícios' }),
    exercicios.length > 1
      ? el('p', { classe: 'painel-nota', texto: 'A ordem que você deixar aqui é a ordem em que o treino aparece na tela.' })
      : null,
    exercicios.length
      ? lista
      : el('p', {
        classe: 'painel-nota',
        'data-teste': 'sem-exercicios',
        texto: 'Este treino ainda não tem exercício nenhum. Toque em "Adicionar exercício" aqui embaixo.',
      }),
    aviso,
    el('button', {
      classe: 'botao botao-neutro',
      type: 'button',
      'data-teste': 'adicionar-exercicio-no-editor',
      texto: '+ Adicionar exercício',
      onclick: () => adicionarExercicio(rotinaId, { aoTerminar: () => pintar() }),
    }),
    el('p', { classe: 'painel-nota', texto: 'Para mudar as séries, a faixa de reps ou o descanso de um exercício, feche aqui e toque em "Editar" no exercício.' }),
  ]);
}

// ------------------------------------------------------------ as ações

async function duplicar(rotinaId, fechar) {
  try {
    const copia = await dados.duplicarRotina(rotinaId);
    avisar(`"${nomeVisivel(copia.nome)}" foi criado com os mesmos exercícios e as mesmas séries. Nenhum treino registrado foi copiado.`);
    fechar({ irPara: `#/treino/${copia.id}` });
  } catch (erro) {
    avisar(`Não consegui duplicar: ${erro.message}`);
  }
}

async function excluir(rotina, fechar) {
  const nome = nomeVisivel(rotina.nome);
  const conta = dados.contagemDeSessoes(rotina.id);

  const oQueAconteceComOHistorico = () => {
    if (conta.registradas === 0) {
      return `Você ainda não registrou nenhum treino com "${nome}", então não há histórico envolvido.`;
    }
    if (conta.registradas === 1) {
      return `O treino que você já fez com "${nome}" continua no histórico, do jeito que foi feito. Excluir aqui não apaga nada do que você treinou.`;
    }
    return `Os ${conta.registradas} treinos que você já fez com "${nome}" continuam no histórico, do jeito que foram feitos. Excluir aqui não apaga nada do que você treinou.`;
  };

  const linhas = [
    oQueAconteceComOHistorico(),
    'Ele sai da sua lista de treinos. Os exercícios continuam existindo para os outros treinos.',
  ];
  if (conta.abertas > 0) {
    linhas.push('Você tem um treino deste em andamento. Ele continua aberto e dá para finalizar normalmente — o que você já marcou não se perde.');
  }

  const temCerteza = await confirmar({
    titulo: `Excluir "${nome}"?`,
    linhas,
    confirmarTexto: 'Excluir treino',
    perigo: true,
  });
  if (!temCerteza) return;

  try {
    await dados.excluirRotina(rotina.id);
    avisar(conta.registradas > 0
      ? `"${nome}" saiu da lista. ${contar(conta.registradas, 'treino registrado', 'treinos registrados')} com ele continuam em "Treinos registrados".`
      : `"${nome}" saiu da lista.`);
    fechar({ irPara: '#/' });
  } catch (erro) {
    avisar(`Não consegui excluir: ${erro.message}`);
  }
}

// ------------------------------- restaurar a configuração original (M9)
//
// Duas coisas moram aqui, e as duas falam de "como este treino era":
//
//  - **Restaurar** recria a estrutura a partir de um ponto de volta. São dois
//    pontos possíveis, e a tela nunca esconde de qual está falando: a
//    configuração de fábrica (o treino como veio na ficha inicial) e a
//    referência que o Lucca marcou.
//  - **Marcar como referência** guarda a configuração de hoje para ele poder
//    voltar a ela depois. Treino que ele criou não tem configuração de fábrica,
//    e é por aqui que ele ganha um caminho de volta.
//
// A confirmação diz o que volta e o que fica, com número, e o que fica é
// sempre a mesma coisa: todo treino registrado. Restaurar não escreve em
// documento de sessão nenhum.

/** O que fica igual depois de restaurar, em português e com número. */
function oQueFicaComoEsta(visao) {
  const linhas = [];

  linhas.push(visao.sessoesRegistradas === 0
    ? `Você ainda não registrou nenhum treino com "${visao.nome}", então não há histórico envolvido.`
    : `Fica como está: ${contar(visao.sessoesRegistradas, 'treino que você já registrou', 'treinos que você já registrou')} com "${visao.nome}", com a carga, as reps e o RIR de cada série exatamente como você deixou. Restaurar não encosta em treino registrado.`);

  if (visao.sessoesAbertas > 0) {
    linhas.push('O treino deste que está em andamento também continua como está, do jeito que você começou. A configuração restaurada vale do próximo em diante.');
  }

  linhas.push('Os outros treinos e a periodização do bloco não mudam.');
  return linhas;
}

async function restaurar(rotinaId, origem, fechar) {
  const visao = dados.visaoDaRestauracao(rotinaId);
  const ponto = origem === 'fabrica' ? visao.fabrica : visao.referencia;
  if (!ponto) return;

  const deOnde = origem === 'fabrica'
    ? 'como veio de fábrica'
    : `para a configuração que você marcou em ${formatarDataCurta(ponto.marcadaEm)}`;

  if (ponto.jaEstaAssim) {
    avisar(`"${visao.nome}" já está exatamente assim. Não mudei nada.`);
    return;
  }

  const linhas = [
    `Volta: ${contar(ponto.exercicios, 'exercício', 'exercícios')} na ordem original, com ${contar(ponto.series, 'série planejada', 'séries planejadas')}, as faixas de reps e os descansos daquele momento.`,
    `Hoje ele tem ${contar(visao.agora.exercicios, 'exercício', 'exercícios')} e ${contar(visao.agora.series, 'série planejada', 'séries planejadas')}. O que você mudou depois sai do treino.`,
  ];
  if (ponto.voltamAoCatalogo > 0) {
    linhas.push(`${contar(ponto.voltamAoCatalogo, 'exercício volta', 'exercícios voltam')} para a sua lista de exercícios, porque o treino restaurado usa ${ponto.voltamAoCatalogo === 1 ? 'ele' : 'eles'}.`);
  }
  linhas.push(...oQueFicaComoEsta(visao));
  linhas.push('Se não for o que você queria, dá para desfazer logo depois, no botão que aparece embaixo.');

  const temCerteza = await confirmar({
    titulo: `Restaurar "${visao.nome}" ${deOnde}?`,
    linhas,
    confirmarTexto: 'Restaurar',
    perigo: true,
  });
  if (!temCerteza) return;

  try {
    const feito = await dados.restaurarTreino(rotinaId, origem);
    avisar(feito.sessoesIntocadas > 0
      ? `"${feito.nome}" voltou com ${contar(feito.depois.exercicios, 'exercício', 'exercícios')} e ${contar(feito.depois.series, 'série planejada', 'séries planejadas')}. ${contar(feito.sessoesIntocadas, 'treino registrado continua', 'treinos registrados continuam')} intacto${feito.sessoesIntocadas === 1 ? '' : 's'}.`
      : `"${feito.nome}" voltou com ${contar(feito.depois.exercicios, 'exercício', 'exercícios')} e ${contar(feito.depois.series, 'série planejada', 'séries planejadas')}.`);
    fechar({});
  } catch (erro) {
    avisar(`Não consegui restaurar: ${erro.message}`);
  }
}

async function marcarReferencia(rotinaId, jaTinha) {
  if (jaTinha) {
    const trocar = await confirmar({
      titulo: 'Guardar esta configuração no lugar da anterior?',
      linhas: [
        `Você já tinha marcado uma referência deste treino em ${formatarDataCurta(jaTinha.marcadaEm)}, com ${contar(jaTinha.exercicios, 'exercício', 'exercícios')} e ${contar(jaTinha.series, 'série planejada', 'séries planejadas')}. Ela vai ser trocada pela de agora.`,
        'A configuração de fábrica continua onde está: ela nunca é trocada.',
        'Nenhum treino registrado muda com isso.',
      ],
      confirmarTexto: 'Guardar esta',
    });
    if (!trocar) return;
  }

  try {
    const feito = await dados.marcarReferenciaDoTreino(rotinaId);
    avisar(`Guardei "${feito.nome}" como está agora: ${contar(feito.exercicios, 'exercício', 'exercícios')} e ${contar(feito.series, 'série planejada', 'séries planejadas')}. Dá para voltar a esta configuração quando quiser.`);
  } catch (erro) {
    avisar(`Não consegui guardar: ${erro.message}`);
  }
}

/** O bloco de restaurar dentro do painel de editar treino. */
function blocoDaConfiguracaoOriginal(rotinaId, fechar) {
  const visao = dados.visaoDaRestauracao(rotinaId);
  if (!visao) return null;

  const botaoDeRestaurar = (ponto, origem, texto, teste) => (ponto
    ? el('button', {
      classe: 'botao botao-neutro', type: 'button', 'data-teste': teste,
      texto: ponto.jaEstaAssim ? `${texto} — já está assim` : texto,
      onclick: () => restaurar(rotinaId, origem, fechar),
    })
    : null);

  return el('section', { classe: 'painel-bloco bloco-referencia' }, [
    el('h3', { classe: 'painel-titulo', texto: 'Voltar este treino como ele era' }),

    el('p', {
      classe: 'painel-nota', 'data-teste': 'alcance-do-restaurar',
      texto: 'Restaurar mexe só na estrutura do treino: exercícios, séries planejadas, faixas de reps e descansos. Os treinos que você já registrou continuam exatamente como estão.',
    }),

    botaoDeRestaurar(visao.fabrica, 'fabrica', 'Restaurar como veio de fábrica', 'restaurar-fabrica'),
    visao.fabrica
      ? el('p', { classe: 'painel-nota', 'data-teste': 'sobre-a-fabrica',
        texto: `Como este treino estava no primeiro dia: ${contar(visao.fabrica.exercicios, 'exercício', 'exercícios')} e ${contar(visao.fabrica.series, 'série planejada', 'séries planejadas')}.` })
      : el('p', { classe: 'painel-nota', 'data-teste': 'sem-fabrica',
        texto: 'Este treino não veio na sua ficha inicial, então ele não tem configuração de fábrica. Marque a configuração de hoje como referência aqui embaixo para ter um caminho de volta.' }),

    botaoDeRestaurar(visao.referencia, 'referencia', 'Restaurar a configuração que eu guardei', 'restaurar-referencia'),
    visao.referencia
      ? el('p', { classe: 'referencia-marca', 'data-teste': 'sobre-a-referencia' }, [
        el('span', { classe: 'referencia-marca-forte', texto: `Guardada em ${formatarDataCurta(visao.referencia.marcadaEm)}: ` }),
        `${contar(visao.referencia.exercicios, 'exercício', 'exercícios')} e ${contar(visao.referencia.series, 'série planejada', 'séries planejadas')}.`,
      ])
      : null,

    el('button', {
      classe: 'botao botao-neutro', type: 'button', 'data-teste': 'marcar-referencia',
      texto: 'Guardar a configuração de hoje',
      onclick: () => marcarReferencia(rotinaId, visao.referencia),
    }),
    el('p', { classe: 'painel-nota',
      texto: 'Guardar tira uma foto do treino do jeito que ele está agora. Depois de mexer bastante, um toque traz esta foto de volta. Guardar de novo troca a anterior.' }),
  ]);
}

// ------------------------------------------------------------- o painel

/** Abre a tela de editar treino por cima do que está na tela.
 *
 *  `dentroDaSessao` tira duplicar e excluir de vista: no meio de um treino em
 *  andamento essas duas não são edição, são desvio. Nome, foco e ordem — que é
 *  o que a regra 7 do CONTEXTO pede durante a sessão — continuam todos ali. */
export function editarTreino(rotinaId, { dentroDaSessao = false } = {}) {
  const rotina = dados.rotinaMesmoExcluida(rotinaId);
  const conta = dados.contagemDeSessoes(rotinaId);

  painel({
    titulo: 'Editar treino',
    teste: 'editor-treino',
    focar: '[data-teste="campo-nome-treino"]',
    nota: dentroDaSessao
      ? 'Tudo aqui salva sozinho e vale já para o treino de hoje. Fechar volta para onde você parou.'
      : 'Tudo aqui salva sozinho. Não existe botão de salvar.',
    montar: (fechar) => (rotina
    ? [
      el('section', { classe: 'painel-bloco' }, [
        campoDeTexto({
          rotulo: 'Nome do treino',
          valor: rotina.nome,
          teste: 'campo-nome-treino',
          aoMudar: (texto) => dados
            .editarRotina(rotinaId, { nome: texto }, { silencioso: true })
            .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`)),
        }),
        campoDeTexto({
          rotulo: 'Foco',
          dica: 'A linha que aparece embaixo do nome, tipo "Push A, peito prioritário".',
          valor: rotina.foco,
          teste: 'campo-foco-treino',
          aoMudar: (texto) => dados
            .editarRotina(rotinaId, { foco: texto }, { silencioso: true })
            .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`)),
        }),
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Dia da semana' }),
        escolhaDoDia({
          valor: rotina.diaSemana,
          aoMudar: (dia) => dados
            .editarRotina(rotinaId, { diaSemana: dia }, { silencioso: true })
            .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`)),
        }),
      ]),

      ordemDosExercicios(rotinaId),

      conta.abertas > 0
        ? el('p', { classe: 'painel-aviso', 'data-teste': 'aviso-sessao-aberta',
          texto: 'Você tem um treino deste em andamento. O nome, o foco e a ordem que você deixar aqui já valem para ele. O que você marcou como feito continua marcado, com a mesma carga e as mesmas reps.' })
        : null,

      // Restaurar fica de fora do painel aberto durante o treino, pelo mesmo
      // motivo de duplicar e excluir: no meio de uma série, trocar a estrutura
      // inteira do treino não é edição, é desvio. E ela não mudaria o treino de
      // hoje de qualquer jeito — a configuração restaurada vale do próximo em
      // diante.
      dentroDaSessao ? null : blocoDaConfiguracaoOriginal(rotinaId, fechar),

      dentroDaSessao
        ? null
        : el('section', { classe: 'painel-bloco' }, [
          el('h3', { classe: 'painel-titulo', texto: 'Este treino' }),
          el('button', {
            classe: 'botao botao-neutro', type: 'button', 'data-teste': 'duplicar-treino',
            texto: 'Duplicar este treino',
            onclick: () => duplicar(rotinaId, fechar),
          }),
          el('p', { classe: 'painel-nota', texto: 'A cópia vem com os mesmos exercícios e as mesmas séries. Ela nasce sem histórico: os treinos que você já fez continuam sendo deste aqui.' }),
          el('button', {
            classe: 'botao botao-perigo', type: 'button', 'data-teste': 'excluir-treino',
            texto: 'Excluir este treino',
            onclick: () => excluir(rotina, fechar),
          }),
          el('p', { classe: 'painel-nota', texto: 'Excluir tira o treino da lista. Os treinos que você já registrou com ele continuam no histórico.' }),
        ]),
    ]
    : [
      el('p', { classe: 'painel-aviso', 'data-teste': 'treino-sumiu',
        texto: 'Este treino não está mais na sua lista. Se você tem um treino dele em andamento, ele continua valendo e vai para o histórico normalmente.' }),
    ]),
  });
}

// ------------------------------------------------------- criar treino novo

/** Abre o treino recém-criado e a tela de edição dele por cima: treino novo sem
 *  nome não serve para nada, e o primeiro campo do painel é o nome. */
function abrirParaEditar(rotinaId) {
  let jaAbriu = false;

  // Espera a tela do treino entrar, para o painel abrir por cima dela e não por
  // cima da tela de onde ele veio. São dois caminhos porque nenhum dos dois
  // sozinho é garantido: a troca de endereço pode chegar antes ou depois do
  // relógio.
  //
  // Quem chegar primeiro abre e **apaga o outro**. O `{ once: true }` que
  // estava aqui antes só se gastava se o `hashchange` acontecesse; quando o
  // relógio ganhava a corrida, o ouvinte ficava armado e a próxima troca de
  // tela do app reabria este painel do nada, por cima de onde ele estivesse.
  const abrir = () => {
    if (jaAbriu) return;
    jaAbriu = true;
    window.removeEventListener('hashchange', abrir);
    editarTreino(rotinaId);
  };

  window.addEventListener('hashchange', abrir);
  setTimeout(abrir, 120);
  location.hash = `#/treino/${rotinaId}`;
}

/** Treino novo: do zero ou copiando a estrutura de um que já existe. */
export async function novoTreino() {
  const existentes = dados.rotinas();

  const escolha = existentes.length
    ? await escolher({
      titulo: 'Treino novo',
      linhas: ['Copiar traz os exercícios e as séries de um treino que você já tem. Nunca traz o histórico: os treinos que você já fez continuam sendo do original.'],
      opcoes: [
        { texto: 'Começar do zero', valor: 'vazio', teste: 'novo-vazio' },
        { texto: 'Copiar um treino que já tenho', valor: 'copiar', teste: 'novo-copiando' },
      ],
    })
    : 'vazio';

  if (escolha === null) return;

  try {
    if (escolha === 'vazio') {
      const nova = await dados.criarRotina({ nome: 'Novo treino' });
      abrirParaEditar(nova.id);
      return;
    }

    const qual = await escolher({
      titulo: 'Copiar qual treino?',
      linhas: ['A cópia vem com os mesmos exercícios, séries, faixas de reps e descansos. Você muda o que quiser depois.'],
      opcoes: existentes.map((r) => ({ texto: nomeVisivel(r.nome), valor: r.id, destaque: false })),
    });
    if (qual === null) return;

    const copia = await dados.duplicarRotina(qual);
    avisar('Cópia criada com os mesmos exercícios e as mesmas séries. Nenhum treino registrado foi copiado.');
    abrirParaEditar(copia.id);
  } catch (erro) {
    avisar(`Não consegui criar o treino: ${erro.message}`);
  }
}
