// A tela da periodização: o bloco inteiro numa rolagem só, semana por semana,
// e cada pedaço dele editável.
//
// Quatro decisões mandam neste arquivo:
//
// 1. **O bloco aparece inteiro antes de qualquer edição.** Depois de dizer onde
//    ele está, a tela desenha o bloco semana a semana, com o RIR de cada série
//    à mostra e a semana de hoje marcada. Mexer em periodização sem ver o bloco
//    é mexer no escuro, e o efeito de uma mudança aqui aparece em todas as
//    outras telas do app.
// 2. **Mudança vale do próximo treino em diante.** A tela diz isso em voz alta,
//    com o número de treinos registrados que não vão mudar. A garantia é de
//    código — `js/dados.js` não tem caminho daqui até um documento de sessão —
//    e o que este arquivo faz é contar isso em português.
// 3. **Tudo grava sozinho, como no resto do app.** Sem botão de salvar. As
//    únicas duas coisas que perguntam antes são as que mexem no bloco inteiro
//    de uma vez: encurtar o bloco e voltar ao padrão.
// 4. **A página muda por botão; o painel muda por campo.** Quem grava de dentro
//    de um painel grava em silêncio, para o teclado não sumir no meio da
//    digitação, e a página se redesenha quando o painel fecha. É a mesma
//    divisão da tela de editar série.

import * as dados from '../dados.js';
import * as contas from '../periodizacao.js';
import { painel } from './painel.js';
import {
  el, cabecalho, etiqueta, avisar, confirmar, contar, formatarNumero,
  campoDeTexto, campoDeInteiro, campoDeDecimal, escolhaEmChips,
} from '../ui.js';

/** O bloco como está agora. Relido a cada uso porque esta tela grava em
 *  silêncio: quem pergunta depois de um toque precisa da versão nova. */
const olhar = () => dados.visaoDaPeriodizacao();

/** Os números de RIR que os chips oferecem. Cresce sozinho se o bloco já usar
 *  um número maior — nenhum valor de RIR fica preso no código. */
function reguaDeRir(bloco, minimo = 5) {
  const usados = bloco.semanas.flatMap((s) => s.rirPorSerie).map(Number).filter(Number.isFinite);
  const maior = Math.min(Math.max(minimo, ...usados), contas.RIR_MAXIMO);
  return Array.from({ length: maior + 1 }, (_, i) => i);
}

const porcentagem = (fator) => `${formatarNumero(Number(fator) * 100, 0)}%`;

/** "Nenhum dos seus 1 treino registrado muda" não é português. Esta frase existe
 *  para o aviso mais importante da tela — o de que o histórico não é tocado —
 *  não sair torto justamente quando ele tem um treino só. */
function fraseDosRegistrados(quantos) {
  if (quantos === 0) return 'Você ainda não registrou nenhum treino, e quando registrar, aquele dia guarda o RIR que valia nele.';
  if (quantos === 1) return 'O treino que você já registrou não muda com isso.';
  return `Nenhum dos seus ${quantos} treinos registrados muda com isso.`;
}

/** "metade das séries", "três quartos" — o fator do deload em palavras, para a
 *  tela nunca mostrar 0,5 esperando que ele traduza. */
function fatorEmPalavras(fator) {
  const numero = Number(fator);
  if (!Number.isFinite(numero) || numero >= 1) return 'todas as séries';
  if (Math.abs(numero - 0.75) < 0.01) return 'três quartos das séries';
  if (Math.abs(numero - 0.5) < 0.01) return 'metade das séries';
  if (Math.abs(numero - (1 / 3)) < 0.02) return 'um terço das séries';
  return `${porcentagem(numero)} das séries`;
}

/** O corte de séries do deload em exemplo concreto. É assim que ele confere se
 *  a regra faz o que ele quer, sem fazer a conta de cabeça. */
function exemploDeCorte(semana) {
  const fatia = (total) => contas.seriesNaSemana(
    { semanas: [{ ...semana, numero: 1 }] }, 1, total);
  return `Um exercício de 4 séries fica com ${fatia(4)}, um de 3 fica com ${fatia(3)} e um de 2 fica com ${fatia(2)}.`;
}

/** Grava a periodização em silêncio e devolve se deu certo. Todo painel desta
 *  tela escreve por aqui: uma escrita só, o documento inteiro, sem redesenhar a
 *  página que está atrás. */
async function guardar(mudar) {
  try {
    await dados.salvarPeriodizacao(mudar(dados.periodizacaoAtual()), { silencioso: true });
    return true;
  } catch (erro) {
    avisar(`Não consegui guardar: ${erro.message}`);
    return false;
  }
}

