// Editar exercício: todos os campos, e as ações de mover, duplicar, trocar por
// outro e excluir.
//
// Três decisões mandam neste arquivo:
//
// 1. **Uma tela só, com os campos separados pelo alcance de cada um.** O bloco
//    de cima muda o exercício em todos os treinos (é o catálogo); o de baixo
//    muda só neste treino (é a prescrição). A tela diz isso em palavras, porque
//    é a única coisa aqui que não dá para adivinhar olhando.
// 2. **Ela grava a cada tecla e não se redesenha sozinha.** Mesmo motivo da M3
//    e da M4: redesenhar tiraria o teclado da mão dele no meio da palavra.
// 3. **Aberta durante o treino, ela diz o que aconteceu com o treino de hoje.**
//    Cada ação avisa, em uma frase, se a mudança valeu só para a estrutura ou
//    também para a sessão que está acontecendo — e o que foi feito hoje nunca
//    se perde no caminho.

import * as dados from '../dados.js';
import { escolherDoCatalogo } from './catalogo.js';
import { editarSerie, editarSeriesDoExercicio } from './serie.js';
import { painel } from './painel.js';
import {
  el, avisar, confirmar, contar, formatarCarga, formatarDescanso, formatarFaixaDeReps,
  campoDeTexto, campoDeInteiro, escolhaEmChips, contadorDeToque,
} from '../ui.js';
import { paraInteiro } from '../util.js';

const OPCOES_DE_TIPO = [
  { valor: 'composto', texto: 'Composto' },
  { valor: 'isolador', texto: 'Isolador' },
];

const OPCOES_DE_LADO = [
  { valor: false, texto: 'Os dois juntos' },
  { valor: true, texto: 'Um lado por vez' },
];

/** O exercício como ele está agora, com o catálogo já juntado. Relido a cada
 *  uso porque a tela grava em silêncio: quem pergunta depois de uma mudança
 *  precisa da versão nova. */
function olhar(rotinaId, exercicioDaRotinaId) {
  const treino = dados.visaoDoTreino(rotinaId);
  const exercicio = treino?.exercicios.find((e) => e.id === exercicioDaRotinaId) ?? null;
  return exercicio ? { treino, exercicio } : null;
}

/** "O treino que você já fez" e "Os 3 treinos que você já fez": contagem em
 *  português, sem o "(s)" pendurado e sem "Os 1 treinos". */
function oQueJaFoiTreinado(quantos, nome) {
  return quantos === 1
    ? `O treino que você já fez com "${nome}" continua no histórico, do jeito que foi feito.`
    : `Os ${quantos} treinos que você já fez com "${nome}" continuam no histórico, do jeito que foram feitos.`;
}

/** A frase que explica o que acabou de acontecer, quando existe treino em
 *  andamento deste treino. Sem ela, mudar o descanso no meio da série deixaria
 *  o Lucca sem saber se valeu para hoje ou só para semana que vem. */
function contarOQueAconteceu(base, alcancouASessao) {
  return alcancouASessao
    ? `${base} Vale para o treino de hoje e para as próximas semanas.`
    : `${base} Vale a partir do próximo treino.`;
}

// ------------------------------------------------------------- as ações

async function mover(rotinaId, exercicio, passo, fechar) {
  try {
    const resultado = await dados.moverExercicioDaRotina(rotinaId, exercicio.id, passo, { silencioso: true });
    if (!resultado.mudou) return;
    avisar(`${exercicio.nome} agora é o ${resultado.posicao}º exercício.`);
    fechar();
  } catch (erro) {
    avisar(`Não consegui mover: ${erro.message}`);
  }
}

async function duplicar(rotinaId, exercicio, fechar) {
  try {
    const { sessoesAlcancadas } = await dados.duplicarExercicioDaRotina(rotinaId, exercicio.id, { silencioso: true });
    avisar(contarOQueAconteceu(
      `Mais um "${exercicio.nome}" entrou logo abaixo, com as mesmas ${contar(exercicio.series.length, 'série', 'séries')}.`,
      sessoesAlcancadas > 0));
    fechar();
  } catch (erro) {
    avisar(`Não consegui duplicar: ${erro.message}`);
  }
}

