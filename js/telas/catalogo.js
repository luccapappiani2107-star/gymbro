// O catálogo: os exercícios que existem no mundo do Lucca.
//
// A diferença entre esta tela e a de editar exercício é a mesma diferença do
// modelo de dados, e ela precisa ficar clara na tela também:
//
// - aqui mora a **identidade** — nome, grupos, composto ou isolador, um lado
//   por vez. Muda aqui, muda em todos os treinos que usam o exercício;
// - a **prescrição** — quantas séries, faixa de reps, descanso — mora dentro de
//   cada treino, e se edita no botão "Editar" do exercício, lá.
//
// Excluir daqui nunca quebra treino nem histórico: o exercício sai da lista e o
// registro continua guardado, então um treino que ainda usa ele continua
// mostrando o nome certo, e um treino já feito continua fazendo sentido.

import * as dados from '../dados.js';
import { nomeVisivel } from '../exercicios.js';
import { painel } from './painel.js';
import {
  el, cabecalho, etiqueta, estadoVazio, avisar, confirmar, contar,
  campoDeTexto, escolhaEmChips, comBotaoDeVoltar,
} from '../ui.js';

/** O que ele digitou na busca. Fica fora da função da tela para sobreviver aos
 *  redesenhos: editar um exercício não pode apagar a busca que ele fez. */
let buscaAtual = '';

const OPCOES_DE_TIPO = [
  { valor: 'composto', texto: 'Composto' },
  { valor: 'isolador', texto: 'Isolador' },
];

const OPCOES_DE_LADO = [
  { valor: false, texto: 'Os dois juntos' },
  { valor: true, texto: 'Um lado por vez' },
];

/** As etiquetas que descrevem um exercício, iguais nas duas listas desta
 *  tela: a do catálogo e a de escolher um. */
function etiquetasDoExercicio(item) {
  const grupos = [item.grupoPrincipal, item.grupoSecundario].filter(Boolean).join(' · ');
  return [
    etiqueta(item.tipo, `etiqueta-${item.tipo}`),
    grupos ? etiqueta(grupos) : null,
    item.unilateral ? etiqueta('um lado por vez') : null,
  ];
}

// ------------------------------------------------- campo de busca reusável

function campoDeBusca({ valor, aoMudar, teste }) {
  const entrada = el('input', {
    classe: 'campo-entrada campo-busca',
    type: 'search',
    inputmode: 'search',
    autocomplete: 'off',
    enterkeyhint: 'search',
    placeholder: 'Buscar por nome ou grupo',
    'aria-label': 'Buscar exercício',
    'data-teste': teste,
    value: valor ?? '',
  });

  entrada.addEventListener('input', () => aoMudar(entrada.value));
  entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') entrada.blur();
  });
  return entrada;
}

// ----------------------------------------------------- criar na hora

/** Formulário curto para inventar um exercício sem sair de onde ele está.
 *  Devolve os campos, ou null se ele desistir. Nome vazio não passa: um
 *  exercício sem nome não dá para achar depois. */
