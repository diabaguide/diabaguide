import { EAN13_MODULES, clientBarcode, ean13Modules } from './barcode';
import { cardFileNameFor, clientNoLabel, phoneLine } from './carteData';

/**
 * Carte d'expédition (« shipping mark ») : le modèle fourni par Diaba (public/
 * carte-expedition-modele.webp, 1040 × 1512 px) sert de fond, et seules les valeurs
 * variables sont écrites dans ses cases vides. Tout le reste (bandeau, titres,
 * libellés, icônes, adresse et horaires de l'entrepôt de Foshan) est dans l'image.
 *
 * Aucune dépendance : dessin sur un canvas, export en PNG pour le partage
 * (WhatsApp, WeChat…) ou l'impression.
 */

/** Modèle de la carte (image vierge). */
export const CARD_TEMPLATE_URL = '/carte-expedition-modele.webp';
export const CARD_W = 1040;
export const CARD_H = 1512;

/** Emplacements des cases à remplir, en pixels du modèle (mesurés sur l'image). */
const ZONE = {
  nom:        { x: 401, y: 395,  w: 607, h: 112 },
  tel:        { x: 402, y: 524,  w: 607, h: 111 },
  entree:     { x: 402, y: 651,  w: 607, h: 110 },
  codeBarres: { x: 32,  y: 1019, w: 533, h: 187 },
  telEntrepot: { x: 581, y: 1020, w: 429, h: 186 },
  bureau:     { x: 147, w: 413, baseline: 1478 },
} as const;

const SANS = "'Plus Jakarta Sans Variable','Noto Sans SC','PingFang SC','Microsoft YaHei',system-ui,sans-serif";
const INK = '#0A0A0A';
const NAVY = '#0B2A6B';

export interface ShippingCardData {
  /** Nom du client, tel qu'imprimé (en capitales). */
  customerName: string;
  /** Téléphone du client (format de son profil). */
  customerPhone: string | null;
  /** Nom court (« BTC »). */
  entryName: string;
  /** Numéro de client (« (0022) », code-barres). */
  clientNo: number;
  warehouse: {
    /** Téléphone de réception de l'entrepôt. */
    tel: string | null;
    /** Contact du bureau (« Arkim ») et son numéro. */
    bureauNom: string | null;
    bureauTel: string | null;
  } | null;
}

type Ctx = CanvasRenderingContext2D;
type SpacedCtx = Ctx & { letterSpacing: string };
const spacing = (ctx: Ctx, px: number) => { if ('letterSpacing' in ctx) (ctx as SpacedCtx).letterSpacing = `${px}px`; };

/** Plus grande taille (≤ `size`, ≥ `min`) pour laquelle le texte tient dans `maxW`. */
function fitSize(ctx: Ctx, text: string, maxW: number, size: number, min: number, weight: number): number {
  for (let s = size; s > min; s -= 2) {
    ctx.font = `${weight} ${s}px ${SANS}`;
    if (ctx.measureText(text).width <= maxW) return s;
  }
  return min;
}

async function loadTemplate(): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = CARD_TEMPLATE_URL;
  try { await img.decode(); } catch { throw new Error('Le modèle de la carte est introuvable.'); }
  if (img.naturalWidth !== CARD_W || img.naturalHeight !== CARD_H) {
    throw new Error(`Le modèle de la carte n'a pas la taille attendue (${CARD_W} × ${CARD_H}).`);
  }
  return img;
}