// -------------------------------------------------------- o bloco na tela

/** Uma semana desenhada: o RIR de cada série do composto e, quando a regra do
 *  isolador muda alguma coisa, o do isolador logo abaixo. */
function cartaoDaSemana(semana, semanaDeHoje) {
  const mostraIsolador = semana.isolador.some((rir, i) => rir !== semana.composto[i]);
  const ehADeHoje = semana.numero === semanaDeHoje;

  const chips = (lista, teste) => el('div', { classe: 'chips-rir chips-rir-bloco', 'data-teste': teste },
    lista.map((rir, indice) => el('span', { classe: 'chip-rir' }, [
      el('span', { classe: 'chip-rir-numero', texto: rir === null ? '—' : String(rir) }),
      el('span', { classe: 'chip-rir-rotulo', texto: `${indice + 1}ª` }),
    ])));

  return el('button', {
    classe: `semana-cartao ${semana.deload ? 'e-deload' : ''} ${ehADeHoje ? 'e-de-hoje' : ''}`.replace(/\s+/g, ' ').trim(),
    type: 'button',
    'data-teste': 'semana-do-bloco',
    'data-semana': String(semana.numero),
    'aria-label': `Editar ${semana.rotulo}`,
    onclick: () => editarSemana(semana.numero),
  }, [
    el('div', { classe: 'semana-cartao-topo' }, [
      el('span', { classe: 'semana-cartao-nome', 'data-teste': 'rotulo-da-semana', texto: semana.rotulo }),
      ehADeHoje ? etiqueta('você está aqui', 'etiqueta-aqui') : null,
      semana.deload ? etiqueta('semana leve', 'etiqueta-deload') : null,
      el('span', { classe: 'treino-seta', texto: '›' }),
    ]),
    el('span', { classe: 'semana-cartao-legenda',
      texto: mostraIsolador ? 'composto' : 'RIR programado, série por série' }),
    chips(semana.composto, 'rir-do-composto'),
    mostraIsolador ? el('span', { classe: 'semana-cartao-legenda', texto: 'isolador' }) : null,
    mostraIsolador ? chips(semana.isolador, 'rir-do-isolador') : null,
    semana.deload
      ? el('span', {
        classe: 'semana-cartao-nota',
        texto: `${fatorEmPalavras(semana.seriesFator)}, carga em torno de ${porcentagem(semana.cargaFator)} da última semana cheia.`,
      })
      : null,
    semana.excecaoDoComposto
      ? el('span', {
        classe: 'semana-cartao-nota',
        texto: `Aqui a última série do composto pode ir a ${semana.excecaoDoComposto.pisoRir}.`,
      })
      : null,
  ]);
}

// -------------------------------------------------- o painel de uma semana

/** Uma linha de RIR: "1ª série  −  3  +". Compacta de propósito — são até doze
 *  delas na tela, e o contador grande do resto do app não caberia doze vezes. */
function linhaDeRir({ posicao, valor, aoMudar }) {
  const numero = el('span', {
    classe: 'rir-linha-valor',
    'data-teste': 'rir-da-posicao',
    'data-posicao': String(posicao + 1),
    texto: String(valor),
  });

  const botao = (passo) => el('button', {
    classe: 'passo-botao',
    type: 'button',
    'data-teste': passo < 0 ? 'rir-da-posicao-menos' : 'rir-da-posicao-mais',
    'data-posicao': String(posicao + 1),
    'aria-label': `${passo < 0 ? 'Menos' : 'Mais'} RIR na ${posicao + 1}ª série`,
    texto: passo < 0 ? '−' : '+',
    onclick: () => {
      const novo = Math.min(Math.max(Number(numero.textContent) + passo, 0), contas.RIR_MAXIMO);
      if (String(novo) === numero.textContent) return;
      numero.textContent = String(novo);
      aoMudar(novo);
    },
  });

  return el('div', { classe: 'rir-linha' }, [
    el('span', { classe: 'rir-linha-rotulo', texto: `${posicao + 1}ª série` }),
    botao(-1),
    numero,
    botao(+1),
  ]);
}

const OPCOES_DE_ARREDONDAMENTO = [
  { valor: 'cima', texto: 'Para cima' },
  { valor: 'normal', texto: 'O mais perto' },
  { valor: 'baixo', texto: 'Para baixo' },
];

const OPCOES_DE_FATIA = [
  { valor: 1, texto: 'Todas' },
  { valor: 0.75, texto: 'Três quartos' },
  { valor: 0.5, texto: 'Metade' },
  { valor: 1 / 3, texto: 'Um terço' },
];

