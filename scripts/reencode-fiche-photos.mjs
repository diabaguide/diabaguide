#!/usr/bin/env node
/**
 * Réencodage des photos DÉJÀ enregistrées des fiches (bucket `fiche-photos`).
 *
 * Pourquoi : les photos téléversées avant l'optimisation pèsent ~200 Ko (parfois
 * 300 Ko en JPEG) pour une vignette de 76 px. Ce script les réduit (1280 px au
 * plus) et les réencode en WebP (ou AVIF) pour alléger les pages.
 *
 * ── Sécurité ────────────────────────────────────────────────────────────────
 *  • Par défaut c'est un ESSAI À BLANC : il télécharge, calcule le gain et
 *    affiche un tableau, sans RIEN écrire. Il faut `--apply` pour agir.
 *  • Les photos d'origine sont CONSERVÉES (sauf `--delete-old`). On envoie de
 *    NOUVEAUX fichiers, puis on remplace les chemins dans `providers.photo_paths`.
 *  • Le remplacement ne s'applique que si la fiche n'a pas changé entre-temps
 *    (si quelqu'un l'a modifiée, elle est ignorée et ses nouveaux fichiers
 *    sont supprimés).
 *  • Un journal `outputs/reencode-fiche-photos-<date>.json` garde l'ancien et le
 *    nouveau chemin de chaque fiche : `--rollback=<journal>` remet les anciens.
 *  • Seules les photos du bucket `fiche-photos` sont traitées ; les URL http
 *    (photos de démonstration) et les photos déjà légères sont laissées.
 *
 * ── Utilisation ─────────────────────────────────────────────────────────────
 *  1. Installer sharp, sans toucher au package.json :
 *       npm install --no-save sharp
 *  2. Donner la clé de service (Supabase → Settings → API → service_role).
 *     NE JAMAIS la mettre dans un fichier du dépôt ni dans le navigateur :
 *       PowerShell :  $env:SUPABASE_SERVICE_ROLE_KEY = "…"
 *       Git Bash   :  export SUPABASE_SERVICE_ROLE_KEY="…"
 *     L'URL du projet est lue dans SUPABASE_URL ou VITE_SUPABASE_URL (.env).
 *  3. Essai à blanc, puis application :
 *       node scripts/reencode-fiche-photos.mjs
 *       node scripts/reencode-fiche-photos.mjs --apply
 *
 * Options : --format=webp|avif (AVIF : lancer d'abord supabase/490_photos_avif.sql)
 *           --max-side=1280  --quality=72 (webp) / 50 (avif)  --min-gain=0.2
 *           --limit=N  --only=<id de fiche>  --delete-old  --rollback=<journal>
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/* ───────────────────────── Réglages ───────────────────────── */

const BUCKET = 'fiche-photos';

function parseArgs(argv) {
  const o = { apply: false, format: 'webp', maxSide: 1280, quality: null, minGain: 0.2, limit: Infinity, only: null, deleteOld: false, rollback: null };
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'apply') o.apply = true;
    else if (k === 'delete-old') o.deleteOld = true;
    else if (k === 'format') o.format = v;
    else if (k === 'max-side') o.maxSide = Number(v);
    else if (k === 'quality') o.quality = Number(v);
    else if (k === 'min-gain') o.minGain = Number(v);
    else if (k === 'limit') o.limit = Number(v);
    else if (k === 'only') o.only = v;
    else if (k === 'rollback') o.rollback = v;
    else throw new Error(`Option inconnue : ${a}`);
  }
  if (!['webp', 'avif'].includes(o.format)) throw new Error('--format doit valoir webp ou avif.');
  if (!(o.maxSide >= 200)) throw new Error('--max-side doit être un nombre ≥ 200.');
  if (!(o.minGain >= 0 && o.minGain < 1)) throw new Error('--min-gain doit être entre 0 et 1.');
  if (o.quality === null) o.quality = o.format === 'avif' ? 50 : 72;
  return o;
}

