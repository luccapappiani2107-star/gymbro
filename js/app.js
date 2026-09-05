// Ponto de entrada: abre os dados, escolhe a tela pelo endereço e redesenha
// sempre que algum dado muda.

import * as dados from './dados.js';
import * as descanso from './descanso.js';
import { telaInicial } from './telas/inicio.js';
import { telaDoTreino } from './telas/treino.js';
import { telaDaSessao } from './telas/sessao.js';
import { telaDoHistorico, telaDaSessaoRegistrada } from './telas/historico.js';
import { telaDeAjustes } from './telas/ajustes.js';
import { telaDoCatalogo } from './telas/catalogo.js';
import { telaDaPeriodizacao } from './telas/periodizacao.js';
import * as barraDeDesfazer from './telas/desfazer.js';
import { el } from './ui.js';

const raiz = document.getElementById('app');

function rotaAtual() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (partes[0] === 'treino' && partes[1]) return { nome: 'treino', id: partes[1] };
  if (partes[0] === 'sessao' && partes[1]) return { nome: 'sessao', id: partes[1] };
  if (partes[0] === 'historico' && partes[1]) return { nome: 'registrado', id: partes[1] };
  if (partes[0] === 'historico') return { nome: 'historico' };
  if (partes[0] === 'catalogo') return { nome: 'catalogo' };
  if (partes[0] === 'periodizacao') return { nome: 'periodizacao' };
  if (partes[0] === 'ajustes') return { nome: 'ajustes' };
  return { nome: 'inicio' };
}

const TELAS = {
  treino: (rota) => telaDoTreino(rota.id),
  sessao: (rota) => telaDaSessao(rota.id),
  historico: () => telaDoHistorico(),
  registrado: (rota) => telaDaSessaoRegistrada(rota.id),
  catalogo: () => telaDoCatalogo(),
  periodizacao: () => telaDaPeriodizacao(),
  ajustes: () => telaDeAjustes(),
  inicio: () => telaInicial(),
};

function desenhar() {
  const rota = rotaAtual();
  raiz.replaceChildren((TELAS[rota.nome] ?? TELAS.inicio)(rota));
  raiz.setAttribute('data-tela', rota.nome);

  // A tela da sessão rola sozinha para onde o Lucca parou; nas outras, começar
  // do topo é o certo.
  if (rota.nome !== 'sessao') window.scrollTo(0, 0);
}

function mostrarProblema(titulo, texto) {
  raiz.replaceChildren(el('div', { classe: 'pagina' }, [
    el('div', { classe: 'vazio' }, [
      el('p', { classe: 'vazio-titulo', texto: titulo }),
      el('p', { classe: 'vazio-texto', texto }),
    ]),
  ]));
  raiz.setAttribute('data-tela', 'problema');
}

async function ligarModoOffline() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('sw.js');
  } catch {
    // Sem modo offline o app continua funcionando com internet.
  }
}

async function comecar() {
  try {
    const situacao = await dados.iniciar();

    if (situacao.erroDeVersao) {
      mostrarProblema(
        'Seus dados são de uma versão mais nova do GYMBRO',
        'Para não estragar nada, o app não vai mexer neles. Abra o app de novo com a internet ligada para ele se atualizar.');
      return;
    }

    descanso.instalar();
    barraDeDesfazer.instalar();
    dados.aoMudar(desenhar);
    window.addEventListener('hashchange', desenhar);
    desenhar();
    ligarModoOffline();
  } catch (erro) {
    // O motivo cru vai para o console e não para a tela: ele vem do navegador,
    // em inglês e em nome de tecnologia, e esta é a primeira coisa que o Lucca
    // veria se algum dia desse errado.
    console.error('GYMBRO: não consegui abrir os dados.', erro);
    mostrarProblema(
      'Não consegui abrir seus treinos',
      'Este navegador não deixou o GYMBRO guardar nada no celular. Se você estiver em uma aba anônima, tente em uma aba normal.');
  }
}

comecar();
