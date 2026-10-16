-- ============================================================
-- Diaba Guide — Prix, halal et cuisine des fiches (audit UX, phase 2B)
--
-- Ajoute quatre colonnes FACULTATIVES à public.providers. Aucune donnée existante
-- n'est modifiée ni supprimée ; aucune valeur n'est inventée : une fiche sans
-- information reste vide, et l'application masque alors la ligne correspondante.
--
--   price_level  1, 2 ou 3  (¥, ¥¥, ¥¥¥)        — hôtels et restaurants
--   price_night  prix indicatif d'une nuit, en ¥ — hôtels
--   halal_status confirmed | unverified | no     — restaurants
--   cuisine_type africaine | chinoise | arabe | autre — restaurants
--
-- Les politiques de sécurité (RLS) de providers s'appliquent déjà à toute la ligne :
-- rien à ajouter. À exécuter une seule fois dans l'éditeur SQL de Supabase.
--
-- RETOUR ARRIÈRE (rollback), si nécessaire :
--   alter table public.providers
--     drop column if exists price_level,  drop column if exists price_night,
--     drop column if exists halal_status, drop column if exists cuisine_type;
-- ============================================================

alter table public.providers add column if not exists price_level  smallint;
alter table public.providers add column if not exists price_night  integer;
alter table public.providers add column if not exists halal_status text;
alter table public.providers add column if not exists cuisine_type text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'providers_price_level_chk') then
    alter table public.providers add constraint providers_price_level_chk
      check (price_level between 1 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'providers_price_night_chk') then
    alter table public.providers add constraint providers_price_night_chk
      check (price_night between 1 and 100000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'providers_halal_status_chk') then
    alter table public.providers add constraint providers_halal_status_chk
      check (halal_status in ('confirmed', 'unverified', 'no'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'providers_cuisine_type_chk') then
    alter table public.providers add constraint providers_cuisine_type_chk
      check (cuisine_type in ('africaine', 'chinoise', 'arabe', 'autre'));
  end if;
end $$;

notify pgrst, 'reload schema';
