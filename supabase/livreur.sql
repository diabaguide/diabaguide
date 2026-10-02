-- ============================================================
-- Diaba Guide — Rôle « livreur » : accès au seul module fret
--
-- Le livreur gère les expéditions, les colis et les voyageurs concernés.
-- Il n'a accès à rien d'autre (fiches, propositions, avis, recherches,
-- annonces, comptes) : ces données restent protégées par is_team(), qui ne
-- couvre PAS le livreur. Le fret passe par is_fret(), qui le couvre.
--
-- Ce que le livreur ne peut pas faire (réservé à l'équipe et aux admins) :
--   - supprimer une expédition, un colis, une étape ou une photo ;
--   - émettre une facture (il peut la consulter et la marquer payée) ;
--   - modifier les tarifs ou les entrepôts.
--
-- Dépend de : admin_roles.sql (is_team, is_admin), fret_module.sql,
-- fret_tarifs.sql, fret_factures.sql, fret_clients.sql, fret_lot2b.sql.
-- Idempotent.
-- ============================================================

-- ---------- 1. Le rôle ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('traveler', 'livreur', 'team', 'admin'));

alter table public.team_invitations drop constraint if exists team_invitations_role_check;
alter table public.team_invitations
  add constraint team_invitations_role_check check (role in ('livreur', 'team', 'admin'));

-- ---------- 2. Helper : la personne a-t-elle accès au fret ? ----------
create or replace function public.is_fret()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('livreur', 'team', 'admin'));
$$;

-- ---------- 3. Expéditions, colis, étapes ----------
-- Lecture, création et modification : fret. Suppression : équipe.
drop policy if exists "expeditions_team_all"     on public.expeditions;
drop policy if exists "expeditions_fret_read"    on public.expeditions;
drop policy if exists "expeditions_fret_insert"  on public.expeditions;
drop policy if exists "expeditions_fret_update"  on public.expeditions;
drop policy if exists "expeditions_team_delete"  on public.expeditions;
create policy "expeditions_fret_read"   on public.expeditions for select using (public.is_fret());
create policy "expeditions_fret_insert" on public.expeditions for insert with check (public.is_fret());
create policy "expeditions_fret_update" on public.expeditions for update using (public.is_fret()) with check (public.is_fret());
create policy "expeditions_team_delete" on public.expeditions for delete using (public.is_team());

drop policy if exists "colis_team_all"     on public.colis;
drop policy if exists "colis_fret_read"    on public.colis;
drop policy if exists "colis_fret_insert"  on public.colis;
drop policy if exists "colis_fret_update"  on public.colis;
drop policy if exists "colis_team_delete"  on public.colis;
create policy "colis_fret_read"   on public.colis for select using (public.is_fret());
create policy "colis_fret_insert" on public.colis for insert with check (public.is_fret());
create policy "colis_fret_update" on public.colis for update using (public.is_fret()) with check (public.is_fret());
create policy "colis_team_delete" on public.colis for delete using (public.is_team());

drop policy if exists "etapes_team_all"     on public.colis_etapes;
drop policy if exists "etapes_fret_read"    on public.colis_etapes;
drop policy if exists "etapes_fret_insert"  on public.colis_etapes;
drop policy if exists "etapes_fret_update"  on public.colis_etapes;
drop policy if exists "etapes_team_delete"  on public.colis_etapes;
create policy "etapes_fret_read"   on public.colis_etapes for select using (public.is_fret());
create policy "etapes_fret_insert" on public.colis_etapes for insert with check (public.is_fret());
create policy "etapes_fret_update" on public.colis_etapes for update using (public.is_fret()) with check (public.is_fret());
create policy "etapes_team_delete" on public.colis_etapes for delete using (public.is_team());

-- ---------- 4. Factures ----------
-- Lecture : fret. Écriture directe : équipe. Le livreur marque une facture
-- payée par marquer_facture_payee() (ci-dessous), jamais en écrivant la table.
drop policy if exists "factures_team_all"   on public.factures;
drop policy if exists "factures_fret_read"  on public.factures;
drop policy if exists "factures_team_write" on public.factures;
create policy "factures_fret_read"  on public.factures for select using (public.is_fret());
create policy "factures_team_write" on public.factures for all using (public.is_team()) with check (public.is_team());