function formularioDeExercicio({ titulo, nomeInicial = '', confirmarTexto = 'Criar exercício' }) {
  return new Promise((resolver) => {
    const valores = {
      nome: nomeInicial,
      grupoPrincipal: '',
      grupoSecundario: '',
      tipo: 'composto',
      unilateral: false,
    };

    const fechar = (resposta) => {
      fundo.remove();
      resolver(resposta);
    };

    const grupos = dados.gruposConhecidos();

    const confirmarBotao = el('button', {
      classe: 'botao botao-primario', type: 'button', 'data-teste': 'confirmar-novo-exercicio',
      texto: confirmarTexto,
      onclick: () => {
        if (String(valores.nome).trim() === '') {
          avisar('Dê um nome ao exercício para conseguir achar ele depois.');
          return;
        }
        fechar(valores);
      },
    });

    const fundo = el('div', {
      classe: 'fundo-modal', role: 'dialog', 'aria-modal': 'true',
      'data-teste': 'formulario-exercicio',
    }, [
      el('div', { classe: 'modal modal-alto' }, [
        el('h2', { classe: 'modal-titulo', texto: titulo }),
        el('p', { classe: 'modal-linha', texto: 'Isto é o exercício em si. Quantas séries, quantas reps e quanto descanso você escolhe dentro do treino.' }),

        campoDeTexto({
          rotulo: 'Nome', valor: valores.nome, teste: 'novo-nome',
          aoMudar: (texto) => { valores.nome = texto; },
        }),
        campoDeTexto({
          rotulo: 'Grupo muscular principal', valor: '', teste: 'novo-grupo-principal',
          sugestoes: grupos,
          aoMudar: (texto) => { valores.grupoPrincipal = texto; },
        }),
        campoDeTexto({
          rotulo: 'Grupo muscular secundário', dica: 'Pode ficar em branco.',
          valor: '', teste: 'novo-grupo-secundario', sugestoes: grupos,
          aoMudar: (texto) => { valores.grupoSecundario = texto; },
        }),
        escolhaEmChips({
          rotulo: 'Tipo', valor: valores.tipo, opcoes: OPCOES_DE_TIPO, teste: 'novo-tipo',
          aoMudar: (valor) => { valores.tipo = valor; },
        }),
        escolhaEmChips({
          rotulo: 'Como você faz', valor: valores.unilateral, opcoes: OPCOES_DE_LADO,
          teste: 'novo-lado',
          aoMudar: (valor) => { valores.unilateral = valor; },
        }),

        el('div', { classe: 'modal-botoes' }, [
          confirmarBotao,
          el('button', {
            classe: 'botao botao-neutro', type: 'button', 'data-teste': 'cancelar',
            texto: 'Cancelar', onclick: () => fechar(null),
          }),
        ]),
      ]),
    ]);

    document.body.append(fundo);
    fundo.querySelector('[data-teste="novo-nome"]')?.focus();
  });
}

/** Cria um exercício no catálogo pelo formulário curto. Devolve o exercício
 *  criado, ou null. */
export async function criarExercicio({ nomeInicial = '', titulo = 'Exercício novo' } = {}) {
  const campos = await formularioDeExercicio({ titulo, nomeInicial });
  if (!campos) return null;

  try {
    const criado = await dados.criarExercicioNoCatalogo(campos);
    return criado;
  } catch (erro) {
    avisar(`Não consegui criar: ${erro.message}`);
    return null;
  }
}

// ---------------------------------------------------------- escolher um

/** Escolher um exercício, com busca por nome. Um toque escolhe: na academia
 *  não dá para pedir "selecionar" e depois "confirmar".
 *
 *  Devolve o identificador escolhido, ou null se ele desistir. O botão de criar
 *  na hora está sempre à mão, porque exercício que ele acabou de inventar no
 *  aparelho da academia não está no catálogo ainda. */
