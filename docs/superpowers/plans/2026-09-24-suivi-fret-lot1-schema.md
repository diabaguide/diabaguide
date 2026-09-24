# Suivi de fret — lot 1 (schéma SQL) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la base de données du module de suivi de fret (tables, enum, déclencheurs, RLS, fonctions d'administration et de suivi public), testée, sans aucune interface.

**Architecture:** Un seul fichier de migration idempotent `supabase/fret_tracking.sql`, exécuté à la main dans le SQL Editor Supabase comme les autres migrations du projet. Toute écriture passe par des fonctions `public.admin_*` en `security definer` ; la seule fonction exposée à `anon` est `public.suivi_public(code)`, qui ne rend que des champs publics. L'ordre de l'enum `statut_expedition` **est** l'ordre du cycle de vie, ce qui permet de comparer deux statuts (`>`), sans table de rangs.

**Tech Stack:** PostgreSQL (Supabase), plpgsql, RLS. Tests SQL exécutés à distance via l'API Management Supabase, à l'intérieur d'un `begin; … rollback;`.

**Spec:** `docs/superpowers/specs/2026-09-24-suivi-fret-design.md`

## Global Constraints

- Projet Supabase : `ezjntxpqvilegowplmqp` (jeton dans `/opt/data/home/.config/supabase/token`, chmod 600).
- Migrations exécutées à la main par Abdoulaye dans le SQL Editor ; les fichiers du dossier `supabase/` sont **idempotents** (`create table if not exists`, `create or replace`, `drop policy if exists` avant `create policy`, `drop trigger if exists` avant `create trigger`).
- Aucune clé `service_role` dans le front — règle explicite du projet.
- Convention des fonctions d'administration : `security definer` + `set search_path = public`, début de corps `if not public.is_admin() then raise exception ...`, puis `revoke all on function ... from public, anon` et `grant execute ... to authenticated`.
- Statuts, dans l'ordre : `preparation`, `regroupage`, `embarque`, `transit`, `douane`, `arrive`, `livre`.
- Format du code public : `DIA-AAAA-NNNN` (4 chiffres, sans caractère ambigu).
- Le fichier doit s'exécuter **après** `security_fixes.sql` (qui définit `is_team()`) et `auth.sql`.
- L'API Management ne renvoie que le **dernier** jeu de résultats d'un appel : chaque test regroupe ses vérifications dans une table temporaire `res(test, ok)` et finit par un seul `select`.

## Review Focus

- **Étape `publique = false`** : elle ne doit jamais apparaître dans `suivi_public`, mais doit rester visible pour le voyageur propriétaire et l'équipe.
- **Statut qui recule** : une étape ShipsGo antérieure à l'état courant (`source = 'shipsgo'`) doit être ignorée silencieusement — le voyageur ne doit jamais voir son lot « redescendre ».
- **Code de suivi inconnu** : `suivi_public('DIA-2026-9999')` doit rendre `null` (pas d'erreur, pas de fuite d'existence).
- **Écriture hors administration** : un voyageur connecté qui tente un `insert` direct dans `expeditions` doit être refusé par la RLS, y compris pour sa propre ligne.
- **Suppression du voyageur** : supprimer le compte (`auth.users`) doit emporter ses expéditions **et** leurs étapes (clé étrangère vers la table parente, pas vers `auth.users` seule).

---

### Task 1: Table, enum, index et cascade

**Files:**
- Create: `supabase/fret_tracking.sql`

