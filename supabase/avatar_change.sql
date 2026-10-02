-- ============================================================
-- Diaba Guide — Changer sa photo de profil
--
--   - chaque utilisateur change sa propre photo (Modifier mon profil) ;
--   - un administrateur change celle d'un membre (Modifier le membre).
--
-- Les photos sont rangées dans un dossier au nom de la personne qui les
-- envoie : <user_id>/<fichier>. Dépend de : member_profile.sql. Idempotent.
-- ============================================================

-- ---------- 1. Stockage : chacun gère son dossier ----------
drop policy if exists "avatars_insert_admin" on storage.objects;
drop policy if exists "avatars_insert_own"   on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));

drop policy if exists "avatars_delete_admin" on storage.objects;
drop policy if exists "avatars_delete_own"   on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars'
         and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));

-- ---------- 2. Modifier son profil ----------
drop function if exists public.update_my_profile(text, text);
create or replace function public.update_my_profile(
  p_name text, p_phone text,
  p_avatar text default null, p_remove_avatar boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_phone  text := nullif(trim(coalesce(p_phone, '')), '');
  v_avatar text := nullif(trim(coalesce(p_avatar, '')), '');
  v_key    text;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour modifier votre profil.';
  end if;
  if public.is_suspended() then
    raise exception 'Ce compte est désactivé.';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Le nom doit contenir au moins 2 caractères.';
  end if;
  if v_phone is not null then
    v_key := public.phone_key(v_phone);
    if length(v_key) < 6 then
      raise exception 'Numéro de téléphone invalide.';
    end if;
    if exists (select 1 from public.profiles where phone_key = v_key and id <> auth.uid()) then
      raise exception 'Ce numéro de téléphone est déjà associé à un autre compte.';
    end if;
  end if;
  -- Sa propre photo seulement : le fichier doit être dans son dossier. Sans
  -- cela, on pourrait afficher la photo d'une autre personne comme la sienne.
  if v_avatar is not null and v_avatar !~ ('^' || auth.uid()::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,150}$') then
    raise exception 'Photo invalide.';
  end if;

  update public.profiles
     set name = trim(p_name), phone = v_phone,
         avatar_path = case when p_remove_avatar then null else coalesce(v_avatar, avatar_path) end
   where id = auth.uid();
end; $$;

revoke all on function public.update_my_profile(text, text, text, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text, text, boolean) to authenticated;

-- ---------- 3. Modifier un membre (administrateurs) ----------
drop function if exists public.admin_update_member(uuid, text, text);
create or replace function public.admin_update_member(
  p_id uuid, p_name text, p_phone text,
  p_avatar text default null, p_remove_avatar boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_phone  text := nullif(trim(coalesce(p_phone, '')), '');
  v_avatar text := nullif(trim(coalesce(p_avatar, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;
  if not exists (select 1 from public.profiles where id = p_id) then
    raise exception 'Compte introuvable.';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Le nom doit contenir au moins 2 caractères.';
  end if;
  if v_phone is not null
     and length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Numéro de téléphone invalide.';
  end if;
  if v_avatar is not null
     and v_avatar !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,150}(/[A-Za-z0-9][A-Za-z0-9._-]{0,150})?$' then
    raise exception 'Photo invalide.';
  end if;

  update public.profiles
     set name = trim(p_name), phone = v_phone,
         avatar_path = case when p_remove_avatar then null else coalesce(v_avatar, avatar_path) end
   where id = p_id;
end; $$;

revoke all on function public.admin_update_member(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.admin_update_member(uuid, text, text, text, boolean) to authenticated;

-- ---------- 4. Ajout d'un membre : la photo peut être dans un dossier ----------
create or replace function public.admin_add_member(
  p_email text, p_role text,
  p_name text default null, p_phone text default null, p_avatar text default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_email  text := lower(trim(p_email));
  v_name   text := nullif(trim(coalesce(p_name, '')), '');
  v_phone  text := nullif(trim(coalesce(p_phone, '')), '');
  v_avatar text := nullif(trim(coalesce(p_avatar, '')), '');
  v_key    text;
  v_id     uuid;
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;
  if p_role not in ('livreur', 'team', 'admin') then
    raise exception 'Rôle invalide.';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Adresse e-mail invalide.';
  end if;
  if v_name is not null and (length(v_name) < 2 or length(v_name) > 100) then
    raise exception 'Le nom doit contenir entre 2 et 100 caractères.';
  end if;
  if v_avatar is not null
     and v_avatar !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,150}(/[A-Za-z0-9][A-Za-z0-9._-]{0,150})?$' then
    raise exception 'Photo invalide.';
  end if;

  select id into v_id from public.profiles where email = v_email;

  if v_phone is not null then
    v_key := public.phone_key(v_phone);
    if length(v_key) < 6 then
      raise exception 'Numéro de téléphone invalide.';
    end if;
    if exists (select 1 from public.profiles where phone_key = v_key and id is distinct from v_id) then
      raise exception 'Ce numéro de téléphone est déjà associé à un autre compte.';
    end if;
  end if;

  if v_id is not null then
    -- guard_profile_role s'applique (pas soi-même, pas le dernier admin).
    update public.profiles
       set role        = p_role,
           name        = coalesce(v_name, name),
           phone       = coalesce(v_phone, phone),
           avatar_path = coalesce(v_avatar, avatar_path)
     where id = v_id;
    return 'promoted';
  end if;

  insert into public.team_invitations (email, role, invited_by, name, phone, avatar_path)
  values (v_email, p_role, auth.uid(), v_name, v_phone, v_avatar)
  on conflict (email) do update
    set role = excluded.role, invited_by = excluded.invited_by, accepted_at = null,
        name = excluded.name, phone = excluded.phone, avatar_path = excluded.avatar_path;
  return 'invited';
end; $$;

revoke all on function public.admin_add_member(text, text, text, text, text) from public, anon;
grant execute on function public.admin_add_member(text, text, text, text, text) to authenticated;