create or replace function public.marquer_facture_payee(p_colis_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_fret() then raise exception 'Réservé à l’équipe fret.'; end if;
  update public.factures set statut = 'payee', payee_le = now() where colis_code = p_colis_code;
end; $$;

-- emettre_facture reste réservée à l'équipe (is_team), inchangée.

-- ---------- 5. Tarifs : consultation ----------
drop policy if exists "tarifs_fret_team_read"    on public.tarifs_fret;
drop policy if exists "tarifs_fret_fret_read"    on public.tarifs_fret;
create policy "tarifs_fret_fret_read" on public.tarifs_fret for select using (public.is_fret());

drop policy if exists "tarifs_annexes_team_read" on public.tarifs_annexes;
drop policy if exists "tarifs_annexes_fret_read" on public.tarifs_annexes;
create policy "tarifs_annexes_fret_read" on public.tarifs_annexes for select using (public.is_fret());

create or replace function public.calc_fret_colis(p_code text, p_devise text default 'XOF')
returns numeric language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select mode, poids_kg, volume_m3, type_marchandise, profile_id into c from public.colis where code = p_code;
  if not found then return null; end if;
  if not public.is_fret() and c.profile_id is distinct from auth.uid() then
    raise exception 'Accès refusé à ce colis.';
  end if;
  return public.calc_fret(c.mode, c.type_marchandise, c.poids_kg, c.volume_m3, p_devise);
end; $$;

-- ---------- 6. Voyageurs ----------
-- Recherche d'un voyageur pour lui rattacher un colis.
create or replace function public.rechercher_clients(p_q text default '')
returns table(id uuid, name text, phone text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.phone
  from public.profiles p
  where public.is_fret()
    and p.role = 'traveler'
    and (coalesce(p_q, '') = ''
         or p.name  ilike '%' || p_q || '%'
         or p.phone ilike '%' || p_q || '%'
         or p.email ilike '%' || p_q || '%')
  order by p.name nulls last
  limit 20;
$$;

-- Voyageurs concernés par le fret : ceux qui ont au moins un colis.
-- Le livreur ne lit jamais la table profiles directement.
create or replace function public.fret_voyageurs(p_q text default '')
returns table(id uuid, name text, phone text, nb_colis bigint, colis_en_cours bigint, dernier_colis timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.phone,
         count(c.code),
         count(c.code) filter (where c.statut <> 'remis'),
         max(c.created_at)
  from public.profiles p
  join public.colis c on c.profile_id = p.id
  where public.is_fret()
    and (coalesce(p_q, '') = ''
         or p.name  ilike '%' || p_q || '%'
         or p.phone ilike '%' || p_q || '%')
  group by p.id, p.name, p.phone
  order by max(c.created_at) desc
  limit 200;
$$;

revoke all on function public.fret_voyageurs(text) from public, anon;
grant execute on function public.fret_voyageurs(text) to authenticated;

-- ---------- 7. Photos du fret ----------
drop policy if exists "fret_photos_insert_team" on storage.objects;
drop policy if exists "fret_photos_insert_fret" on storage.objects;
create policy "fret_photos_insert_fret" on storage.objects
  for insert to authenticated with check (bucket_id = 'fret-photos' and public.is_fret());
-- fret_photos_delete_team (is_team) reste inchangée : le livreur ne supprime pas.

-- ---------- 8. Ajout d'un membre : le rôle livreur est accepté ----------
create or replace function public.admin_add_member(p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
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

  select id into v_id from public.profiles where email = v_email;
  if v_id is not null then
    -- guard_profile_role s'applique (pas soi-même, pas le dernier admin).
    update public.profiles set role = p_role where id = v_id;
    return 'promoted';
  end if;

  insert into public.team_invitations (email, role, invited_by)
  values (v_email, p_role, auth.uid())
  on conflict (email) do update
    set role = excluded.role, invited_by = excluded.invited_by, accepted_at = null;
  return 'invited';
end; $$;