/** Editar uma semana: o RIR de cada série, se ela é a semana leve, o corte de
 *  séries e a carga do deload, a exceção do composto e o nome dela. */
export function editarSemana(numeroSemana) {
  const bloco = olhar();
  const semana = bloco.semanas.find((s) => s.numero === numeroSemana);
  if (!semana) {
    avisar('Não achei essa semana no bloco.');
    return;
  }

  const agoraA = () => olhar().semanas.find((s) => s.numero === numeroSemana) ?? semana;
  const comEsta = (mudancas) => (p) => contas.comSemana(p, numeroSemana, mudancas);

  const listaDeRir = el('div', { classe: 'rir-lista', 'data-teste': 'rir-da-semana-editavel' });
  const resultado = el('p', { classe: 'campo-dica', 'data-teste': 'resultado-da-semana' });
  const corpoDoDeload = el('div', { classe: 'campos-condicionais', 'data-teste': 'bloco-do-deload' });
  const exemplo = el('p', { classe: 'campo-dica', 'data-teste': 'exemplo-de-corte' });

  /** Repinta o que depende do dado e não do toque: as linhas de série e a frase
   *  que mostra o RIR já com as regras aplicadas. Não reconstrói os campos do
   *  deload de propósito — reconstruir um campo de texto enquanto ele digita
   *  tira o teclado da tela na metade do número. */
  const repintar = () => {
    const atual = agoraA();

    listaDeRir.replaceChildren(...atual.rirPorSerie.map((rir, posicao) =>
      linhaDeRir({
        posicao,
        valor: rir,
        aoMudar: async (novo) => {
          const lista = [...agoraA().rirPorSerie];
          lista[posicao] = novo;
          if (await guardar(comEsta({ rirPorSerie: lista }))) repintar();
        },
      })));

    const iguais = atual.isolador.join(',') === atual.composto.join(',');
    resultado.textContent = atual.deload
      ? `Nesta semana o RIR é ${atual.composto.join(', ')} em tudo. Um exercício com mais séries repete o último número.`
      : `Sai assim: composto ${atual.composto.join(', ')}${iguais ? '' : ` · isolador ${atual.isolador.join(', ')}`}. Um exercício com mais séries repete o último número.`;

    exemplo.textContent = atual.deload ? exemploDeCorte(atual) : '';
  };

  /** Os campos que só existem na semana leve. Montados uma vez quando ela vira
   *  leve, e daí em diante cada um cuida do próprio texto de apoio. */
  const montarCamposDoDeload = () => {
    const atual = agoraA();
    if (!atual.deload) {
      corpoDoDeload.replaceChildren();
      return;
    }

    const dicaDaCarga = el('span', { classe: 'campo-dica', 'data-teste': 'dica-da-carga-do-deload' });
    const contarACarga = (fator) => {
      dicaDaCarga.textContent = `Hoje: ${porcentagem(fator)}. Uma série de 40 kg vira ${formatarNumero(40 * Number(fator))} kg.`;
    };
    contarACarga(atual.cargaFator);

    corpoDoDeload.replaceChildren(
      escolhaEmChips({
        rotulo: 'Quantas séries valem na semana leve',
        valor: OPCOES_DE_FATIA.find((o) => Math.abs(o.valor - atual.seriesFator) < 0.02)?.valor ?? 1,
        opcoes: OPCOES_DE_FATIA,
        teste: 'campo-series-do-deload',
        aoMudar: async (valor) => {
          if (await guardar(comEsta({ seriesFator: valor }))) repintar();
        },
      }),
      escolhaEmChips({
        rotulo: 'Quando a conta não dá número redondo',
        valor: atual.seriesArredondamento,
        opcoes: OPCOES_DE_ARREDONDAMENTO,
        teste: 'campo-arredondamento-do-deload',
        aoMudar: async (valor) => {
          if (await guardar(comEsta({ seriesArredondamento: valor }))) repintar();
        },
      }),
      exemplo,
      campoDeInteiro({
        rotulo: 'Carga da semana leve (% da última semana cheia)',
        valor: Math.round(Number(atual.cargaFator) * 100),
        teste: 'campo-carga-do-deload',
        aoMudar: async (texto) => {
          const numero = Number(String(texto).replace(',', '.'));
          if (!Number.isFinite(numero) || numero <= 0) return;
          const fator = Math.min(numero, 100) / 100;
          if (await guardar(comEsta({ cargaFator: fator }))) contarACarga(fator);
        },
      }),
      dicaDaCarga,
    );
  };

  const uniforme = new Set(semana.rirPorSerie).size === 1 ? semana.rirPorSerie[0] : null;

  painel({
    titulo: `Editar ${semana.rotulo.toLowerCase()}`,
    teste: 'editor-semana',
    nota: 'Tudo aqui salva sozinho. Vale do próximo treino em diante; nenhum treino que você já registrou muda.',
    montar: () => [
      el('p', { classe: 'painel-titulo painel-titulo-solto', 'data-teste': 'semana-editada',
        texto: `Semana ${semana.numero} de ${bloco.total} · ${bloco.nome}` }),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'RIR desta semana' }),

        escolhaEmChips({
          rotulo: 'O mesmo RIR em todas as séries',
          valor: uniforme,
          opcoes: reguaDeRir(bloco).map((numero) => ({ valor: numero, texto: `RIR ${numero}` })),
          teste: 'campo-rir-da-semana-inteira',
          aoMudar: async (valor) => {
            if (await guardar((p) => contas.comRirEmTodaASemana(p, numeroSemana, valor))) repintar();
          },
        }),
        el('p', { classe: 'campo-dica', texto: 'Um toque muda a semana inteira. Logo abaixo você acerta série por série.' }),

        listaDeRir,

        el('div', { classe: 'ordem-botoes-largos' }, [
          el('button', {
            classe: 'botao botao-neutro botao-largo', type: 'button', 'data-teste': 'menos-uma-serie',
            texto: '− Série',
            onclick: async () => {
              const quantas = agoraA().rirPorSerie.length;
              if (quantas <= 1) {
                avisar('A semana precisa de pelo menos uma série na lista.');
                return;
              }
              if (await guardar((p) => contas.comPosicoesNaSemana(p, numeroSemana, quantas - 1))) {
                repintar();
              }
            },
          }),
          el('button', {
            classe: 'botao botao-neutro botao-largo', type: 'button', 'data-teste': 'mais-uma-serie',
            texto: '+ Série',
            onclick: async () => {
              const quantas = agoraA().rirPorSerie.length;
              if (quantas >= bloco.limiteDePosicoes) {
                avisar(`A lista da semana vai até ${bloco.limiteDePosicoes} séries.`);
                return;
              }
              if (await guardar((p) => contas.comPosicoesNaSemana(p, numeroSemana, quantas + 1))) {
                repintar();
              }
            },
          }),
        ]),
        resultado,
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Semana leve' }),
        escolhaEmChips({
          rotulo: 'Esta é a semana leve do bloco?',
          valor: semana.deload,
          opcoes: [{ valor: false, texto: 'Semana cheia' }, { valor: true, texto: 'Semana leve' }],
          teste: 'campo-e-deload',
          aoMudar: async (valor) => {
            // A semana leve nasce com os números dela ligados. Sem isso ela
            // viraria "leve" sem cortar série nem carga — uma etiqueta sem
            // efeito nenhum. Os dois campos aparecem logo abaixo para ele
            // mudar na hora.
            const mudancas = valor
              ? {
                deload: true,
                aplicarRegrasDeTipo: false,
                seriesFator: 0.5,
                seriesArredondamento: 'cima',
                cargaFator: 0.6,
              }
              : { deload: false, aplicarRegrasDeTipo: true };
            if (await guardar(comEsta(mudancas))) {
              repintar();
              montarCamposDoDeload();
            }
          },
        }),
        el('p', { classe: 'painel-nota', texto: 'Na semana leve a periodização corta séries e a carga sugerida vem menor. O treino continua inteiro: as séries que ficam de fora não somem, só não são cobradas naquela semana.' }),
        corpoDoDeload,
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Regras nesta semana' }),
        escolhaEmChips({
          rotulo: 'Aplicar as regras de composto e isolador',
          valor: semana.aplicarRegrasDeTipo,
          opcoes: [{ valor: true, texto: 'Aplicar' }, { valor: false, texto: 'Mesmo RIR em tudo' }],
          teste: 'campo-aplicar-regras',
          aoMudar: async (valor) => {
            if (await guardar(comEsta({ aplicarRegrasDeTipo: valor }))) repintar();
          },
        }),
        escolhaEmChips({
          rotulo: 'Nesta semana, a última série do composto',
          valor: semana.excecaoDoComposto?.pisoRir ?? null,
          opcoes: [
            { valor: null, texto: 'Segue o piso' },
            ...reguaDeRir(bloco, 2).map((numero) => ({ valor: numero, texto: `Pode ir a ${numero}` })),
          ],
          teste: 'campo-excecao-do-composto',
          aoMudar: async (valor) => {
            if (await guardar((p) => contas.comExcecaoDoComposto(p, numeroSemana, valor))) repintar();
          },
        }),
        el('p', { classe: 'painel-nota', texto: 'É por aqui que a última série da semana mais pesada chega mais perto da falha do que o piso do composto deixaria.' }),
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Nome desta semana' }),
        campoDeTexto({
          rotulo: 'Como ela aparece na tela',
          dica: `Em branco vira "Semana ${semana.numero}".`,
          valor: semana.rotulo,
          teste: 'campo-rotulo-da-semana',
          aoMudar: (texto) => guardar(comEsta({ rotulo: texto })),
        }),
      ]),
    ],
  });

  repintar();
  montarCamposDoDeload();
}

