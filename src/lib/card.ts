import { catLabel, cityName, type Provider } from '../data';

/* Carte de visite du prestataire, dessinée sur un canvas (aucune dépendance) :
   image PNG à partager (WhatsApp, WeChat…) ou à montrer au chauffeur. */

const W = 1080;
const H = 1350;
const PAD = 72;
const FONT = "'Noto Sans SC','PingFang SC','Microsoft YaHei',Figtree,system-ui,sans-serif";
const NAVY = '#153E9F';
const GOLD = '#E6BC4B';
const SOFT = '#DCE6FA';

type Ctx = CanvasRenderingContext2D;

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

/* Écrit un bloc de texte en réduisant la taille jusqu'à tenir dans maxLines ; renvoie le y suivant. */
function block(ctx: Ctx, text: string, y: number, o: { size: number; min: number; weight: number; color: string; maxLines: number; gap?: number }): number {
  const maxW = W - PAD * 2;
  let size = o.size;
  let lines: string[] = [];
  for (;;) {
    ctx.font = `${o.weight} ${size}px ${FONT}`;
    lines = wrap(ctx, text, maxW);
    if (lines.length <= o.maxLines || size <= o.min) break;
    size -= 2;
  }
  ctx.fillStyle = o.color;
  const lh = size * 1.3;
  for (const l of lines.slice(0, o.maxLines)) { y += lh; ctx.fillText(l, PAD, y - size * 0.25); }
  return y + (o.gap ?? 0);
}

function label(ctx: Ctx, text: string, y: number): number {
  ctx.font = `700 26px ${FONT}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(text, PAD, y + 26);
  return y + 26 + 10;
}

function rule(ctx: Ctx, y: number): number {
  ctx.fillStyle = GOLD;
  ctx.fillRect(PAD, y, 96, 4);
  return y + 4;
}

export async function renderCard(p: Provider): Promise<Blob> {
  // Les polices web doivent être prêtes, sinon le chinois est dessiné avec une police de secours.
  try {
    await Promise.all([`700 40px 'Noto Sans SC'`, `500 40px 'Noto Sans SC'`, `700 26px Figtree`].map((f) => document.fonts.load(f, p.cn + p.addrCn)));
  } catch { /* on continue avec les polices disponibles */ }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponible');
  ctx.textBaseline = 'alphabetic';

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#123794');
  bg.addColorStop(1, NAVY);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // En-tête
  ctx.font = `700 30px ${FONT}`;
  ctx.fillStyle = GOLD;
  ctx.fillText('DIABA GUIDE', PAD, PAD + 30);
  ctx.font = `500 26px ${FONT}`;
  ctx.fillStyle = SOFT;
  const tag = `${catLabel(p.cat)} · ${cityName(p.city)}`;
  ctx.fillText(tag, W - PAD - ctx.measureText(tag).width, PAD + 30);

  // Nom et adresse en chinois : ce que lit le chauffeur
  let y = PAD + 30 + 56;
  y = label(ctx, '名称 · NOM', y);
  y = block(ctx, p.cn, y, { size: 84, min: 44, weight: 700, color: '#fff', maxLines: 2, gap: 34 });
  y = rule(ctx, y) + 34;
  y = label(ctx, '地址 · ADRESSE', y);
  y = block(ctx, p.addrCn, y, { size: 58, min: 36, weight: 500, color: '#fff', maxLines: 4, gap: 30 });

  // Repères en français
  block(ctx, `${p.name} · ${p.addrFr.split('(')[0].trim()}`, y, { size: 32, min: 24, weight: 500, color: SOFT, maxLines: 3 });

  // Contacts, calés en bas au-dessus du bandeau
  const contacts: [string, string][] = [];
  if (p.tel) contacts.push(['电话 · TÉL.', p.tel]);
  if (p.wechat) contacts.push(['微信 · WECHAT', p.wechat]);
  let cy = H - 200 - contacts.length * 112;
  for (const [k, v] of contacts) {
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = GOLD;
    ctx.fillText(k, PAD, cy + 24);
    ctx.font = `700 44px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(v, PAD, cy + 24 + 48);
    cy += 112;
  }

  // Bandeau final
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, H - 150, W, 150);
  ctx.fillStyle = NAVY;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText('请带我到这个地址，谢谢！', PAD, H - 150 + 64);
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText('Montrez cette carte au chauffeur · diabaguide', PAD, H - 150 + 110);

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
