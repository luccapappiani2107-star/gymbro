// A barra de desfazer: fica colada no rodapé da janela e diz, em uma frase, o
// que o próximo toque vai desfazer.
//
// Mora fora das telas, como o cronômetro de descanso, e pelo mesmo motivo: ela
// vale para o app inteiro. Uma edição feita na tela do treino se desfaz de
// dentro da tela do treino, uma edição de periodização de dentro da
// periodização, e as duas continuam ali quando ele muda de tela no meio.
//
// **Ela diz o que vai desfazer antes de desfazer.** Não é um "Desfazer" seco: é
// "Última alteração: renomear o treino para Push AB". Na academia, com pressa,
// um botão que não diz o que faz é um botão que ninguém toca.
//
// **Ela some quando ele manda, e volta na alteração seguinte.** A tela do
// celular é pequena e a barra cobre o rodapé; um "×" tira ela de vista sem
// jogar fora o caminho de volta, que continua no bloco "Últimas alterações" da
// tela de backup.

import * as dados from '../dados.js';
import { el, avisar } from '../ui.js';

let barra = null;
let escondidaPorEle = false;
let ultimoSelo = 0;

/** Desfaz e conta o que foi desfeito. Exportada porque a tela de backup usa a
 *  mesma ação, e a frase tem de ser a mesma nos dois lugares. */
export async function desfazerAgora() {
  try {
    const feito = await dados.desfazer();
    if (!feito) return;
    avisar(feito.treinoDeHojeFicouComoEstava
      ? `Desfeito: ${feito.frase}. O treino que você está fazendo agora ficou como está, porque você já registrou série nele.`
      : `Desfeito: ${feito.frase}.`);
  } catch (erro) {
    avisar(`Não consegui desfazer: ${erro.message}`);
  }
}

export async function refazerAgora() {
  try {
    const feito = await dados.refazer();
    if (!feito) return;
    avisar(feito.treinoDeHojeFicouComoEstava
      ? `Refeito: ${feito.frase}. O treino que você está fazendo agora ficou como está, porque você já registrou série nele.`
      : `Refeito: ${feito.frase}.`);
  } catch (erro) {
    avisar(`Não consegui refazer: ${erro.message}`);
  }
}

function botao({ texto, teste, principal = false, aoTocar }) {
  return el('button', {
    classe: `desfazer-botao ${principal ? 'desfazer-botao-forte' : ''}`.trim(),
    type: 'button',
    'data-teste': teste,
    texto,
    onclick: aoTocar,
  });
}

function pintar() {
  if (!barra) return;
  const visao = dados.visaoDoDesfazer();

  // Alteração nova traz a barra de volta: ele escondeu a de antes, não esta.
  // Desfazer e refazer não mexem no selo, então a barra que ele escondeu
  // continua escondida enquanto ele não editar mais nada.
  if (visao.selo !== ultimoSelo) {
    ultimoSelo = visao.selo;
    escondidaPorEle = false;
  }

  const aparece = (visao.podeDesfazer || visao.podeRefazer) && !escondidaPorEle;
  barra.classList.toggle('aparecendo', aparece);
  document.body.classList.toggle('com-desfazer', aparece);
  if (!aparece) {
    barra.replaceChildren();
    return;
  }

  barra.replaceChildren(
    el('p', { classe: 'desfazer-frase', 'data-teste': 'frase-do-desfazer' }, [
      el('span', {
        classe: 'desfazer-rotulo',
        texto: visao.podeDesfazer ? 'Última alteração' : 'Você desfez',
      }),
      el('span', {
        classe: 'desfazer-texto',
        texto: visao.podeDesfazer ? visao.fraseParaDesfazer : visao.fraseParaRefazer,
      }),
    ]),
    el('div', { classe: 'desfazer-botoes' }, [
      visao.podeDesfazer
        ? botao({ texto: 'Desfazer', teste: 'desfazer', principal: true, aoTocar: desfazerAgora })
        : null,
      visao.podeRefazer
        ? botao({ texto: 'Refazer', teste: 'refazer', principal: !visao.podeDesfazer, aoTocar: refazerAgora })
        : null,
      botao({
        texto: '×',
        teste: 'esconder-desfazer',
        aoTocar: () => { escondidaPorEle = true; pintar(); },
      }),
    ]),
  );
}

/** Pendura a barra na janela. Chamado uma vez, na abertura do app. */
export function instalar() {
  if (barra) return;
  barra = el('div', {
    classe: 'barra-desfazer',
    role: 'status',
    'aria-live': 'polite',
    'data-teste': 'barra-desfazer',
  });
  document.body.append(barra);
  dados.aoMudar(pintar);
  pintar();
}
