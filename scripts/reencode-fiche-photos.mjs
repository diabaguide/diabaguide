#!/usr/bin/env node
/**
 * Optimisation des photos DÉJÀ enregistrées des fiches (bucket `fiche-photos`) :
 *   1. RÉENCODAGE de l'original : 1280 px au plus, en WebP (ou AVIF) ;
 *   2. VIGNETTES pour les listes : `<nom>-sm.webp`, 320 px au plus (~10–20 Ko),
 *      rangées à côté de l'original. L'application les utilise dans Explorer,
 *      l'accueil, les favoris… et retombe sur l'original si elles manquent.
 *
 * Pourquoi : les photos téléversées avant l'optimisation pèsent ~200 Ko (parfois
 * 300 Ko en JPEG) alors que les listes n'en affichent que 76 px.
 *
 * ── Sécurité ────────────────────────────────────────────────────────────────
 *  • Par défaut c'est un ESSAI À BLANC : il télécharge, calcule les gains et
 *    affiche un tableau, sans RIEN écrire. Il faut `--apply` pour agir.
 *  • Les photos d'origine sont CONSERVÉES (sauf `--delete-old`). On envoie de
 *    NOUVEAUX fichiers, puis on remplace les chemins dans `providers.photo_paths`.
 *  • Le remplacement ne s'applique que si la fiche n'a pas changé entre-temps
 *    (si quelqu'un l'a modifiée, elle est ignorée et ses nouveaux fichiers
 *    sont supprimés).
 *  • Un journal `outputs/reencode-fiche-photos-<date>.json` garde l'ancien et le
 *    nouveau chemin de chaque fiche : `--rollback=<journal>` remet les anciens.
 *  • `--thumbs-only` ne crée QUE des vignettes : aucune fiche n'est modifiée,
 *    aucun original n'est touché. C'est la façon la plus sûre de commencer.
 *  • Seules les photos du bucket `fiche-photos` sont traitées ; les URL http
 *    (photos de démonstration) et les photos déjà légères sont laissées.
 *
 * ── Utilisation (ordre conseillé) ───────────────────────────────────────────
 *  1. Installer sharp, sans toucher au package.json :
 *       npm install --no-save sharp
 *  2. Donner la clé de service : clé « secret » (nouveau format, `sb_secret_…`) ou
 *     « service_role » (ancien format, `eyJ…`), dans Supabase → Settings → API.
 *     NE JAMAIS la mettre dans un fichier du dépôt ni dans le navigateur. La
 *     variable ne doit contenir QUE la clé (pas de « $env: », de guillemets ni
 *     d'espaces ; le script refuse tout ce qui n'est pas une clé, sans l'afficher).
 *       PowerShell (saisie masquée, rien dans l'historique) :
 *         $k = Read-Host "Cle" -AsSecureString; $env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new("", $k).Password
 *       Git Bash :  export SUPABASE_SERVICE_ROLE_KEY="…"
 *     L'URL du projet est lue dans SUPABASE_URL ou VITE_SUPABASE_URL (.env).
 *  3. Essai à blanc (ne modifie rien) :
 *       node scripts/reencode-fiche-photos.mjs --thumbs-only
 *  4. Créer les vignettes (n'ajoute que des fichiers, ne modifie aucune fiche) :
 *       node scripts/reencode-fiche-photos.mjs --thumbs-only --apply
 *  5. Plus tard, si voulu : alléger aussi les originaux et les vignettes qui vont
 *     avec (essai à blanc, puis un test sur une fiche, puis le reste) :
 *       node scripts/reencode-fiche-photos.mjs
 *       node scripts/reencode-fiche-photos.mjs --apply --limit=1 --only=<id de fiche>
 *       node scripts/reencode-fiche-photos.mjs --apply
 *
 * Options : --thumbs-only  --no-thumbs  --format=webp|avif (AVIF : lancer d'abord
 *           supabase/490_photos_avif.sql)  --max-side=1280  --quality=72 (webp) / 50 (avif)
 *           --min-gain=0.2  --limit=N  --only=<id de fiche>  --delete-old  --rollback=<journal>
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/* ───────────────────────── Réglages ───────────────────────── */

const BUCKET = 'fiche-photos';
const THUMB_MAX_SIDE = 320;
const THUMB_QUALITY = 70;

/** Même convention que src/lib/photoPaths.ts : `<nom>.<ext>` → `<nom>-sm.webp`. */
const isThumbPath = (p) => /-sm\.webp$/i.test(p);
const thumbPath = (p) => (isThumbPath(p) ? p : `${p.replace(/\.[A-Za-z0-9]+$/, '')}-sm.webp`);

