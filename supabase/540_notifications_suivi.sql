-- ============================================================
-- Diaba Guide — Notifications de suivi d'envoi
--
-- Quand l'équipe ajoute à une expédition une étape VISIBLE du voyageur (en transit,
-- arrivé à Dakar, disponible au retrait, en livraison, remis…), chaque voyageur qui a un
-- colis dans cette expédition reçoit une notification dans l'application (cloche, pastille
-- sur « Mes envois », page « Notifications »).
--
-- Une notification par voyageur et par étape, même s'il a plusieurs colis dans l'expédition
-- (les codes de ses colis sont regroupés). Une étape rendue visible plus tard déclenche la
-- notification à ce moment-là, une seule fois.
--
-- Sûreté :
--   - le voyageur ne lit que SES notifications et ne peut rien écrire directement ;
--     il les marque comme lues via une fonction qui ne touche qu'à ses propres lignes ;
--   - la création de la notification ne peut jamais bloquer l'équipe : une erreur dans le
--     déclencheur est transformée en simple avertissement.
--
-- Dépend de : 240_fret_module.sql (colis, etape_type), 330_expedition_etapes.sql.
-- Idempotent.
-- ============================================================

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  etape_id        uuid references public.expedition_etapes(id) on delete cascade,
  etape_type      text not null,
  expedition_code text,
  colis_codes     text[] not null default '{}',
  lu_le           timestamptz,
  created_at      timestamptz not null default now()
);

-- Une seule notification par voyageur et par étape.
create unique index if not exists notifications_profil_etape_uniq
  on public.notifications (profile_id, etape_id);
create index if not exists notifications_profil_recent_idx
  on public.notifications (profile_id, created_at desc);
create index if not exists notifications_non_lues_idx
  on public.notifications (profile_id) where lu_le is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_lecture_perso" on public.notifications;
create policy "notifications_lecture_perso" on public.notifications
  for select to authenticated using (profile_id = (select auth.uid()));

-- Aucune écriture directe : ni le voyageur, ni l'API.
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;

-- ---------- Création, à chaque étape visible ----------
create or replace function public.notifier_etape()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.visible_client then return new; end if;
  if tg_op = 'UPDATE' and old.visible_client then return new; end if;

  begin
    insert into public.notifications (profile_id, etape_id, etape_type, expedition_code, colis_codes)
    select c.profile_id, new.id, new.type::text, new.expedition_code, array_agg(c.code order by c.code)
      from public.colis c
     where c.expedition_code = new.expedition_code
       and c.profile_id is not null
     group by c.profile_id
    on conflict (profile_id, etape_id) do nothing;
  exception when others then
    -- Ne jamais empêcher l'équipe d'enregistrer une étape.
    raise warning 'notifier_etape : %', sqlerrm;
  end;
  return new;
end; $$;

revoke all on function public.notifier_etape() from public, anon, authenticated;

drop trigger if exists on_etape_notifier on public.expedition_etapes;
create trigger on_etape_notifier
  after insert or update of visible_client on public.expedition_etapes
  for each row execute function public.notifier_etape();

-- ---------- Marquer comme lues (ses propres notifications) ----------
-- Sans argument : toutes. Rend le nombre de notifications marquées.
-- Au passage, supprime ses notifications lues depuis plus de 90 jours.
create or replace function public.marquer_notifications_lues(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour voir vos notifications.';
  end if;
  update public.notifications
     set lu_le = now()
   where profile_id = auth.uid()
     and lu_le is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  delete from public.notifications
   where profile_id = auth.uid() and lu_le < now() - interval '90 days';
  return v_n;
end; $$;

revoke all on function public.marquer_notifications_lues(uuid[]) from public, anon;
grant execute on function public.marquer_notifications_lues(uuid[]) to authenticated;
