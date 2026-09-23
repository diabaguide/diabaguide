-- ============================================================
-- Diaba Guide — Journal de session
--
-- But : comprendre pourquoi une connexion n'est pas conservée d'une visite à
-- l'autre. Deux causes possibles, opposées, et impossibles à distinguer de
-- l'extérieur :
--   • le stockage du navigateur a été vidé (téléphone, mode privé, protection
--     contre le pistage) : au démarrage, AUCUNE clé de session n'est présente ;
--   • le stockage est intact mais le renouvellement du jeton est refusé
--     (jeton vu comme réutilisé, session révoquée) : la clé est présente et la
--     session est vide.
--
-- L'application écrit donc, à chaque démarrage, ce qu'elle constate.
--
-- Ce que ce journal contient : un identifiant de compte éventuel, un mot
-- d'événement, et le navigateur utilisé. Aucun mot de passe, aucun jeton,
-- aucune donnée de voyageur. Il est lisible uniquement par l'administration
-- (aucune politique de lecture : le tableau n'est pas exposé par l'API).
-- ============================================================

create table if not exists public.session_events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  evenement text not null,
  detail text,
  appareil text,
  created_at timestamptz not null default now()
);

create index if not exists session_events_recent_idx on public.session_events (created_at desc);

alter table public.session_events enable row level security;

-- Écriture ouverte (un voyageur déconnecté doit pouvoir signaler son propre
-- démarrage), lecture fermée : le tableau n'est consultable qu'en administration.
drop policy if exists session_events_insert on public.session_events;
create policy session_events_insert on public.session_events
  for insert to anon, authenticated with check (true);

create or replace function public.log_session_event(
  p_evenement text,
  p_detail text default null,
  p_appareil text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_evenement is null or length(btrim(p_evenement)) = 0 or length(p_evenement) > 40 then
    return;  -- rien d'exploitable : on n'écrit pas
  end if;
  insert into public.session_events (user_id, evenement, detail, appareil)
  values (
    auth.uid(),
    btrim(p_evenement),
    left(coalesce(p_detail, ''), 300),
    left(coalesce(p_appareil, ''), 200)
  );
end $$;

revoke all on function public.log_session_event(text, text, text) from public;
grant execute on function public.log_session_event(text, text, text) to anon, authenticated;

/** Ménage : le journal ne sert qu'au diagnostic, on le garde 30 jours. */
create or replace function public.purge_session_events(p_jours int default 30)
returns integer language plpgsql security definer set search_path = public as $$
declare supprimes integer;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.session_events where created_at < now() - make_interval(days => greatest(coalesce(p_jours, 30), 1));
  get diagnostics supprimes = row_count;
  return supprimes;
end $$;

revoke all on function public.purge_session_events(int) from public;
-- Supabase accorde l'exécution aux rôles anon/authenticated par défaut : on la
-- retire explicitement à anon (le ménage est réservé à l'administration).
revoke all on function public.purge_session_events(int) from anon;
grant execute on function public.purge_session_events(int) to authenticated;