// ------------------------------------------------------ o painel de regras

/** As regras que valem no bloco inteiro, mais o nome dele e o degrau da carga
 *  sugerida. Ficam num painel porque têm campo de digitar: na página, cada
 *  tecla redesenharia a tela debaixo do dedo dele. */
function editarRegras() {
  const bloco = olhar();
  const fraseDoComposto = el('p', { classe: 'campo-dica', 'data-teste': 'regra-do-composto' });
  const fraseDoIsolador = el('p', { classe: 'campo-dica', 'data-teste': 'regra-do-isolador' });
  const camposDoIsolador = el('div', { classe: 'campos-condicionais', 'data-teste': 'campos-do-isolador' });

  const contarAsRegras = () => {
    const agora = olhar();
    fraseDoComposto.textContent = agora.regras.composto?.descricao ?? '';
    fraseDoIsolador.textContent = agora.regras.isolador?.descricao ?? '';
  };

  const guardarRegras = async (mudancas) => {
    const feito = await guardar((p) => contas.comRegras(p, mudancas));
    if (feito) contarAsRegras();
    return feito;
  };

  const chipsDeRir = (minimo = 3) =>
    reguaDeRir(bloco, minimo).map((numero) => ({ valor: numero, texto: String(numero) }));

  /** Só o ajuste é condicional. O piso do isolador vale sempre — inclusive com
   *  o ajuste desligado, e é justamente aí que ele importa: sem o piso do
   *  composto por cima, o piso do isolador é o único chão que a série tem. */
  const montarCamposDoIsolador = () => {
    const agora = olhar().regras.isolador ?? {};

    camposDoIsolador.replaceChildren(
      agora.aplicarAutomaticamente === true
        ? escolhaEmChips({
          rotulo: 'Quanto ele fica em relação ao composto',
          valor: Number(agora.ajusteRir ?? 0),
          opcoes: [
            { valor: -2, texto: '2 abaixo' },
            { valor: -1, texto: '1 abaixo' },
            { valor: 1, texto: '1 acima' },
          ],
          teste: 'campo-ajuste-do-isolador',
          aoMudar: (valor) => guardarRegras({ isolador: { ajusteRir: valor } }),
        })
        : el('p', { classe: 'campo-dica', texto: 'Sem ajuste, o isolador fica com o RIR cru da semana. Ele não copia o composto: o composto tem o piso dele, e pode acabar mais alto.' }),
      escolhaEmChips({
        rotulo: 'Isolador nunca abaixo de',
        valor: Number(agora.pisoRir ?? 0),
        opcoes: chipsDeRir(),
        teste: 'campo-piso-do-isolador',
        aoMudar: (valor) => guardarRegras({ isolador: { pisoRir: valor } }),
      }),
    );
  };

  painel({
    titulo: 'Regras do bloco',
    teste: 'editor-regras',
    nota: 'Tudo aqui salva sozinho, e vale para todas as semanas do bloco a partir do próximo treino.',
    montar: () => [
      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Exercício composto' }),
        escolhaEmChips({
          rotulo: 'Nunca abaixo de',
          valor: Number(bloco.regras.composto?.pisoRir ?? 0),
          opcoes: chipsDeRir(),
          teste: 'campo-piso-do-composto',
          aoMudar: (valor) => guardarRegras({ composto: { pisoRir: valor } }),
        }),
        fraseDoComposto,
        el('p', { classe: 'painel-nota', texto: 'A semana que pode passar desse piso na última série você marca dentro da própria semana.' }),
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Exercício isolador' }),
        escolhaEmChips({
          rotulo: 'O isolador muda em relação ao composto?',
          valor: bloco.regras.isolador?.aplicarAutomaticamente === true,
          opcoes: [
            { valor: true, texto: 'Tem ajuste próprio' },
            { valor: false, texto: 'Segue a semana' },
          ],
          teste: 'campo-liga-isolador',
          aoMudar: async (valor) => {
            if (await guardarRegras({ isolador: { aplicarAutomaticamente: valor } })) {
              montarCamposDoIsolador();
            }
          },
        }),
        camposDoIsolador,
        fraseDoIsolador,
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Carga sugerida' }),
        campoDeDecimal({
          rotulo: 'Degrau da carga (kg)',
          valor: bloco.passoDeCarga,
          teste: 'campo-passo-de-carga',
          dica: 'Usado só quando a semana muda o número sugerido, que hoje é a semana leve. Em semana cheia a carga sugerida é, ao quilo, a que você registrou.',
          aoMudar: (texto) => {
            const numero = Number(String(texto).replace(',', '.'));
            if (!Number.isFinite(numero) || numero <= 0) return;
            dados.definirPassoDeCarga(numero, { silencioso: true })
              .catch((erro) => avisar(`Não consegui guardar: ${erro.message}`));
          },
        }),
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Nome do bloco' }),
        campoDeTexto({
          rotulo: 'Como ele aparece na tela',
          dica: 'Fica guardado dentro de cada treino que você registrar, para o histórico dizer de que bloco aquele dia era.',
          valor: bloco.nome,
          teste: 'campo-nome-da-periodizacao',
          aoMudar: (texto) => guardar((p) => ({ ...p, nome: texto })),
        }),
      ]),

      el('section', { classe: 'painel-bloco' }, [
        el('h3', { classe: 'painel-titulo', texto: 'Série além da lista da semana' }),
        el('p', { classe: 'painel-nota', texto: 'Quando um exercício tem mais séries do que a lista da semana descreve, as séries que sobram repetem o último RIR dela. É assim em todas as semanas.' }),
      ]),
    ],
  });

  contarAsRegras();
  montarCamposDoIsolador();
}

