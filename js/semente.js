// A semente: transforma o arquivo dados/semente.json nos documentos que ficam
// guardados no aparelho.
//
// Roda uma única vez, quando o aparelho ainda não tem nada. Depois disso o dono
// da verdade é o que está salvo no celular — mexer no semente.json não muda mais
// nada, nem quando o app é atualizado.

import { novoId, hojeISO, agoraISO, clonar } from './util.js';

export const CAMINHO_SEMENTE = 'dados/semente.json';

export async function carregarSemente(caminho = CAMINHO_SEMENTE) {
  const resposta = await fetch(caminho, { cache: 'no-cache' });
  // A frase é para o Lucca, não para quem programa: o endereço do arquivo e o
  // número da resposta ficam no console, que é onde eles servem para alguma
  // coisa.
  if (!resposta.ok) {
    console.warn('GYMBRO: não consegui ler', caminho, resposta.status);
    throw new Error('não consegui abrir a ficha inicial do GYMBRO');
  }
  return resposta.json();
}

function montarCatalogo(semente, quando) {
  return (semente.catalogo ?? []).map((bruto) => ({
    id: novoId('ex'),
    nome: bruto.nome,
    grupoPrincipal: bruto.grupoPrincipal ?? null,
    grupoSecundario: bruto.grupoSecundario ?? null,
    tipo: bruto.tipo === 'isolador' ? 'isolador' : 'composto',
    unilateral: bruto.unilateral === true,
    notas: bruto.notas ?? '',
    arquivado: false,
    arquivadoEm: null,
    criadoEm: quando,
  }));
}

function montarRotinas(semente, catalogo, quando) {
  const porNome = new Map(catalogo.map((ex) => [ex.nome, ex.id]));

  return (semente.rotinas ?? []).map((bruta, posicaoRotina) => ({
    id: novoId('rot'),
    nome: bruta.nome,
    foco: bruta.foco ?? '',
    diaSemana: Number(bruta.diaSemana) || null,
    ordem: posicaoRotina,
    arquivada: false,
    arquivadaEm: null,
    criadoEm: quando,
    exercicios: (bruta.exercicios ?? []).map((item, posicaoExercicio) => {
      const exercicioId = porNome.get(item.catalogo);
      if (!exercicioId) {
        throw new Error(`a semente cita "${item.catalogo}", que não está no catálogo`);
      }
      const quantas = Number(item.series) || 0;

      return {
        id: novoId('rex'),
        exercicioId,
        ordem: posicaoExercicio,
        repMin: Number(item.repMin),
        repMax: Number(item.repMax),
        descansoSegundos: Number(item.descansoSegundos),
        notas: item.notas ?? '',
        arquivado: false,
        arquivadoEm: null,
        substituidoPor: null,
        series: Array.from({ length: quantas }, (_, posicaoSerie) => ({
          id: novoId('ser'),
          ordem: posicaoSerie,
          rirManual: null,
          repMin: null,
          repMax: null,
          cargaAlvo: null,
          notas: '',
        })),
      };
    }),
  }));
}

/** Devolve os documentos prontos para gravar, a partir do arquivo da semente. */
export function montarDocumentos(semente) {
  const quando = agoraISO();
  const catalogo = montarCatalogo(semente, quando);
  const rotinas = montarRotinas(semente, catalogo, quando);
  const periodizacao = clonar(semente.periodizacao);

  const config = {
    unidadeCarga: 'kg',
    casasDecimaisCarga: 1,
    // O degrau de carga da sugestão, usado quando a semana muda o número
    // sugerido (deload). Fica em `config` para virar campo de tela na M8, sem
    // passar por código.
    passoDeCarga: 0.5,
    semanaAtual: 1,
    bloco: 1,
    ...clonar(semente.config ?? {}),
    inicioDoBloco: hojeISO(),
    ultimaAbertura: quando,
  };

  return {
    config,
    periodizacao,
    catalogo,
    rotinas,
    // Congelada aqui e nunca mais tocada: é o "original" que a M9 restaura.
    fabrica: {
      criadaEm: quando,
      origem: CAMINHO_SEMENTE,
      catalogo: clonar(catalogo),
      rotinas: clonar(rotinas),
      periodizacao: clonar(periodizacao),
    },
  };
}
