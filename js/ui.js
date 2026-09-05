// Peças de tela reaproveitadas. Nada aqui sabe onde os dados ficam guardados.

const DIAS = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo',
};

/** Monta um elemento sem usar innerHTML: texto do usuário nunca vira marcação. */
export function el(tag, atributos = {}, filhos = []) {
  const no = document.createElement(tag);

  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === 'classe') no.className = valor;
    else if (chave === 'texto') no.textContent = valor;
    else if (chave.startsWith('on') && typeof valor === 'function') {
      no.addEventListener(chave.slice(2), valor);
    } else no.setAttribute(chave, valor === true ? '' : String(valor));
  }

  for (const filho of [].concat(filhos)) {
    if (filho === null || filho === undefined || filho === false) continue;
    no.append(filho.nodeType ? filho : document.createTextNode(String(filho)));
  }
  return no;
}

export const nomeDoDia = (numero) => DIAS[Number(numero)] ?? 'Sem dia definido';

/** Os dias como a tela de escolher precisa deles: o número que fica gravado, o
 *  nome inteiro para quem usa leitor de tela e o apelido curto que cabe no
 *  botão. */
export const DIAS_DA_SEMANA = Object.entries(DIAS).map(([numero, nome]) => ({
  numero: Number(numero),
  nome,
  curto: nome.slice(0, 3),
}));

export function formatarDescanso(segundos) {
  const total = Number(segundos);
  if (!Number.isFinite(total) || total <= 0) return 'sem descanso';
  if (total < 60) return `${total} s`;

  const minutos = Math.floor(total / 60);
  const resto = total % 60;
  return resto === 0 ? `${minutos} min` : `${minutos} min ${resto} s`;
}

export function formatarFaixaDeReps(min, max) {
  // Campo em branco é `null`, e `Number(null)` é zero: sem este cuidado, um
  // exercício sem faixa definida apareceria como "0 reps", que é uma
  // prescrição, e não a falta de uma.
  const lerNumero = (valor) =>
    (valor === null || valor === undefined || valor === '' ? NaN : Number(valor));
  const a = lerNumero(min);
  const b = lerNumero(max);
  if (!Number.isFinite(a) && !Number.isFinite(b)) return 'reps livres';
  if (!Number.isFinite(b) || a === b) return `${a} reps`;
  return `${a} a ${b} reps`;
}

