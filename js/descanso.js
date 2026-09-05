// O cronômetro de descanso.
//
// Mora fora das telas, colado no rodapé da janela, por dois motivos: ele
// continua correndo quando o Lucca navega dentro do app, e ele precisa estar à
// mão sem que ele role a tela para achar.
//
// Como ele sobrevive a tudo: o que fica guardado não é "faltam 90 segundos", é
// "termina às 20:04:31". Bloquear a tela, o navegador congelar a aba ou o app
// ser fechado e reaberto não muda a hora de terminar — ao voltar, o app subtrai
// e mostra o tempo certo. E como essa hora fica gravada dentro da sessão, o
// descanso volta até se o celular for reiniciado no meio.
//
// O aviso de fim não usa notificação do sistema: notificação pede permissão, e
// um app que só funciona depois de o Lucca aprovar uma caixa de diálogo é um app
// quebrado. Aqui o aviso é apito, vibração e a barra mudando de cor — nada disso
// pede autorização.

import * as dados from './dados.js';
import { el, formatarRelogio } from './ui.js';

const SEGUNDOS_EXTRAS = 30;
const SEGUNDOS_ATE_SUMIR = 20;

const estado = {
  sessaoId: null,
  serieId: null,
  rotulo: '',
  duracaoSegundos: 0,
  terminaEm: null,   // texto ISO: a hora do fim, não quanto falta
  avisado: false,
};

let barra = null;
let campos = null;
let relogio = null;
let audio = null;

// ------------------------------------------------------------------- som

/** Prepara o som no toque que começa o descanso. Navegador de celular só deixa
 *  tocar áudio a partir de um toque do usuário — este é o toque. */
