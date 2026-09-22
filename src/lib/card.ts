import { catLabel, cityName, type Provider } from '../data';

/* Carte de visite du prestataire, dessinée sur un canvas (aucune dépendance) :
   image PNG à partager (WhatsApp, WeChat…) ou à montrer au chauffeur.
   Direction : titre de transport / bordereau. Bandeau indigo à treillis,
   papier ivoire pour l'adresse (lisibilité maximale), cachet vermillon. */

const W = 1080;
const H = 1350;
const PAD = 72;
const BAND = 150;   // hauteur du bandeau vermillon final
const SANS = "'Plus Jakarta Sans Variable','Noto Sans SC','PingFang SC','Microsoft YaHei',system-ui,sans-serif";
const SERIF = "'Playfair Display','Noto Serif SC','Songti SC',Georgia,serif";
const INDIGO = '#151C4A';
const INDIGO_2 = '#243073';
const PAPER = '#F3ECDD';
const INK = '#14163A';
const MUTED = '#5A5C78';
const SEAL = '#D2381F';
const GOLD = '#E6BC4B';
const IVORY = '#FBF3E2';

type Ctx = CanvasRenderingContext2D;
type SpacedCtx = Ctx & { letterSpacing: string };

function spacing(ctx: Ctx, px: number) {
  if ('letterSpacing' in ctx) (ctx as SpacedCtx).letterSpacing = `${px}px`;
}

/* Générateur pseudo-aléatoire déterministe : la carte est identique à chaque rendu. */
function rng(seed: string) {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353) << 13 | h >>> 19;
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Découpe en lignes : un caractère à la fois pour le chinois, un mot à la fois sinon. */
function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const tokens = text.match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+\s*/g) ?? [];
  const lines: string[] = [];
  let cur = '';
  for (const t of tokens) {
    if (cur && ctx.measureText((cur + t).trimEnd()).width > maxW) { lines.push(cur.trimEnd()); cur = t; }
    else cur += t;
  }
  if (cur) lines.push(cur.trimEnd());
  return lines;
}

interface BlockOpts {
  size: number; min: number; weight: number; color: string; maxLines: number;
  gap?: number; family?: string; maxW?: number; lh?: number;
  oneMin?: number;  // vise une seule ligne, en réduisant la taille jusqu'à oneMin
  dry?: boolean;    // mesure sans dessiner
}

/* Écrit un bloc de texte ; renvoie le y suivant. Vise une seule ligne (jusqu'à oneMin),
   sinon réduit la taille jusqu'à tenir dans maxLines, puis équilibre les lignes (pas d'orphelin). */
function block(ctx: Ctx, text: string, y: number, o: BlockOpts): number {
  const maxW = o.maxW ?? W - PAD * 2;
  const fontAt = (size: number) => `${o.weight} ${size}px ${o.family ?? SANS}`;
  let size = o.size;
  let lines: string[] = [];
  if (o.oneMin) {
    for (let s = o.size; s >= o.oneMin; s -= 2) {
      ctx.font = fontAt(s);
      if (ctx.measureText(text).width <= maxW) { size = s; lines = [text]; break; }
    }
  }
  if (!lines.length) {
    for (;;) {
      ctx.font = fontAt(size);
      lines = wrap(ctx, text, maxW);
      if (lines.length <= o.maxLines || size <= o.min) break;
      size -= 2;
    }
    if (lines.length > 1) {
      const n = lines.length;
      let lo = maxW * 0.5;
      let hi = maxW;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (wrap(ctx, text, mid).length === n) hi = mid; else lo = mid;
      }
      lines = wrap(ctx, text, hi);
    }
  }
  const shown = lines.slice(0, o.maxLines);
  const lh = size * (o.lh ?? 1.25);
  if (o.dry) return y + lh * shown.length + (o.gap ?? 0);
  ctx.fillStyle = o.color;
  for (const l of shown) { y += lh; ctx.fillText(l, PAD, y - size * 0.22); }
  return y + (o.gap ?? 0);
}

