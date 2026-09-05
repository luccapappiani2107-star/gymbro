// Faz o GYMBRO abrir sem internet depois da primeira visita.
//
// Guarda uma cópia dos arquivos do app no aparelho, serve essa cópia na hora e
// busca a versão nova por trás. Atualização do app aparece na abertura seguinte.
//
// Ao mudar a lista de arquivos, troque o número do PACOTE: é isso que faz o
// celular jogar fora a cópia velha.

const PACOTE = 'gymbro-v8';

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilo.css',
  './css/sessao.css',
  './css/editor.css',
  './css/exercicio.css',
  './css/serie.css',
  './css/periodizacao.css',
  './css/desfazer.css',
  './js/app.js',
  './js/dados.js',
  './js/alteracoes.js',
  './js/referencia.js',
  './js/descanso.js',
  './js/sessao.js',
  './js/sugestao.js',
  './js/rotinas.js',
  './js/exercicios.js',
  './js/armazenamento.js',
  './js/esquema.js',
  './js/periodizacao.js',
  './js/semente.js',
  './js/ui.js',
  './js/util.js',
  './js/telas/inicio.js',
  './js/telas/treino.js',
  './js/telas/sessao.js',
  './js/telas/historico.js',
  './js/telas/ajustes.js',
  './js/telas/editor.js',
  './js/telas/exercicio.js',
  './js/telas/catalogo.js',
  './js/telas/painel.js',
  './js/telas/serie.js',
  './js/telas/periodizacao.js',
  './js/telas/desfazer.js',
  './dados/semente.json',
  './icones/icone-192.png',
  './icones/icone-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(PACOTE)
      .then((pacote) => pacote.addAll(ARQUIVOS))
      .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== PACOTE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;

  evento.respondWith((async () => {
    const pacote = await caches.open(PACOTE);
    const guardado = await pacote.match(pedido, { ignoreSearch: true });

    const daRede = fetch(pedido)
      .then((resposta) => {
        if (resposta.ok) pacote.put(pedido, resposta.clone());
        return resposta;
      })
      .catch(() => null);

    if (guardado) return guardado;

    const resposta = await daRede;
    if (resposta) return resposta;

    // Sem internet e sem cópia: se for uma navegação, abre a tela inicial.
    if (pedido.mode === 'navigate') {
      const inicial = await pacote.match('./index.html');
      if (inicial) return inicial;
    }
    return new Response('', { status: 504, statusText: 'sem internet' });
  })());
});
