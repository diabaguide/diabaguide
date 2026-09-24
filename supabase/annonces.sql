-- ============================================================
-- Diaba Guide — Annonces de services
-- L'équipe rédige des annonces (fret Chine → Sénégal, livraison à
-- Dakar, …) affichées sur le tableau de bord des voyageurs.
-- À exécuter après auth.sql (is_team(), is_admin(), profiles) et
-- shopping_lists.sql (touch_updated_at). Idempotent : relançable sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Les annonces
--    Un titre, un texte, un lien d'action facultatif (URL + libellé
--    du bouton), un état actif/inactif, une période facultative
--    (date de début / date de fin) et la trace de son auteur.
--    Pas d'image en v1 : le téléversement Storage est un module à part.
-- ------------------------------------------------------------
create table if not exists public.annonces (
  id           uuid primary key default gen_random_uuid(),
  titre        text not null,
  texte        text not null,
  lien_url     text,                                    -- facultatif : URL du bouton
  lien_libelle text,                                    -- libellé du bouton, avec l'URL
  actif        boolean not null default true,
  debut_le     date,                                    -- facultative : hors période, invisible
  fin_le       date,                                    -- facultative : hors période, invisible
  auteur_id    uuid references auth.users(id) on delete set null,
  auteur       text,                                    -- nom figé à la rédaction
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Contraintes posées à part, sous leur nom : « create table if not
-- exists » ne les ajouterait pas à une table créée par une première
-- exécution interrompue avant elles.
alter table public.annonces drop constraint if exists annonces_titre_check;
alter table public.annonces add constraint annonces_titre_check
  check (char_length(btrim(titre)) between 1 and 120);

alter table public.annonces drop constraint if exists annonces_texte_check;
alter table public.annonces add constraint annonces_texte_check
  check (char_length(btrim(texte)) between 1 and 2000);

-- Un lien d'action se présente toujours avec son libellé de bouton :
-- sans lui, le voyageur verrait un bouton sans intitulé.
alter table public.annonces drop constraint if exists annonces_lien_check;
alter table public.annonces add constraint annonces_lien_check
  check (lien_url is null
         or (btrim(lien_url) <> '' and lien_libelle is not null and btrim(lien_libelle) <> ''));

-- Une fin avant le début rendrait l'annonce invisible : on la refuse.
alter table public.annonces drop constraint if exists annonces_periode_check;
alter table public.annonces add constraint annonces_periode_check
  check (fin_le is null or debut_le is null or fin_le >= debut_le);

-- Les annonces visibles, les plus récentes d'abord (voir la politique RLS).
create index if not exists annonces_visibles_idx
  on public.annonces (actif, debut_le, fin_le, created_at desc);

-- updated_at tenu par la base, jamais par le client.
drop trigger if exists on_annonce_update on public.annonces;
create trigger on_annonce_update
  before update on public.annonces
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 2. Accès
--    Lecture : l'équipe voit TOUT (y compris les annonces inactives,
--    pour la console) ; le voyageur ne voit que les annonces actives
--    et dans leur période.
--    Écriture : AUCUNE politique → uniquement les fonctions admin_*
--    (security definer). Un voyageur ne peut pas écrire.
-- ------------------------------------------------------------
alter table public.annonces enable row level security;

drop policy if exists "annonces_lecture" on public.annonces;
create policy "annonces_lecture" on public.annonces
  for select to authenticated using (
    public.is_team()
    or (actif
        and (debut_le is null or debut_le <= current_date)
        and (fin_le is null or fin_le >= current_date))
  );

-- Supabase accorde « all » aux rôles de l'API sur toute table créée dans
-- public : on le retire explicitement, puis on n'accorde que la lecture.
-- Sans ce revoke, un voyageur pourrait écrire directement dans la table.
revoke all on public.annonces from public, anon, authenticated;
grant select on public.annonces to authenticated;

-- ------------------------------------------------------------
-- 3. Nom de l'auteur, figé à la rédaction
--    La trace survit à la suppression du compte (auteur_id passe à
--    null, le nom reste). Fonction interne : non accordée à l'API.
-- ------------------------------------------------------------
create or replace function public.auteur_courant()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(p.name), ''), p.email, 'Équipe Diaba')
    from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.auteur_courant() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Création d'une annonce (administration uniquement)