function prepararSom() {
  try {
    const Contexto = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Contexto) return;
    if (!audio) audio = new Contexto();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

function apitar() {
  if (!audio || audio.state !== 'running') return;
  try {
    const inicio = audio.currentTime;
    for (const [atraso, frequencia] of [[0, 880], [0.2, 1175]]) {
      const oscilador = audio.createOscillator();
      const volume = audio.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.value = frequencia;
      volume.gain.setValueAtTime(0.0001, inicio + atraso);
      volume.gain.exponentialRampToValueAtTime(0.25, inicio + atraso + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, inicio + atraso + 0.17);
      oscilador.connect(volume).connect(audio.destination);
      oscilador.start(inicio + atraso);
      oscilador.stop(inicio + atraso + 0.2);
    }
  } catch {
    // sem som: a vibração e a barra continuam avisando
  }
}

function vibrar() {
  try {
    navigator.vibrate?.([220, 120, 220]);
  } catch {
    // aparelho sem vibração
  }
}

// ----------------------------------------------------------------- a barra

function montarBarra() {
  const tempo = el('span', {
    classe: 'descanso-tempo', 'data-teste': 'descanso-tempo', texto: '0:00',
  });
  const rotulo = el('span', {
    classe: 'descanso-rotulo', 'data-teste': 'descanso-rotulo', texto: '',
  });
  const fechar = el('button', {
    classe: 'descanso-botao descanso-fechar', type: 'button', 'data-teste': 'descanso-pular',
    texto: 'Pular', onclick: () => limpar(),
  });

  const no = el('div', {
    classe: 'barra-descanso', 'data-teste': 'descanso', role: 'status', 'aria-live': 'polite',
  }, [
    el('div', { classe: 'descanso-relogio' }, [tempo, rotulo]),
    el('div', { classe: 'descanso-botoes' }, [
      el('button', {
        classe: 'descanso-botao', type: 'button', 'data-teste': 'descanso-mais',
        texto: `+${SEGUNDOS_EXTRAS}s`, onclick: () => adicionar(SEGUNDOS_EXTRAS),
      }),
      el('button', {
        classe: 'descanso-botao', type: 'button', 'data-teste': 'descanso-reiniciar',
        'aria-label': 'Reiniciar o descanso', texto: '↻', onclick: () => reiniciar(),
      }),
      fechar,
    ]),
  ]);

  campos = { tempo, rotulo, fechar };
  return no;
}

function segundosQueFaltam() {
  if (!estado.terminaEm) return null;
  const fim = Date.parse(estado.terminaEm);
  if (!Number.isFinite(fim)) return null;
  return (fim - Date.now()) / 1000;
}

function pintar() {
  if (!barra) return;
  const faltam = segundosQueFaltam();

  if (faltam === null) {
    barra.classList.remove('aparecendo', 'acabou');
    document.body.classList.remove('com-descanso');
    return;
  }

  const acabou = faltam <= 0;
  barra.classList.add('aparecendo');
  barra.classList.toggle('acabou', acabou);
  document.body.classList.add('com-descanso');

  campos.tempo.textContent = formatarRelogio(Math.max(0, faltam));
  campos.rotulo.textContent = acabou ? `Descanso acabou · ${estado.rotulo}` : estado.rotulo;
  campos.fechar.textContent = acabou ? 'Pronto' : 'Pular';
}

function bater() {
  const faltam = segundosQueFaltam();
  if (faltam === null) return;

  if (faltam <= 0 && !estado.avisado) {
    estado.avisado = true;
    apitar();
    vibrar();
  }

  // Depois de um tempo parado no zero a barra some sozinha, para não ficar
  // cobrindo a tela para sempre se o Lucca voltar só muito depois.
  if (faltam <= -SEGUNDOS_ATE_SUMIR) {
    limpar();
    return;
  }
  pintar();
}

// --------------------------------------------------------------- comandos

function gravar() {
  if (!estado.sessaoId) return;
  const guardar = estado.terminaEm
    ? {
      serieId: estado.serieId,
      rotulo: estado.rotulo,
      duracaoSegundos: estado.duracaoSegundos,
      terminaEm: estado.terminaEm,
    }
    : null;

  dados.salvarDescanso(estado.sessaoId, guardar).catch(() => {
    // Não vale estragar o treino por causa do cronômetro: ele continua na tela.
  });
}

/** Começa o descanso. Chame direto do toque que concluiu a série, sem esperar
 *  nada antes, para o navegador liberar o som. */
export function iniciar({ sessaoId, serieId, rotulo, segundos }) {
  const duracao = Number(segundos);
  if (!Number.isFinite(duracao) || duracao <= 0) {
    estado.sessaoId = sessaoId;
    limpar();
    return;
  }

  prepararSom();
  estado.sessaoId = sessaoId;
  estado.serieId = serieId;
  estado.rotulo = rotulo ?? '';
  estado.duracaoSegundos = Math.round(duracao);
  estado.terminaEm = new Date(Date.now() + duracao * 1000).toISOString();
  estado.avisado = false;

  pintar();
  gravar();
}

/** Volta a mostrar o descanso que estava correndo quando o app foi fechado. */
export function retomarDaSessao(sessao) {
  // Cronômetro que já está correndo na memória manda: voltar para a tela da
  // sessão não pode reiniciar nem apagar o descanso que está na cara do Lucca.
  if (estado.sessaoId === sessao?.id && estado.terminaEm) return true;
  if (!sessao?.descanso?.terminaEm) return false;

  estado.sessaoId = sessao.id;
  estado.serieId = sessao.descanso.serieId ?? null;
  estado.rotulo = sessao.descanso.rotulo ?? '';
  estado.duracaoSegundos = Number(sessao.descanso.duracaoSegundos) || 0;
  estado.terminaEm = sessao.descanso.terminaEm;

  const faltam = segundosQueFaltam();
  if (faltam === null || faltam <= 0) {
    // Acabou enquanto o app estava fechado: não apita agora, só limpa.
    estado.avisado = true;
    limpar();
    return false;
  }

  estado.avisado = false;
  pintar();
  return true;
}

export function adicionar(segundos) {
  if (!estado.terminaEm) return;
  const base = Math.max(Date.now(), Date.parse(estado.terminaEm));
  estado.terminaEm = new Date(base + segundos * 1000).toISOString();
  estado.duracaoSegundos += segundos;
  estado.avisado = false;
  pintar();
  gravar();
}

export function reiniciar() {
  if (!estado.terminaEm || !estado.duracaoSegundos) return;
  estado.terminaEm = new Date(Date.now() + estado.duracaoSegundos * 1000).toISOString();
  estado.avisado = false;
  pintar();
  gravar();
}

/** Tira o descanso da tela. Sem confirmação: pular é um toque só. */
export function limpar() {
  const tinha = estado.terminaEm !== null;
  estado.terminaEm = null;
  estado.serieId = null;
  estado.rotulo = '';
  estado.duracaoSegundos = 0;
  estado.avisado = false;
  pintar();
  if (tinha) gravar();
}

/** Cancela o descanso se ele for daquela série (o Lucca desmarcou a série). */
export function limparSeFor(serieId) {
  if (estado.serieId === serieId) limpar();
}

export function estaCorrendo() {
  const faltam = segundosQueFaltam();
  return faltam !== null && faltam > 0;
}

/** Pendura a barra na janela. Chamado uma vez, na abertura do app. */
export function instalar() {
  if (barra) return;
  barra = montarBarra();
  document.body.append(barra);
  relogio = setInterval(bater, 250);

  // Voltar de tela bloqueada: o navegador pode ter congelado o relógio, então a
  // conta é refeita na hora em que a tela reaparece.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) bater();
  });
  window.addEventListener('focus', bater);
  window.addEventListener('pageshow', bater);
}
