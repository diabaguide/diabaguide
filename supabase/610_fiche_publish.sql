-- Diaba Guide — Publier / dépublier des fiches (actions groupées).
-- Additif et idempotent. À exécuter dans l'éditeur SQL de Supabase.
--
-- Une fiche dépubliée disparaît pour les voyageurs (recherche, explorer,
-- favoris, achats) mais l'équipe la voit et peut la modifier ou la republier.
-- Rien n'est supprimé : toutes les fiches existantes restent publiées.

alter table public.providers add column if not exists unpublished_at timestamptz;
alter table public.providers add column if not exists unpublished_by uuid references auth.users(id) on delete set null;

drop policy if exists "providers_read_authenticated" on public.providers;
create policy "providers_read_authenticated" on public.providers
  for select to authenticated
  using (
    (deletion_requested_at is null and deleted_at is null and unpublished_at is null)
    or public.is_team()
  );

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
      update public.providers set unpublished_at = null, unpublished_by = null where id = v_id;
    else
      update public.providers set unpublished_at = coalesce(unpublished_at, now()), unpublished_by = auth.uid() where id = v_id;
    end if;
    res_id := v_id; res_status := 'done'; res_reason := null; return next;
  end loop;
end; $$;

revoke all on function public.admin_set_fiches_published(text[], boolean) from public, anon;
grant execute on function public.admin_set_fiches_published(text[], boolean) to authenticated;
