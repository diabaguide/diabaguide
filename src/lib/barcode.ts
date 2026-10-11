/**
 * Code-barres EAN-13, sans dépendance : calcul du numéro à partir du numéro de
 * client, clé de contrôle, et motif de barres à dessiner.
 *
 * Numéro de client n → `200` + n sur 9 chiffres + clé de contrôle. Le préfixe 200
 * appartient à la plage EAN réservée à l'usage interne (aucun risque de collision
 * avec un produit du commerce). Pour n = 0, on obtient 2000000000008, comme sur la
 * carte d'expédition de référence.
 */

/** Largeur d'un code EAN-13, en modules (bandes silencieuses non comprises). */
export const EAN13_MODULES = 95;

/** Plus grand numéro de client représentable (9 chiffres). */
export const MAX_CLIENT_NO = 999_999_999;

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
/** Parité (L ou G) des 6 chiffres de gauche, selon le premier chiffre du code. */
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Clé de contrôle EAN-13 des 12 premiers chiffres. */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('Il faut exactement 12 chiffres.');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** Code EAN-13 (13 chiffres) d'un numéro de client. */
export function clientBarcode(clientNo: number): string {
  if (!Number.isInteger(clientNo) || clientNo < 0 || clientNo > MAX_CLIENT_NO) {
    throw new Error(`Numéro de client invalide : ${clientNo}`);
  }
  const first12 = `200${String(clientNo).padStart(9, '0')}`;
  return `${first12}${ean13CheckDigit(first12)}`;
}

/** Le code à 13 chiffres est-il un EAN-13 valide (clé de contrôle comprise) ? */
export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** Motif des 95 modules d'un EAN-13 : true = barre noire, false = espace. */
export function ean13Modules(code: string): boolean[] {
  if (!isValidEan13(code)) throw new Error(`EAN-13 invalide : ${code}`);
  const digits = [...code].map(Number);
  const parity = PARITY[digits[0]];
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += (parity[i] === 'L' ? L : G)[digits[1 + i]];
  bits += '01010';
  for (let i = 0; i < 6; i++) bits += R[digits[7 + i]];
  bits += '101';
  return [...bits].map((b) => b === '1');
}
