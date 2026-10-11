-- Ville de départ (en Chine) d'un colis annoncé : id de la table des villes (ex. 'guangzhou').
alter table public.colis add column if not exists ville_depart text;

grant select (ville_depart) on public.colis to authenticated;
