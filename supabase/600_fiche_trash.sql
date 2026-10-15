-- Diaba Guide — Corbeille des fiches (30 jours) et actions groupées.
-- Additif et idempotent. À exécuter dans l'éditeur SQL de Supabase.
--
-- Une fiche à la corbeille disparaît pour les voyageurs (recherche, explorer,
-- favoris, achats) ; l'équipe la voit toujours. Restaurable 30 jours, puis
-- supprimée définitivement par la purge quotidienne (/api/purge-corbeille).

alter table public.providers add column if not exists deleted_at timestamptz;
alter table public.providers add column if not exists deleted_by uuid references auth.users(id) on delete set null;
create index if not exists providers_deleted_at_idx on public.providers (deleted_at) where deleted_at is not null;

-- Masquage côté base : l'équipe garde la lecture, les voyageurs ne voient ni
-- les fiches à la corbeille ni celles dont la suppression est demandée.
drop policy if exists "providers_read_authenticated" on public.providers;
create policy "providers_read_authenticated" on public.providers
  for select to authenticated
  using ((deletion_requested_at is null and deleted_at is null) or public.is_team());

create or replace function public.admin_trash_fiches(p_ids text[])
returns table (res_id text, res_status text, res_reason text)
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not public.is_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'Cent fiches au maximum par opération.'; end if;
  foreach v_id in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_ids) as x) loop
    if not exists (select 1 from public.providers where id = v_id) then
      res_id := v_id; res_status := 'skipped'; res_reason := 'Fiche introuvable.'; return next; continue;
    end if;
    update public.providers set deleted_at = coalesce(deleted_at, now()), deleted_by = auth.uid() where id = v_id;
    res_id := v_id; res_status := 'done'; res_reason := null; return next;
  end loop;
end; $$;

create or replace function public.admin_restore_fiches(p_ids text[])
returns table (res_id text, res_status text, res_reason text)
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not public.is_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'Cent fiches au maximum par opération.'; end if;
  foreach v_id in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_ids) as x) loop
    if not exists (select 1 from public.providers where id = v_id and deleted_at is not null) then
      res_id := v_id; res_status := 'skipped'; res_reason := 'Pas à la corbeille.'; return next; continue;
    end if;
    update public.providers set deleted_at = null, deleted_by = null where id = v_id;
    res_id := v_id; res_status := 'done'; res_reason := null; return next;
  end loop;
end; $$;

-- Suppression définitive immédiate (fiches déjà à la corbeille uniquement).
create or replace function public.admin_purge_fiches(p_ids text[])
returns table (res_id text, res_status text, res_reason text)
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not public.is_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'Cent fiches au maximum par opération.'; end if;
  foreach v_id in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_ids) as x) loop
    if not exists (select 1 from public.providers where id = v_id and deleted_at is not null) then
      res_id := v_id; res_status := 'skipped'; res_reason := 'Mettez d’abord la fiche à la corbeille.'; return next; continue;
    end if;
    delete from public.providers where id = v_id;
    res_id := v_id; res_status := 'done'; res_reason := null; return next;
  end loop;
end; $$;

-- Purge quotidienne : réservée au service.
create or replace function public.purge_expired_fiches(p_ids text[])
returns table (res_id text, res_status text, res_reason text)
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  foreach v_id in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_ids) as x) loop
    if not exists (select 1 from public.providers where id = v_id and deleted_at is not null and deleted_at < now() - interval '30 days') then
      res_id := v_id; res_status := 'skipped'; res_reason := 'Délai de 30 jours non écoulé.'; return next; continue;
    end if;
    delete from public.providers where id = v_id;
    res_id := v_id; res_status := 'done'; res_reason := null; return next;
  end loop;
end; $$;

revoke all on function public.admin_trash_fiches(text[]) from public, anon;
revoke all on function public.admin_restore_fiches(text[]) from public, anon;
revoke all on function public.admin_purge_fiches(text[]) from public, anon;
grant execute on function public.admin_trash_fiches(text[]) to authenticated;
grant execute on function public.admin_restore_fiches(text[]) to authenticated;
grant execute on function public.admin_purge_fiches(text[]) to authenticated;
revoke all on function public.purge_expired_fiches(text[]) from public, anon, authenticated;
grant execute on function public.purge_expired_fiches(text[]) to service_role;