// ------------------------------------------------------ mudar o tamanho

/** Muda quantas semanas o bloco tem. Encurtar pergunta antes, porque a semana
 *  que sai leva o RIR que estava escrito nela; aumentar não pergunta, porque
 *  não perde nada. */
async function mudarQuantidadeDeSemanas(quantidade) {
  const bloco = olhar();
  const alvo = Math.min(Math.max(quantidade, 1), bloco.limiteDeSemanas);

  if (alvo === bloco.total) {
    avisar(quantidade < 1
      ? 'O bloco precisa de pelo menos uma semana.'
      : `O bloco vai até ${contar(bloco.limiteDeSemanas, 'semana', 'semanas')}.`);
    return;
  }

  if (alvo < bloco.total) {
    // Quem sai não é sempre o fim da lista: com a semana leve guardada na
    // última posição, quem cai são as semanas cheias de trás para a frente.
    const guardaODeload = bloco.semanas[bloco.total - 1].deload && alvo >= 2;
    const somem = (guardaODeload
      ? bloco.semanas.slice(alvo - 1, bloco.total - 1)
      : bloco.semanas.slice(alvo)).map((s) => s.rotulo);

    const linhas = [
      `O bloco passa de ${contar(bloco.total, 'semana', 'semanas')} para ${contar(alvo, 'semana', 'semanas')}.`,
      guardaODeload
        ? `Sai do bloco: ${somem.join(', ')}. A semana leve continua sendo a última.`
        : `Sai do bloco: ${somem.join(', ')}.`,
    ];
    if (bloco.semanaAtual > alvo) {
      linhas.push(`Você está na semana ${bloco.semanaAtual}, que deixa de existir. Você passa para a semana ${alvo}, no mesmo bloco ${bloco.bloco}.`);
    }
    linhas.push(fraseDosRegistrados(bloco.sessoesRegistradas));

    const temCerteza = await confirmar({
      titulo: 'Encurtar o bloco?',
      linhas,
      confirmarTexto: 'Encurtar',
    });
    if (!temCerteza) return;
  }

  try {
    const feito = await dados.salvarPeriodizacao(
      contas.comQuantidadeDeSemanas(dados.periodizacaoAtual(), alvo));
    avisar(feito.mudouASemana
      ? `Bloco de ${contar(feito.total, 'semana', 'semanas')}. A semana ${feito.semanaAntes} não existe mais, então você está na ${feito.semanaDepois}.`
      : `Bloco de ${contar(feito.total, 'semana', 'semanas')}. Vale do próximo treino em diante.`);
  } catch (erro) {
    avisar(`Não consegui mudar o bloco: ${erro.message}`);
  }
}

