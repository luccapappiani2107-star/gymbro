// Ferramentas pequenas usadas em todo lugar.

const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Identificador estável de um registro. O prefixo só serve para dar uma pista
 *  de que tipo de registro é quando se olha o dado exportado. */
export function novoId(prefixo) {
  if (globalThis.crypto?.randomUUID) return `${prefixo}_${crypto.randomUUID().slice(0, 12)}`;

  let sorteio = '';
  for (let i = 0; i < 12; i += 1) {
    sorteio += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return `${prefixo}_${sorteio}`;
}

/** Data de hoje no fuso do aparelho, como 2026-09-04. */
export function hojeISO(quando = new Date()) {
  const doisDigitos = (n) => String(n).padStart(2, '0');
  return `${quando.getFullYear()}-${doisDigitos(quando.getMonth() + 1)}-${doisDigitos(quando.getDate())}`;
}

export function agoraISO() {
  return new Date().toISOString();
}

/** Cópia funda. Existe para que nenhuma tela consiga alterar por acidente o que
 *  está guardado na memória do módulo de dados. */
export function clonar(valor) {
  if (valor === undefined || valor === null) return valor;
  if (globalThis.structuredClone) return structuredClone(valor);
  return JSON.parse(JSON.stringify(valor));
}

/** Lê um número que o Lucca digitou. Aceita vírgula: "42,5" é 42.5.
 *  Devolve null quando não dá para ler um número — campo em branco nunca vira
 *  zero, porque zero é um valor de treino e branco é "não fiz". */
export function paraNumero(texto) {
  if (texto === null || texto === undefined) return null;
  const limpo = String(texto).trim().replace(',', '.');
  if (limpo === '') return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

/** Igual a paraNumero, mas sem casa decimal. Para reps e RIR. */
export function paraInteiro(texto) {
  const numero = paraNumero(texto);
  return numero === null ? null : Math.trunc(numero);
}
