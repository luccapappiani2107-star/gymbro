// Armazenamento no aparelho. Camada mais baixa do app: guarda e devolve
// documentos por chave e não sabe nada sobre treino, série ou RIR.
//
// Quem fala com este arquivo é só o js/dados.js. Nenhuma tela chega aqui.
//
// Driver principal: IndexedDB. Se o navegador não deixar (aba anônima antiga,
// armazenamento bloqueado), cai sozinho para localStorage com o mesmo contrato.

const NOME_BANCO = 'gymbro';
const ESTANTE = 'dados';
const VERSAO_BANCO = 1;
const PREFIXO_LOCAL = 'gymbro:';

let driver = null;

/** O que o Lucca lê quando o aparelho recusa a gravação.
 *
 *  O navegador explica esse tipo de falha em inglês e em nome de tecnologia
 *  ("QuotaExceededError", "TransactionInactiveError"). Esse texto chega à tela
 *  por um `avisar(...)` e não pode chegar: nenhuma tela do app fala assim. Aqui
 *  a falha vira uma frase em português, e o motivo cru fica só no console, para
 *  quem for consertar. */
function falhaDoAparelho(frase, motivo) {
  if (motivo) console.warn('GYMBRO:', frase, motivo);
  return new Error(frase);
}

const NAO_LI = 'não consegui ler o que está guardado neste celular';
const NAO_GRAVEI = 'não consegui guardar neste celular. Pode ser falta de espaço';

function driverIndexedDB(db) {
  function lerTudo() {
    return new Promise((ok, erro) => {
      const tx = db.transaction(ESTANTE, 'readonly');
      const documentos = {};
      const req = tx.objectStore(ESTANTE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          documentos[cursor.key] = cursor.value;
          cursor.continue();
        }
      };
      tx.oncomplete = () => ok(documentos);
      tx.onerror = () => erro(falhaDoAparelho(NAO_LI, tx.error));
      tx.onabort = () => erro(falhaDoAparelho(NAO_LI, tx.error));
    });
  }

  function escrever(trabalho) {
    return new Promise((ok, erro) => {
      const tx = db.transaction(ESTANTE, 'readwrite');
      trabalho(tx.objectStore(ESTANTE));
      tx.oncomplete = () => ok();
      tx.onerror = () => erro(falhaDoAparelho(NAO_GRAVEI, tx.error));
      tx.onabort = () => erro(falhaDoAparelho(NAO_GRAVEI, tx.error));
    });
  }

  return {
    nome: 'IndexedDB',
    lerTudo,
    gravarVarios: (pares) =>
      escrever((loja) => pares.forEach(([chave, valor]) => loja.put(valor, chave))),
    apagarVarios: (chaves) =>
      escrever((loja) => chaves.forEach((chave) => loja.delete(chave))),
    limparTudo: () => escrever((loja) => loja.clear()),
    // Uma transação só: ou o aparelho fica inteiro com o conteúdo novo, ou
    // continua inteiro com o velho. Ver a explicação em `substituirTudo`.
    substituirTudo: (pares) => escrever((loja) => {
      loja.clear();
      pares.forEach(([chave, valor]) => loja.put(valor, chave));
    }),
  };
}

function driverLocalStorage() {
  const chaves = () =>
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO_LOCAL));

  return {
    nome: 'localStorage',
    async lerTudo() {
      const documentos = {};
      for (const bruta of chaves()) {
        try {
          documentos[bruta.slice(PREFIXO_LOCAL.length)] = JSON.parse(localStorage.getItem(bruta));
        } catch {
          // documento ilegível é ignorado na leitura, mas não é apagado:
          // apagar em silêncio é exatamente como se perde histórico.
        }
      }
      return documentos;
    },
    async gravarVarios(pares) {
      for (const [chave, valor] of pares) {
        try {
          localStorage.setItem(PREFIXO_LOCAL + chave, JSON.stringify(valor));
        } catch (motivo) {
          throw falhaDoAparelho(NAO_GRAVEI, motivo);
        }
      }
    },
    async apagarVarios(listaDeChaves) {
      for (const chave of listaDeChaves) localStorage.removeItem(PREFIXO_LOCAL + chave);
    },
    async limparTudo() {
      for (const bruta of chaves()) localStorage.removeItem(bruta);
    },
    async substituirTudo(pares) {
      // Aqui não existe transação, então a ordem é a proteção: grava tudo
      // primeiro e só depois tira o que sobrou do conteúdo antigo.
      // Interrompido no meio, o aparelho fica com os dois conjuntos
      // misturados — o app se recupera disso. Vazio ele não se recupera.
      const novas = new Set(pares.map(([chave]) => PREFIXO_LOCAL + chave));
      try {
        for (const [chave, valor] of pares) {
          localStorage.setItem(PREFIXO_LOCAL + chave, JSON.stringify(valor));
        }
      } catch (motivo) {
        throw falhaDoAparelho(NAO_GRAVEI, motivo);
      }
      for (const bruta of chaves()) if (!novas.has(bruta)) localStorage.removeItem(bruta);
    },
  };
}

function abrirIndexedDB() {
  return new Promise((ok, erro) => {
    if (typeof indexedDB === 'undefined') {
      erro(new Error('este navegador não tem o jeito principal de guardar'));
      return;
    }
    const req = indexedDB.open(NOME_BANCO, VERSAO_BANCO);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(ESTANTE)) {
        req.result.createObjectStore(ESTANTE);
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
    req.onblocked = () => erro(new Error('banco bloqueado por outra aba'));
  });
}

export async function abrir() {
  if (driver) return driver;
  try {
    driver = driverIndexedDB(await abrirIndexedDB());
  } catch {
    driver = driverLocalStorage();
  }
  return driver;
}

/** Pede ao navegador para não jogar os dados fora quando o aparelho ficar sem
 *  espaço. Se ele recusar, o app continua funcionando: é só uma proteção extra. */
export async function pedirParaNaoApagar() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* navegador sem suporte */
  }
  return false;
}

export const lerTudo = () => abrir().then((d) => d.lerTudo());
export const gravarVarios = (pares) => abrir().then((d) => d.gravarVarios(pares));
export const apagarVarios = (chaves) => abrir().then((d) => d.apagarVarios(chaves));
export const limparTudo = () => abrir().then((d) => d.limparTudo());

/** Troca o conteúdo inteiro do aparelho de uma vez.
 *
 *  Existe porque `limparTudo` seguido de `gravarVarios` tem um instante em que
 *  o aparelho está vazio. O app fechado nesse instante — e no celular ele é
 *  fechado o tempo todo — deixaria o Lucca sem nenhum treino registrado, com o
 *  app semeando de fábrica na abertura seguinte como se nunca tivesse havido
 *  nada. Histórico é sagrado (regra 3 do CONTEXTO), e uma janela de meio
 *  segundo continua sendo uma janela. */
export const substituirTudo = (pares) => abrir().then((d) => d.substituirTudo(pares));
export const nomeDoArmazenamento = () => (driver ? driver.nome : 'ainda não aberto');