**Interfaces:**
- Produces: type `public.statut_expedition` (7 valeurs, dans l'ordre du cycle de vie) ; tables `public.expeditions(id uuid, code text, user_id uuid, provider_id text, fret text, origine text, conteneur text, shipsgo_id integer, shipsgo_type text, sync_le timestamptz, articles text, poids text, depart_le date, arrivee_prevue date, arrivee_le date, statut statut_expedition, list_id uuid, notes text, created_at, updated_at)` et `public.expedition_etapes(id uuid, expedition_id uuid, statut statut_expedition, lieu text, note text, photo text, publique boolean, source text, ref_shipsgo text, created_at)`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `/opt/data/cache/scratch/t1.sql` : le test écrit dans une table temporaire, puis la relit.

```sql
begin;

create temp table res(test text, ok boolean) on commit drop;

do $$
begin
  insert into res
  select 'enum statut_expedition existe', exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'statut_expedition'
  );
  insert into res
  select 'table expeditions existe', exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'expeditions'
  );
  insert into res
  select 'table expedition_etapes existe', exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'expedition_etapes'
  );
  insert into res
  select 'ordre de l''enum = ordre du cycle de vie',
         'preparation'::public.statut_expedition < 'regroupage'::public.statut_expedition
     and 'livre'::public.statut_expedition = (select max(v) from unnest(enum_range(null::public.statut_expedition)) v);
end $$;

select test, ok from res;
rollback;
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
cd /opt/data/cache/scratch && curl -s -X POST \
  "https://api.supabase.com/v1/projects/ezjntxpqvilegowplmqp/database/query" \
  -H "Authorization: Bearer $(cat /opt/data/home/.config/supabase/token)" \
  -H "Content-Type: application/json" \
  --data-binary "$(python3 -c 'import json,sys;print(json.dumps({"query":open(sys.argv[1]).read()}))' t1.sql)"
```

Attendu : erreur `type "public.statut_expedition" does not exist` (le `do $$` s'arrête sur la première colonne inconnue), **aucune** ligne `ok = true`. Rien n'est écrit : le script est en transaction et se termine par `rollback`.

- [ ] **Step 3: Écrire la migration**

Créer `supabase/fret_tracking.sql` :

```sql
-- ============================================================
-- Diaba Guide — Suivi de fret Chine / Sénégal
-- Lot 1 : schéma. À exécuter après security_fixes.sql (is_team()).
-- Idempotent : peut être relancé sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cycle de vie d'un lot — l'ORDRE de l'enum est l'ordre du
--    cycle de vie : on compare deux statuts avec < et >,
--    sans table de rangs.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'statut_expedition') then
    create type public.statut_expedition as enum
      ('preparation', 'regroupage', 'embarque', 'transit', 'douane', 'arrive', 'livre');
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Les expéditions : un lot = un conteneur ou un envoi aérien
-- ------------------------------------------------------------
create table if not exists public.expeditions (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,                 -- DIA-AAAA-NNNN, dictable au téléphone
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider_id     text references public.providers(id) on delete set null,
  fret            text not null check (fret in ('air', 'sea')),
  origine         text not null check (origine in ('Guangzhou', 'Shenzhen')),
  conteneur       text,                                 -- n° de conteneur ou n° AWB
  shipsgo_id      integer unique,                       -- nul tant que le suivi auto n'est pas branché
  shipsgo_type    text check (shipsgo_type in ('ocean', 'air')),
  sync_le         timestamptz,
  articles        text,
  poids           text,
  depart_le       date,
  arrivee_prevue  date,
  arrivee_le      date,
  statut          public.statut_expedition not null default 'preparation',
  list_id         uuid references public.shopping_lists(id) on delete set null,
  notes           text,                                 -- notes internes, jamais publiques
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists expeditions_user_idx  on public.expeditions (user_id, created_at desc);
create index if not exists expeditions_statut_idx on public.expeditions (statut, arrivee_prevue);

-- ------------------------------------------------------------
-- 3. Les étapes : la frise du lot
--    La clé étrangère pointe la table PARENTE : supprimer un lot
--    efface ses étapes (une clé vers auth.users seul ne le ferait pas).
-- ------------------------------------------------------------
create table if not exists public.expedition_etapes (
  id            uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references public.expeditions(id) on delete cascade,
  statut        public.statut_expedition not null,
  lieu          text,
  note          text,
  photo         text,
  publique      boolean not null default true,
  source        text not null default 'equipe' check (source in ('equipe', 'shipsgo')),
  ref_shipsgo   text,
  created_at    timestamptz not null default now()
);

create index if not exists expedition_etapes_idx
  on public.expedition_etapes (expedition_id, created_at desc);

-- Un même mouvement ShipsGo ne doit produire qu'une seule étape
-- (ShipsGo réessaie jusqu'à 3 fois une livraison de webhook).
create unique index if not exists expedition_etapes_shipsgo_uniq
  on public.expedition_etapes (expedition_id, ref_shipsgo)
  where ref_shipsgo is not null;
```

- [ ] **Step 4: Appliquer la migration en transaction et relancer le test**

```bash
cd /opt/data/cache/scratch && python3 - <<'PY'
import json, urllib.request, pathlib
tok = pathlib.Path('/opt/data/home/.config/supabase/token').read_text().strip()
sql = "begin;\n" + pathlib.Path('/opt/data/projects/diabaguide/supabase/fret_tracking.sql').read_text() + "\n" + pathlib.Path('t1.sql').read_text().replace('begin;','').replace('rollback;','') + "\nrollback;\n"
req = urllib.request.Request(
    'https://api.supabase.com/v1/projects/ezjntxpqvilegowplmqp/database/query',
    data=json.dumps({"query": sql}).encode(), method='POST',
    headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=1, ensure_ascii=False))
PY
```

Attendu : `[{"test": "enum statut_expedition existe", "ok": true}, …]` — **toutes** les lignes à `true`. Le `rollback` final garantit qu'aucune table n'est créée pour de bon.

- [ ] **Step 5: Faire exécuter la migration pour de vrai**

Abdoulaye colle le contenu de `supabase/fret_tracking.sql` dans le SQL Editor et l'exécute. Contrôle ensuite que les tables existent (`select count(*) from public.expeditions;` doit répondre `0`).

- [ ] **Step 6: Commit**

```bash
cd /opt/data/projects/diabaguide
git add supabase/fret_tracking.sql
git -c user.email=etiennesamake@gmail.com -c user.name="Abdoulaye E SAMAKÉ" \
  commit -m "fret : tables expeditions et expedition_etapes (lot 1)"
```

---

### Task 2: Statut recalculé et `updated_at` tenus par la base

**Files:**
- Modify: `supabase/fret_tracking.sql` (ajout en fin de fichier)

**Interfaces:**
- Consumes: `public.expeditions`, `public.expedition_etapes` (Task 1).
- Produces: fonction et déclencheur `public.refresh_expedition_statut()` / `on_expedition_etape_change` ; réutilise `public.touch_updated_at()` (défini par `shopping_lists.sql`).

- [ ] **Step 1: Écrire le test qui échoue**

`/opt/data/cache/scratch/t2.sql` — le test insère un voyageur jetable, un lot, trois étapes, puis vérifie le statut et le recalcul :

```sql
begin;

create temp table res(test text, ok boolean) on commit drop;

do $$
declare
  v_uid uuid := (select id from auth.users limit 1);
  v_exp uuid;
  v_derniere uuid;
begin
  if v_uid is null then
    insert into res values ('prérequis : un compte existe', false);
    return;
  end if;
  insert into res values ('prérequis : un compte existe', true);

  insert into public.expeditions (code, user_id, fret, origine)
  values ('TEST-' || floor(random()*100000)::text, v_uid, 'sea', 'Guangzhou')
  returning id into v_exp;

  insert into res values ('statut initial preparation',
    (select statut from public.expeditions where id = v_exp) = 'preparation');

  insert into public.expedition_etapes (expedition_id, statut) values (v_exp, 'embarque');
  insert into res values ('statut remonte a embarque',
    (select statut from public.expeditions where id = v_exp) = 'embarque');

  insert into public.expedition_etapes (expedition_id, statut) values (v_exp, 'transit');
  insert into res values ('statut remonte a transit',
    (select statut from public.expeditions where id = v_exp) = 'transit');

  delete from public.expedition_etapes where expedition_id = v_exp and statut = 'transit';
  insert into res values ('suppression de la derniere etape : recalcul a embarque',
    (select statut from public.expeditions where id = v_exp) = 'embarque');

  delete from public.expedition_etapes where expedition_id = v_exp;
  insert into res values ('plus aucune etape : retour a preparation',
    (select statut from public.expeditions where id = v_exp) = 'preparation');

  delete from public.expeditions where id = v_exp;
  insert into res values ('les etapes suivent la suppression du lot',
    (select count(*) from public.expedition_etapes where expedition_id = v_exp) = 0);
end $$;

select test, ok from res;
rollback;
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Même commande qu'en Task 1 Step 2, avec `t2.sql`. Attendu : les lignes « statut remonte… » à `false` — sans déclencheur, le statut reste `preparation`.

- [ ] **Step 3: Écrire les déclencheurs**

Ajouter à la fin de `supabase/fret_tracking.sql` :

```sql
-- ------------------------------------------------------------
-- 4. Le statut du lot = le plus avancé de ses étapes.
--    « plus avancé » s'appuie sur l'ORDRE de l'enum : max() suffit.
-- ------------------------------------------------------------
create or replace function public.refresh_expedition_statut()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_exp uuid := coalesce(new.expedition_id, old.expedition_id);
  v_statut public.statut_expedition;
begin
  select coalesce(max(statut), 'preparation') into v_statut
    from public.expedition_etapes where expedition_id = v_exp;

  update public.expeditions
     set statut = v_statut, updated_at = now()
   where id = v_exp and statut is distinct from v_statut;

  return null;
end; $$;

drop trigger if exists on_expedition_etape_change on public.expedition_etapes;
create trigger on_expedition_etape_change
  after insert or update or delete on public.expedition_etapes
  for each row execute function public.refresh_expedition_statut();

-- updated_at d'une expédition : tenu par la base, jamais par le client.
drop trigger if exists on_expedition_update on public.expeditions;
create trigger on_expedition_update
  before update on public.expeditions
  for each row execute function public.touch_updated_at();
```

- [ ] **Step 4: Appliquer en transaction et relancer le test**

Même commande que Task 1 Step 4, avec `t2.sql`. Attendu : **toutes** les lignes à `true`, y compris la recalcul après suppression d'étape et la cascade des étapes.

- [ ] **Step 5: Refaire exécuter la migration à Abdoulaye et committer**

```bash
cd /opt/data/projects/diabaguide
git add supabase/fret_tracking.sql
git -c user.email=etiennesamake@gmail.com -c user.name="Abdoulaye E SAMAKÉ" \
  commit -m "fret : statut du lot recalcule depuis ses etapes (lot 1)"
```

---

### Task 3: Accès — lecture propriétaire et équipe, écriture réservée aux fonctions

**Files:**
- Modify: `supabase/fret_tracking.sql`

**Interfaces:**
- Consumes: `public.is_team()`, `public.is_admin()` (déjà en base).
- Produces: politiques `expeditions_owner_read`, `expeditions_staff_read`, `expedition_etapes_owner_read`, `expedition_etapes_staff_read`.

- [ ] **Step 1: Écrire le test qui échoue**

`/opt/data/cache/scratch/t3.sql` — deux voyageurs, une équipe, un anonyme, en simulant les jetons :

```sql
begin;

create temp table res(test text, ok boolean) on commit drop;

do $$
declare
  v_a uuid; v_b uuid; v_team uuid; v_exp uuid;
begin
  select id into v_a from auth.users order by created_at limit 1;
  select id into v_b from auth.users where id <> v_a order by created_at limit 1;
  select id into v_team from public.profiles where role = 'admin' limit 1;

  insert into res values ('prérequis : deux voyageurs et un admin', v_a is not null and v_b is not null and v_team is not null);
  if v_a is null or v_b is null or v_team is null then return; end if;

  insert into public.expeditions (code, user_id, fret, origine)
  values ('TEST-ACC-' || floor(random()*100000)::text, v_a, 'sea', 'Shenzhen')
  returning id into v_exp;

  -- A lit la sienne
  perform set_config('request.jwt.claims', json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into res values ('le proprietaire lit son lot', (select count(*) from public.expeditions where id = v_exp) = 1);

  -- A tente d'ecrire en direct : refuse
  begin
    insert into public.expeditions (code, user_id, fret, origine)
    values ('TEST-DIRECT', v_a, 'air', 'Guangzhou');
    insert into res values ('ecriture directe refusee', false);
  exception when others then
    insert into res values ('ecriture directe refusee', true);
  end;

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  insert into res values ('un autre voyageur ne voit rien', (select count(*) from public.expeditions where id = v_exp) = 0);

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_team::text, 'role', 'authenticated')::text, true);
  insert into res values ('l''equipe lit le lot', (select count(*) from public.expeditions where id = v_exp) = 1);
end $$;

select test, ok from res;
rollback;
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Attendu : `le proprietaire lit son lot` à `false` (la RLS n'est pas encore activée, mais `alter table … enable row level security` manque : sans politique, tout est refusé).

- [ ] **Step 3: Écrire les politiques**

Ajouter à `supabase/fret_tracking.sql` :

```sql
-- ------------------------------------------------------------
-- 5. Accès
--    Lecture : le voyageur propriétaire, l'équipe en support.
--    Écriture : AUCUNE politique → uniquement les fonctions admin_*
--    (security definer). Un voyageur ne peut pas écrire même chez lui.
-- ------------------------------------------------------------
alter table public.expeditions enable row level security;
alter table public.expedition_etapes enable row level security;

drop policy if exists "expeditions_owner_read" on public.expeditions;
create policy "expeditions_owner_read" on public.expeditions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "expeditions_staff_read" on public.expeditions;
create policy "expeditions_staff_read" on public.expeditions
  for select to authenticated using (public.is_team());

drop policy if exists "expedition_etapes_owner_read" on public.expedition_etapes;
create policy "expedition_etapes_owner_read" on public.expedition_etapes
  for select to authenticated using (
    exists (select 1 from public.expeditions e
             where e.id = expedition_etapes.expedition_id and e.user_id = auth.uid()));

drop policy if exists "expedition_etapes_staff_read" on public.expedition_etapes;
create policy "expedition_etapes_staff_read" on public.expedition_etapes
  for select to authenticated using (public.is_team());
```

- [ ] **Step 4: Appliquer en transaction et relancer le test**

Attendu : **toutes** les lignes à `true`, en particulier `ecriture directe refusee` et `un autre voyageur ne voit rien`.

- [ ] **Step 5: Refaire exécuter la migration et committer**

```bash
cd /opt/data/projects/diabaguide
git add supabase/fret_tracking.sql
git -c user.email=etiennesamake@gmail.com -c user.name="Abdoulaye E SAMAKÉ" \
  commit -m "fret : lecture RLS proprietaire et equipe, ecriture reservee aux fonctions (lot 1)"
```

---

### Task 4: `admin_creer_expedition` et génération du code

**Files:**
- Modify: `supabase/fret_tracking.sql`

**Interfaces:**
- Produces: `public.admin_creer_expedition(p_user_id uuid, p_fret text, p_origine text, p_provider_id text default null, p_conteneur text default null, p_articles text default null, p_poids text default null, p_depart_le date default null, p_arrivee_prevue date default null, p_list_id uuid default null, p_notes text default null) returns table (id uuid, code text)`.

- [ ] **Step 1: Écrire le test qui échoue**

`/opt/data/cache/scratch/t4.sql` — un admin crée deux lots, un voyageur essaie :

```sql
begin;

create temp table res(test text, ok boolean) on commit drop;

do $$
declare
  v_admin uuid; v_user uuid; v1 record; v2 record;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  select id into v_user from auth.users where id <> v_admin order by created_at limit 1;
  if v_admin is null or v_user is null then
    insert into res values ('prérequis : un admin et un voyageur', false); return;
  end if;
  insert into res values ('prérequis : un admin et un voyageur', true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select * into v1 from public.admin_creer_expedition(v_user, 'sea', 'Guangzhou', null, 'MSCU1234567');
  select * into v2 from public.admin_creer_expedition(v_user, 'air', 'Shenzhen', null, '333-88888888');

  reset role;
  insert into res values ('code au format DIA-AAAA-NNNN',
    v1.code ~ ('^DIA-' || to_char(now(), 'YYYY') || '-[0-9]{4}$'));
  insert into res values ('deux codes consecutifs',
    substring(v2.code from 10)::int = substring(v1.code from 10)::int + 1);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_creer_expedition(v_user, 'sea', 'Guangzhou');
    insert into res values ('un voyageur ne peut pas creer de lot', false);
  exception when others then
    insert into res values ('un voyageur ne peut pas creer de lot', true);
  end;
end $$;

select test, ok from res;
rollback;
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Attendu : `function public.admin_creer_expedition(uuid, unknown, unknown, unknown, unknown) does not exist`.

- [ ] **Step 3: Écrire la fonction**

Ajouter à `supabase/fret_tracking.sql` :

```sql
-- ------------------------------------------------------------
-- 6. Création d'un lot (équipe uniquement)
--    Le code est genere en base, sous verrou, pour que deux
--    creations simultanees ne produisent pas le meme numero.
-- ------------------------------------------------------------
create or replace function public.admin_creer_expedition(
  p_user_id       uuid,
  p_fret          text,
  p_origine       text,
  p_provider_id   text    default null,
  p_conteneur     text    default null,
  p_articles      text    default null,
  p_poids         text    default null,
  p_depart_le     date    default null,
  p_arrivee_prevue date   default null,
  p_list_id       uuid    default null,
  p_notes         text    default null
) returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  if p_fret not in ('air', 'sea') then
    raise exception 'Type de fret invalide : %', p_fret;
  end if;
  if p_origine not in ('Guangzhou', 'Shenzhen') then
    raise exception 'Ville d''origine invalide : %', p_origine;
  end if;

  -- Sérialise la génération des codes : deux appels simultanés
  -- ne peuvent pas lire le même « dernier numéro ».
  perform pg_advisory_xact_lock(hashtext('fret_code_' || to_char(now(), 'YYYY')));

  select 'DIA-' || to_char(now(), 'YYYY') || '-' ||
         lpad((coalesce(max(substring(e.code from '[0-9]{4}$')::int), 0) + 1)::text, 4, '0')
    into v_code
    from public.expeditions e
   where e.code like 'DIA-' || to_char(now(), 'YYYY') || '-%';

  insert into public.expeditions
    (code, user_id, provider_id, fret, origine, conteneur, articles, poids,
     depart_le, arrivee_prevue, list_id, notes)
  values
    (v_code, p_user_id, p_provider_id, p_fret, p_origine, p_conteneur, p_articles, p_poids,
     p_depart_le, p_arrivee_prevue, p_list_id, p_notes)
  returning expeditions.id into v_id;

  return query select v_id, v_code;
end; $$;

revoke all on function public.admin_creer_expedition(uuid, text, text, text, text, text, text, date, date, uuid, text) from public, anon;
grant execute on function public.admin_creer_expedition(uuid, text, text, text, text, text, text, date, date, uuid, text) to authenticated;
```

- [ ] **Step 4: Appliquer en transaction et relancer le test**

Attendu : les quatre lignes à `true`.

- [ ] **Step 5: Refaire exécuter la migration et committer**

```bash
cd /opt/data/projects/diabaguide
git add supabase/fret_tracking.sql
git -c user.email=etiennesamake@gmail.com -c user.name="Abdoulaye E SAMAKÉ" \
  commit -m "fret : creation d'un lot par l'equipe, code DIA-AAAA-NNNN (lot 1)"
```

---

### Task 5: `admin_ajouter_etape`, sans retour en arrière automatique

**Files:**
- Modify: `supabase/fret_tracking.sql`

**Interfaces:**
- Produces: `public.admin_ajouter_etape(p_expedition_id uuid, p_statut public.statut_expedition, p_lieu text default null, p_note text default null, p_photo text default null, p_publique boolean default true, p_source text default 'equipe', p_ref_shipsgo text default null) returns uuid` — rend l'identifiant de l'étape créée, ou `null` si l'étape a été ignorée.

- [ ] **Step 1: Écrire le test qui échoue**

`/opt/data/cache/scratch/t5.sql` :

```sql
begin;

create temp table res(test text, ok boolean) on commit drop;

do $$
declare
  v_admin uuid; v_user uuid; v_exp uuid; v_etape uuid; v_retour uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  select id into v_user from auth.users where id <> v_admin order by created_at limit 1;
  if v_admin is null or v_user is null then
    insert into res values ('prérequis', false); return;
  end if;

  -- lot créé en tant qu'admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into v_exp from public.admin_creer_expedition(v_user, 'sea', 'Guangzhou', null, 'MSCU7654321');

  v_etape := public.admin_ajouter_etape(v_exp, 'transit', 'En mer', 'Navire MSC LORETO');
  reset role;
  insert into res values ('etape ajoutee', v_etape is not null);
  insert into res values ('statut du lot = transit',
    (select statut from public.expeditions where id = v_exp) = 'transit');

  -- ShipsGo annonce une etape ANTERIEURE : elle doit etre ignoree
  set local role authenticated;
  v_retour := public.admin_ajouter_etape(v_exp, 'embarque', 'Nansha', null, null, true, 'shipsgo', 'DEP-123');
  reset role;
  insert into res values ('etape shipsgo anterieure ignoree', v_retour is null);
  insert into res values ('statut non regresse',
    (select statut from public.expeditions where id = v_exp) = 'transit');
  insert into res values ('aucune etape shipsgo ecrite',
    (select count(*) from public.expedition_etapes
      where expedition_id = v_exp and source = 'shipsgo') = 0);

  -- ShipsGo annonce une etape POSTERIEURE : elle passe
  set local role authenticated;
  v_etape := public.admin_ajouter_etape(v_exp, 'arrive', 'Port de Dakar', null, null, true, 'shipsgo', 'ARR-456');
  reset role;
  insert into res values ('etape shipsgo posterieure acceptee', v_etape is not null);

  -- meme mouvement livre deux fois : une seule etape
  set local role authenticated;
  v_retour := public.admin_ajouter_etape(v_exp, 'arrive', 'Port de Dakar', null, null, true, 'shipsgo', 'ARR-456');
  reset role;
  insert into res values ('mouvement shipsgo dedoublonne',
    (select count(*) from public.expedition_etapes
      where expedition_id = v_exp and ref_shipsgo = 'ARR-456') = 1);

  -- etape interne masquee du public
  set local role authenticated;
  perform public.admin_ajouter_etape(v_exp, 'douane', 'Bureau des douanes', 'Dossier en cours', null, false);
  reset role;
  insert into res values ('etape interne enregistree mais non publique',
    (select count(*) from public.expedition_etapes
      where expedition_id = v_exp and publique = false) = 1);

  -- un voyageur ne peut pas ajouter d'etape
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_ajouter_etape(v_exp, 'livre');
    insert into res values ('un voyageur ne peut pas ajouter d''etape', false);
  exception when others then
    insert into res values ('un voyageur ne peut pas ajouter d''etape', true);
  end;
end $$;

select test, ok from res;
rollback;
```

Retirer la ligne marquée « placeholder » avant d'exécuter.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Attendu : `function public.admin_ajouter_etape(uuid, unknown, unknown, …) does not exist`.

- [ ] **Step 3: Écrire la fonction**

```sql
-- ------------------------------------------------------------
-- 7. Ajout d'une étape (équipe uniquement)
--    Règle métier : une étape automatique (ShipsGo) ne fait JAMAIS
--    reculer le statut — le voyageur ne voit pas son lot redescendre.
--    Un mouvement déjà connu est ignoré (ShipsGo réessaie).
-- ------------------------------------------------------------
create or replace function public.admin_ajouter_etape(
  p_expedition_id uuid,
  p_statut        public.statut_expedition,
  p_lieu          text    default null,
  p_note          text    default null,
  p_photo         text    default null,
  p_publique      boolean default true,
  p_source        text    default 'equipe',
  p_ref_shipsgo   text    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_statut public.statut_expedition;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  if p_source not in ('equipe', 'shipsgo') then
    raise exception 'Source inconnue : %', p_source;
  end if;

  select statut into v_statut from public.expeditions where id = p_expedition_id;
  if not found then
    raise exception 'Expédition introuvable';
  end if;

  -- déjà connue ? (mouvement rejoué) : rien à faire
  if p_ref_shipsgo is not null and exists (
    select 1 from public.expedition_etapes
     where expedition_id = p_expedition_id and ref_shipsgo = p_ref_shipsgo) then
    return null;
  end if;

  -- mise à jour automatique qui reculerait le statut : ignorée
  if p_source = 'shipsgo' and p_statut < v_statut then
    return null;
  end if;

  insert into public.expedition_etapes
    (expedition_id, statut, lieu, note, photo, publique, source, ref_shipsgo)
  values
    (p_expedition_id, p_statut, p_lieu, p_note, p_photo, p_publique, p_source, p_ref_shipsgo)
  returning expedition_etapes.id into v_id;

  return v_id;
end; $$;

revoke all on function public.admin_ajouter_etape(uuid, public.statut_expedition, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.admin_ajouter_etape(uuid, public.statut_expedition, text, text, text, boolean, text, text) to authenticated;
```

- [ ] **Step 4: Appliquer en transaction et relancer le test**

Attendu : toutes les lignes à `true`.

- [ ] **Step 5: Refaire exécuter la migration et committer**

```bash
cd /opt/data/projects/diabaguide
git add supabase/fret_tracking.sql
git -c user.email=etiennesamake@gmail.com -c user.name="Abdoulaye E SAMAKÉ" \
  commit -m "fret : ajout d'etapes, sans retour en arriere automatique (lot 1)"
```

---

### Task 6: Modification et suppression d'un lot

**Files:**
- Modify: `supabase/fret_tracking.sql`

**Interfaces:**
- Produces: `public.admin_maj_expedition(p_id uuid, p_conteneur text, p_articles text, p_poids text, p_provider_id text, p_depart_le date, p_arrivee_prevue date, p_arrivee_le date, p_notes text, p_shipsgo_id integer, p_shipsgo_type text) returns void` (chaque paramètre à `null` laisse la colonne inchangée) ; `public.admin_supprimer_expedition(p_id uuid) returns void`.

- [ ] **Step 1: Écrire le test qui échoue**

`/opt/data/cache/scratch/t6.sql` :

```sql
begin;

create temp table res(test text, ok boolean) on commit drop;

do $$
declare
  v_admin uuid; v_user uuid; v_exp uuid; v_user2 uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  select id into v_user from auth.users where id <> v_admin order by created_at limit 1;
  if v_admin is null or v_user is null then
    insert into res values ('prérequis', false); return;
  end if;
  select id into v_user2 from auth.users where id not in (v_admin, v_user) order by created_at limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select id into v_exp from public.admin_creer_expedition(v_user, 'sea', 'Guangzhou', null, 'MSCU1111111');
  perform public.admin_maj_expedition(v_exp, p_articles := 'Textiles, 12 cartons', p_arrivee_prevue := current_date + 30);
  reset role;
  insert into res values ('mise a jour partielle : articles ecrits',
    (select articles from public.expeditions where id = v_exp) = 'Textiles, 12 cartons');
  insert into res values ('mise a jour partielle : conteneur inchange',
    (select conteneur from public.expeditions where id = v_exp) = 'MSCU1111111');

  -- transfert d'un lot vers un autre voyageur : interdit
  set local role authenticated;
  perform public.admin_maj_expedition(v_exp, p_notes := 'note interne');
  begin
    update public.expeditions set user_id = v_user2 where id = v_exp;
    insert into res values ('changement de proprietaire refuse en direct', false);
  exception when others then
    insert into res values ('changement de proprietaire refuse en direct', true);
  end;

  perform public.admin_supprimer_expedition(v_exp);
  reset role;
  insert into res values ('suppression du lot par l''equipe',
    (select count(*) from public.expeditions where id = v_exp) = 0);
end $$;

select test, ok from res;
rollback;
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Attendu : `function public.admin_maj_expedition(uuid, p_articles := unknown, p_arrivee_prevue := unknown) does not exist`.

- [ ] **Step 3: Écrire les fonctions**

```sql
-- ------------------------------------------------------------
-- 8. Mise à jour d'un lot. Un paramètre nul laisse la colonne
--    inchangée : la console n'envoie que ce qu'elle modifie.
--    Le propriétaire (user_id) n'est jamais modifiable ici.
-- ------------------------------------------------------------
create or replace function public.admin_maj_expedition(
  p_id             uuid,
  p_conteneur      text    default null,
  p_articles       text    default null,
  p_poids          text    default null,
  p_provider_id    text    default null,
  p_depart_le      date    default null,
  p_arrivee_prevue date    default null,
  p_arrivee_le     date    default null,
  p_notes          text    default null,
  p_shipsgo_id     integer default null,
  p_shipsgo_type   text    default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;

  update public.expeditions set
    conteneur      = coalesce(p_conteneur, conteneur),
    articles       = coalesce(p_articles, articles),
    poids          = coalesce(p_poids, poids),
    provider_id    = coalesce(p_provider_id, provider_id),
    depart_le      = coalesce(p_depart_le, depart_le),
    arrivee_prevue = coalesce(p_arrivee_prevue, arrivee_prevue),
    arrivee_le     = coalesce(p_arrivee_le, arrivee_le),
    notes          = coalesce(p_notes, notes),
    shipsgo_id     = coalesce(p_shipsgo_id, shipsgo_id),
    shipsgo_type   = coalesce(p_shipsgo_type, shipsgo_type)
  where id = p_id;

  if not found then
    raise exception 'Expédition introuvable';
  end if;
end; $$;

revoke all on function public.admin_maj_expedition(uuid, text, text, text, text, date, date, date, text, integer, text) from public, anon;
grant execute on function public.admin_maj_expedition(uuid, text, text, text, text, date, date, date, text, integer, text) to authenticated;

-- ------------------------------------------------------------
-- 9. Suppression d'un lot : ses étapes partent avec lui
--    (clé étrangère vers la table parente).
-- ------------------------------------------------------------
create or replace function public.admin_supprimer_expedition(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  delete from public.expeditions where id = p_id;
end; $$;

revoke all on function public.admin_supprimer_expedition(uuid) from public, anon;
grant execute on function public.admin_supprimer_expedition(uuid) to authenticated;
```

- [ ] **Step 4: Appliquer en transaction et relancer le test**

Attendu : toutes les lignes à `true`.

- [ ] **Step 5: Refaire exécuter la migration et committer**

```bash
cd /opt/data/projects/diabaguide
git add supabase/fret_tracking.sql
git -c user.email=etiennesamake@gmail.com -c user.name="Abdoulaye E SAMAKÉ" \
  commit -m "fret : mise a jour et suppression d'un lot par l'equipe (lot 1)"
```

---

### Task 7: `suivi_public`, la seule porte ouverte aux anonymes

**Files:**
- Modify: `supabase/fret_tracking.sql`

**Interfaces:**
- Produces: `public.suivi_public(p_code text) returns jsonb` — `null` si le code est inconnu ; sinon `{code, fret, origine, statut, arrivee_prevue, arrivee_le, depart_le, transitaire: {nom, telephone}, etapes: [{statut, lieu, note, date, estime}]}`. **Jamais** `user_id`, le nom du voyageur, `notes`, `articles` détaillés, ni `shipsgo_id`.

- [ ] **Step 1: Écrire le test qui échoue**

`/opt/data/cache/scratch/t7.sql` :

```sql
begin;

create temp table res(test text, ok boolean) on commit drop;

do $$
declare
  v_admin uuid; v_user uuid; v_exp uuid; v_code text; v_json jsonb;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  select id into v_user from auth.users where id <> v_admin order by created_at limit 1;
  if v_admin is null or v_user is null then
    insert into res values ('prérequis', false); return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select e.code into v_code from public.admin_creer_expedition(
    v_user, 'sea', 'Guangzhou',
    (select id from public.providers where cat = 'transitaire' limit 1),
    'MSCU2222222', 'Textiles, 12 cartons') e;
  select id into v_exp from public.expeditions where code = v_code;
  perform public.admin_ajouter_etape(v_exp, 'embarque', 'Nansha', 'Chargé', null, true);
  perform public.admin_ajouter_etape(v_exp, 'douane', 'Bureau des douanes', 'Facture à fournir', null, false);
  reset role;

  -- appel anonyme
  set local role anon;
  v_json := public.suivi_public(v_code);
  reset role;

  insert into res values ('suivi public rend un objet', v_json is not null);
  insert into res values ('code present', v_json->>'code' = v_code);
  insert into res values ('statut present', v_json->>'statut' = 'douane');
  insert into res values ('etape publique presente',
    exists (select 1 from jsonb_array_elements(v_json->'etapes') e where e->>'statut' = 'embarque'));
  insert into res values ('etape interne absente',
    not exists (select 1 from jsonb_array_elements(v_json->'etapes') e where e->>'statut' = 'douane'));
  insert into res values ('aucune donnee personnelle',
    not (v_json::text ilike '%' || v_user::text || '%')
    and not (v_json ? 'notes') and not (v_json ? 'articles')
    and not (v_json ? 'user_id') and not (v_json ? 'shipsgo_id'));
  insert into res values ('code inconnu : null',
    public.suivi_public('DIA-2026-9999') is null);
end $$;

select test, ok from res;
rollback;
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Attendu : `function public.suivi_public(unknown) does not exist`.

- [ ] **Step 3: Écrire la fonction**

```sql
-- ------------------------------------------------------------
-- 10. Suivi public : la SEULE fonction ouverte à anon.
--     Elle ne rend que ce qu'un tiers peut voir : statut, dates,
--     frise des étapes publiques, transitaire. Jamais le voyageur,
--     jamais les notes internes ni le détail des articles.
-- ------------------------------------------------------------
create or replace function public.suivi_public(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'code', e.code,
           'fret', e.fret,
           'origine', e.origine,
           'statut', e.statut,
           'depart_le', e.depart_le,
           'arrivee_prevue', e.arrivee_prevue,
           'arrivee_le', e.arrivee_le,
           'transitaire', case when p.id is null then null else
             jsonb_build_object('nom', p.name, 'telephone', p.tel) end,
           'etapes', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'statut', t.statut,
                      'lieu', t.lieu,
                      'note', t.note,
                      'date', t.created_at)
                    order by t.created_at)
               from public.expedition_etapes t
              where t.expedition_id = e.id and t.publique), '[]'::jsonb)
         )
    from public.expeditions e
    left join public.providers p on p.id = e.provider_id
   where e.code = upper(btrim(p_code));
