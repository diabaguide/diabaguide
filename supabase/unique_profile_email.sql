-- ============================================================
-- Diaba Guide — Unicité de l'e-mail par compte
-- Filet de sécurité en base : deux voyageurs ne doivent jamais partager la
-- même adresse e-mail. auth.users l'impose déjà à l'inscription (et
-- src/lib/auth.ts rejette désormais explicitement les doublons côté
-- client), mais profiles n'avait pas sa propre contrainte.
-- À exécuter après auth.sql. Idempotent.
-- ============================================================

drop index if exists public.profiles_email_unique;
create unique index profiles_email_unique on public.profiles (lower(email));
