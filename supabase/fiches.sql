-- Gestion des fiches par l'équipe : ajout, modification, demande de suppression.
-- La suppression définitive reste réservée à l'administrateur (policy providers_delete_admin).
-- À exécuter dans Supabase → SQL Editor (après security_fixes.sql). Relançable sans risque.

alter table public.providers add column if not exists deletion_requested_at timestamptz;
alter table public.providers add column if not exists deletion_requested_by text;
alter table public.providers add column if not exists deletion_reason text;

-- Une fiche dont la suppression est demandée disparaît pour les voyageurs ; l'équipe la voit toujours.
drop policy if exists "providers_read_authenticated" on public.providers;
create policy "providers_read_authenticated" on public.providers
  for select to authenticated using (deletion_requested_at is null or public.is_team());

-- Seul un administrateur peut annuler une demande de suppression (refus de la suppression).
create or replace function public.guard_provider_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- SQL Editor / service
  if tg_op = 'UPDATE'
     and old.deletion_requested_at is not null
     and new.deletion_requested_at is null
     and not public.is_admin() then
    raise exception 'Seul un administrateur peut annuler une demande de suppression.';
  end if;
  return new;
end; $$;

drop trigger if exists guard_provider_deletion on public.providers;
create trigger guard_provider_deletion
  before update on public.providers
  for each row execute function public.guard_provider_deletion();