/** URL du projet : SUPABASE_URL, sinon VITE_SUPABASE_URL (variable ou fichier .env). */
async function projectUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/$/, '');
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL.replace(/\/$/, '');
  for (const f of ['.env.local', '.env']) {
    try {
      const m = (await readFile(f, 'utf8')).match(/^\s*VITE_SUPABASE_URL\s*=\s*(\S+)/m);
      if (m) return m[1].replace(/^["']|["']$/g, '').replace(/\/$/, '');
    } catch { /* fichier absent */ }
  }
  throw new Error('URL du projet introuvable : définissez SUPABASE_URL.');
}

/* ───────────────────────── Accès Supabase ───────────────────────── */

function makeApi(base, key) {
  const auth = { apikey: key, Authorization: `Bearer ${key}` };
  const fail = async (what, r) => {
    let detail = '';
    try { detail = (await r.text()).slice(0, 300); } catch { /* corps illisible */ }
    throw new Error(`${what} : HTTP ${r.status} ${detail}`);
  };
  const enc = (path) => path.split('/').map(encodeURIComponent).join('/');
  return {
    /** Toutes les fiches avec leurs photos, par pages de 500. */
    async providers() {
      const out = [];
      for (let from = 0; ; from += 500) {
        const r = await fetch(`${base}/rest/v1/providers?select=id,name,photo_paths&order=id`, { headers: { ...auth, Range: `${from}-${from + 499}`, 'Range-Unit': 'items' } });
        if (!r.ok && r.status !== 206) await fail('Lecture des fiches', r);
        const page = await r.json();
        out.push(...page);
        if (page.length < 500) return out;
      }
    },
    async download(path) {
      const r = await fetch(`${base}/storage/v1/object/authenticated/${BUCKET}/${enc(path)}`, { headers: auth });
      if (!r.ok) await fail(`Téléchargement de ${path}`, r);
      return Buffer.from(await r.arrayBuffer());
    },
    async upload(path, buf, contentType) {
      const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${enc(path)}`, { method: 'POST', headers: { ...auth, 'Content-Type': contentType, 'x-upsert': 'false' }, body: buf });
      if (!r.ok) await fail(`Envoi de ${path}`, r);
    },
    async remove(paths) {
      if (!paths.length) return;
      const r = await fetch(`${base}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
      if (!r.ok) await fail('Suppression de fichiers', r);
    },
    /**
     * Remplace photo_paths seulement si la valeur actuelle est encore `expected`
     * (aucune modification entre-temps). Renvoie true si une ligne a été mise à jour.
     */
    async swapPaths(id, expected, next) {
      const filter = `photo_paths=eq.${encodeURIComponent(`{${expected.map((p) => `"${p}"`).join(',')}}`)}`;
      const r = await fetch(`${base}/rest/v1/providers?id=eq.${encodeURIComponent(id)}&${filter}`, {
        method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ photo_paths: next }),
      });
      if (!r.ok) await fail(`Mise à jour de la fiche ${id}`, r);
      return (await r.json()).length === 1;
    },
  };
}

/* ───────────────────────── Traitement d'image ───────────────────────── */

async function loadSharp() {
  try { return (await import('sharp')).default; } catch {
    throw new Error('Le module « sharp » est introuvable. Lancez d\'abord : npm install --no-save sharp');
  }
}

async function reencode(sharp, buf, { format, maxSide, quality }) {
  // rotate() applique l'orientation EXIF ; withoutEnlargement n'agrandit jamais.
  const pipe = sharp(buf, { failOn: 'none' }).rotate().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
  return format === 'avif' ? pipe.avif({ quality, effort: 4 }).toBuffer() : pipe.webp({ quality }).toBuffer();
}

const ko = (n) => `${Math.round(n / 1024)} Ko`;
const isStored = (p) => typeof p === 'string' && p !== '' && !/^https?:/i.test(p);

/* ───────────────────────── Retour arrière ───────────────────────── */

async function rollback(api, file) {
  const log = JSON.parse(await readFile(file, 'utf8'));
  let ok = 0, ignorees = 0;
  for (const e of log.fiches ?? []) {
    try {
      // On remet les anciens chemins seulement si la fiche porte encore les nouveaux.
      if (await api.swapPaths(e.id, e.nouveau, e.ancien)) { ok++; console.log(`  rétablie : ${e.id}`); }
      else { ignorees++; console.log(`  ignorée (modifiée depuis) : ${e.id}`); }
    } catch (err) { ignorees++; console.log(`  erreur ${e.id} : ${err.message}`); }
  }
  console.log(`\nRetour arrière : ${ok} fiche(s) rétablie(s), ${ignorees} ignorée(s).`);
  console.log('Les nouveaux fichiers restent dans le stockage (inoffensifs) ; les anciens sont réutilisés.');
}