function parseArgs(argv) {
  const o = { apply: false, format: 'webp', maxSide: 1280, quality: null, minGain: 0.2, limit: Infinity, only: null, deleteOld: false, rollback: null, thumbsOnly: false, noThumbs: false };
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'apply') o.apply = true;
    else if (k === 'delete-old') o.deleteOld = true;
    else if (k === 'thumbs-only') o.thumbsOnly = true;
    else if (k === 'no-thumbs') o.noThumbs = true;
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
  if (o.thumbsOnly && o.noThumbs) throw new Error('--thumbs-only et --no-thumbs s\'excluent.');
  if (o.thumbsOnly && o.deleteOld) throw new Error('--delete-old n\'a pas de sens avec --thumbs-only (aucun original n\'est remplacé).');
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

/**
 * Vérifie la clé de service AVANT tout appel, et ne l'affiche jamais en entier
 * (au plus ses 6 premiers caractères, pour qu'on voie ce qui a été collé).
 *  • ancien format : un JWT `eyJ…` dont le rôle est `service_role` ;
 *  • nouveau format : `sb_secret_…` (ce n'est pas un JWT : on l'envoie seulement
 *    dans l'en-tête `apikey`, jamais en `Authorization: Bearer`).
 * Refuse les clés publiques (`anon`, `sb_publishable_`) et tout texte qui n'est
 * pas une clé (par exemple une commande collée avec la clé).
 */
function checkKey(raw) {
  const key = String(raw ?? '').trim();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante (voir l\'en-tête du script).');
  if (/^sb_publishable_/.test(key)) throw new Error('Cette clé est la clé « publishable » (publique). Il faut la clé « secret » (nouveau format) ou « service_role » (ancien format).');
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return { key, jwt: false };
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    let role = null;
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role; } catch { /* charge illisible */ }
    if (role === 'anon') throw new Error('Cette clé est la clé « anon » (publique). Il faut la clé « service_role » (ancien format) ou « secret » (nouveau format).');
    if (role && role !== 'service_role') throw new Error(`Cette clé a le rôle « ${role} » ; il faut le rôle « service_role ».`);
    return { key, jwt: true };
  }
  throw new Error(`La variable SUPABASE_SERVICE_ROLE_KEY ne contient pas une clé reconnaissable (elle commence par « ${key.slice(0, 6)} », ${key.length} caractères). Elle ne doit contenir QUE la clé : « sb_secret_… » ou « eyJ… », sans « $env: », ni guillemets, ni espaces.`);
}

