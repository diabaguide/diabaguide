-- ============================================================
-- Diaba Guide — Module Fret : factures
-- Une facture par colis : montant dû (fret + stockage + livraison)
-- et statut de paiement. Le paiement se fait hors application ;
-- l'équipe marque « payée ».
--
-- À exécuter APRÈS fret_module.sql et fret_tarifs.sql. Idempotent.
-- ============================================================

create table if not exists public.factures (
  colis_code        text primary key references public.colis(code) on delete cascade,
  montant_fret      numeric(12,2) not null default 0,
  montant_stockage  numeric(12,2) not null default 0,
  montant_livraison numeric(12,2) not null default 0,
  montant_total     numeric(12,2) generated always as (montant_fret + montant_stockage + montant_livraison) stored,
  devise            text not null default 'XOF',
  statut            text not null default 'a_payer' check (statut in ('a_payer', 'payee', 'annulee')),
  emise_le          timestamptz not null default now(),
  payee_le          timestamptz,
  note              text
);

alter table public.factures enable row level security;
drop policy if exists "factures_team_all" on public.factures;
create policy "factures_team_all" on public.factures for all using (public.is_team()) with check (public.is_team());
drop policy if exists "factures_owner_read" on public.factures;
create policy "factures_owner_read" on public.factures for select using (
  exists (select 1 from public.colis c where c.code = factures.colis_code and c.profile_id = auth.uid())
);

-- Émet (ou met à jour) la facture d'un colis : fret calculé + frais éventuels.
create or replace function public.emettre_facture(
  p_colis_code text, p_stockage numeric default 0, p_livraison numeric default 0, p_devise text default 'XOF'
) returns void language plpgsql security definer set search_path = public as $$
declare v_fret numeric;
begin
  if not public.is_team() then raise exception 'Réservé à l’équipe.'; end if;
  v_fret := coalesce(public.calc_fret_colis(p_colis_code, p_devise), 0);
  insert into public.factures (colis_code, montant_fret, montant_stockage, montant_livraison, devise, statut, emise_le)
  values (p_colis_code, v_fret, coalesce(p_stockage,0), coalesce(p_livraison,0), p_devise, 'a_payer', now())
  on conflict (colis_code) do update set
    montant_fret = excluded.montant_fret, montant_stockage = excluded.montant_stockage,
    montant_livraison = excluded.montant_livraison, devise = excluded.devise,
    statut = 'a_payer', emise_le = now(), payee_le = null;
end; $$;
grant execute on function public.emettre_facture(text, numeric, numeric, text) to authenticated;

create or replace function public.marquer_facture_payee(p_colis_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team() then raise exception 'Réservé à l’équipe.'; end if;
  update public.factures set statut = 'payee', payee_le = now() where colis_code = p_colis_code;
end; $$;
grant execute on function public.marquer_facture_payee(text) to authenticated;
