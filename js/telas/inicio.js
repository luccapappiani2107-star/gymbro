// Tela inicial: a semana do bloco e os treinos.

import * as dados from '../dados.js';
import { novoTreino } from './editor.js';
import { el, nomeDoDia, etiqueta, estadoVazio, formatarDataCurta } from '../ui.js';

/** Treino começado e não finalizado. Aparece no alto da tela inicial porque é o
 *  caminho mais curto de volta para dentro do treino: abrir o app e tocar uma
 *  vez. Sessão interrompida não pode virar treino perdido. */
function cartaoEmAndamento(sessao) {
  const conta = sessao.resumo;

  return el('a', {
    classe: 'cartao-andamento',
    href: `#/sessao/${sessao.id}`,
    'data-teste': 'continuar-treino',
  }, [
    el('div', { classe: 'andamento-texto' }, [
      el('p', { classe: 'andamento-titulo', texto: `${sessao.rotinaNome} em andamento` }),
      el('p', {
        classe: 'andamento-linha',
        texto: `${formatarDataCurta(sessao.data)} · ${conta.concluidas} de ${conta.total} séries`,
      }),
    ]),
    el('span', { classe: 'andamento-acao', texto: 'Continuar' }),
  ]);
}

function cartaoDaSemana(semana) {
  const chips = semana.rirBase.map((rir, indice) =>
    el('span', { classe: 'chip-rir' }, [
      el('span', { classe: 'chip-rir-numero', texto: String(rir) }),
      el('span', { classe: 'chip-rir-rotulo', texto: `${indice + 1}ª` }),
    ]));

  // O cartão inteiro é o caminho para a periodização: é o número que ele olha
  // todo dia, e é dele que sai a vontade de mexer no bloco. Um botãozinho ao
  // lado seria alvo pequeno numa tela usada com a mão suada.
  return el('a', {
    classe: `cartao-semana ${semana.deload ? 'e-deload' : ''}`.trim(),
    href: '#/periodizacao',
    'data-teste': 'ir-periodizacao',
  }, [
    el('div', { classe: 'linha-semana' }, [
      el('p', { classe: 'semana-titulo', 'data-teste': 'semana-atual',
        texto: `Bloco ${semana.bloco} · Semana ${semana.numero} de ${semana.total}` }),
      semana.deload ? etiqueta('semana leve', 'etiqueta-deload') : null,
      el('span', { classe: 'treino-seta', texto: '›' }),
    ]),
    // O rótulo só aparece quando diz algo a mais que "Semana 1 de 6".
    semana.rotulo && semana.rotulo !== `Semana ${semana.numero}`
      ? el('p', { classe: 'semana-rotulo', texto: semana.rotulo })
      : null,
    el('p', { classe: 'semana-legenda', texto: 'RIR programado desta semana, série por série' }),
    el('div', { classe: 'chips-rir', 'data-teste': 'rir-da-semana' }, chips),
    semana.explicacao ? el('p', { classe: 'semana-nota', texto: semana.explicacao }) : null,
    el('p', { classe: 'semana-nota semana-atalho', texto: 'Tocar aqui abre a periodização: semanas, RIR e semana leve.' }),
  ]);
}

function cartaoDoTreino(treino) {
  return el('a', {
    classe: 'cartao-treino',
    href: `#/treino/${treino.id}`,
    'data-teste': 'cartao-treino',
  }, [
    el('div', { classe: 'treino-cabecalho' }, [
      el('h2', { classe: 'treino-nome', texto: treino.nome }),
      el('span', { classe: 'treino-seta', texto: '›' }),
    ]),
    treino.foco ? el('p', { classe: 'treino-foco', texto: treino.foco }) : null,
    el('div', { classe: 'treino-rodape' }, [
      etiqueta(nomeDoDia(treino.diaSemana)),
      etiqueta(`${treino.exercicios} exercícios`),
      etiqueta(`${treino.series} séries`),
    ]),
  ]);
}

export function telaInicial() {
  const semana = dados.visaoDaSemana();
  const treinos = dados.visaoDosTreinos();
  const emAndamento = dados.visaoDaSessaoEmAndamento();
  const contagens = dados.contagens();
  const registrados = contagens.sessoes;

  return el('div', { classe: 'pagina' }, [
    el('header', { classe: 'topo topo-inicio' }, [
      el('h1', { classe: 'marca', texto: 'GYMBRO' }),
      el('a', { classe: 'botao-topo', href: '#/ajustes', 'aria-label': 'Backup e informações',
        'data-teste': 'ir-ajustes', texto: '⋯' }),
    ]),
    emAndamento ? cartaoEmAndamento(emAndamento) : null,
    cartaoDaSemana(semana),
    el('h2', { classe: 'titulo-secao', texto: 'Seus treinos' }),
    treinos.length
      ? el('div', { classe: 'lista-treinos' }, treinos.map(cartaoDoTreino))
      : estadoVazio({
        titulo: 'Nenhum treino aqui ainda',
        texto: 'Crie um treino no botão aqui embaixo. Se você já usou o GYMBRO em outro celular, traga seus treinos pelo arquivo de backup.',
        acaoTexto: 'Abrir backup',
        acaoHref: '#/ajustes',
      }),
    el('button', {
      classe: 'botao botao-neutro',
      type: 'button',
      'data-teste': 'novo-treino',
      texto: '+ Novo treino',
      onclick: () => novoTreino(),
    }),
    el('a', { classe: 'linha-atalho', href: '#/catalogo', 'data-teste': 'ir-catalogo' }, [
      el('span', { classe: 'atalho-texto', texto: 'Meus exercícios' }),
      el('span', { classe: 'atalho-valor', texto: String(contagens.exerciciosNoCatalogo) }),
      el('span', { classe: 'treino-seta', texto: '›' }),
    ]),
    el('a', { classe: 'linha-atalho', href: '#/historico', 'data-teste': 'ir-historico' }, [
      el('span', { classe: 'atalho-texto', texto: 'Treinos registrados' }),
      el('span', { classe: 'atalho-valor', texto: registrados === 0 ? 'nenhum ainda' : String(registrados) }),
      el('span', { classe: 'treino-seta', texto: '›' }),
    ]),
  ]);
}
