// Tela de backup e informações. Sem jargão: nada de arquivo de dados, formato,
// versão de esquema ou nome de tecnologia aparece aqui.

import * as dados from '../dados.js';
import { desfazerAgora, refazerAgora } from './desfazer.js';
import { el, cabecalho, confirmar, avisar, formatarDataHora, contar } from '../ui.js';

function baixarBackup() {
  const conteudo = dados.exportar();
  const hoje = new Date().toISOString().slice(0, 10);
  const endereco = URL.createObjectURL(
    new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' }));

  const link = el('a', { href: endereco, download: `gymbro-backup-${hoje}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 30000);

  avisar('Backup salvo no seu celular. Guarde esse arquivo em outro lugar também.');
}

async function restaurarDoArquivo(arquivo) {
  let conteudo;
  let resumo;

  try {
    conteudo = JSON.parse(await arquivo.text());
    resumo = dados.resumirBackup(conteudo);
  } catch {
    avisar('Não consegui ler esse arquivo. Escolha um backup feito pelo GYMBRO.');
    return;
  }

  const agora = dados.contagens();
  const querSubstituir = await confirmar({
    titulo: 'Substituir tudo que está neste celular?',
    linhas: [
      `O backup tem ${resumo.treinos} treinos, ${resumo.exercicios} exercícios, ${resumo.seriesPlanejadas} séries planejadas e ${resumo.sessoes} treinos registrados.`,
      `Hoje neste celular: ${agora.treinos} treinos, ${agora.exercicios} exercícios, ${agora.seriesPlanejadas} séries planejadas e ${agora.sessoes} treinos registrados.`,
      'Tudo que está aqui agora vai embora e entra o conteúdo do backup. Isso não tem como voltar atrás.',
    ],
    confirmarTexto: 'Substituir',
    perigo: true,
  });
  if (!querSubstituir) return;

  try {
    const feito = await dados.importar(conteudo);
    avisar(`Pronto: ${feito.treinos} treinos e ${feito.sessoes} treinos registrados voltaram.`);
  } catch (erro) {
    avisar(erro.name === 'DadosMaisNovosQueOApp'
      ? 'Esse backup foi feito por uma versão mais nova do GYMBRO. Atualize o app e tente de novo.'
      : 'Não consegui usar esse backup.');
  }
}

async function apagarComConfirmacao() {
  const agora = dados.contagens();

  const temCerteza = await confirmar({
    titulo: 'Apagar tudo deste celular?',
    linhas: [
      `Você perde ${agora.treinos} treinos, ${agora.exercicios} exercícios e ${agora.sessoes} treinos registrados.`,
      'Os treinos voltam como vieram de fábrica, e o histórico não volta.',
      'Se você não fez um backup agora há pouco, cancele e faça primeiro.',
    ],
    confirmarTexto: 'Apagar tudo',
    perigo: true,
  });
  if (!temCerteza) return;

  await dados.apagarTudo();
  avisar('Tudo apagado. Os treinos de fábrica estão de volta.');
}

/** O mesmo desfazer da barra do rodapé, num lugar que não some.
 *
 *  A barra pode ser escondida com um toque, e quem a esconde não pode ficar sem
 *  caminho de volta. Aqui ele está sempre, dizendo a mesma frase. */
function blocoDeAlteracoes() {
  const visao = dados.visaoDoDesfazer();

  const linha = (rotulo, frase, texto, teste, aoTocar) => el('div', { classe: 'linha-alteracao' }, [
    el('p', { classe: 'alteracao-frase' }, [
      el('span', { classe: 'desfazer-rotulo', texto: rotulo }),
      el('br'),
      frase,
    ]),
    el('button', {
      classe: 'botao desfazer-botao desfazer-botao-forte', type: 'button',
      'data-teste': teste, texto, onclick: aoTocar,
    }),
  ]);

  return el('section', { classe: 'cartao' }, [
    el('h2', { classe: 'cartao-titulo', texto: 'Últimas alterações' }),

    visao.podeDesfazer || visao.podeRefazer
      ? null
      : el('p', {
        classe: 'alteracao-frase alteracao-frase-fraca', 'data-teste': 'sem-alteracoes',
        texto: 'Você não mudou nenhum treino desde que abriu o app agora.',
      }),

    visao.podeDesfazer
      ? linha('Última alteração', visao.fraseParaDesfazer, 'Desfazer', 'desfazer-nos-ajustes', desfazerAgora)
      : null,
    visao.podeRefazer
      ? linha('Você desfez', visao.fraseParaRefazer, 'Refazer', 'refazer-nos-ajustes', refazerAgora)
      : null,

    el('p', {
      classe: 'cartao-nota', 'data-teste': 'quantos-passos',
      texto: `O app lembra as últimas ${visao.limite} alterações de treino desta vez que você abriu o app — ${contar(visao.guardados, 'guardada', 'guardadas')} agora. Fechar o app zera essa lista; para voltar a uma configuração antiga depois disso, use "Voltar este treino como ele era", dentro de editar treino.`,
    }),
    el('p', {
      classe: 'cartao-nota',
      texto: 'Desfazer e refazer mexem só na configuração dos treinos. Nenhum treino que você já registrou muda, em nenhum dos dois sentidos.',
    }),
  ]);
}

function blocoDeInformacoes() {
  const c = dados.contagens();
  const config = dados.config();
  const semana = dados.visaoDaSemana();

  const linha = (rotulo, valor) =>
    el('div', { classe: 'linha-info' }, [
      el('span', { classe: 'info-rotulo', texto: rotulo }),
      el('span', { classe: 'info-valor', texto: valor }),
    ]);

  return el('section', { classe: 'cartao' }, [
    el('h2', { classe: 'cartao-titulo', texto: 'Como está seu app' }),
    linha('Treinos', String(c.treinos)),
    linha('Exercícios nos treinos', String(c.exercicios)),
    linha('Séries planejadas', String(c.seriesPlanejadas)),
    linha('Treinos registrados', String(c.sessoes)),
    linha('Semana do bloco', `${semana.numero} de ${semana.total}`),
    linha('Periodização', semana.nomeDaPeriodizacao || '—'),
    linha('Última vez que você abriu', formatarDataHora(config.ultimaAbertura)),
    el('p', { classe: 'cartao-nota',
      texto: 'Seus treinos ficam guardados só neste celular. Nada sai daqui sozinho, e ninguém mais vê.' }),
  ]);
}

export function telaDeAjustes() {
  const entrada = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    classe: 'escondido',
    'data-teste': 'entrada-backup',
    onchange: async (evento) => {
      const arquivo = evento.target.files?.[0];
      evento.target.value = '';
      if (arquivo) await restaurarDoArquivo(arquivo);
    },
  });

  return el('div', { classe: 'pagina' }, [
    cabecalho('Backup', { voltarPara: '#/' }),
    el('section', { classe: 'cartao' }, [
      el('h2', { classe: 'cartao-titulo', texto: 'Levar seus treinos para outro celular' }),
      el('p', { classe: 'cartao-nota',
        texto: 'Se você limpar o navegador ou trocar de aparelho, só o backup traz tudo de volta.' }),
      el('button', {
        classe: 'botao botao-primario', type: 'button', 'data-teste': 'exportar',
        texto: 'Salvar backup', onclick: baixarBackup,
      }),
      el('button', {
        classe: 'botao botao-neutro', type: 'button', 'data-teste': 'importar',
        texto: 'Abrir um backup', onclick: () => entrada.click(),
      }),
      entrada,
    ]),
    blocoDeAlteracoes(),
    blocoDeInformacoes(),
    el('section', { classe: 'cartao cartao-perigo' }, [
      el('h2', { classe: 'cartao-titulo', texto: 'Recomeçar do zero' }),
      el('p', { classe: 'cartao-nota',
        texto: 'Apaga tudo deste celular e traz os treinos como vieram de fábrica.' }),
      el('button', {
        classe: 'botao botao-perigo', type: 'button', 'data-teste': 'apagar',
        texto: 'Apagar tudo', onclick: apagarComConfirmacao,
      }),
    ]),
  ]);
}