-- ------------------------------------------------------------
create or replace function public.admin_creer_annonce(
  p_titre        text,
  p_texte        text,
  p_lien_url     text    default null,
  p_lien_libelle text    default null,
  p_actif        boolean default true,
  p_debut_le     date    default null,
  p_fin_le       date    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid;
  v_titre text := btrim(coalesce(p_titre, ''));
  v_texte text := btrim(coalesce(p_texte, ''));
  v_url   text := nullif(btrim(coalesce(p_lien_url, '')), '');
  v_lbl   text := nullif(btrim(coalesce(p_lien_libelle, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  if v_titre = '' then
    raise exception 'Renseignez le titre de l''annonce.';
  end if;
  if char_length(v_titre) > 120 then
    raise exception 'Le titre ne doit pas dépasser 120 caractères.';
  end if;
  if v_texte = '' then
    raise exception 'Renseignez le texte de l''annonce.';
  end if;
  if char_length(v_texte) > 2000 then
    raise exception 'Le texte ne doit pas dépasser 2000 caractères.';
  end if;
  if p_fin_le is not null and p_debut_le is not null and p_fin_le < p_debut_le then
    raise exception 'La date de fin précède la date de début.';
  end if;
  -- Un lien sans libellé s'afficherait sans intitulé ; l'inverse (libellé
  -- sans lien) ne mènerait nulle part : les deux vont ensemble ou pas du tout.
  if v_url is null then
    v_lbl := null;
  elsif v_lbl is null then
    v_lbl := 'En savoir plus';
  end if;

  insert into public.annonces
    (titre, texte, lien_url, lien_libelle, actif, debut_le, fin_le, auteur_id, auteur)
  values
    (v_titre, v_texte, v_url, v_lbl, coalesce(p_actif, true), p_debut_le, p_fin_le,
     auth.uid(), public.auteur_courant())
  returning annonces.id into v_id;

  return v_id;
end; $$;

revoke all on function public.admin_creer_annonce(text, text, text, text, boolean, date, date) from public, anon;
grant execute on function public.admin_creer_annonce(text, text, text, text, boolean, date, date) to authenticated;

-- ------------------------------------------------------------
-- 5. Mise à jour d'une annonce (administration uniquement)
--    Un paramètre nul laisse la colonne inchangée : la console
--    n'envoie que ce qu'elle modifie. Deux exceptions explicites,
--    parce qu'un NULL ne peut pas dire « efface » :
--      • p_remplacer_lien    → l'URL et le libellé deviennent ceux
--                              transmis (vides = retirés) ;
--      • p_remplacer_periode → le début et la fin deviennent ceux
--                              transmis (vides = retirés). C'est le
--                              seul moyen d'effacer une date : sans
--                              ce drapeau, un début vide garderait
--                              l'ancienne date.
-- ------------------------------------------------------------
create or replace function public.admin_maj_annonce(
  p_id                uuid,
  p_titre             text    default null,
  p_texte             text    default null,
  p_lien_url          text    default null,
  p_lien_libelle      text    default null,
  p_actif             boolean default null,
  p_debut_le          date    default null,
  p_fin_le            date    default null,
  p_remplacer_lien    boolean default false,
  p_remplacer_periode boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_titre text;
  v_texte text;
  v_url   text;
  v_lbl   text;
  v_debut date;
  v_fin   date;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;

  select titre, texte, lien_url, lien_libelle, debut_le, fin_le
    into v_titre, v_texte, v_url, v_lbl, v_debut, v_fin
    from public.annonces where id = p_id;
  if not found then
    raise exception 'Annonce introuvable';
  end if;

  if p_titre is not null then v_titre := btrim(p_titre); end if;
  if p_texte is not null then v_texte := btrim(p_texte); end if;

  if p_remplacer_lien then
    v_url := nullif(btrim(coalesce(p_lien_url, '')), '');
    v_lbl := nullif(btrim(coalesce(p_lien_libelle, '')), '');
  end if;

  if p_remplacer_periode then
    v_debut := p_debut_le;
    v_fin   := p_fin_le;
  end if;

  if v_titre = '' then
    raise exception 'Renseignez le titre de l''annonce.';
  end if;
  if char_length(v_titre) > 120 then
    raise exception 'Le titre ne doit pas dépasser 120 caractères.';
  end if;
  if v_texte = '' then
    raise exception 'Renseignez le texte de l''annonce.';
  end if;
  if char_length(v_texte) > 2000 then
    raise exception 'Le texte ne doit pas dépasser 2000 caractères.';
  end if;
  if v_fin is not null and v_debut is not null and v_fin < v_debut then
    raise exception 'La date de fin précède la date de début.';
  end if;
  if v_url is null then
    v_lbl := null;
  elsif v_lbl is null then
    v_lbl := 'En savoir plus';
  end if;

  update public.annonces set
    titre        = v_titre,
    texte        = v_texte,
    lien_url     = v_url,
    lien_libelle = v_lbl,
    actif        = coalesce(p_actif, actif),
    debut_le     = v_debut,
    fin_le       = v_fin
  where id = p_id;
end; $$;

revoke all on function public.admin_maj_annonce(uuid, text, text, text, text, boolean, date, date, boolean, boolean) from public, anon;
grant execute on function public.admin_maj_annonce(uuid, text, text, text, text, boolean, date, date, boolean, boolean) to authenticated;

-- ------------------------------------------------------------
-- 6. Suppression d'une annonce (administration uniquement)
-- ------------------------------------------------------------
create or replace function public.admin_supprimer_annonce(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  delete from public.annonces where id = p_id;
  if not found then
    raise exception 'Annonce introuvable';
  end if;
end; $$;

revoke all on function public.admin_supprimer_annonce(uuid) from public, anon;
grant execute on function public.admin_supprimer_annonce(uuid) to authenticated;