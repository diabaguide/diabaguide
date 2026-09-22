-- ============================================================
-- Diaba Guide — Numéro de téléphone obligatoire à l'inscription
-- Ajoute la colonne phone à profiles et la renseigne à la création du
-- compte, à partir des métadonnées d'inscription (voir src/lib/auth.ts).
-- À exécuter après admin_roles.sql (redéfinit son trigger). Idempotent.
-- ============================================================

alter table public.profiles add column if not exists phone text;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare invited_role text;
begin
  select role into invited_role from public.team_invitations
   where lower(email) = lower(new.email) and accepted_at is null;

  insert into public.profiles (id, name, phone, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone',
    new.email,
    coalesce(invited_role, 'traveler')   -- plus aucune règle basée sur l'e-mail
  )
  on conflict (id) do nothing;

  if invited_role is not null then
    update public.team_invitations set accepted_at = now()
     where lower(email) = lower(new.email);
  end if;
  return new;
end; $$;
