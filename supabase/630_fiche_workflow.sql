create or replace function public.providers_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old public.providers%rowtype;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  -- Un « upsert » (insert … on conflict) passe d'abord ici en INSERT même pour une fiche existante :
  -- on la traite alors comme une modification, sinon elle repasserait en brouillon.
  if tg_op = 'UPDATE' then v_old := old;
  else select * into v_old from public.providers where id = new.id; end if;
  if v_old.id is null then
    if new.cat in ('gros', 'hotel', 'resto') then new.review_status := 'draft'; end if;
    new.partner_label := null;
  else
    if new.review_status = 'published' and v_old.review_status is distinct from 'published' then
      raise exception 'Seul un administrateur peut publier une fiche.';
    end if;
    new.partner_label := v_old.partner_label;
  end if;
  return new;
end $$;

-- ============================================================
-- Diaba Guide — Outil de saisie : statuts, position vérifiée, note interne, étiquette
-- (audit UX, phase 2C). Additif et idempotent. À exécuter une fois dans l'éditeur SQL.
--
--  review_status  draft | review | published  — défaut « published » : TOUTES les fiches
--                 existantes restent visibles. Seul un administrateur peut publier.
--  coords_verified  vrai quand la position a été relevée sur place (GPS) ; NULL = inconnu
--                 (l'application juge alors d'après les valeurs). Aucune donnée existante changée.
--  partner_label  service_diaba | partenaire — étiquette affichée aux voyageurs ; NULL = automatique.
--  provider_notes  note interne de l'équipe, JAMAIS lisible par les voyageurs (RLS).
--
-- RETOUR ARRIÈRE (rollback), si nécessaire :
--   drop trigger if exists providers_status_guard on public.providers;
--   drop function if exists public.providers_status_guard();
--   drop table if exists public.provider_notes;
--   alter table public.providers drop column if exists review_status,
--     drop column if exists coords_verified, drop column if exists partner_label;
--   (puis ré-exécuter 610_fiche_publish.sql pour retrouver la politique de lecture précédente)
-- ============================================================

alter table public.providers add column if not exists review_status text not null default 'published';
alter table public.providers add column if not exists coords_verified boolean;
alter table public.providers add column if not exists partner_label text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'providers_review_status_chk') then
    alter table public.providers add constraint providers_review_status_chk
      check (review_status in ('draft', 'review', 'published'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'providers_partner_label_chk') then
    alter table public.providers add constraint providers_partner_label_chk
      check (partner_label in ('service_diaba', 'partenaire'));
  end if;
end $$;

-- Les voyageurs ne voient que les fiches publiées ; l'équipe voit tout.
drop policy if exists "providers_read_authenticated" on public.providers;
create policy "providers_read_authenticated" on public.providers
  for select to authenticated
  using (
    (deletion_requested_at is null and deleted_at is null and unpublished_at is null and review_status = 'published')
    or public.is_team()
  );

-- Garde-fou : seul un administrateur publie ou choisit l'étiquette. Une fiche créée par un membre de
-- l'équipe dans un annuaire public démarre en brouillon. (auth.uid() nul = éditeur SQL : autorisé.)
create or replace function public.providers_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if new.cat in ('gros', 'hotel', 'resto') then new.review_status := 'draft'; end if;
    new.partner_label := null;
  else
    if new.review_status = 'published' and old.review_status is distinct from 'published' then
      raise exception 'Seul un administrateur peut publier une fiche.';
    end if;
    new.partner_label := old.partner_label;
  end if;
  return new;
end $$;

drop trigger if exists providers_status_guard on public.providers;
create trigger providers_status_guard before insert or update on public.providers
  for each row execute function public.providers_status_guard();

-- Publier en groupe rend aussi la fiche « Publié » (elle restait sinon masquée si elle était en brouillon).
create or replace function public.admin_set_fiches_published(p_ids text[], p_published boolean)
returns table (res_id text, res_status text, res_reason text)
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not public.is_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'Cent fiches au maximum par opération.'; end if;
  foreach v_id in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_ids) as x) loop
    if not exists (select 1 from public.providers where id = v_id and deleted_at is null) then
      res_id := v_id; res_status := 'skipped'; res_reason := 'Fiche introuvable.'; return next; continue;
    end if;
    if p_published then
      update public.providers set unpublished_at = null, unpublished_by = null, review_status = 'published' where id = v_id;
    else
      update public.providers set unpublished_at = coalesce(unpublished_at, now()), unpublished_by = auth.uid() where id = v_id;
    end if;
    res_id := v_id; res_status := 'done'; res_reason := null; return next;
  end loop;
end; $$;
revoke all on function public.admin_set_fiches_published(text[], boolean) from public, anon;
grant execute on function public.admin_set_fiches_published(text[], boolean) to authenticated;

-- Note interne : jamais publiée, lisible et modifiable par l'équipe seulement.
create table if not exists public.provider_notes (
  provider_id text primary key references public.providers(id) on delete cascade,
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.provider_notes enable row level security;
drop policy if exists provider_notes_team_select on public.provider_notes;
create policy provider_notes_team_select on public.provider_notes for select to authenticated using (public.is_team());
drop policy if exists provider_notes_team_insert on public.provider_notes;
create policy provider_notes_team_insert on public.provider_notes for insert to authenticated with check (public.is_team());
drop policy if exists provider_notes_team_update on public.provider_notes;
create policy provider_notes_team_update on public.provider_notes for update to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists provider_notes_team_delete on public.provider_notes;
create policy provider_notes_team_delete on public.provider_notes for delete to authenticated using (public.is_team());

notify pgrst, 'reload schema';