async function excluir(rotinaId, exercicio, fechar) {
  const conta = dados.contagemDeSessoesDoExercicio(exercicio.id);

  const linhas = [
    conta.registradas === 0
      ? `Você ainda não registrou nenhum treino com "${exercicio.nome}" neste treino, então não há histórico envolvido.`
      : `${oQueJaFoiTreinado(conta.registradas, exercicio.nome)} Excluir aqui não apaga nada do que você treinou.`,
    'Ele sai deste treino. O exercício continua no seu catálogo e nos outros treinos que usam ele.',
  ];
  if (conta.abertas > 0) {
    linhas.push('Você tem um treino deste em andamento. Se você já preencheu alguma série dele hoje, ela continua lá até você finalizar.');
  }

  const temCerteza = await confirmar({
    titulo: `Tirar "${exercicio.nome}" deste treino?`,
    linhas,
    confirmarTexto: 'Tirar do treino',
    perigo: true,
  });
  if (!temCerteza) return;

  try {
    const resultado = await dados.excluirExercicioDaRotina(rotinaId, exercicio.id, { silencioso: true });
    if (resultado.ficouEmHoje > 0) {
      avisar(`"${exercicio.nome}" saiu do treino. As séries que você já fez hoje continuam no treino de hoje até você finalizar.`);
    } else {
      avisar(contarOQueAconteceu(`"${exercicio.nome}" saiu do treino.`, resultado.saiuDeHoje > 0));
    }
    fechar();
  } catch (erro) {
    avisar(`Não consegui tirar: ${erro.message}`);
  }
}

/** Trocar por outro exercício.
 *
 *  A frase da confirmação é a parte importante: ela promete, em português, o
 *  que o modelo de dados garante — o que já foi treinado continua sendo do
 *  exercício que ele realmente fez, e os dois históricos nunca viram um só. */
async function substituir(rotinaId, exercicio, fechar) {
  const escolhido = await escolherDoCatalogo({
    titulo: `Trocar "${exercicio.nome}" por qual?`,
    linhas: [
      'A troca vale deste treino em diante. O que você já treinou continua registrado no nome do exercício que você fez de verdade — os dois nunca viram um histórico só.',
      'A quantidade de séries, a faixa de reps e o descanso vêm junto, e você muda o que quiser depois.',
    ],
    semEste: exercicio.exercicioId,
  });
  if (!escolhido) return;

  const conta = dados.contagemDeSessoesDoExercicio(exercicio.id);
  const nomeNovo = dados.nomeDoExercicio(escolhido);

  const linhas = [
    `"${exercicio.nome}" sai e "${nomeNovo}" entra no lugar, com as mesmas ${contar(exercicio.series.length, 'série', 'séries')}.`,
  ];
  if (conta.registradas > 0) {
    linhas.push(`${oQueJaFoiTreinado(conta.registradas, exercicio.nome)} A troca não reescreve nada do que passou, e a carga de um nunca vai virar sugestão do outro.`);
  }
  if (conta.abertas > 0) {
    linhas.push('Você tem um treino deste em andamento. Se você já fez alguma série do antigo hoje, ela continua lá; o novo entra no lugar dele.');
  }

  const temCerteza = await confirmar({
    titulo: `Trocar por "${nomeNovo}"?`,
    linhas,
    confirmarTexto: 'Trocar exercício',
  });
  if (!temCerteza) return;

  try {
    const resultado = await dados.substituirExercicioDaRotina(rotinaId, exercicio.id, escolhido, { silencioso: true });
    if (resultado.ficouEmHoje > 0) {
      avisar(`"${resultado.nomeNovo}" entrou no lugar. As séries que você já fez no "${resultado.nomeAntigo}" continuam no treino de hoje, no nome dele.`);
    } else {
      avisar(contarOQueAconteceu(
        `"${resultado.nomeAntigo}" virou "${resultado.nomeNovo}".`,
        resultado.sessoesAlcancadas > 0));
    }
    fechar();
  } catch (erro) {
    avisar(`Não consegui trocar: ${erro.message}`);
  }
}

/** Acrescentar um exercício ao treino, escolhendo do catálogo ou criando na
 *  hora. Fica aqui, e não na tela, porque a mesma função serve à tela do treino
 *  e à tela do treino em andamento. */