// -------------------------------------------------------- voltar ao padrão

async function voltarAoPadrao() {
  const bloco = olhar();

  if (bloco.ehOPadraoDeFabrica) {
    avisar('A sua periodização já é a que veio de fábrica.');
    return;
  }

  const temCerteza = await confirmar({
    titulo: 'Voltar à periodização de fábrica?',
    linhas: [
      `O bloco de ${contar(bloco.total, 'semana', 'semanas')} que você montou dá lugar ao que veio com o app.`,
      'Muda só a periodização. Seus treinos, seus exercícios e os treinos que você já registrou ficam exatamente como estão.',
      'Vale do próximo treino em diante.',
    ],
    confirmarTexto: 'Voltar ao padrão',
  });
  if (!temCerteza) return;

  try {
    const feito = await dados.restaurarPeriodizacaoPadrao();
    avisar(feito.mudouASemana
      ? `Periodização de fábrica de volta, com ${contar(feito.total, 'semana', 'semanas')}. Você passou para a semana ${feito.semanaDepois}.`
      : `Periodização de fábrica de volta, com ${contar(feito.total, 'semana', 'semanas')}. Nada do seu histórico mudou.`);
  } catch (erro) {
    avisar(`Não consegui voltar ao padrão: ${erro.message}`);
  }
}

