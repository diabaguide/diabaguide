-- ============================================================
-- Diaba Guide — Nom, téléphone et photo de profil à l'ajout d'un membre
--
-- Depuis la page Membres, l'administrateur renseigne en plus de l'e-mail et
-- du rôle : le nom complet, le téléphone (avec indicatif) et une photo.
--   - compte déjà existant : le rôle est appliqué et les champs renseignés
--     complètent le profil ;
--   - personne pas encore inscrite : les champs sont gardés avec l'invitation
--     et appliqués à sa première inscription (handle_new_user).
--
-- Dépend de : admin_roles.sql, phone_signup.sql, livreur.sql. Idempotent.
-- ============================================================

-- ---------- 1. Colonnes ----------
alter table public.profiles         add column if not exists avatar_path text;
alter table public.team_invitations add column if not exists name        text;
alter table public.team_invitations add column if not exists phone       text;
alter table public.team_invitations add column if not exists avatar_path text;

-- ---------- 2. Stockage des photos de profil ----------
-- Bucket privé, lecture par tout compte connecté (affichage dans les listes),
-- écriture et suppression réservées aux administrateurs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select" on storage.objects;
create policy "avatars_select" on storage.objects
  for select to authenticated using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_admin" on storage.objects;
create policy "avatars_insert_admin" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and public.is_admin());

drop policy if exists "avatars_delete_admin" on storage.objects;
create policy "avatars_delete_admin" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and public.is_admin());

-- ---------- 3. Ajout d'un membre ----------
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
  if v_avatar is not null and v_avatar !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$' then
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

-- ---------- 4. Inscription : l'invitation complète le profil ----------
-- Le nom de l'invitation prime (l'administrateur sait qui il invite) ; le
-- téléphone saisi à l'inscription reste prioritaire, car c'est l'identifiant
-- de connexion ; celui de l'invitation sert de repli.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  invited_role   text;
  invited_name   text;
  invited_phone  text;
  invited_avatar text;
  v_tel text := coalesce(nullif(btrim(new.raw_user_meta_data->>'phone'), ''), '');
  v_key text;
begin
  if v_tel = '' and new.email like 'p%@diabaguide.local' then
    v_tel := public.phone_display(split_part(new.email, '@', 1));
  end if;

  select role, name, phone, avatar_path
    into invited_role, invited_name, invited_phone, invited_avatar
    from public.team_invitations
   where lower(email) = lower(new.email) and accepted_at is null;

  if v_tel = '' and invited_phone is not null then v_tel := invited_phone; end if;
  v_key := public.phone_key(v_tel);

  if v_key <> '' and exists (select 1 from public.profiles where phone_key = v_key) then
    raise exception 'Ce numéro de téléphone est déjà associé à un compte.'
      using errcode = 'unique_violation';
  end if;

  insert into public.profiles (id, name, phone, email, role, avatar_path)
  values (
    new.id,
    coalesce(invited_name,
             nullif(btrim(new.raw_user_meta_data->>'name'), ''),
             case when v_key <> '' then public.phone_display(v_tel) else split_part(new.email, '@', 1) end),
    nullif(btrim(v_tel), ''),
    new.email,
    coalesce(invited_role, 'traveler'),
    invited_avatar
  )
  on conflict (id) do nothing;

  if invited_role is not null then
    update public.team_invitations set accepted_at = now()
     where lower(email) = lower(new.email);
  end if;
  return new;
end; $$;
