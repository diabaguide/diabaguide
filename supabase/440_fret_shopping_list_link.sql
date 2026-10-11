-- Lie facultativement une annonce de colis à la liste d'achats qui l'a préparée.
-- Migration additive compatible avec le modèle fret actuel (colis/expeditions).

alter table public.colis
  add column if not exists shopping_list_id uuid
  references public.shopping_lists(id) on delete set null;

create index if not exists colis_shopping_list_id_idx
  on public.colis(shopping_list_id)
  where shopping_list_id is not null;

-- Un voyageur ne peut rattacher son annonce qu'à l'une de ses propres listes.
drop policy if exists colis_owner_insert on public.colis;
create policy colis_owner_insert on public.colis
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and expedition_code is null
    and statut = 'annonce'::public.colis_statut
    and (
      shopping_list_id is null
      or exists (
        select 1
        from public.shopping_lists l
        where l.id = shopping_list_id
          and l.user_id = (select auth.uid())
      )
    )
  );

comment on column public.colis.shopping_list_id is
  'Liste d’achats voyageur ayant servi à préparer l’annonce du colis.';

grant select (shopping_list_id), insert (shopping_list_id)
  on public.colis to authenticated;
