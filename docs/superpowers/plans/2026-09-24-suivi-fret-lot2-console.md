# Suivi de fret — lot 2 (console équipe) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à l'équipe Diaba une console pour créer un lot, y ajouter des étapes, le modifier et le supprimer, depuis `/equipe/expeditions`.

**Architecture:** Une page d'administration unique (`src/pages/admin/Expeditions.tsx`), une couche d'accès `src/lib/fret.ts` qui n'appelle que les fonctions `admin_*` de la base (jamais d'écriture directe : la RLS n'accorde aucune politique d'écriture), et un repli navigateur quand Supabase est absent, comme `src/lib/shopping.ts`. Sur téléphone la liste est une pile de cartes `AdminCard` ouvrant une fiche `AdminSheet` ; sur ordinateur, un tableau.

**Tech Stack:** Vite + React 18 + TypeScript, react-router 6, Supabase (RPC `security definer`), CSS maison (`styles.css`, `.admin-head`, `.card`, `.acard`, `.asheet`), i18n maison (`tr()` / `t()`).

**Spec:** `docs/superpowers/specs/2026-09-24-suivi-fret-design.md`

## Global Constraints

- **Aucune clé `service_role` dans le front** — règle explicite du projet ; l'équipe passe par les fonctions `admin_*`.
- **Jamais `select *` sur `expeditions`** : le droit de lecture est accordé colonne par colonne et `notes` en est exclue. Les `select` nomment leurs colonnes.
- Les notes internes passent par `public.admin_notes_expedition(id)`, jamais par un `select` direct.
- Toute chaîne visible passe par `tr()` ou `t()` **et reçoit ses traductions `en`, `zh`, `ar`** dans `src/i18n/messages.json`. Une phrase = une clé, avec le nombre en trou `{0}` ; jamais une phrase composée de morceaux.
- Sous 1024 px : cartes empilées, jamais de tableau (les tableaux d'administration y sont rognés). Le badge va **sous** le nom, pas dans une colonne de fin.
- Composants imposés : `Screen`/`TopBar` côté voyageur, `header.admin-head` + `div.admin-body` côté équipe ; `Button` (`kind` = `p|s|g|t|d`), `Field`, `TextArea`, `Select`, `Chip`, `Tag`, `Icon`, `AdminCard`, `AdminSheet`, `SheetActions`, `SheetDanger` (titre seul, à l'intérieur de `SheetActions`).
- Les étiquettes de statut viennent de `tag tag-ok` / `tag tag-warn` / `tag tag-muted` / `tag tag-fav` — `tag danger` n'existe pas.
- Signatures à respecter (lot 1, en production) :
  - `admin_creer_expedition(p_user_id uuid, p_fret text, p_origine text, p_provider_id text, p_conteneur text, p_articles text, p_poids text, p_depart_le date, p_arrivee_prevue date, p_list_id uuid, p_notes text) returns table(id uuid, code text)`
  - `admin_ajouter_etape(p_expedition_id uuid, p_statut statut_expedition, p_lieu text, p_note text, p_photo text, p_publique boolean, p_source text, p_ref_shipsgo text, p_survenu_le timestamptz, p_estime boolean) returns uuid`
  - `admin_maj_expedition(p_id uuid, p_conteneur text, p_articles text, p_poids text, p_provider_id text, p_depart_le date, p_arrivee_prevue date, p_arrivee_le date, p_notes text, p_shipsgo_id integer, p_shipsgo_type text) returns void`
  - `admin_supprimer_expedition(p_id uuid) returns void`, `admin_notes_expedition(p_id uuid) returns table(notes text)`
- Statuts, dans l'ordre : `preparation`, `regroupage`, `embarque`, `transit`, `douane`, `arrive`, `livre`.
- `npm run build` (`tsc --noEmit && vite build`) doit passer ; il exige `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (valeurs factices acceptables pour vérifier, sans déployer le `dist/` ainsi produit).

## Review Focus

- **Écriture directe depuis l'interface** : aucune fonction de `src/lib/fret.ts` ne doit faire `insert`/`update`/`delete` sur une table — la RLS les refuse et l'erreur remonterait en clair à l'équipe.
- **Deux lots créés en rafale** : la console ne doit pas afficher « aucun lot » après une création, ni deux lots pour un seul clic (double envoi).
- **Lot sans transitaire** : `p_provider_id` nul doit rester accepté (champ facultatif), et la fiche ne doit pas proposer les fiches non-`transitaire`.
- **Voyageur supprimé par ailleurs** : un lot dont le voyageur n'existe plus doit disparaître de la liste sans casser la page (jointure absente).
- **Statut reculé** : la fiche d'ajout d'étape ne doit pas offrir un statut antérieur à l'état courant — sinon la base l'accepte (source `equipe`) et le voyageur voit son lot redescendre.

---

### Task 1: Couche d'accès `src/lib/fret.ts`

**Files:**
- Create: `src/lib/fret.ts`

**Interfaces:**
- Produces: `STATUTS: Statut[]`, `STATUT_LABEL: Record<Statut,string>`, `type Statut`, `type Fret = 'sea'|'air'`, `type Expedition`, `type Etape`, `type LotEquipe = Expedition & { voyageur: string }`, `fetchExpeditions(): Promise<LotEquipe[]>`, `fetchEtapes(id: string): Promise<Etape[]>`, `fetchNotes(id: string): Promise<string | null>`, `creerExpedition(champs): Promise<{ id?: string; code?: string; error?: string }>`, `ajouterEtape(champs): Promise<{ error?: string }>`, `majExpedition(champs): Promise<{ error?: string }>`, `supprimerExpedition(id): Promise<{ error?: string }>`.

- [ ] **Step 1: Écrire le script de vérification qui échoue**

`/opt/data/cache/scratch/verif_rpc.py` — contrôle que chaque fonction appelée par l'interface existe en base avec les bons paramètres :

```python
import json, pathlib, urllib.request
tok = pathlib.Path('/opt/data/home/.config/supabase/token').read_text().strip()
src = pathlib.Path('/opt/data/projects/diabaguide/src/lib/fret.ts').read_text()
attendues = ['admin_creer_expedition', 'admin_ajouter_etape', 'admin_maj_expedition',
             'admin_supprimer_expedition', 'admin_notes_expedition']
requete = json.dumps({"query": """
  select p.proname, pg_get_function_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any(%s)
""" % json.dumps(attendues)})
r = urllib.request.Request('https://api.supabase.com/v1/projects/ezjntxpqvilegowplmqp/database/query',
    data=requete.encode(), method='POST',
    headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
trouvees = {l['proname']: l['args'] for l in json.load(urllib.request.urlopen(r))}
manquantes = [f for f in attendues if f not in trouvees]
nommees = [f for f, a in trouvees.items() if f in src]
print('manquantes en base :', manquantes)
print('appelees par fret.ts :', nommees)
```

- [ ] **Step 2: Lancer et voir échouer**

Run: `python3 /opt/data/cache/scratch/verif_rpc.py`
Attendu : `FileNotFoundError: src/lib/fret.ts` — le fichier n'existe pas.

- [ ] **Step 3: Écrire `src/lib/fret.ts`**

Le fichier complet : types, libellés français des statuts, et pour chaque fonction un appel `supabase.rpc(...)` nommant les paramètres exacts, plus un repli `localStorage` (clé `dg.fret`) utilisé quand `supabase` est absent — les mêmes fonctions, mêmes types, comme `shopping.ts`. `fetchExpeditions` lit `expeditions` avec une jointure `profiles` pour le nom du voyageur, en **nommant les colonnes** (`id, code, user_id, provider_id, fret, origine, conteneur, articles, poids, depart_le, arrivee_prevue, arrivee_le, statut, created_at, updated_at` — pas `notes`).

- [ ] **Step 4: Relancer le script**

Run: `python3 /opt/data/cache/scratch/verif_rpc.py`
Attendu : `manquantes en base : []` et les cinq noms cités par `fret.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fret.ts
git commit -m "fret : couche d'acces de la console equipe (lot 2)"
```

---

### Task 2: La page `/equipe/expeditions`

**Files:**
- Create: `src/pages/admin/Expeditions.tsx`
- Modify: `src/App.tsx` (route sous `/equipe`), `src/pages/admin/Admin.tsx` (entrée de navigation)

**Interfaces:**
- Consumes: tout `src/lib/fret.ts` (Task 1).
- Produces: composant exporté `Expeditions`.

- [ ] **Step 1: Écrire le test de rendu qui échoue**

`/opt/data/cache/scratch/rendu_fret.mjs` — extrait le CSS du build et vérifie que les classes employées par la page existent :

```js
import { readFileSync, readdirSync } from 'node:fs';
const dist = '/opt/data/projects/diabaguide/dist/assets';
const css = readdirSync(dist).filter(f => f.endsWith('.css')).map(f => readFileSync(`${dist}/${f}`, 'utf8')).join('\n');
const page = readFileSync('/opt/data/projects/diabaguide/src/pages/admin/Expeditions.tsx', 'utf8');
const classes = [...page.matchAll(/className="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean);
const inconnues = [...new Set(classes)].filter(c => !c.includes('{') && !css.includes(`.${c}`));
console.log('classes sans CSS :', inconnues);
process.exit(inconnues.length ? 1 : 0);
```

- [ ] **Step 2: Lancer et voir échouer**

Run: `cd /opt/data/projects/diabaguide && VITE_SUPABASE_URL=https://x.supabase.co VITE_SUPABASE_ANON_KEY=x npm run build && node /opt/data/cache/scratch/rendu_fret.mjs`
Attendu : échec à la lecture de `Expeditions.tsx` (fichier absent).

- [ ] **Step 3: Écrire la page**

Liste : recherche (nom du voyageur, code, conteneur, via `contient()`), filtre par statut, compteurs ; sur largeur ≥ 1024 px un tableau, en dessous des `AdminCard` (titre = code + voyageur, sous-titre = origine→Dakar et dates, badge de statut) ; le clic ouvre une `AdminSheet` avec les champs modifiables, **l'ajout d'une étape** (statuts proposés = ceux à partir de l'état courant), la liste des étapes déjà posées avec leur date et leur caractère estimé, les notes internes (`admin_notes_expedition`, affichées à part et modifiables), et `SheetActions` avec la suppression.

Création : bouton en tête ouvrant la même fiche, vide, avec choix du voyageur (liste des comptes), du type de fret, de la ville d'origine, du transitaire (uniquement `cat = 'transitaire'`), du conteneur/AWB, des dates et des articles.

- [ ] **Step 4: Route et navigation**

`src/App.tsx` : `<Route path="/equipe/expeditions" element={<Expeditions />} />` dans le groupe `need="team"`, à côté de `/equipe/fiches`.
`src/pages/admin/Admin.tsx` : ajouter `['/equipe/expeditions', 'Suivi de fret', 'truck', false]` à la liste de navigation de l'équipe.

- [ ] **Step 5: Vérifier le rendu et le build**

Run: `VITE_SUPABASE_URL=https://x.supabase.co VITE_SUPABASE_ANON_KEY=x npm run build && node /opt/data/cache/scratch/rendu_fret.mjs`
Attendu : `classes sans CSS : []` et sortie 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/Expeditions.tsx src/App.tsx src/pages/admin/Admin.tsx
git commit -m "fret : console equipe des expeditions (lot 2)"
```

---

### Task 3: Traductions

**Files:**
- Modify: `src/i18n/messages.json`

- [ ] **Step 1: Écrire l'audit qui échoue**

`/opt/data/cache/scratch/audit_fret.mjs` — liste les chaînes de la page et de la couche d'accès absentes du dictionnaire, dans les trois langues :

```js
import { readFileSync } from 'node:fs';
const messages = JSON.parse(readFileSync('/opt/data/projects/diabaguide/src/i18n/messages.json', 'utf8'));
const norm = s => s.replace(/’/g, "'").replace(/\s+/g, ' ').trim();
const cles = new Set(Object.keys(messages).map(norm));
const manquantes = [];
for (const f of ['src/pages/admin/Expeditions.tsx', 'src/lib/fret.ts']) {
  const src = readFileSync(`/opt/data/projects/diabaguide/${f}`, 'utf8');
  for (const m of src.matchAll(/tr\("([^"]{2,})"\)|tr\('([^']{2,})'\)/g)) {
    const s = norm(m[1] ?? m[2]);
    if (!cles.has(s)) manquantes.push(s);
  }
}
console.log('non traduites :', [...new Set(manquantes)]);
```

- [ ] **Step 2: Lancer et voir échouer**

Run: `node /opt/data/cache/scratch/audit_fret.mjs`
Attendu : liste non vide (toutes les chaînes de la console).

- [ ] **Step 3: Ajouter les traductions**

Pour chaque clé manquante, une entrée `{ "en": …, "zh": …, "ar": … }` dans `messages.json`. Aucune valeur vide (une valeur vide fait disparaître le texte). Les gabarits portent `{0}`.

- [ ] **Step 4: Relancer l'audit**

Run: `node /opt/data/cache/scratch/audit_fret.mjs` puis relecture de `messages.json` avec un contrôle de non-vacuité sur les clés ajoutées.
Attendu : `non traduites : []` et aucune valeur vide.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages.json
git commit -m "fret : traductions de la console equipe (lot 2)"
```

---

### Task 4: Vérification finale et PR

- [ ] **Step 1: Build complet**

Run: `cd /opt/data/projects/diabaguide && VITE_SUPABASE_URL=https://x.supabase.co VITE_SUPABASE_ANON_KEY=x npm run build`
Attendu : `tsc --noEmit` sans erreur, `vite build` jusqu'au bout.

- [ ] **Step 2: Contrôle des signatures appelées**

Run: `python3 /opt/data/cache/scratch/verif_rpc.py` — les cinq fonctions en base, appelées avec leurs noms de paramètres réels. Attendu : aucune manquante.

- [ ] **Step 3: Branche et PR**

Branche `fret/lot2-console` depuis `main`, PR contre `main`, corps listant ce que la console sait faire, les commandes de vérification et leurs résultats.