-- Caractéristiques particulières d'un colis, cochées par le voyageur à l'annonce.
alter table public.colis add column if not exists caracteristiques text[] not null default '{}';

alter table public.colis drop constraint if exists colis_caracteristiques_valides;
alter table public.colis add constraint colis_caracteristiques_valides
  check (caracteristiques <@ array['fragile', 'batterie', 'inflammable', 'liquide']::text[]);

grant select (caracteristiques) on public.colis to authenticated;