export async function adicionarExercicio(rotinaId, { depoisDe = null, aoTerminar = null } = {}) {
  const escolhido = await escolherDoCatalogo({
    titulo: 'Adicionar exercício',
    linhas: ['Escolha um exercício que você já tem ou crie um agora. As séries, a faixa de reps e o descanso entram iguais aos do exercício de cima, e você muda em seguida.'],
  });
  if (!escolhido) return null;

  try {
    const resultado = await dados.adicionarExercicioNaRotina(rotinaId, escolhido, { depoisDe });
    const nome = dados.nomeDoExercicio(escolhido);
    avisar(contarOQueAconteceu(
      `"${nome}" entrou no treino com ${contar(resultado.criado.series.length, 'série', 'séries')}.`,
      resultado.sessoesAlcancadas > 0));

    if (aoTerminar) aoTerminar(resultado.criado);
    return resultado.criado;
  } catch (erro) {
    avisar(`Não consegui adicionar: ${erro.message}`);
    return null;
  }
}

// ------------------------------------------------------------- o painel

/** Abre a tela de editar exercício por cima do que está na tela.
 *
 *  `dentroDaSessao` não esconde nada: a regra 7 do CONTEXTO diz que toda edição
 *  possível fora da sessão também é possível dentro dela. O que muda é o que a
 *  tela fala — durante o treino, cada ação avisa o que aconteceu com o treino
 *  de hoje. */