export function formatarDataHora(iso) {
  if (!iso) return '—';
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return '—';
  return quando.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** "1 treino" e "3 treinos": contagem em português, sem o "(s)" pendurado. */
export function contar(quantidade, singular, plural) {
  return `${quantidade} ${Number(quantidade) === 1 ? singular : plural}`;
}

export const etiqueta = (texto, classe = '') =>
  el('span', { classe: `etiqueta ${classe}`.trim(), texto });

export function cabecalho(titulo, { voltarPara = null } = {}) {
  return el('header', { classe: 'topo' }, [
    voltarPara
      ? el('a', { classe: 'botao-topo', href: voltarPara, 'aria-label': 'Voltar', texto: '‹' })
      : null,
    el('h1', { classe: 'topo-titulo', texto: titulo }),
  ]);
}

/** Aviso curto que aparece e some sozinho. */
export function avisar(texto) {
  document.querySelector('.aviso')?.remove();
  const balao = el('div', { classe: 'aviso', role: 'status', texto });
  document.body.append(balao);
  setTimeout(() => balao.remove(), 4000);
}

// ------------------------------------------- o botão de voltar do celular
//
// O painel e as janelas de tela cheia abrem por cima do que já está na tela,
// sem trocar de endereço. As duas precisam responder ao botão de voltar do
// celular, porque é assim que se fecha coisa no celular: voltar fecha o que
// está por cima, não sai do treino.
//
// Cada uma empurra um passo de endereço ao abrir e tira o passo ao fechar. O
// que não dava certo era cada uma ouvir o `popstate` por conta própria: com
// uma janela de confirmação aberta por cima de um painel, o voltar chegava nas
// duas e o painel de baixo fechava junto — a janela ficava flutuando sobre a
// tela errada. Por isso a pilha é uma só, mora aqui, e quem responde ao voltar
// é sempre a de cima.

const sobrepostas = [];
let consumindoOPasso = null;
let ouvindoOVoltar = false;

function ouvirOVoltar() {
  if (ouvindoOVoltar) return;
  ouvindoOVoltar = true;

  window.addEventListener('popstate', () => {
    // Passo que uma sobreposição já fechada deixou para trás: só sai da pilha
    // do navegador, sem mexer em quem ainda está aberto.
    if (consumindoOPasso) {
      const terminar = consumindoOPasso;
      consumindoOPasso = null;
      terminar();
      return;
    }
    sobrepostas.pop()?.aoVoltar();
  });
}

/** Põe uma sobreposição na frente do botão de voltar. Devolve as duas saídas
 *  dela: fechar por um botão (que ainda precisa tirar o passo do endereço) e
 *  fechar porque o voltar chegou nela (o passo já saiu). */
export function comBotaoDeVoltar(aoVoltar) {
  const minha = { aoVoltar };
  let empurrou = false;

  try {
    history.pushState({ sobrepostoNoGymbro: true }, '');
    empurrou = true;
  } catch {
    // Sem mexer no endereço, a sobreposição continua fechando pelos botões dela.
  }
  if (empurrou) {
    sobrepostas.push(minha);
    ouvirOVoltar();
  }

  const tirarDaPilha = () => {
    const posicao = sobrepostas.indexOf(minha);
    if (posicao >= 0) sobrepostas.splice(posicao, 1);
  };

  return {
    sair(terminar) {
      tirarDaPilha();
      // Tira da pilha do navegador o passo que esta sobreposição criou, para o
      // botão de voltar não precisar de dois toques depois de fechar.
      if (empurrou) {
        empurrou = false;
        consumindoOPasso = terminar;
        history.back();
        return;
      }
      terminar();
    },
    jaSaiu() {
      tirarDaPilha();
      empurrou = false;
    },
  };
}

/** A mecânica das duas janelas de tela cheia: a de confirmar e a de escolher.
 *  As duas são a mesma coisa com botões diferentes, e as duas cancelam quando o
 *  Lucca aperta o voltar do celular — que é o que qualquer pessoa espera. */
function janelaDeTelaCheia({ titulo, linhas, montarBotoes, valorAoVoltar }) {
  return new Promise((resolver) => {
    let fechada = false;
    let voltar = null;

    const responder = (resposta) => {
      if (fechada) return;
      fechada = true;
      fundo.remove();
      voltar.sair(() => resolver(resposta));
    };

    const fundo = el('div', { classe: 'fundo-modal', role: 'dialog', 'aria-modal': 'true' }, [
      el('div', { classe: 'modal' }, [
        el('h2', { classe: 'modal-titulo', texto: titulo }),
        ...linhas.map((linha) => el('p', { classe: 'modal-linha', texto: linha })),
        el('div', { classe: 'modal-botoes' }, montarBotoes(responder)),
      ]),
    ]);

    voltar = comBotaoDeVoltar(() => {
      voltar.jaSaiu();
      responder(valorAoVoltar);
    });

    document.body.append(fundo);
    fundo.querySelector('button')?.focus();
  });
}

/** Confirmação em tela cheia, com alvo de toque grande. Devolve uma promessa
 *  que vira true se o Lucca confirmar. */
export function confirmar({ titulo, linhas = [], confirmarTexto = 'Confirmar', perigo = false }) {
  return janelaDeTelaCheia({
    titulo,
    linhas,
    valorAoVoltar: false,
    montarBotoes: (responder) => [
      el('button', {
        classe: `botao ${perigo ? 'botao-perigo' : 'botao-primario'}`,
        type: 'button',
        'data-teste': 'confirmar',
        texto: confirmarTexto,
        onclick: () => responder(true),
      }),
      el('button', {
        classe: 'botao botao-neutro',
        type: 'button',
        'data-teste': 'cancelar',
        texto: 'Cancelar',
        onclick: () => responder(false),
      }),
    ],
  });
}

/** Estado vazio: nunca só "nada aqui". Sempre diz o que fazer e onde. */
export function estadoVazio({ titulo, texto, acaoTexto = null, acaoHref = null }) {
  return el('div', { classe: 'vazio' }, [
    el('p', { classe: 'vazio-titulo', texto: titulo }),
    el('p', { classe: 'vazio-texto', texto }),
    acaoTexto && acaoHref
      ? el('a', { classe: 'botao botao-primario', href: acaoHref, texto: acaoTexto })
      : null,
  ]);
}

/** Número do jeito que se escreve em português: 42.5 vira "42,5" e 40 vira
 *  "40". Nada de ".0" pendurado. */
export function formatarNumero(valor, casas = 2) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
  return Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

export function formatarCarga(valor, unidade = 'kg') {
  return valor === null || valor === undefined ? '—' : `${formatarNumero(valor)} ${unidade}`;
}

/** Tempo de cronômetro: 90 vira "1:30". */
export function formatarRelogio(segundos) {
  const total = Math.max(0, Math.round(Number(segundos) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Quanto tempo o treino durou, em palavras. */
export function formatarDuracao(segundos) {
  const total = Math.max(0, Math.round(Number(segundos) || 0));
  const minutos = Math.round(total / 60);
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** Data curta com o dia da semana: "seg, 08/09". */
export function formatarDataCurta(iso) {
  if (!iso) return '—';
  const [ano, mes, dia] = String(iso).split('-').map(Number);
  const quando = new Date(ano, (mes || 1) - 1, dia || 1);
  if (Number.isNaN(quando.getTime())) return '—';
  const semana = quando.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${semana}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

export function formatarHora(iso) {
  if (!iso) return '—';
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return '—';
  return quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Escolha entre alternativas, em tela cheia e com alvo de toque grande.
 *  Devolve o `valor` da opção tocada, ou null se o Lucca cancelar. */
export function escolher({ titulo, linhas = [], opcoes = [], cancelarTexto = 'Cancelar' }) {
  return janelaDeTelaCheia({
    titulo,
    linhas,
    valorAoVoltar: null,
    montarBotoes: (responder) => [
      ...opcoes.map((opcao, indice) =>
        el('button', {
          classe: `botao ${opcao.destaque ?? indice === 0 ? 'botao-primario' : 'botao-neutro'}`,
          type: 'button',
          'data-teste': opcao.teste ?? null,
          texto: opcao.texto,
          onclick: () => responder(opcao.valor),
        })),
      el('button', {
        classe: 'botao botao-neutro',
        type: 'button',
        'data-teste': 'cancelar',
        texto: cancelarTexto,
        onclick: () => responder(null),
      }),
    ],
  });
}

// ------------------------------------------------------------- os campos
//
// Todo campo do app grava a cada tecla e a cada toque: não existe botão de
// salvar em lugar nenhum (regra 5 do CONTEXTO). Por isso `aoMudar` é chamado no
// evento `input`, e não no `change`.

/** Campo de texto de uma linha, ou de várias quando `linhas` é maior que 1.
 *  `sugestoes` liga a lista de opções do próprio navegador — para o grupo
 *  muscular não precisar ser digitado igual duas vezes. */
export function campoDeTexto({
  rotulo, dica = null, valor, teste, aoMudar, sugestoes = null, linhas = 1, dentroDe = null,
}) {
  const comum = {
    classe: 'campo-entrada',
    autocomplete: 'off',
    'data-teste': teste,
    'aria-label': rotulo,
  };

  const entrada = linhas > 1
    ? el('textarea', { ...comum, classe: 'campo-entrada campo-entrada-alta', rows: String(linhas) })
    : el('input', { ...comum, type: 'text', enterkeyhint: 'done' });

  entrada.value = valor ?? '';
  entrada.addEventListener('input', () => aoMudar(entrada.value));

  // No celular o teclado ocupa meia tela: Enter fecha em vez de ficar no
  // caminho. Em campo de várias linhas Enter continua sendo quebra de linha.
  if (linhas === 1) {
    entrada.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') entrada.blur();
    });
  }

  let lista = null;
  if (sugestoes?.length) {
    const listaId = `sugestoes-${teste}`;
    entrada.setAttribute('list', listaId);
    lista = el('datalist', { id: listaId },
      sugestoes.map((texto) => el('option', { value: texto })));
  }

  return el('label', { classe: `campo campo-empilhado ${dentroDe ?? ''}`.trim() }, [
    el('span', { classe: 'campo-rotulo', texto: rotulo }),
    entrada,
    lista,
    dica ? el('span', { classe: 'campo-dica', texto: dica }) : null,
  ]);
}

/** Campo de número inteiro (reps, segundos). Abre o teclado numérico no celular
 *  e devolve o texto cru: quem chama decide o que fazer com o branco, porque
 *  branco nunca vira zero sozinho. */
export function campoDeInteiro({ rotulo, valor, teste, aoMudar, dica = null }) {
  const entrada = el('input', {
    classe: 'campo-entrada campo-entrada-numero',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    enterkeyhint: 'done',
    'data-teste': teste,
    'aria-label': rotulo,
    value: valor === null || valor === undefined ? '' : String(valor),
  });

  entrada.addEventListener('input', () => aoMudar(entrada.value));
  entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') entrada.blur();
  });

  return el('label', { classe: 'campo campo-empilhado' }, [
    el('span', { classe: 'campo-rotulo', texto: rotulo }),
    entrada,
    dica ? el('span', { classe: 'campo-dica', texto: dica }) : null,
  ]);
}

/** Campo de número com casa decimal (carga em quilos). Abre o teclado
 *  decimal no celular e aceita vírgula: 42,5 é o jeito que se escreve aqui.
 *  Devolve o texto cru, como o campo de inteiro — branco nunca vira zero
 *  sozinho, porque zero é um valor de treino. */
export function campoDeDecimal({ rotulo, valor, teste, aoMudar, dica = null }) {
  const entrada = el('input', {
    classe: 'campo-entrada campo-entrada-numero',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    enterkeyhint: 'done',
    'data-teste': teste,
    'aria-label': rotulo,
    value: valor === null || valor === undefined ? '' : String(valor).replace('.', ','),
  });

  entrada.addEventListener('input', () => aoMudar(entrada.value));
  entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') entrada.blur();
  });

  return el('label', { classe: 'campo campo-empilhado' }, [
    el('span', { classe: 'campo-rotulo', texto: rotulo }),
    entrada,
    dica ? el('span', { classe: 'campo-dica', texto: dica }) : null,
  ]);
}

/** Escolha entre poucas opções, cada uma um botão do tamanho de um dedo.
 *  Um seletor de lista rolante seria menor na tela e pior na mão suada. */
export function escolhaEmChips({ rotulo, valor, opcoes, aoMudar, teste }) {
  let atual = valor;

  const grade = el('div', {
    classe: 'chips-escolha', role: 'group', 'aria-label': rotulo, 'data-teste': teste,
  });

  const pintar = () => {
    grade.replaceChildren(...opcoes.map((opcao) => el('button', {
      classe: `chip-escolha ${atual === opcao.valor ? 'chip-ligado' : ''}`.trim(),
      type: 'button',
      'data-teste': `${teste}-opcao`,
      'data-valor': String(opcao.valor),
      'aria-pressed': String(atual === opcao.valor),
      texto: opcao.texto,
      onclick: () => {
        atual = opcao.valor;
        pintar();
        aoMudar(opcao.valor);
      },
    })));
  };

  pintar();
  return el('div', { classe: 'campo-empilhado' }, [
    el('span', { classe: 'campo-rotulo', texto: rotulo }),
    grade,
  ]);
}

/** Menos e mais em volta de um número. Para contar séries com o polegar, sem
 *  abrir teclado. */
export function contadorDeToque({ rotulo, valor, minimo = 0, maximo = 99, aoMudar, teste, legenda = null }) {
  let atual = Number(valor) || 0;

  const numero = el('span', { classe: 'contador-valor', 'data-teste': teste, texto: String(atual) });
  const linhaDeApoio = el('p', { classe: 'campo-dica', 'data-teste': `${teste}-legenda` });

  const botao = (passo) => el('button', {
    classe: 'passo-botao passo-botao-grande',
    type: 'button',
    'data-teste': passo < 0 ? `${teste}-menos` : `${teste}-mais`,
    'aria-label': `${passo < 0 ? 'Menos' : 'Mais'} ${rotulo.toLowerCase()}`,
    texto: passo < 0 ? '−' : '+',
    onclick: () => {
      const novo = Math.min(Math.max(atual + passo, minimo), maximo);
      if (novo === atual) return;
      atual = novo;
      numero.textContent = String(atual);
      aoMudar(atual);
    },
  });

  const pintarLegenda = (texto) => { linhaDeApoio.textContent = texto ?? ''; };
  pintarLegenda(legenda);

  const bloco = el('div', { classe: 'campo-empilhado' }, [
    el('span', { classe: 'campo-rotulo', texto: rotulo }),
    el('div', { classe: 'contador' }, [botao(-1), numero, botao(+1)]),
    linhaDeApoio,
  ]);

  bloco.pintarLegenda = pintarLegenda;
  return bloco;
}

// -------------------------------------------------------------- o painel

/** Tela que abre por cima da que está embaixo, sem trocar de endereço.
 *
 *  É isso que faz a mesma tela servir para editar fora e dentro do treino:
 *  aberta no meio da sessão, a sessão continua montada atrás, com o cronômetro
 *  correndo e a rolagem onde estava. Fechar devolve o Lucca exatamente onde ele
 *  estava, e o botão de voltar do celular fecha o painel em vez de sair do
 *  treino.
 *
 *  `montar` recebe a função de fechar e devolve o conteúdo. `aoFechar` é de
 *  quem chamou, porque este arquivo não sabe onde os dados ficam guardados. */
export function abrirPainel({ titulo, teste, nota = null, montar, focar = null, aoFechar = () => {} }) {
  if (document.querySelector('.painel-fundo')) return null;

  let fechado = false;
  let voltar = null;

  const fechar = ({ irPara = null } = {}) => {
    if (fechado) return;
    fechado = true;

    fundo.remove();
    document.body.classList.remove('com-painel');
    voltar.sair(() => aoFechar({ irPara }));
  };

  const corpo = [].concat(montar(fechar));

  const fundo = el('div', {
    classe: 'painel-fundo',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': titulo,
    'data-teste': teste,
  }, [
    el('div', { classe: 'painel' }, [
      el('header', { classe: 'painel-topo' }, [
        el('h2', { classe: 'painel-cabecalho', texto: titulo }),
        el('button', {
          classe: 'botao-topo', type: 'button', 'data-teste': 'fechar-painel',
          'aria-label': 'Fechar', texto: '✕', onclick: () => fechar(),
        }),
      ]),
      nota ? el('p', { classe: 'painel-nota painel-nota-topo', texto: nota }) : null,
      ...corpo,
    ]),
  ]);

  voltar = comBotaoDeVoltar(() => {
    voltar.jaSaiu();
    fechar();
  });

  document.body.append(fundo);
  document.body.classList.add('com-painel');

  // Só foca campo de texto quando quem abriu pediu: no celular, focar sozinho
  // abre o teclado e come metade da tela antes de ele ver o que tem ali.
  const alvo = (focar && fundo.querySelector(focar)) ?? fundo.querySelector('[data-teste="fechar-painel"]');
  alvo?.focus();

  return { fundo, fechar };
}