$$;

revoke all on function public.suivi_public(text) from public;
grant execute on function public.suivi_public(text) to anon, authenticated;
```

- [ ] **Step 4: Appliquer en transaction et relancer le test**

Attendu : toutes les lignes à `true`, y compris `aucune donnee personnelle` et `code inconnu : null`.

- [ ] **Step 5: Refaire exécuter la migration et committer**

```bash
cd /opt/data/projects/diabaguide
git add supabase/fret_tracking.sql
git -c user.email=etiennesamake@gmail.com -c user.name="Abdoulaye E SAMAKÉ" \
  commit -m "fret : suivi public par code, sans donnee personnelle (lot 1)"
```

---

### Task 8: Batterie complète, relance et PR

**Files:**
- Modify: `supabase/fret_tracking.sql` (vérification finale seulement)

**Interfaces:**
- Consumes: tout ce qui précède.

- [ ] **Step 1: Vérifier l'idempotence**

Exécuter la migration **deux fois de suite** dans la même transaction, puis la batterie complète : aucun `create` ne doit échouer.

```bash
cd /opt/data/cache/scratch && python3 - <<'PY'
import json, urllib.request, pathlib
tok = pathlib.Path('/opt/data/home/.config/supabase/token').read_text().strip()
mig = pathlib.Path('/opt/data/projects/diabaguide/supabase/fret_tracking.sql').read_text()
tests = "\n".join(pathlib.Path(f't{i}.sql').read_text().replace('begin;','').replace('rollback;','') for i in range(1, 8))
sql = "begin;\n" + mig + "\n" + mig + "\n" + tests + "\nrollback;\n"
req = urllib.request.Request('https://api.supabase.com/v1/projects/ezjntxpqvilegowplmqp/database/query',
    data=json.dumps({"query": sql}).encode(), method='POST',
    headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=1, ensure_ascii=False))