export function escolherDoCatalogo({ titulo, linhas = [], semEste = null }) {
  return new Promise((resolver) => {
    let busca = '';
    let fechada = false;
    let voltar = null;

    // Voltar no celular fecha esta janela, e não a tela que está atrás dela.
    // Ver o comentário da pilha em ui.js.
    const fechar = (resposta) => {
      if (fechada) return;
      fechada = true;
      fundo.remove();
      voltar.sair(() => resolver(resposta));
    };

    const lista = el('div', { classe: 'lista-catalogo', 'data-teste': 'lista-escolher' });
    const vazio = el('p', { classe: 'modal-linha', 'data-teste': 'escolher-sem-resultado' });

    const criarNovo = el('button', {
      classe: 'botao botao-neutro', type: 'button', 'data-teste': 'criar-exercicio-na-hora',
      texto: '+ Criar exercício novo',
      onclick: async () => {
        const criado = await criarExercicio({ nomeInicial: busca });
        if (criado) fechar(criado.id);
      },
    });

    const pintar = () => {
      const achados = dados.visaoDoCatalogo(busca).filter((item) => item.id !== semEste);

      lista.replaceChildren(...achados.map((item) => el('button', {
        classe: 'item-catalogo',
        type: 'button',
        'data-teste': 'opcao-exercicio',
        'data-exercicio': item.id,
        onclick: () => fechar(item.id),
      }, [
        el('span', { classe: 'item-nome', texto: nomeVisivel(item.nome) }),
        el('span', { classe: 'item-etiquetas' }, etiquetasDoExercicio(item)),
      ])));

      vazio.textContent = achados.length === 0
        ? (busca.trim() === ''
          ? 'Seu catálogo está vazio. Crie o primeiro exercício aqui embaixo.'
          : `Nenhum exercício com "${busca.trim()}". Dá para criar um agora.`)
        : '';
      vazio.classList.toggle('escondido', achados.length > 0);
    };

    pintar();

    const fundo = el('div', {
      classe: 'fundo-modal', role: 'dialog', 'aria-modal': 'true',
      'data-teste': 'escolher-exercicio',
    }, [
      el('div', { classe: 'modal modal-alto' }, [
        el('h2', { classe: 'modal-titulo', texto: titulo }),
        ...linhas.map((linha) => el('p', { classe: 'modal-linha', texto: linha })),
        campoDeBusca({
          valor: busca, teste: 'busca-escolher',
          aoMudar: (texto) => { busca = texto; pintar(); },
        }),
        lista,
        vazio,
        el('div', { classe: 'modal-botoes' }, [
          criarNovo,
          el('button', {
            classe: 'botao botao-neutro', type: 'button', 'data-teste': 'cancelar',
            texto: 'Cancelar', onclick: () => fechar(null),
          }),
        ]),
      ]),
    ]);

    voltar = comBotaoDeVoltar(() => {
      voltar.jaSaiu();
      fechar(null);
    });

    document.body.append(fundo);
  });
}

// ------------------------------------------- editar um item do catálogo

async function excluirDoCatalogo(item, fechar) {
  const nome = nomeVisivel(item.nome);
  const onde = dados.ondeOExercicioEUsado(item.id);

  const linhas = [];
  if (onde.treinos.length === 0) {
    linhas.push(`"${nome}" não está em nenhum treino seu agora.`);
  } else {
    linhas.push(`"${nome}" está em ${onde.treinos.map((t) => `"${t.nome}"`).join(', ')}. Esses treinos continuam do jeito que estão, com o exercício dentro e com o mesmo nome.`);
  }
  if (onde.registradas > 0) {
    linhas.push(onde.registradas === 1
      ? 'O treino que você já fez com ele continua no histórico, do jeito que foi feito.'
      : `Os ${onde.registradas} treinos que você já fez com ele continuam no histórico, do jeito que foram feitos.`);
  }
  linhas.push('Ele só sai da lista de escolher exercício. Dá para trazer de volta aqui mesmo, no fim desta tela.');

  const temCerteza = await confirmar({
    titulo: `Excluir "${nome}" do catálogo?`,
    linhas,
    confirmarTexto: 'Excluir do catálogo',
    perigo: true,
  });
  if (!temCerteza) return;

  try {
    await dados.excluirExercicioDoCatalogo(item.id);
    avisar(`"${nome}" saiu da lista de exercícios. Nada do que você já treinou mudou.`);
    fechar();
  } catch (erro) {
    avisar(`Não consegui excluir: ${erro.message}`);
  }
}

