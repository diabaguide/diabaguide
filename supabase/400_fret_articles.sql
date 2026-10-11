-- Diaba Guide — Articles détaillés d'une expédition
-- Adaptation additive au schéma fret Production : les lots sont identifiés par code.

create table if not exists public.expedition_articles (
  id              uuid primary key default gen_random_uuid(),
  expedition_code text not null references public.expeditions(code) on delete cascade,
  nom             text not null,
  quantite        numeric not null default 1 check (quantite > 0),
  poids_kg        numeric check (poids_kg is null or poids_kg >= 0),
  created_at      timestamptz not null default now()
);

create index if not exists expedition_articles_code_idx
  on public.expedition_articles (expedition_code, created_at);

alter table public.expedition_articles enable row level security;
revoke all on public.expedition_articles from anon, authenticated;
grant select on public.expedition_articles to authenticated;

drop policy if exists "expedition_articles_team_read" on public.expedition_articles;
create policy "expedition_articles_team_read"
  on public.expedition_articles
  for select to authenticated
  using (public.is_team());

create or replace function public.admin_ajouter_article(
  p_expedition_code text,
  p_nom            text,
  p_quantite       numeric,
  p_poids_kg       numeric default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.is_team() then raise exception 'Réservé à l''équipe'; end if;
  if not exists (select 1 from public.expeditions where code = p_expedition_code) then
    raise exception 'Expédition introuvable';
  end if;
  if p_nom is null or btrim(p_nom) = '' then raise exception 'Le nom de l''article est obligatoire'; end if;
  if p_quantite is null or p_quantite <= 0 then raise exception 'La quantité doit être supérieure à zéro'; end if;
  if p_poids_kg is not null and p_poids_kg < 0 then raise exception 'Le poids ne peut pas être négatif'; end if;

  insert into public.expedition_articles (expedition_code, nom, quantite, poids_kg)
  values (p_expedition_code, btrim(p_nom), p_quantite, p_poids_kg)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_supprimer_article(p_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_team() then raise exception 'Réservé à l''équipe'; end if;
  delete from public.expedition_articles where id = p_id;
  if not found then raise exception 'Article introuvable'; end if;
end;
$$;

revoke all on function public.admin_ajouter_article(text, text, numeric, numeric) from public, anon;
grant execute on function public.admin_ajouter_article(text, text, numeric, numeric) to authenticated;
revoke all on function public.admin_supprimer_article(uuid) from public, anon;
grant execute on function public.admin_supprimer_article(uuid) to authenticated;
