// Versão do formato dos dados e caminho de atualização.
//
// Quando uma missão precisar mudar o formato do que fica guardado no aparelho:
//   1. sobe VERSAO_ATUAL em um;
//   2. escreve o passo novo em PASSOS, com a chave igual à versão de destino;
//   3. atualiza claude/analises/modelo_de_dados.md no mesmo commit.
//
// O passo recebe todos os documentos e devolve todos os documentos. Nenhum passo
// pode apagar documento de sessão: histórico é sagrado (regra 3 do CONTEXTO).

import { ehDeload } from './periodizacao.js';

export const VERSAO_ATUAL = 7;

const PASSOS = {
  // A sessão ganhou o cronômetro de descanso (campo `descanso`) na M3. Nenhum
  // dado antigo precisa mudar de forma: sessão sem o campo é sessão sem
  // descanso correndo, que é exatamente o que `null` já quer dizer. O passo
  // existe para deixar a mudança de formato registrada e para um aparelho na
  // versão velha recusar um backup que ele não entenderia inteiro.
  2: (documentos) => documentos,

  // A M4 abriu a edição de treino, e com ela dois campos novos, os dois
  // aditivos e os dois fora do histórico já registrado:
  //   - `arquivadaEm` na rotina, a hora em que o treino foi excluído (excluir é
  //     tirar da lista, não apagar: é isso que deixa o histórico dele de pé e
  //     dá à M9 um caminho de volta);
  //   - `rotinaExercicioId` no exercício da sessão, o vínculo fraco com o
  //     exercício da rotina que nasceu junto com ela, usado para levar a nova
  //     ordem dos exercícios para dentro de um treino que está acontecendo
  //     agora.
  // Documento antigo não muda de forma: rotina sem `arquivadaEm` é rotina que
  // nunca foi excluída, e sessão sem `rotinaExercicioId` cai no vínculo do
  // catálogo. Nenhuma série de nenhuma sessão é tocada aqui.
  3: (documentos) => documentos,

  // A M5 abriu a edição de exercício, e com ela quatro campos novos, todos
  // aditivos e todos fora do histórico já registrado:
  //   - `arquivadoEm` no exercício do catálogo (o `arquivado` já existia desde
  //     a M2): a hora em que ele saiu da lista do catálogo;
  //   - `arquivado`, `arquivadoEm` e `substituidoPor` no exercício da rotina.
  // Excluir um exercício de um treino é tirar da lista, não apagar — a mesma
  // escolha que a M4 fez com o treino inteiro, pelo mesmo motivo: as sessões
  // guardam `rotinaExercicioId`, a M7 vai agrupar histórico por ele e a M9
  // precisa de um caminho de volta. `substituidoPor` guarda, no exercício que
  // saiu, o identificador do que entrou no lugar: é o que deixa uma troca
  // legível no dado e desfazível depois, sem nunca fundir os dois históricos.
  // Documento antigo não muda de forma: exercício sem `arquivado` é exercício
  // que nunca foi excluído, e sem `substituidoPor` é exercício que nunca foi
  // trocado. Nenhuma série de nenhuma sessão é tocada aqui.
  4: (documentos) => documentos,

  // A M7 separou de vez o RIR programado do RIR usado na tela e passou a
  // sugerir carga. Três campos novos, os três aditivos e os três fora do
  // histórico já registrado:
  //   - `sugestao` na série da sessão: a carga sugerida com a origem inteira
  //     dentro (de que dia veio, de que série, qual fator da semana foi
  //     aplicado). Congelada no nascimento da série, como o `rirProgramado`, e
  //     nunca reescrita por tela nenhuma;
  //   - `deload` na sessão: se aquele dia foi semana leve. Serve para a
  //     sugestão das próximas semanas não usar um deload como base;
  //   - `passoDeCarga` em `config`: o degrau de carga usado quando a semana
  //     muda o número sugerido.
  // Documento antigo não muda de forma, e este passo não reescreve nada de
  // propósito: série sem `sugestao` é série que nasceu antes de existir
  // sugestão (e o campo dela abre em branco, como abria), sessão sem `deload`
  // cai na pergunta à periodização de hoje, e config sem `passoDeCarga` usa o
  // valor de fábrica de `js/sugestao.js`. Nenhuma série de nenhuma sessão é
  // tocada aqui: a carga registrada continua sendo a que ele levantou.
  5: (documentos) => documentos,

  // A M8 abriu a edição da periodização, e com ela a única pergunta que uma
  // sessão antiga ainda fazia à periodização de hoje: "aquele dia foi semana
  // leve?". Sessão nascida antes da M7 não guarda `deload`, e até aqui a
  // resposta era calculada na hora, olhando o bloco que está valendo agora.
  // Enquanto a periodização era fixa isso dava sempre a mesma resposta. Com o
  // Lucca podendo tirar o deload da semana 6, a mesma sessão antiga passaria a
  // responder outra coisa amanhã — e a sugestão de carga das próximas semanas
  // mudaria por causa de uma edição feita hoje.
  //
  // Este passo congela a resposta antes que ela possa mudar: escreve `deload`
  // na sessão que não tem, com o valor que a periodização de agora daria, que
  // é exatamente o que a leitura de hoje já devolve. Depois disso nenhuma
  // sessão pergunta mais nada à periodização.
  //
  // Só o campo que falta é escrito. Nenhuma série é tocada: nem carga, nem
  // reps, nem `rirProgramado`, nem `rirUsado`, nem `rirReal`. Sessão que já
  // tem `deload` sai daqui idêntica.
  6: (documentos) => {
    const periodizacao = documentos.periodizacao;

    for (const [chave, sessao] of Object.entries(documentos)) {
      if (!chave.startsWith('sessao:') || !sessao || typeof sessao !== 'object') continue;
      if (typeof sessao.deload === 'boolean') continue;
      documentos[chave] = { ...sessao, deload: ehDeload(periodizacao, sessao.semana) };
    }
    return documentos;
  },

  // A M9 deu ao treino um ponto de volta que o Lucca marca na tela: o campo
  // `referencia` na rotina, com uma cópia congelada da estrutura dela (nome,
  // foco, dia e os exercícios com as séries planejadas dentro). É aditivo e
  // opcional — rotina sem `referencia` é rotina que ele nunca marcou, e a tela
  // diz isso com todas as letras em vez de oferecer um botão sem destino.
  //
  // A outra metade do "original" já existia e não muda de forma nenhuma: o
  // documento `fabrica`, congelado na semeadura desde a M2, é o treino como
  // veio da ficha inicial. Aparelho velho que não tem `fabrica` (backup de
  // antes dela) simplesmente não oferece o caminho de fábrica.
  //
  // O passo não reescreve nada de propósito. Nenhuma série de nenhuma sessão é
  // tocada aqui — nem podia ser: desfazer e restaurar são as duas ações desta
  // missão, e as duas existem justamente para não encostar no histórico.
  7: (documentos) => documentos,
};

export class DadosMaisNovosQueOApp extends Error {
  constructor(versaoGravada) {
    super(`dados na versão ${versaoGravada}, app na versão ${VERSAO_ATUAL}`);
    this.name = 'DadosMaisNovosQueOApp';
    this.versaoGravada = versaoGravada;
  }
}

/** Leva os documentos da versão em que estão até a versão atual do app.
 *  Devolve { documentos, de, para, migrou }. */
export function migrar(documentos, versaoGravada) {
  const de = Number(versaoGravada) || 0;

  if (de > VERSAO_ATUAL) throw new DadosMaisNovosQueOApp(de);

  let atuais = documentos;
  for (let alvo = de + 1; alvo <= VERSAO_ATUAL; alvo += 1) {
    const passo = PASSOS[alvo];
    if (passo) atuais = passo(atuais);
  }

  return { documentos: atuais, de, para: VERSAO_ATUAL, migrou: de !== VERSAO_ATUAL };
}