/* ───────────────────────── Programme principal ───────────────────────── */

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante (voir l\'en-tête du script).');
  const base = await projectUrl();
  const host = new URL(base).host;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const api = makeApi(base, key);

  console.log(`Projet : ${host}`);
  if (opt.rollback) {
    console.log(`Mode : RETOUR ARRIÈRE depuis ${opt.rollback}`);
    return rollback(api, opt.rollback);
  }
  console.log(`Mode : ${opt.apply ? 'APPLICATION' : 'essai à blanc (rien n\'est écrit)'} · format ${opt.format} · ${opt.maxSide} px · qualité ${opt.quality} · gain minimal ${Math.round(opt.minGain * 100)} %${opt.deleteOld ? ' · SUPPRESSION des anciens fichiers' : ''}`);
  if (opt.apply && !local) {
    console.log('Application sur un projet distant : Ctrl+C dans les 5 secondes pour annuler…');
    await new Promise((r) => setTimeout(r, 5000));
  }

  const sharp = await loadSharp();
  let fiches = (await api.providers()).filter((f) => (f.photo_paths ?? []).some(isStored));
  if (opt.only) fiches = fiches.filter((f) => f.id === opt.only);
  console.log(`${fiches.length} fiche(s) avec photos enregistrées.\n`);

  const journal = [];
  const tot = { photos: 0, traitees: 0, avant: 0, apres: 0, ignorees: 0, erreurs: 0, conflits: 0 };
  let restantes = opt.limit;

  for (const f of fiches) {
    if (restantes <= 0) break;
    const ancien = [...f.photo_paths];
    const nouveau = [...ancien];
    const crees = [];
    const remplaces = [];
    for (let i = 0; i < ancien.length && restantes > 0; i++) {
      const p = ancien[i];
      if (!isStored(p)) continue;
      tot.photos++;
      try {
        const src = await api.download(p);
        const out = await reencode(sharp, src, opt);
        if (out.length > src.length * (1 - opt.minGain)) { tot.ignorees++; console.log(`  = ${f.id} · ${p} : ${ko(src.length)} → ${ko(out.length)} (gain insuffisant, laissée)`); continue; }
        const nouvPath = `${randomUUID()}.${opt.format}`;
        console.log(`  ${opt.apply ? '→' : '~'} ${f.id} · ${p} : ${ko(src.length)} → ${ko(out.length)} (−${Math.round((1 - out.length / src.length) * 100)} %)`);
        tot.avant += src.length; tot.apres += out.length; tot.traitees++; restantes--;
        if (opt.apply) {
          await api.upload(nouvPath, out, `image/${opt.format}`);
          crees.push(nouvPath);
          nouveau[i] = nouvPath;
          remplaces.push(p);
        }
      } catch (e) {
        tot.erreurs++;
        console.log(`  ! ${f.id} · ${p} : ${e.message}`);
      }
    }
    if (opt.apply && crees.length) {
      let appliquee = false;
      try { appliquee = await api.swapPaths(f.id, ancien, nouveau); } catch (e) { console.log(`  ! ${f.id} : ${e.message}`); }
      if (appliquee) {
        journal.push({ id: f.id, nom: f.name, ancien, nouveau });
        if (opt.deleteOld) { try { await api.remove(remplaces); } catch (e) { console.log(`  ! suppression des anciens (${f.id}) : ${e.message}`); } }
      } else {
        // Fiche modifiée entre-temps (ou erreur) : on retire les fichiers qu'on vient d'envoyer.
        tot.conflits++;
        console.log(`  ✗ ${f.id} : fiche modifiée entre-temps ou mise à jour refusée, ignorée (nouveaux fichiers retirés).`);
        try { await api.remove(crees); } catch { /* on ne peut rien de plus */ }
      }
    }
  }

  console.log('\n──────── Bilan ────────');
  console.log(`Photos examinées : ${tot.photos} · réencodées : ${tot.traitees} · laissées (gain insuffisant) : ${tot.ignorees} · erreurs : ${tot.erreurs}${opt.apply ? ` · fiches en conflit : ${tot.conflits}` : ''}`);
  if (tot.traitees) console.log(`Poids des photos réencodées : ${ko(tot.avant)} → ${ko(tot.apres)} (−${Math.round((1 - tot.apres / tot.avant) * 100)} %)`);
  if (opt.apply && journal.length) {
    await mkdir('outputs', { recursive: true });
    const file = `outputs/reencode-fiche-photos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await writeFile(file, JSON.stringify({ date: new Date().toISOString(), projet: host, options: opt, fiches: journal }, null, 2));
    console.log(`Journal : ${file}`);
    console.log(`Retour arrière possible : node scripts/reencode-fiche-photos.mjs --rollback=${file}`);
  }
  if (!opt.apply) console.log('\nEssai à blanc terminé. Relancez avec --apply pour appliquer.');
  if (tot.erreurs) process.exitCode = 1;
}

main().catch((e) => { console.error(`\nErreur : ${e.message}`); process.exit(1); });
