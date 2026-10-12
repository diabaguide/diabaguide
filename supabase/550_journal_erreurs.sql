-- ============================================================
-- Diaba Guide — Journal des erreurs de l'application
--
-- But : apprendre qu'une page plante chez un voyageur sans attendre qu'il écrive. L'application
-- note elle-même ses erreurs inattendues (jamais les coupures de réseau, qui ne sont pas des
-- bugs) : message, page, navigateur, et au plus quelques lignes de détail.
--
-- Une ligne par erreur DIFFÉRENTE (message + page) : une erreur qui se répète incrémente un
-- compteur au lieu de remplir la table. Une erreur marquée résolue qui revient est rouverte.
--
-- Ce que ce journal contient : un identifiant de compte éventuel, le message technique, la page
-- et le navigateur. Aucun mot de passe, aucun jeton, aucune donnée saisie par le voyageur.
--
-- Sûreté :
--   - écriture ouverte à tous (un visiteur déconnecté peut signaler un plantage) mais bornée :
--     messages tronqués, et au plus 300 nouvelles erreurs différentes par heure ;
--   - lecture et suivi réservés à l'administration.
--
-- Dépend de : 020_auth.sql (is_admin). Idempotent.
-- ============================================================

create table if not exists public.error_events (
  id            bigserial primary key,
  empreinte     text not null unique,
  message       text not null,
  detail        text,
  page          text,
  appareil      text,
  user_id       uuid references auth.users(id) on delete set null,
  occurrences   integer not null default 1,
  premiere_fois timestamptz not null default now(),
  derniere_fois timestamptz not null default now(),
  resolue       boolean not null default false
);

create index if not exists error_events_recentes_idx on public.error_events (resolue, derniere_fois desc);

alter table public.error_events enable row level security;

drop policy if exists "error_events_lecture_admin" on public.error_events;
create policy "error_events_lecture_admin" on public.error_events
  for select to authenticated using (public.is_admin());

-- Aucune écriture directe : tout passe par les fonctions ci-dessous.
revoke all on public.error_events from public, anon, authenticated;
grant select on public.error_events to authenticated;
revoke all on sequence public.error_events_id_seq from public, anon, authenticated;

-- ---------- Signalement par l'application ----------
create or replace function public.log_error_event(
  p_message text, p_detail text default null, p_page text default null, p_appareil text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_msg  text := left(btrim(coalesce(p_message, '')), 300);
  v_page text := left(btrim(coalesce(p_page, '')), 120);
  v_emp  text;
begin
  if v_msg = '' then return; end if;
  v_emp := md5(v_msg || '|' || v_page);

  -- Garde-fou : une avalanche d'erreurs toutes différentes ne doit pas remplir la table.
  if not exists (select 1 from public.error_events where empreinte = v_emp)
     and (select count(*) from public.error_events where premiere_fois > now() - interval '1 hour') >= 300 then
    return;
  end if;

  insert into public.error_events (empreinte, message, detail, page, appareil, user_id)
  values (v_emp, v_msg, left(coalesce(p_detail, ''), 1500), v_page, left(coalesce(p_appareil, ''), 200), auth.uid())
  on conflict (empreinte) do update
     set occurrences   = public.error_events.occurrences + 1,
         derniere_fois = now(),
         resolue       = false,
         user_id       = coalesce(auth.uid(), public.error_events.user_id);
end; $$;

revoke all on function public.log_error_event(text, text, text, text) from public;
grant execute on function public.log_error_event(text, text, text, text) to anon, authenticated;

-- ---------- Suivi par l'administration ----------
create or replace function public.admin_maj_erreur(p_id bigint, p_resolue boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  update public.error_events set resolue = coalesce(p_resolue, resolue) where id = p_id;
  if not found then raise exception 'Erreur introuvable'; end if;
end; $$;

-- Ménage : supprime les erreurs résolues depuis plus de p_jours jours. Rend le nombre supprimé.
create or replace function public.admin_purger_erreurs(p_jours integer default 30)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  delete from public.error_events
   where resolue and derniere_fois < now() - make_interval(days => greatest(coalesce(p_jours, 30), 1));
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

revoke all on function public.admin_maj_erreur(bigint, boolean) from public, anon;
revoke all on function public.admin_purger_erreurs(integer) from public, anon;
grant execute on function public.admin_maj_erreur(bigint, boolean) to authenticated;
grant execute on function public.admin_purger_erreurs(integer) to authenticated;