// ------------------------------------------------------ onde ele está hoje

async function andar(passo) {
  try {
    const feito = passo > 0 ? await dados.avancarSemana() : await dados.voltarSemana();
    if (feito.jaEraAPrimeira) {
      avisar('Você já está na primeira semana do bloco.');
      return;
    }
    avisar(feito.virouBloco
      ? `Bloco ${feito.bloco} começou, na semana 1 de ${feito.total}. Os treinos dos blocos anteriores continuam guardados.`
      : `Semana ${feito.semana} de ${feito.total}, no bloco ${feito.bloco}.`);
  } catch (erro) {
    avisar(`Não consegui mudar a semana: ${erro.message}`);
  }
}

function cartaoDeOndeEleEsta(bloco) {
  const chips = bloco.semanas.map((semana) => el('button', {
    classe: `chip-escolha chip-semana ${semana.numero === bloco.semanaAtual ? 'chip-ligado' : ''}`.trim(),
    type: 'button',
    'data-teste': 'ir-para-semana',
    'data-semana': String(semana.numero),
    'aria-pressed': String(semana.numero === bloco.semanaAtual),
    'aria-label': `Ir para a semana ${semana.numero}`,
    texto: semana.deload ? `${semana.numero} leve` : String(semana.numero),
    onclick: async () => {
      const feito = await dados.definirSemanaAtual(semana.numero);
      avisar(`Semana ${feito.semana} de ${feito.total}, no bloco ${feito.bloco}.`);
    },
  }));

  const naUltima = bloco.semanaAtual >= bloco.total;

  return el('section', { classe: 'cartao' }, [
    el('h2', { classe: 'cartao-titulo', texto: 'Onde você está' }),
    el('p', { classe: 'onde-linha', 'data-teste': 'onde-voce-esta',
      texto: `Bloco ${bloco.bloco} · Semana ${bloco.semanaAtual} de ${bloco.total}` }),
    el('p', { classe: 'cartao-nota', texto: 'O app não vira a semana sozinho. Quem diz que a semana passou é você, aqui.' }),
    el('div', { classe: 'chips-escolha', role: 'group', 'aria-label': 'Semana do bloco' }, chips),
    el('div', { classe: 'ordem-botoes-largos' }, [
      el('button', {
        classe: 'botao botao-neutro botao-largo', type: 'button', 'data-teste': 'semana-anterior',
        texto: '‹ Semana anterior', onclick: () => andar(-1),
      }),
      el('button', {
        classe: 'botao botao-primario botao-largo', type: 'button', 'data-teste': 'proxima-semana',
        texto: naUltima ? 'Começar bloco novo ›' : 'Próxima semana ›',
        onclick: () => andar(+1),
      }),
    ]),
    el('p', { classe: 'cartao-nota', 'data-teste': 'aviso-do-fim-do-bloco',
      texto: naUltima
        ? `Esta é a última semana do bloco. O próximo toque começa o bloco ${bloco.bloco + 1} na semana 1, e tudo que você já treinou continua guardado.`
        : `Quando você terminar a semana ${bloco.total}, o toque seguinte começa o bloco ${bloco.bloco + 1}.` }),
  ]);
}

// ------------------------------------------------------------- as regras

