-- ============================================================
-- Diaba Guide — Recherches sans résultat
--
-- Chaque recherche tapée dans l'application est enregistrée avec le nombre
-- d'adresses trouvées. L'équipe y voit ce que les voyageurs cherchent en vain :
-- de quoi décider quelles fiches aller chercher sur le terrain.
--
-- Le journal est réservé à l'équipe (aucun voyageur ne voit les recherches des
-- autres) et nettoyé par la fonction prune_search_logs.
--
-- À exécuter après security_fixes.sql (nécessite is_team()). Idempotent.
-- ============================================================

create table if not exists public.search_logs (
  id         bigserial primary key,
  user_id    uuid default auth.uid() references auth.users(id) on delete set null,
  term       text not null check (length(btrim(term)) between 2 and 80),
  city       text,
  cat        text,
  -- Nombre d'adresses trouvées. 0 = recherche restée sans résultat.
  results    integer not null default 0 check (results >= 0),
  created_at timestamptz not null default now()
);

-- Simplifie le regroupement par terme (« iPhone », « iphone », « IPHONE »).
alter table public.search_logs
  add column if not exists term_norm text
  generated always as (lower(btrim(term))) stored;

create index if not exists search_logs_recents_idx on public.search_logs (created_at desc);
create index if not exists search_logs_sans_resultat_idx on public.search_logs (results, created_at desc);
create index if not exists search_logs_terme_idx on public.search_logs (term_norm, city);

alter table public.search_logs enable row level security;

-- Le voyageur écrit ses propres recherches ; il ne peut pas les modifier ni
-- les relire. L'équipe lit l'ensemble.
drop policy if exists "search_logs_insert_own" on public.search_logs;
create policy "search_logs_insert_own" on public.search_logs
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "search_logs_staff_read" on public.search_logs;
create policy "search_logs_staff_read" on public.search_logs
  for select to authenticated using (public.is_team());

-- Aucune politique d'update/delete : le journal ne se réécrit pas.

-- ------------------------------------------------------------
-- Ce que les voyageurs cherchent, et ce qui ne donne rien
-- ------------------------------------------------------------
create or replace function public.admin_search_stats(p_jours integer default 30)
returns table (
  terme          text,
  ville          text,
  recherches     integer,
  sans_resultat  integer,
  voyageurs      integer,
  dernier_le     timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team() then
    raise exception 'Seule l’équipe peut consulter les recherches.' using errcode = '42501';
  end if;
  return query
    select l.term_norm,
           l.city,
           count(*)::integer,
           count(*) filter (where l.results = 0)::integer,
           count(distinct l.user_id) filter (where l.results = 0)::integer,
           max(l.created_at) filter (where l.results = 0)
      from public.search_logs l
     where l.created_at >= now() - make_interval(days => greatest(p_jours, 1))
     group by l.term_norm, l.city
    having count(*) filter (where l.results = 0) > 0
     order by count(*) filter (where l.results = 0) desc, max(l.created_at) desc
     limit 200;
end; $$;

revoke all on function public.admin_search_stats(integer) from public, anon;
grant execute on function public.admin_search_stats(integer) to authenticated;

-- ------------------------------------------------------------
-- Ménage : le journal n'a pas besoin de tout garder
-- ------------------------------------------------------------
create or replace function public.admin_prune_search_logs(p_jours integer default 180)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'Seule l’administration peut nettoyer le journal des recherches.'
      using errcode = '42501';
  end if;
  delete from public.search_logs
   where created_at < now() - make_interval(days => greatest(p_jours, 7));
  get diagnostics n = row_count;
  return n;
end; $$;

revoke all on function public.admin_prune_search_logs(integer) from public, anon;
grant execute on function public.admin_prune_search_logs(integer) to authenticated;