function makeApi(base, key, jwt = true) {
  const auth = jwt ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
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
    /** Envoie un fichier. Renvoie 'created', ou 'exists' s'il y était déjà (jamais écrasé). */
    async upload(path, buf, contentType) {
      const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${enc(path)}`, { method: 'POST', headers: { ...auth, 'Content-Type': contentType, 'x-upsert': 'false' }, body: buf });
      if (r.ok) return 'created';
      const text = await r.text().catch(() => '');
      if (r.status === 409 || /already exists|Duplicate/i.test(text)) return 'exists';
      throw new Error(`Envoi de ${path} : HTTP ${r.status} ${text.slice(0, 300)}`);
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

/** Vignette : toujours en WebP (le nom `-sm.webp` l'exige), 320 px au plus. */
function makeThumb(sharp, buf) {
  return sharp(buf, { failOn: 'none' }).rotate().resize({ width: THUMB_MAX_SIDE, height: THUMB_MAX_SIDE, fit: 'inside', withoutEnlargement: true }).webp({ quality: THUMB_QUALITY }).toBuffer();
}

const ko = (n) => `${Math.round(n / 1024)} Ko`;
const isStored = (p) => typeof p === 'string' && p !== '' && !/^https?:/i.test(p) && !isThumbPath(p);

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
  const { key, jwt } = checkKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const base = await projectUrl();
  const host = new URL(base).host;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const api = makeApi(base, key, jwt);

  console.log(`Projet : ${host}`);
  if (opt.rollback) {
    console.log(`Mode : RETOUR ARRIÈRE depuis ${opt.rollback}`);
    return rollback(api, opt.rollback);
  }
  const quoi = opt.thumbsOnly ? 'vignettes seulement (aucune fiche modifiée)' : `${opt.noThumbs ? 'originaux seulement' : 'originaux + vignettes'} · format ${opt.format} · ${opt.maxSide} px · qualité ${opt.quality} · gain minimal ${Math.round(opt.minGain * 100)} %${opt.deleteOld ? ' · SUPPRESSION des anciens fichiers' : ''}`;
  console.log(`Mode : ${opt.apply ? 'APPLICATION' : 'essai à blanc (rien n\'est écrit)'} · ${quoi}`);
  if (opt.apply && !local) {
    console.log('Application sur un projet distant : Ctrl+C dans les 5 secondes pour annuler…');
    await new Promise((r) => setTimeout(r, 5000));
  }

  const sharp = await loadSharp();
  let fiches = (await api.providers()).filter((f) => (f.photo_paths ?? []).some(isStored));
  if (opt.only) fiches = fiches.filter((f) => f.id === opt.only);
  console.log(`${fiches.length} fiche(s) avec photos enregistrées.\n`);

  const journal = [];
  const tot = { photos: 0, traitees: 0, avant: 0, apres: 0, ignorees: 0, erreurs: 0, conflits: 0, vignettes: 0, vignettesExistantes: 0, vignettesKo: 0 };
  let restantes = opt.limit;

  for (const f of fiches) {
    if (restantes <= 0) break;
    const ancien = [...f.photo_paths];
    const nouveau = [...ancien];
    const crees = [];          // originaux envoyés pour cette fiche
    const vignettesNeuves = []; // vignettes des NOUVEAUX originaux (à retirer en cas de conflit)
    const remplaces = [];
    for (let i = 0; i < ancien.length && restantes > 0; i++) {
      const p = ancien[i];
      if (!isStored(p)) continue;
      tot.photos++;
      try {
        const src = await api.download(p);
        // 1) Original réencodé (sauf --thumbs-only), seulement si le gain est suffisant.
        let plein = null;
        if (!opt.thumbsOnly) {
          const out = await reencode(sharp, src, opt);
          if (out.length > src.length * (1 - opt.minGain)) { tot.ignorees++; console.log(`  = ${f.id} · ${p} : original ${ko(src.length)} → ${ko(out.length)} (gain insuffisant, laissé)`); }
          else plein = out;
        }
        // 2) Vignette (sauf --no-thumbs), faite à partir de la meilleure source.
        const mini = opt.noThumbs ? null : await makeThumb(sharp, plein ?? src);
        if (!plein && !mini) continue;

        const nouvPath = plein ? `${randomUUID()}.${opt.format}` : p;
        const morceaux = [];
        if (plein) { morceaux.push(`original ${ko(src.length)} → ${ko(plein.length)} (−${Math.round((1 - plein.length / src.length) * 100)} %)`); tot.avant += src.length; tot.apres += plein.length; tot.traitees++; }
        if (mini) morceaux.push(`vignette ${ko(mini.length)}`);
        console.log(`  ${opt.apply ? '→' : '~'} ${f.id} · ${p} : ${morceaux.join(' · ')}`);
        restantes--;

        if (opt.apply) {
          if (plein) {
            await api.upload(nouvPath, plein, `image/${opt.format}`);
            crees.push(nouvPath);
            nouveau[i] = nouvPath;
            remplaces.push(p);
          }
          if (mini) {
            const etat = await api.upload(thumbPath(nouvPath), mini, 'image/webp');
            if (etat === 'created') { tot.vignettes++; tot.vignettesKo += mini.length; if (plein) vignettesNeuves.push(thumbPath(nouvPath)); }
            else tot.vignettesExistantes++;
          }
        } else if (mini) { tot.vignettes++; tot.vignettesKo += mini.length; }
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
        if (opt.deleteOld) { try { await api.remove(remplaces.flatMap((p) => [p, thumbPath(p)])); } catch (e) { console.log(`  ! suppression des anciens (${f.id}) : ${e.message}`); } }
      } else {
        // Fiche modifiée entre-temps (ou erreur) : on retire les fichiers qu'on vient d'envoyer.
        tot.conflits++;
        console.log(`  ✗ ${f.id} : fiche modifiée entre-temps ou mise à jour refusée, ignorée (nouveaux fichiers retirés).`);
        try { await api.remove([...crees, ...vignettesNeuves]); } catch { /* on ne peut rien de plus */ }
      }
    }
  }

  console.log('\n──────── Bilan ────────');
  console.log(`Photos examinées : ${tot.photos} · originaux réencodés : ${tot.traitees} · laissés (gain insuffisant) : ${tot.ignorees} · erreurs : ${tot.erreurs}${opt.apply ? ` · fiches en conflit : ${tot.conflits}` : ''}`);
  if (tot.traitees) console.log(`Poids des originaux réencodés : ${ko(tot.avant)} → ${ko(tot.apres)} (−${Math.round((1 - tot.apres / tot.avant) * 100)} %)`);
  if (tot.vignettes || tot.vignettesExistantes) console.log(`Vignettes ${opt.apply ? 'créées' : 'à créer'} : ${tot.vignettes}${tot.vignettes ? ` (${ko(tot.vignettesKo)} au total, ~${ko(tot.vignettesKo / tot.vignettes)} chacune)` : ''}${tot.vignettesExistantes ? ` · déjà présentes : ${tot.vignettesExistantes}` : ''}`);
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