function cartaoDasRegras(bloco) {
  const linha = (rotulo, valor) => el('div', { classe: 'linha-info' }, [
    el('span', { classe: 'info-rotulo', texto: rotulo }),
    el('span', { classe: 'info-valor', texto: valor }),
  ]);

  const isolador = bloco.regras.isolador ?? {};

  return el('section', { classe: 'cartao' }, [
    el('h2', { classe: 'cartao-titulo', texto: 'Regras do bloco' }),
    linha('Composto', `nunca abaixo de ${bloco.regras.composto?.pisoRir ?? 0}`),
    linha('Isolador', isolador.aplicarAutomaticamente && Number(isolador.ajusteRir ?? 0) !== 0
      ? `${Math.abs(Number(isolador.ajusteRir ?? 0))} ${Number(isolador.ajusteRir ?? 0) < 0 ? 'abaixo' : 'acima'} do composto, piso ${isolador.pisoRir ?? 0}`
      : `segue a semana, piso ${isolador.pisoRir ?? 0}`),
    linha('Degrau da carga sugerida', `${formatarNumero(bloco.passoDeCarga)} kg`),
    el('p', { classe: 'cartao-nota', 'data-teste': 'resumo-das-regras',
      texto: `${bloco.regras.composto?.descricao ?? ''} ${bloco.regras.isolador?.descricao ?? ''}`.trim() }),
    el('button', {
      classe: 'botao botao-neutro', type: 'button', 'data-teste': 'editar-regras',
      texto: 'Editar regras e nome do bloco',
      onclick: editarRegras,
    }),
  ]);
}

// --------------------------------------------------------------- a tela

export function telaDaPeriodizacao() {
  const bloco = olhar();

  return el('div', { classe: 'pagina' }, [
    cabecalho('Periodização', { voltarPara: '#/' }),

    el('p', { classe: 'painel-nota painel-nota-alta', 'data-teste': 'alcance-da-periodizacao',
      texto: `O que você mudar aqui vale do próximo treino em diante. ${fraseDosRegistrados(bloco.sessoesRegistradas)} Cada treino registrado guarda o RIR programado do dia em que aconteceu, e isso não muda nunca.` }),

    bloco.sessoesAbertas > 0
      ? el('p', { classe: 'painel-aviso', 'data-teste': 'aviso-sessao-aberta',
        texto: 'Você tem um treino em andamento. Ele não muda: as séries dele já nasceram com o RIR daquele dia. Só série que nascer depois desta mudança usa os números novos.' })
      : null,

    cartaoDeOndeEleEsta(bloco),

    // O nome do bloco quase sempre já diz o tamanho ("Padrão 6 semanas"). Só
    // repete o número quando ele não estiver lá.
    el('h2', { classe: 'titulo-secao', 'data-teste': 'titulo-do-bloco',
      texto: bloco.nome.includes(String(bloco.total))
        ? bloco.nome
        : `${bloco.nome} · ${contar(bloco.total, 'semana', 'semanas')}` }),
    el('div', { classe: 'lista-semanas', 'data-teste': 'bloco-inteiro' },
      bloco.semanas.map((semana) => cartaoDaSemana(semana, bloco.semanaAtual))),

    el('section', { classe: 'cartao' }, [
      el('h2', { classe: 'cartao-titulo', texto: 'Tamanho do bloco' }),
      el('div', { classe: 'contador' }, [
        el('button', {
          classe: 'passo-botao passo-botao-grande', type: 'button', 'data-teste': 'menos-uma-semana',
          'aria-label': 'Menos uma semana', texto: '−',
          onclick: () => mudarQuantidadeDeSemanas(bloco.total - 1),
        }),
        el('span', { classe: 'contador-valor', 'data-teste': 'quantidade-de-semanas', texto: String(bloco.total) }),
        el('button', {
          classe: 'passo-botao passo-botao-grande', type: 'button', 'data-teste': 'mais-uma-semana',
          'aria-label': 'Mais uma semana', texto: '+',
          onclick: () => mudarQuantidadeDeSemanas(bloco.total + 1),
        }),
      ]),
      el('p', { classe: 'cartao-nota', texto: 'A semana nova entra como cópia da última semana cheia, e você acerta o RIR dela tocando nela aqui em cima. Se a última semana do seu bloco é a leve, ela continua sendo a última.' }),
    ]),

    cartaoDasRegras(bloco),

    el('section', { classe: 'cartao' }, [
      el('h2', { classe: 'cartao-titulo', texto: 'Voltar ao padrão' }),
      el('p', { classe: 'cartao-nota', 'data-teste': 'estado-do-padrao',
        texto: bloco.ehOPadraoDeFabrica
          ? 'Sua periodização é a que veio de fábrica: bloco de 6 semanas, com a última leve.'
          : 'Traz de volta o bloco de 6 semanas que veio com o app. Não apaga nada: nem treino, nem exercício, nem treino registrado.' }),
      el('button', {
        classe: 'botao botao-neutro', type: 'button', 'data-teste': 'voltar-ao-padrao',
        texto: 'Voltar à periodização de fábrica',
        onclick: voltarAoPadrao,
      }),
    ]),
  ]);
}