export function editarExercicio(rotinaId, exercicioDaRotinaId, { dentroDaSessao = false } = {}) {
  const visto = olhar(rotinaId, exercicioDaRotinaId);
  if (!visto) {
    avisar('Não achei esse exercício no treino.');
    return;
  }

  const { treino, exercicio } = visto;
  const posicao = treino.exercicios.findIndex((e) => e.id === exercicioDaRotinaId);
  const total = treino.exercicios.length;
  const onde = dados.ondeOExercicioEUsado(exercicio.exercicioId);
  const grupos = dados.gruposConhecidos();
  const temSessaoAberta = dados.sessoesAbertas().some((s) => s.rotinaId === rotinaId);

  const guardarIdentidade = (mudancas) => dados
    .editarExercicioDoCatalogo(exercicio.exercicioId, mudancas, { silencioso: true })
    .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`));

  const guardarPrescricao = (mudancas) => dados
    .editarExercicioDaRotina(rotinaId, exercicioDaRotinaId, mudancas, { silencioso: true })
    .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`));

  // ---- séries: o contador e a frase que mostra o RIR que a semana manda
  const legendaDasSeries = () => {
    const agora = olhar(rotinaId, exercicioDaRotinaId)?.exercicio;
    if (!agora) return '';
    const rir = agora.series.map((s) => (s.rirProgramado === null ? '—' : s.rirProgramado));
    const fora = agora.seriesForaDaSemana > 0
      ? ` Na semana leve valem só as ${agora.series.length - agora.seriesForaDaSemana} primeiras.`
      : '';
    return `RIR programado desta semana, série por série: ${rir.join(', ')}.${fora}`;
  };

  const contadorDeSeries = contadorDeToque({
    rotulo: 'Número de séries',
    valor: exercicio.series.length,
    minimo: 1,
    maximo: 20,
    teste: 'contador-series',
    legenda: legendaDasSeries(),
    aoMudar: async (quantidade) => {
      try {
        const resultado = await dados.definirQuantidadeDeSeries(
          rotinaId, exercicioDaRotinaId, quantidade, { silencioso: true });
        contadorDeSeries.pintarLegenda(legendaDasSeries());
        repintarSeries();

        if (resultado.presas > 0) {
          avisar(`Tirei o que dava do treino de hoje: ${contar(resultado.presas, 'série já preenchida continua', 'séries já preenchidas continuam')} lá até você finalizar.`);
        } else if (resultado.entraram > 0) {
          avisar(`${contar(resultado.entraram, 'série entrou', 'séries entraram')} no treino de hoje também, já com o RIR da semana.`);
        }
      } catch (erro) {
        avisar(`Não consegui mudar as séries: ${erro.message}`);
      }
    },
  });

  // ---- descanso: o número em segundos, com a leitura em minutos embaixo
  const legendaDoDescanso = el('span', {
    classe: 'campo-dica', 'data-teste': 'descanso-em-palavras',
    texto: formatarDescanso(exercicio.descansoSegundos),
  });

  const campoDoDescanso = campoDeInteiro({
    rotulo: 'Descanso entre séries (segundos)',
    valor: exercicio.descansoSegundos,
    teste: 'campo-descanso',
    aoMudar: (texto) => {
      const segundos = paraInteiro(texto);
      legendaDoDescanso.textContent = segundos === null
        ? 'em branco — o cronômetro não vai ter tempo para contar'
        : formatarDescanso(segundos);
      guardarPrescricao({ descansoSegundos: texto });
    },
  });
  campoDoDescanso.append(legendaDoDescanso);

  // O que fazer depois que este painel fechar de verdade. Ver o botão de editar
  // as séries, mais abaixo, e o comentário de `depoisDeFechar` em painel.js.
  let aoTerminar = null;

  // ---- as séries deste exercício, uma a uma
  //
  // A regra 7 do CONTEXTO diz que toda edição possível fora da sessão também é
  // possível durante o treino, sem sair dele. A tela do treino abre cada série
  // planejada num toque; a tela do treino em andamento mostra as séries de
  // hoje, que são outra coisa — e casar uma com a outra pela posição é
  // justamente o vínculo que a M6 decidiu não inventar. Por isso a lista mora
  // aqui, no painel que abre nos dois lugares: assim carga alvo, faixa de reps
  // só daquela série, RIR fixo e anotação da série têm caminho também de dentro
  // do treino, e o caminho é o mesmo painel dos dois lados.
  const listaDeSeries = el('div', { classe: 'lista-do-plano', 'data-teste': 'series-do-plano' });
  let repintarSeries = () => {};

  const linhaDaSerie = (serie, fechar) => {
    const detalhes = [];
    if (serie.cargaAlvo !== null) detalhes.push(`alvo ${formatarCarga(serie.cargaAlvo)}`);
    if (serie.faixaPropria) detalhes.push('faixa própria');
    if (serie.notas) detalhes.push('com anotação');
    if (!serie.naSemana) detalhes.push('fora da semana leve');

    return el('button', {
      classe: `serie serie-toque ${serie.naSemana ? '' : 'serie-fora'}`.trim(),
      type: 'button',
      'data-teste': 'serie-do-plano',
      'data-serie': serie.id,
      'aria-label': `Editar a ${serie.numero}ª série de ${exercicio.nome}`,
      // Fecha este painel e só então abre o outro, pelo mesmo motivo do botão
      // de editar as séries de uma vez: painel aberto por cima de um que está
      // fechando leva de volta o passo de endereço e se fecha sozinho.
      onclick: () => {
        aoTerminar = () => editarSerie(rotinaId, exercicioDaRotinaId, serie.id, { dentroDaSessao });
        fechar();
      },
    }, [
      el('span', { classe: 'serie-numero', texto: `${serie.numero}ª` }),
      el('span', { classe: 'serie-reps', texto: formatarFaixaDeReps(serie.repMin, serie.repMax) }),
      // A segunda linha só aparece quando a série tem alguma coisa dela. Série
      // que segue o exercício em tudo não precisa dizer isso quatro vezes
      // seguidas.
      el('span', { classe: 'serie-descanso', texto: detalhes.join(' · ') }),
      el('span', {
        classe: `serie-rir ${serie.rirFixadoAMao ? 'serie-rir-fixo' : ''}`.trim(),
        texto: serie.rirProgramado === null ? 'RIR —' : `RIR ${serie.rirProgramado}`,
      }),
    ]);
  };

  // Este painel não se redesenha sozinho (ver a decisão 2, lá em cima), então a
  // lista se repinta na mão quando o número de séries muda.
  const montarListaDeSeries = (fechar) => {
    repintarSeries = () => {
      const agora = olhar(rotinaId, exercicioDaRotinaId)?.exercicio;
      listaDeSeries.replaceChildren(
        ...(agora?.series ?? []).map((serie) => linhaDaSerie(serie, fechar)));
    };
    repintarSeries();
    return listaDeSeries;
  };

  painel({
    titulo: 'Editar exercício',
    teste: 'editor-exercicio',
    depoisDeFechar: () => {
      const fazer = aoTerminar;
      aoTerminar = null;
      if (fazer) fazer();
    },
    nota: dentroDaSessao
      ? 'Tudo aqui salva sozinho. Você está no meio de um treino: cada mudança avisa se ela vale para o treino de hoje também.'
      : 'Tudo aqui salva sozinho. Não existe botão de salvar.',
    montar: (fechar) => [
      el('p', { classe: 'painel-titulo painel-titulo-solto', 'data-teste': 'exercicio-editado',
        texto: `${posicao + 1}º de ${total} · ${exercicio.nome}` }),

      dentroDaSessao || temSessaoAberta
        ? el('p', { classe: 'painel-aviso', 'data-teste': 'aviso-exercicio-na-sessao',
          texto: 'Você tem um treino deste em andamento. O que você mudar aqui vale para o treino de hoje e para as próximas semanas. As séries que você já marcou continuam marcadas, com a mesma carga e as mesmas reps.' })
        : null,

      // ------------------------------------------------- o exercício em si
      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'O exercício' }),
        el('p', { classe: 'painel-nota painel-nota-alta', 'data-teste': 'alcance-do-catalogo',
          texto: onde.treinos.length > 1
            ? `Isto vale em todos os treinos que usam ele: ${onde.treinos.map((t) => t.nome).join(', ')}.`
            : 'Isto é o exercício em si, e vale em todo treino que usar ele.' }),

        campoDeTexto({
          rotulo: 'Nome', valor: exercicio.nome === 'Exercício sem nome' ? '' : exercicio.nome,
          teste: 'campo-nome-exercicio',
          aoMudar: (texto) => guardarIdentidade({ nome: texto }),
        }),
        campoDeTexto({
          rotulo: 'Grupo muscular principal', valor: exercicio.grupoPrincipal ?? '',
          teste: 'campo-grupo-principal', sugestoes: grupos,
          aoMudar: (texto) => guardarIdentidade({ grupoPrincipal: texto }),
        }),
        campoDeTexto({
          rotulo: 'Grupo muscular secundário', dica: 'Pode ficar em branco.',
          valor: exercicio.grupoSecundario ?? '', teste: 'campo-grupo-secundario',
          sugestoes: grupos,
          aoMudar: (texto) => guardarIdentidade({ grupoSecundario: texto }),
        }),
        escolhaEmChips({
          rotulo: 'Tipo', valor: exercicio.tipo, opcoes: OPCOES_DE_TIPO, teste: 'campo-tipo',
          // Espera a gravação para reler: o RIR programado da semana muda
          // quando o exercício vira isolador, e a frase embaixo do contador
          // precisa mostrar o número novo.
          aoMudar: (valor) => guardarIdentidade({ tipo: valor }).then(() => {
            contadorDeSeries.pintarLegenda(legendaDasSeries());
            repintarSeries();
          }),
        }),
        el('p', { classe: 'painel-nota', texto: 'O tipo muda o RIR que a periodização programa: o isolador vai um abaixo do composto. O RIR das séries que você já fez não muda com isso.' }),
        escolhaEmChips({
          rotulo: 'Como você faz', valor: exercicio.unilateral === true, opcoes: OPCOES_DE_LADO,
          teste: 'campo-lado',
          aoMudar: (valor) => guardarIdentidade({ unilateral: valor }),
        }),
      ]),

      // --------------------------------------------- neste treino, só aqui
      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: `Neste treino (${treino.nome})` }),
        el('p', { classe: 'painel-nota painel-nota-alta',
          texto: 'Isto vale só aqui. O mesmo exercício pode ter outras séries e outro descanso em outro treino.' }),

        contadorDeSeries,

        el('div', { classe: 'linha-de-campos' }, [
          campoDeInteiro({
            rotulo: 'Reps, de', valor: exercicio.repMin, teste: 'campo-rep-min',
            aoMudar: (texto) => guardarPrescricao({ repMin: texto }),
          }),
          campoDeInteiro({
            rotulo: 'até', valor: exercicio.repMax, teste: 'campo-rep-max',
            aoMudar: (texto) => guardarPrescricao({ repMax: texto }),
          }),
        ]),

        campoDoDescanso,

        el('button', {
          classe: 'botao botao-neutro', type: 'button', 'data-teste': 'abrir-edicao-em-massa',
          texto: 'Editar séries do exercício',
          // Fecha este painel e só então abre o outro: um painel aberto por
          // cima de um que está fechando levaria de volta o passo de endereço
          // que o primeiro devolveu, e se fecharia sozinho.
          onclick: () => {
            aoTerminar = () => editarSeriesDoExercicio(rotinaId, exercicioDaRotinaId, { dentroDaSessao });
            fechar();
          },
        }),
        el('p', { classe: 'painel-nota', texto: 'Muda o número de séries, a faixa de reps e, se você quiser, o descanso e o RIR — tudo de uma vez, contando antes o que vai acontecer.' }),

        el('h4', { classe: 'painel-subtitulo', texto: 'Cada série, uma por uma' }),
        el('p', { classe: 'painel-nota', texto: 'Toque numa série para dar a ela uma carga alvo, uma faixa de reps só dela, um RIR fixo ou uma anotação.' }),
        montarListaDeSeries(fechar),

        campoDeTexto({
          rotulo: 'Anotação neste treino',
          dica: 'Aparece embaixo do exercício, só neste treino.',
          valor: exercicio.notas ?? '', teste: 'campo-notas-exercicio', linhas: 2,
          aoMudar: (texto) => guardarPrescricao({ notas: texto }),
        }),
      ]),

      // ------------------------------------------------------- as ações
      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Onde ele fica' }),
        el('div', { classe: 'ordem-botoes ordem-botoes-largos' }, [
          el('button', {
            classe: 'botao-mover botao-largo', type: 'button', 'data-teste': 'subir-no-painel',
            disabled: posicao === 0,
            'aria-label': `Subir ${exercicio.nome}`, texto: '↑ Subir',
            onclick: () => mover(rotinaId, exercicio, -1, fechar),
          }),
          el('button', {
            classe: 'botao-mover botao-largo', type: 'button', 'data-teste': 'descer-no-painel',
            disabled: posicao === total - 1,
            'aria-label': `Descer ${exercicio.nome}`, texto: '↓ Descer',
            onclick: () => mover(rotinaId, exercicio, +1, fechar),
          }),
        ]),
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Este exercício no treino' }),

        el('button', {
          classe: 'botao botao-neutro', type: 'button', 'data-teste': 'trocar-exercicio',
          texto: 'Trocar por outro exercício',
          onclick: () => substituir(rotinaId, exercicio, fechar),
        }),
        el('p', { classe: 'painel-nota', texto: 'O novo entra no lugar deste, com as mesmas séries. O que você já treinou continua registrado no nome do exercício que você fez de verdade.' }),

        el('button', {
          classe: 'botao botao-neutro', type: 'button', 'data-teste': 'duplicar-exercicio',
          texto: 'Duplicar este exercício',
          onclick: () => duplicar(rotinaId, exercicio, fechar),
        }),
        el('p', { classe: 'painel-nota', texto: 'Uma cópia entra logo abaixo, com as mesmas séries e o mesmo descanso.' }),

        el('button', {
          classe: 'botao botao-perigo', type: 'button', 'data-teste': 'excluir-exercicio',
          texto: 'Tirar do treino',
          onclick: () => excluir(rotinaId, exercicio, fechar),
        }),
        el('p', { classe: 'painel-nota', texto: 'Ele sai deste treino e continua no seu catálogo. Os treinos que você já registrou com ele não mudam.' }),
      ]),
    ],
  });
}

/** O botão "Editar" que fica em cada exercício, na tela do treino e na tela do
 *  treino em andamento. */
export function botaoDeEditar(rotinaId, exercicioDaRotinaId, nome, { dentroDaSessao = false } = {}) {
  return el('button', {
    classe: 'botao-editar-exercicio',
    type: 'button',
    'data-teste': 'editar-exercicio',
    'data-exercicio': exercicioDaRotinaId,
    'aria-label': `Editar ${nome}`,
    texto: 'Editar',
    onclick: () => editarExercicio(rotinaId, exercicioDaRotinaId, { dentroDaSessao }),
  });
}