/** Editar a identidade de um exercício. Abre por cima da tela do catálogo. */
export function editarNoCatalogo(exercicioId) {
  const item = dados.exercicioDoCatalogo(exercicioId);
  if (!item) return;

  const onde = dados.ondeOExercicioEUsado(exercicioId);
  const grupos = dados.gruposConhecidos();

  const guardar = (mudancas) => dados
    .editarExercicioDoCatalogo(exercicioId, mudancas, { silencioso: true })
    .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`));

  painel({
    titulo: 'Editar exercício',
    teste: 'editor-catalogo',
    nota: 'Isto é o exercício em si. Tudo aqui salva sozinho.',
    montar: (fechar) => [
      onde.treinos.length > 1
        ? el('p', { classe: 'painel-aviso', 'data-teste': 'aviso-varios-treinos',
          texto: `Este exercício está em ${contar(onde.treinos.length, 'treino', 'treinos')}: ${onde.treinos.map((t) => t.nome).join(', ')}. O que você mudar aqui vale em todos eles.` })
        : null,

      el('section', { classe: 'painel-bloco' }, [
        campoDeTexto({
          rotulo: 'Nome', valor: item.nome, teste: 'catalogo-nome',
          aoMudar: (texto) => guardar({ nome: texto }),
        }),
        campoDeTexto({
          rotulo: 'Grupo muscular principal', valor: item.grupoPrincipal ?? '',
          teste: 'catalogo-grupo-principal', sugestoes: grupos,
          aoMudar: (texto) => guardar({ grupoPrincipal: texto }),
        }),
        campoDeTexto({
          rotulo: 'Grupo muscular secundário', dica: 'Pode ficar em branco.',
          valor: item.grupoSecundario ?? '', teste: 'catalogo-grupo-secundario', sugestoes: grupos,
          aoMudar: (texto) => guardar({ grupoSecundario: texto }),
        }),
        escolhaEmChips({
          rotulo: 'Tipo', valor: item.tipo, opcoes: OPCOES_DE_TIPO, teste: 'catalogo-tipo',
          aoMudar: (valor) => guardar({ tipo: valor }),
        }),
        escolhaEmChips({
          rotulo: 'Como você faz', valor: item.unilateral === true, opcoes: OPCOES_DE_LADO,
          teste: 'catalogo-lado',
          aoMudar: (valor) => guardar({ unilateral: valor }),
        }),
        campoDeTexto({
          rotulo: 'Anotação do exercício',
          dica: 'Vale em todos os treinos, tipo "banco na terceira marca".',
          valor: item.notas ?? '', teste: 'catalogo-notas', linhas: 2,
          aoMudar: (texto) => guardar({ notas: texto }),
        }),
      ]),

      el('p', { classe: 'painel-nota', 'data-teste': 'catalogo-onde-usa',
        texto: onde.treinos.length === 0
          ? 'Este exercício não está em nenhum treino seu agora.'
          : `Em uso: ${onde.treinos.map((t) => t.nome).join(', ')}. Quantas séries e quanto descanso você escolhe dentro de cada treino.` }),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Tirar do catálogo' }),
        el('button', {
          classe: 'botao botao-perigo', type: 'button', 'data-teste': 'excluir-do-catalogo',
          texto: 'Excluir do catálogo',
          onclick: () => excluirDoCatalogo(item, fechar),
        }),
        el('p', { classe: 'painel-nota', texto: 'Ele sai da lista de escolher exercício. Os treinos que usam ele e os treinos que você já fez não mudam em nada.' }),
      ]),
    ],
  });
}

// ------------------------------------------------------------- a tela

function cartaoDoItem(item) {
  return el('button', {
    classe: 'item-catalogo',
    type: 'button',
    'data-teste': 'item-catalogo',
    'data-exercicio': item.id,
    onclick: () => editarNoCatalogo(item.id),
  }, [
    el('span', { classe: 'item-nome', texto: nomeVisivel(item.nome) }),
    el('span', { classe: 'item-etiquetas' }, [
      ...etiquetasDoExercicio(item),
      etiqueta(item.treinos === 0 ? 'fora dos treinos' : contar(item.treinos, 'treino', 'treinos')),
    ]),
  ]);
}

async function trazerDeVolta(item) {
  try {
    await dados.trazerExercicioDeVolta(item.id);
    avisar(`"${nomeVisivel(item.nome)}" voltou para a lista.`);
  } catch (erro) {
    avisar(`Não consegui trazer de volta: ${erro.message}`);
  }
}

export function telaDoCatalogo() {
  const lista = el('div', { classe: 'lista-catalogo', 'data-teste': 'lista-catalogo' });
  const contagem = el('p', { classe: 'catalogo-contagem', 'data-teste': 'contagem-catalogo' });
  const semNada = el('p', { classe: 'painel-nota', 'data-teste': 'catalogo-sem-resultado' });

  const pintar = () => {
    const achados = dados.visaoDoCatalogo(buscaAtual);
    const todos = dados.visaoDoCatalogo('');

    lista.replaceChildren(...achados.map(cartaoDoItem));
    contagem.textContent = buscaAtual.trim() === ''
      ? contar(todos.length, 'exercício no catálogo', 'exercícios no catálogo')
      : `${contar(achados.length, 'exercício', 'exercícios')} de ${todos.length}`;

    semNada.textContent = achados.length === 0 && buscaAtual.trim() !== ''
      ? `Nenhum exercício com "${buscaAtual.trim()}". Crie um no botão aqui embaixo.`
      : '';
    semNada.classList.toggle('escondido', achados.length > 0 || buscaAtual.trim() === '');
  };

  pintar();

  const excluidos = dados.catalogoExcluido();
  const temExercicio = dados.visaoDoCatalogo('').length > 0;

  return el('div', { classe: 'pagina' }, [
    cabecalho('Meus exercícios', { voltarPara: '#/' }),
    el('p', { classe: 'cartao-nota', texto: 'Aqui mora o exercício em si: nome, grupo e tipo. Quantas séries, quantas reps e quanto descanso ficam dentro de cada treino.' }),

    temExercicio
      ? el('div', { classe: 'busca-linha' }, [
        campoDeBusca({
          valor: buscaAtual, teste: 'busca-catalogo',
          aoMudar: (texto) => { buscaAtual = texto; pintar(); },
        }),
      ])
      : null,

    temExercicio ? contagem : null,
    temExercicio ? lista : null,
    temExercicio ? semNada : null,

    temExercicio
      ? null
      : estadoVazio({
        titulo: 'Nenhum exercício ainda',
        texto: 'Crie o primeiro no botão aqui embaixo. Depois ele fica disponível para todos os seus treinos.',
      }),

    el('button', {
      classe: 'botao botao-neutro', type: 'button', 'data-teste': 'novo-exercicio-catalogo',
      texto: '+ Novo exercício',
      onclick: async () => {
        const criado = await criarExercicio({ nomeInicial: buscaAtual });
        if (criado) {
          buscaAtual = '';
          avisar(`"${nomeVisivel(criado.nome)}" entrou no seu catálogo.`);
          editarNoCatalogo(criado.id);
        }
      },
    }),

    excluidos.length
      ? el('section', { classe: 'cartao', 'data-teste': 'catalogo-excluidos' }, [
        el('h2', { classe: 'cartao-titulo', texto: 'Excluídos' }),
        el('p', { classe: 'cartao-nota', texto: 'Eles saíram da lista de escolher, mas continuam guardados. Os treinos que ainda usam eles não mudaram.' }),
        ...excluidos.map((item) => el('div', { classe: 'linha-info' }, [
          el('span', { classe: 'info-rotulo', texto: nomeVisivel(item.nome) }),
          el('button', {
            classe: 'botao-mover botao-largo', type: 'button', 'data-teste': 'trazer-de-volta',
            'data-exercicio': item.id,
            'aria-label': `Trazer ${nomeVisivel(item.nome)} de volta`,
            texto: 'Trazer de volta',
            onclick: () => trazerDeVolta(item),
          }),
        ])),
      ])
      : null,
  ]);
}