PY
```

Attendu : toutes les lignes `ok = true`, et la seconde exécution de la migration sans erreur.

- [ ] **Step 2: Vérifier qu'aucune trace ne reste**

```bash
cd /opt/data/cache/scratch && curl -s -X POST \
  "https://api.supabase.com/v1/projects/ezjntxpqvilegowplmqp/database/query" \
  -H "Authorization: Bearer $(cat /opt/data/home/.config/supabase/token)" \
  -H "Content-Type: application/json" \
  --data-binary '{"query":"select (select count(*) from public.expeditions) as lots, (select count(*) from public.expedition_etapes) as etapes"}'
```

Attendu : `lots` et `etapes` **inchangés** après les tests (le `rollback` ne doit rien laisser).

- [ ] **Step 3: Pousser et ouvrir la PR**

```bash
export HOME=/opt/data/home PATH="/opt/data/home/.npm-global/bin:/opt/data/home/.local/bin:$PATH"
cd /opt/data/projects/diabaguide
git push origin spec/suivi-fret   # ou la branche de lot créée pour l'occasion
gh pr create --base main --head <branche> --title "fret : schema du suivi (lot 1)" \
  --body-file /opt/data/cache/scratch/pr_lot1.md
```

Le corps de la PR (fichier `pr_lot1.md`) liste : les tables créées, les fonctions et leur contrôle d'accès, le résultat des tests SQL ligne par ligne, et rappelle qu'aucune interface n'est livrée dans ce lot.

- [ ] **Step 4: Faire exécuter la migration par Abdoulaye en production Supabase**

C'est la seule étape que lui seul peut faire (SQL Editor). Tant qu'elle n'est pas exécutée, le lot 2 n'a pas de tables pour travailler.