-- ============================================================
-- Diaba Guide — Les étapes de suivi appartiennent aux EXPÉDITIONS
--
-- Avant : chaque colis avait ses propres étapes (colis_etapes).
-- Maintenant : on ajoute une étape à l'expédition (départ, en transit,
-- arrivé à Dakar…) et tous ses colis la suivent. Le voyageur voit les étapes
-- visibles de l'expédition qui transporte son colis.
--
-- colis_etapes n'est plus alimentée par l'application ; la table est
-- conservée telle quelle (aucune donnée perdue).
--
-- Dépend de : fret_module.sql (expeditions, colis, etape_type), livreur.sql
-- (is_fret, is_team). Idempotent.
-- ============================================================

create table if not exists public.expedition_etapes (
  id              uuid primary key default gen_random_uuid(),
  expedition_code text not null references public.expeditions(code) on delete cascade,
  type            etape_type not null,
  au              timestamptz not null default now(),
  visible_client  boolean not null default false,
  note_interne    text,
  par             text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_exp_etapes on public.expedition_etapes(expedition_code, au);

alter table public.expedition_etapes enable row level security;

drop policy if exists "exp_etapes_fret_read" on public.expedition_etapes;
create policy "exp_etapes_fret_read" on public.expedition_etapes
  for select using (public.is_fret());
drop policy if exists "exp_etapes_fret_insert" on public.expedition_etapes;
create policy "exp_etapes_fret_insert" on public.expedition_etapes
  for insert with check (public.is_fret());
drop policy if exists "exp_etapes_fret_update" on public.expedition_etapes;
create policy "exp_etapes_fret_update" on public.expedition_etapes
  for update using (public.is_fret()) with check (public.is_fret());
drop policy if exists "exp_etapes_team_delete" on public.expedition_etapes;
create policy "exp_etapes_team_delete" on public.expedition_etapes
  for delete using (public.is_team());

-- Le voyageur lit les étapes visibles des expéditions qui portent ses colis.
drop policy if exists "exp_etapes_owner_read" on public.expedition_etapes;
create policy "exp_etapes_owner_read" on public.expedition_etapes
  for select using (
    visible_client = true
    and exists (
      select 1 from public.colis c
      where c.expedition_code = expedition_etapes.expedition_code
        and c.profile_id = (select auth.uid())
    )
  );

-- Reprise de l'existant : les étapes d'expédition déjà saisies sur des colis
-- (regroupé, départ, transit, arrivée…) deviennent des étapes de l'expédition.
-- « annonce » et « recu_chine » restent propres au colis, elles ne sont pas reprises.
insert into public.expedition_etapes (expedition_code, type, au, visible_client, note_interne, par)
select distinct on (c.expedition_code, e.type)
       c.expedition_code, e.type, e.au, e.visible_client, e.note_interne, e.par
  from public.colis_etapes e
  join public.colis c on c.code = e.colis_code
 where c.expedition_code is not null
   and e.type not in ('annonce', 'recu_chine')
   and not exists (
     select 1 from public.expedition_etapes x
      where x.expedition_code = c.expedition_code and x.type = e.type)
 order by c.expedition_code, e.type, e.au;

-- Ajoute une étape à une expédition et fait avancer ses colis (et
-- l'expédition elle-même) d'un seul geste, dans la même transaction.
create or replace function public.ajouter_etape_expedition(
  p_code text, p_type etape_type, p_visible boolean default null, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_visible boolean;
  v_colis_statut colis_statut;
  v_exp_statut expedition_statut;
begin
  if not public.is_fret() then
    raise exception 'Réservé à l’équipe fret.';
  end if;
  if not exists (select 1 from public.expeditions where code = p_code) then
    raise exception 'Expédition introuvable.';
  end if;
  if p_type in ('annonce', 'recu_chine') then
    raise exception 'Cette étape concerne un colis, pas une expédition.';
  end if;

  -- Visibilité par défaut : ce que le voyageur doit savoir.
  v_visible := coalesce(p_visible, p_type in ('en_transit', 'arrive_dakar', 'dispo_retrait', 'en_livraison', 'remis'));

  insert into public.expedition_etapes (expedition_code, type, visible_client, note_interne, par)
  values (p_code, p_type, v_visible, nullif(trim(coalesce(p_note, '')), ''),
          (select name from public.profiles where id = auth.uid()));

  v_colis_statut := case p_type
    when 'regroupe'      then 'affecte'
    when 'depart'        then 'en_transit'
    when 'en_transit'    then 'en_transit'
    when 'arrive_dakar'  then 'arrive_dakar'
    when 'chez_diaba'    then 'arrive_dakar'
    when 'dispo_retrait' then 'dispo_retrait'
    when 'en_livraison'  then 'en_livraison'
    when 'remis'         then 'remis'
  end;
  update public.colis
     set statut = v_colis_statut, updated_at = now()
   where expedition_code = p_code and statut <> 'probleme';

  v_exp_statut := case p_type
    when 'regroupe'      then 'cloturee'
    when 'depart'        then 'partie'
    when 'en_transit'    then 'partie'
    when 'arrive_dakar'  then 'arrivee'
    when 'chez_diaba'    then 'arrivee'
    when 'remis'         then 'livree'
  end;
  if v_exp_statut is not null then
    update public.expeditions
       set statut = v_exp_statut,
           cloturee_le = case when v_exp_statut = 'cloturee' then now() else cloturee_le end,
           partie_le   = case when v_exp_statut = 'partie'   then coalesce(partie_le, now()) else partie_le end,
           arrivee_le  = case when v_exp_statut = 'arrivee'  then coalesce(arrivee_le, now()) else arrivee_le end,
           updated_at  = now()
     where code = p_code;
  end if;
end; $$;

revoke all on function public.ajouter_etape_expedition(text, etape_type, boolean, text) from public, anon;
grant execute on function public.ajouter_etape_expedition(text, etape_type, boolean, text) to authenticated;