function label(ctx: Ctx, text: string, y: number, color: string): number {
  ctx.font = `700 30px ${SANS}`;
  ctx.fillStyle = color;
  spacing(ctx, 4);
  ctx.fillText(text, PAD, y + 30);
  spacing(ctx, 0);
  return y + 30 + 16;
}

/* Treillis façon boîte de bois chinoise / bogolan : losanges et points. */
function lattice(ctx: Ctx, head: number) {
  const s = 60;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, head);
  ctx.clip();
  ctx.strokeStyle = 'rgba(230,188,75,.20)';
  ctx.fillStyle = 'rgba(230,188,75,.30)';
  ctx.lineWidth = 2;
  for (let y = 0; y < head + s; y += s) {
    for (let x = 0; x < W + s; x += s) {
      const cx = x + s / 2;
      const cy = y + s / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 20); ctx.lineTo(cx + 20, cy); ctx.lineTo(cx, cy + 20); ctx.lineTo(cx - 20, cy); ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
  // le motif s'efface vers le bas et laisse la place au texte
  const fade = ctx.createLinearGradient(0, 120, 0, head);
  fade.addColorStop(0, 'rgba(21,28,74,0)');
  fade.addColorStop(0.75, 'rgba(21,28,74,.96)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, head);
  ctx.restore();
}

/* Cachet rouge : caractères en réserve, double filet, grain d'encre. */
function seal(ctx: Ctx, cx: number, cy: number, size: number, rand: () => number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);
  const r = size / 2;
  ctx.beginPath();
  ctx.roundRect(-r, -r, size, size, 10);
  ctx.fillStyle = SEAL;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = IVORY;
  ctx.lineWidth = 4;
  ctx.strokeRect(-r + 12, -r + 12, size - 24, size - 24);
  ctx.fillStyle = IVORY;
  ctx.font = `700 ${size * 0.34}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('指', -size * 0.18, -size * 0.02);
  ctx.fillText('南', size * 0.18, size * 0.02);
  ctx.font = `700 ${size * 0.1}px ${SANS}`;
  ctx.fillText('DIABA', 0, size * 0.32);
  // usure de l'encre
  ctx.fillStyle = 'rgba(243,236,221,.55)';
  for (let i = 0; i < 260; i++) {
    const a = rand() * 2.2 + 0.4;
    ctx.fillRect((rand() - 0.5) * size, (rand() - 0.5) * size, a, a);
  }
  ctx.restore();
}

const NAME: BlockOpts = { size: 100, min: 52, weight: 800, color: IVORY, maxLines: 2, gap: 20, lh: 1.18, oneMin: 76 };
const NAME_FR: BlockOpts = { size: 48, min: 30, weight: 400, color: 'rgba(251,243,226,.9)', maxLines: 2, family: SERIF, lh: 1.2 };
const NAME_TOP = 150 + 30 + 16;

export async function renderCard(p: Provider): Promise<Blob> {
  // Les polices web doivent être prêtes, sinon le chinois est dessiné avec une police de secours.
  try {
    await Promise.all([
      `700 40px 'Plus Jakarta Sans Variable'`, `500 40px 'Plus Jakarta Sans Variable'`, `400 40px 'Playfair Display'`,
      `700 40px 'Noto Sans SC'`, `500 40px 'Noto Sans SC'`,
    ].map((f) => document.fonts.load(f, p.cn + p.addrCn + '指南名称地址电话微信请带我到这个谢DIABA')));
  } catch { /* on continue avec les polices disponibles */ }

  const rand = rng(p.id);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponible');
  ctx.textBaseline = 'alphabetic';

  // Hauteur du bandeau indigo : suit la longueur du nom (mesure à blanc).
  const dry = { ...NAME, dry: true };
  const head = Math.round(block(ctx, p.name, block(ctx, p.cn, NAME_TOP, dry) + 6, { ...NAME_FR, dry: true }) + 64);

  // Papier + grain
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(20,22,58,.045)' : 'rgba(210,56,31,.04)';
    const a = rand() * 2.4 + 0.6;
    ctx.fillRect(rand() * W, head + rand() * (H - head), a, a);
  }

  // Bandeau indigo
  const bg = ctx.createLinearGradient(0, 0, W, head);
  bg.addColorStop(0, INDIGO);
  bg.addColorStop(1, INDIGO_2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, head);
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, 520);
  glow.addColorStop(0, 'rgba(210,56,31,.55)');
  glow.addColorStop(1, 'rgba(210,56,31,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, head);
  lattice(ctx, head);

  // En-tête
  ctx.font = `700 28px ${SANS}`;
  ctx.fillStyle = GOLD;
  spacing(ctx, 6);
  ctx.fillText('DIABA GUIDE', PAD, PAD + 28);
  spacing(ctx, 0);
  ctx.font = `500 28px ${SANS}`;
  ctx.fillStyle = 'rgba(251,243,226,.8)';
  const tag = `${catLabel(p.cat)} · ${cityName(p.city)}`;
  ctx.fillText(tag, W - PAD - ctx.measureText(tag).width, PAD + 28);

  // Nom en chinois : ce que lit le chauffeur, puis nom en français
  let y = label(ctx, '名称 · NOM', 150, GOLD);
  y = block(ctx, p.cn, y, NAME);
  block(ctx, p.name, y + 6, NAME_FR);

  // Perforation
  ctx.save();
  ctx.setLineDash([14, 12]);
  ctx.strokeStyle = 'rgba(20,22,58,.28)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(PAD, head + 34);
  ctx.lineTo(W - PAD, head + 34);
  ctx.stroke();
  ctx.restore();

  // Adresse sur papier : contraste maximal
  y = label(ctx, '地址 · ADRESSE', head + 76, SEAL);
  y = block(ctx, p.addrCn, y, { size: 66, min: 40, weight: 600, color: INK, maxLines: 4, gap: 22 });
  block(ctx, p.addrFr.split('(')[0].trim(), y, { size: 36, min: 26, weight: 500, color: MUTED, maxLines: 3 });

  // Contacts, calés au-dessus du bandeau final
  const contacts: [string, string][] = [];
  if (p.tel) contacts.push(['电话 · TÉL.', p.tel]);
  if (p.wechat) contacts.push(['微信 · WECHAT', p.wechat]);
  let cy = H - BAND - 44 - contacts.length * 118;
  for (const [k, v] of contacts) {
    ctx.font = `700 26px ${SANS}`;
    ctx.fillStyle = SEAL;
    spacing(ctx, 3);
    ctx.fillText(k, PAD, cy + 26);
    spacing(ctx, 0);
    ctx.font = `700 52px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.fillText(v, PAD, cy + 26 + 58);
    cy += 118;
  }

  // Bandeau final
  ctx.fillStyle = SEAL;
  ctx.fillRect(0, H - BAND, W, BAND);
  ctx.fillStyle = IVORY;
  ctx.font = `800 46px ${SANS}`;
  ctx.fillText('请带我到这个地址，谢谢！', PAD, H - BAND + 68);
  ctx.font = `500 28px ${SANS}`;
  ctx.fillStyle = 'rgba(251,243,226,.88)';
  ctx.fillText('Montrez cette carte au chauffeur · Diaba Guide', PAD, H - BAND + 112);

  // Cachet, posé par-dessus le filet du bandeau final
  seal(ctx, W - PAD - 92, H - BAND - 6, 184, rand);

  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('export PNG impossible'))), 'image/png'));
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

export function cardFileName(p: Provider) {
  return `diaba-guide-${p.id}.png`;
}

/* Feuille de partage du téléphone : WhatsApp et WeChat y figurent s'ils sont installés. */
export async function shareCard(blob: Blob, p: Provider): Promise<ShareResult> {
  const file = new File([blob], cardFileName(p), { type: 'image/png' });
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], title: p.name, text: `${p.name} · ${p.cn}\n${p.addrCn}` });
    return 'shared';
  } catch (e) {
    return (e as DOMException).name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export function downloadCard(blob: Blob, p: Provider) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cardFileName(p);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