/** Dessine le code-barres EAN-13 du client dans sa case, avec les chiffres en dessous. */
function drawBarcode(ctx: Ctx, clientNo: number) {
  const z = ZONE.codeBarres;
  const code = clientBarcode(clientNo);
  const modules = ean13Modules(code);
  const m = 4.6;                                   // largeur d'un module, en pixels
  const total = EAN13_MODULES * m;
  const x0 = z.x + (z.w - total) / 2;
  const top = z.y + 24;
  const height = 106;
  ctx.fillStyle = INK;
  // Les modules noirs consécutifs sont fusionnés en une seule barre (bords nets, sans fente).
  for (let i = 0; i < modules.length;) {
    if (!modules[i]) { i++; continue; }
    let j = i;
    while (j < modules.length && modules[j]) j++;
    ctx.fillRect(x0 + i * m, top, (j - i) * m, height);
    i = j;
  }
  // Chiffres lisibles, répartis régulièrement sous les barres.
  ctx.font = `700 34px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const baseline = top + height + 44;
  const first = x0 + 12;
  const step = (total - 24) / 12;
  [...code].forEach((d, i) => ctx.fillText(d, first + i * step, baseline));
}

export async function renderShippingCard(d: ShippingCardData): Promise<Blob> {
  // Les polices web doivent être prêtes, sinon le texte serait dessiné avec une police de secours.
  try {
    await Promise.all([`800 60px 'Plus Jakarta Sans Variable'`, `700 34px 'Plus Jakarta Sans Variable'`]
      .map((f) => document.fonts.load(f, `${d.customerName}${d.customerPhone ?? ''}${d.entryName}0123456789()/+ `)));
  } catch { /* on continue avec les polices disponibles */ }

  const tpl = await loadTemplate();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponible');
  ctx.drawImage(tpl, 0, 0);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;

  const PAD = 34;

  // 1) Nom du client : à gauche, en capitales, réduit pour tenir sur une ligne.
  {
    const z = ZONE.nom;
    const text = d.customerName.trim().toUpperCase();
    const size = fitSize(ctx, text, z.w - PAD * 2, 82, 34, 900);
    ctx.font = `900 ${size}px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText(text, z.x + PAD, z.y + z.h / 2 + size * 0.36);
  }

  // 2) Téléphone / (numéro client) : le « (0022) » est un peu plus petit, sur la même ligne.
  {
    const z = ZONE.tel;
    const full = phoneLine(d.customerPhone, d.clientNo);
    const noTxt = `(${clientNoLabel(d.clientNo)})`;
    const telTxt = full.slice(0, full.length - noTxt.length);   // « 774115164 / » ou ''
    const maxW = z.w - PAD * 2;
    let size = 82;
    const width = (s: number) => {
      ctx.font = `900 ${s}px ${SANS}`; const a = ctx.measureText(telTxt).width;
      ctx.font = `900 ${Math.round(s * 0.84)}px ${SANS}`; return a + ctx.measureText(noTxt).width;
    };
    while (size > 34 && width(size) > maxW) size -= 2;
    const y = z.y + z.h / 2 + size * 0.36;
    ctx.textAlign = 'left';
    ctx.font = `900 ${size}px ${SANS}`;
    ctx.fillText(telTxt, z.x + PAD, y);
    const x = z.x + PAD + ctx.measureText(telTxt).width;
    ctx.font = `900 ${Math.round(size * 0.84)}px ${SANS}`;
    ctx.fillText(noTxt, x, y);
  }

  // 3) Nom court (« BTC ») : centré, en très gros.
  {
    const z = ZONE.entree;
    const text = d.entryName.trim().toUpperCase();
    spacing(ctx, 4);
    const size = fitSize(ctx, text, z.w - PAD * 2, 104, 40, 900);
    ctx.font = `900 ${size}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, z.x + z.w / 2 + 2, z.y + z.h / 2 + size * 0.36);
    spacing(ctx, 0);
  }

  // 4) Code-barres du numéro client.
  drawBarcode(ctx, d.clientNo);

  // 5) Téléphone de l'entrepôt (sous son libellé).
  const w = d.warehouse;
  if (w?.tel?.trim()) {
    const z = ZONE.telEntrepot;
    const text = w.tel.trim();
    const size = fitSize(ctx, text, z.w - 48, 62, 28, 900);
    ctx.font = `900 ${size}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = NAVY;
    ctx.fillText(text, z.x + z.w / 2 + 14, z.y + z.h - 26);
  }

  // 6) Contact du bureau (« Arkim 15711885660 »), sous le libellé « Office ».
  const bureau = [w?.bureauNom, w?.bureauTel].map((s) => s?.trim()).filter(Boolean).join(' ');
  if (bureau) {
    const z = ZONE.bureau;
    const size = fitSize(ctx, bureau, z.w, 40, 24, 800);
    ctx.font = `800 ${size}px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = NAVY;
    ctx.fillText(bureau, z.x, z.baseline);
  }

  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('export PNG impossible'))), 'image/png'));
}

/* ---------- Export : partage, téléchargement, impression ---------- */

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

export const shippingCardFileName = (d: Pick<ShippingCardData, 'entryName' | 'clientNo'>) => cardFileNameFor(d.entryName, d.clientNo);

/** Feuille de partage du téléphone : WhatsApp et WeChat y figurent s'ils sont installés. */
export async function shareShippingCard(blob: Blob, d: ShippingCardData): Promise<ShareResult> {
  const file = new File([blob], shippingCardFileName(d), { type: 'image/png' });
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], title: `DIABA CARGO · ${d.entryName}`, text: `${d.customerName} · ${phoneLine(d.customerPhone, d.clientNo)}` });
    return 'shared';
  } catch (e) {
    return (e as DOMException).name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export function downloadShippingCard(blob: Blob, d: Pick<ShippingCardData, 'entryName' | 'clientNo'>) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = shippingCardFileName(d);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ouvre la boîte d'impression du navigateur avec la carte seule, en pleine page. */
export function printShippingCard(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); URL.revokeObjectURL(url); throw new Error('impression impossible'); }
  doc.open();
  doc.write(`<!doctype html><title>Carte d'expédition</title><style>@page{margin:8mm}html,body{margin:0}img{display:block;width:100%;max-height:100vh;object-fit:contain}</style><img src="${url}">`);
  doc.close();
  const clean = () => { setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 1000); };
  const img = doc.querySelector('img');
  const go = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); clean(); };
  if (img?.complete) go(); else img?.addEventListener('load', go, { once: true });
}
