// O painel que abre por cima da tela, já sabendo o que fazer ao fechar.
//
// A mecânica toda (fundo escuro, botão de voltar do celular, foco) mora em
// `ui.js`, que não sabe onde os dados ficam guardados. Este arquivo é só a
// ponta que liga uma coisa na outra: ao fechar, ou vai para outro endereço —
// que já redesenha sozinho — ou pede um redesenho, para o que está embaixo
// aparecer com o nome e a ordem novos.
//
// `depoisDeFechar` existe por um motivo só, e é um motivo de navegador: fechar
// um painel devolve um passo do endereço, e esse passo só volta um instante
// depois. Um painel aberto no meio disso levaria o passo de volta na cara e se
// fecharia sozinho. Quem quiser abrir um painel a partir de outro pede aqui, e
// o segundo abre com o endereço já no lugar.

import * as dados from '../dados.js';
import { abrirPainel } from '../ui.js';

export function painel({ depoisDeFechar = null, ...opcoes }) {
  return abrirPainel({
    ...opcoes,
    aoFechar: ({ irPara }) => {
      // Trocar de endereço já redesenha sozinho; redesenhar antes só faria a
      // tela velha piscar no caminho.
      if (irPara && location.hash !== irPara) location.hash = irPara;
      else dados.redesenhar();
      if (depoisDeFechar) depoisDeFechar();
    },
  });
}
