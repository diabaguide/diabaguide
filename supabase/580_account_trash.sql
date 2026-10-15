-- Diaba Guide — Corbeille des comptes (voyageurs et membres), 30 jours.
-- Additif et idempotent. À exécuter dans l'éditeur SQL de Supabase.
--
-- Mettre à la corbeille = compte désactivé (connexion bloquée), masqué des listes,
-- restaurable pendant 30 jours. Passé ce délai, la purge quotidienne
-- (/api/purge-corbeille) le supprime définitivement.
-- Jamais concernés : soi-même, l'administrateur principal, le dernier administrateur.

alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists deleted_by uuid references auth.users(id) on delete set null;
create index if not exists profiles_deleted_at_idx on public.profiles (deleted_at) where deleted_at is not null;

-- Garde commune : motif de refus, ou null si le compte peut être traité.
create or replace function public.account_bulk_refusal(p_id uuid, p_caller uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v record;
begin
  select id, role, is_primary_admin into v from public.profiles where id = p_id;
  if v.id is null then return 'Compte introuvable.'; end if;
  if p_id = p_caller then return 'Vous-même'; end if;
  if v.is_primary_admin then return 'Administrateur principal'; end if;
  if v.role = 'admin' and (select count(*) from public.profiles where role = 'admin' and deleted_at is null) <= 1 then
    return 'Dernier administrateur';
  end if;
  return null;
end; $$;
revoke all on function public.account_bulk_refusal(uuid, uuid) from public, anon, authenticated;

-- Met des comptes à la corbeille : un résultat par compte.
create or replace function public.admin_trash_accounts(p_ids uuid[])
returns table (res_id uuid, res_status text, res_reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_reason text;
begin
  if not public.is_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'Cent comptes au maximum par opération.'; end if;
  foreach v_id in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_ids) as x) loop
    v_reason := public.account_bulk_refusal(v_id, auth.uid());
    if v_reason is not null then
      res_id := v_id; res_status := 'skipped'; res_reason := v_reason; return next; continue;
    end if;
    update public.profiles
       set deleted_at = coalesce(deleted_at, now()), deleted_by = auth.uid(),
           status = 'suspended', suspended_at = coalesce(suspended_at, now()),
           suspended_reason = 'Mis à la corbeille'
     where id = v_id;
    update auth.users set banned_until = now() + interval '100 years' where id = v_id;
    res_id := v_id; res_status := 'done'; res_reason := null; return next;
  end loop;
end; $$;

-- Restaure : le compte redevient actif.
create or replace function public.admin_restore_accounts(p_ids uuid[])
returns table (res_id uuid, res_status text, res_reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'Cent comptes au maximum par opération.'; end if;
  foreach v_id in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_ids) as x) loop
    if not exists (select 1 from public.profiles where id = v_id and deleted_at is not null) then
      res_id := v_id; res_status := 'skipped'; res_reason := 'Pas à la corbeille.'; return next; continue;
    end if;
    update public.profiles
       set deleted_at = null, deleted_by = null, status = 'active', suspended_at = null, suspended_reason = null
     where id = v_id;
    update auth.users set banned_until = null where id = v_id;
    res_id := v_id; res_status := 'done'; res_reason := null; return next;
  end loop;
end; $$;

-- Suppression définitive immédiate (comptes déjà à la corbeille uniquement).
-- Les contributions sont détachées, comme dans admin_delete_traveler.
create or replace function public.admin_purge_accounts(p_ids uuid[])
returns table (res_id uuid, res_status text, res_reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_reason text;
begin
  if not public.is_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'Cent comptes au maximum par opération.'; end if;
  foreach v_id in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_ids) as x) loop
    v_reason := public.account_bulk_refusal(v_id, auth.uid());
    if v_reason is null and not exists (select 1 from public.profiles where id = v_id and deleted_at is not null) then
      v_reason := 'Mettez d’abord le compte à la corbeille.';
    end if;
    if v_reason is not null then
      res_id := v_id; res_status := 'skipped'; res_reason := v_reason; return next; continue;
    end if;
    alter table public.proposals disable trigger guard_proposal_write;
    update public.proposals set user_id = null where user_id = v_id;
    alter table public.proposals enable trigger guard_proposal_write;
    delete from auth.users where id = v_id;
    res_id := v_id; res_status := 'done'; res_reason := null; return next;
  end loop;
end; $$;

-- Purge quotidienne : réservée au service (route Vercel protégée par un secret).
create or replace function public.purge_expired_accounts(p_ids uuid[])
returns table (res_id uuid, res_status text, res_reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_reason text;
begin
  foreach v_id in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_ids) as x) loop
    v_reason := public.account_bulk_refusal(v_id, null);
    if v_reason is null and not exists (
      select 1 from public.profiles where id = v_id and deleted_at is not null and deleted_at < now() - interval '30 days'
    ) then
      v_reason := 'Délai de 30 jours non écoulé.';
    end if;
    if v_reason is not null then
      res_id := v_id; res_status := 'skipped'; res_reason := v_reason; return next; continue;
    end if;
    alter table public.proposals disable trigger guard_proposal_write;
    update public.proposals set user_id = null where user_id = v_id;
    alter table public.proposals enable trigger guard_proposal_write;
    delete from auth.users where id = v_id;
    res_id := v_id; res_status := 'done'; res_reason := null; return next;
  end loop;
end; $$;

revoke all on function public.admin_trash_accounts(uuid[]) from public, anon;
revoke all on function public.admin_restore_accounts(uuid[]) from public, anon;
revoke all on function public.admin_purge_accounts(uuid[]) from public, anon;
grant execute on function public.admin_trash_accounts(uuid[]) to authenticated;
grant execute on function public.admin_restore_accounts(uuid[]) to authenticated;
grant execute on function public.admin_purge_accounts(uuid[]) to authenticated;
revoke all on function public.purge_expired_accounts(uuid[]) from public, anon, authenticated;
grant execute on function public.purge_expired_accounts(uuid[]) to service_role;
