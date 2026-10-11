-- ShipsGo integration for the current production fret schema.
-- Additive only: existing expeditions and manual tracking remain unchanged.

alter table public.expeditions
  add column if not exists shipsgo_id integer,
  add column if not exists shipsgo_type text,
  add column if not exists shipsgo_status text,
  add column if not exists shipsgo_synced_at timestamptz,
  add column if not exists shipsgo_tracking_state text not null default 'inactive',
  add column if not exists shipsgo_claimed_at timestamptz;

alter table public.expedition_etapes
  add column if not exists source text not null default 'equipe',
  add column if not exists ref_shipsgo text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expeditions_shipsgo_type_check' and conrelid = 'public.expeditions'::regclass) then
    alter table public.expeditions add constraint expeditions_shipsgo_type_check
      check (shipsgo_type is null or shipsgo_type in ('ocean', 'air'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expeditions_shipsgo_status_check' and conrelid = 'public.expeditions'::regclass) then
    alter table public.expeditions add constraint expeditions_shipsgo_status_check
      check (shipsgo_status is null or shipsgo_status ~ '^[A-Z0-9_]{1,64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expeditions_shipsgo_tracking_state_check' and conrelid = 'public.expeditions'::regclass) then
    alter table public.expeditions add constraint expeditions_shipsgo_tracking_state_check
      check (shipsgo_tracking_state in ('inactive', 'creating', 'active', 'error'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expedition_etapes_source_check' and conrelid = 'public.expedition_etapes'::regclass) then
    alter table public.expedition_etapes add constraint expedition_etapes_source_check
      check (source in ('equipe', 'shipsgo'));
  end if;
end $$;

create unique index if not exists expeditions_shipsgo_external_id_uniq
  on public.expeditions (shipsgo_type, shipsgo_id) where shipsgo_id is not null;
create unique index if not exists expedition_etapes_shipsgo_ref_uniq
  on public.expedition_etapes (expedition_code, ref_shipsgo) where ref_shipsgo is not null;

-- The browser may read integration status through the existing fret RLS policy,
-- but only the server's service_role may change these columns.
create or replace function public.protect_shipsgo_expedition_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (new.shipsgo_id is distinct from old.shipsgo_id
       or new.shipsgo_type is distinct from old.shipsgo_type
       or new.shipsgo_status is distinct from old.shipsgo_status
       or new.shipsgo_synced_at is distinct from old.shipsgo_synced_at
       or new.shipsgo_tracking_state is distinct from old.shipsgo_tracking_state
       or new.shipsgo_claimed_at is distinct from old.shipsgo_claimed_at) then
    raise exception 'ShipsGo fields can only be changed by the server.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_shipsgo_expedition_fields on public.expeditions;
create trigger protect_shipsgo_expedition_fields
before update on public.expeditions
for each row execute function public.protect_shipsgo_expedition_fields();

create or replace function public.shipsgo_claim_tracking(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_claimed boolean := false;
begin
  update public.expeditions
     set shipsgo_tracking_state = 'creating', shipsgo_claimed_at = now()
   where code = upper(btrim(p_code))
     and shipsgo_id is null
     and (shipsgo_tracking_state in ('inactive', 'error')
       or (shipsgo_tracking_state = 'creating' and shipsgo_claimed_at < now() - interval '15 minutes'))
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.shipsgo_finish_tracking(
  p_code text, p_type text, p_id integer, p_status text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_type is null or p_type not in ('ocean', 'air') or p_id is null or p_id <= 0 then
    raise exception 'Invalid ShipsGo shipment identifier.';
  end if;
  if p_status is not null and p_status !~ '^[A-Z0-9_]{1,64}$' then
    raise exception 'Invalid ShipsGo status.';
  end if;
  update public.expeditions
     set shipsgo_id = p_id,
         shipsgo_type = p_type,
         shipsgo_status = p_status,
         shipsgo_tracking_state = 'active',
         shipsgo_claimed_at = null
   where code = upper(btrim(p_code))
     and shipsgo_id is null
     and shipsgo_tracking_state = 'creating';
  if not found then
    if exists (select 1 from public.expeditions where code = upper(btrim(p_code)) and shipsgo_id = p_id and shipsgo_type = p_type) then
      return;
    end if;
    raise exception 'Expedition is not awaiting ShipsGo registration.';
  end if;
end;
$$;

create or replace function public.shipsgo_fail_tracking(p_code text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.expeditions
     set shipsgo_tracking_state = 'error', shipsgo_claimed_at = null
   where code = upper(btrim(p_code))
     and shipsgo_id is null
     and shipsgo_tracking_state = 'creating';
$$;

create or replace function public.shipsgo_apply_sync(
  p_code text, p_type text, p_id integer, p_status text, p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.expeditions%rowtype;
  v_target text;
  v_depart_at timestamptz;
  v_arrive_at timestamptz;
  v_event jsonb;
  v_inserted integer := 0;
  v_rows integer := 0;
  v_type text;
  v_ref text;
  v_at timestamptz;
begin
  if p_type is null or p_type not in ('ocean', 'air') or p_id is null or p_id <= 0 then
    raise exception 'Invalid ShipsGo shipment identifier.';
  end if;
  if p_status is not null and p_status !~ '^[A-Z0-9_]{1,64}$' then
    raise exception 'Invalid ShipsGo status.';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 500 then
    raise exception 'Invalid ShipsGo event batch.';
  end if;

  select * into v_current from public.expeditions where code = upper(btrim(p_code)) for update;
  if not found or v_current.shipsgo_id is distinct from p_id or v_current.shipsgo_type is distinct from p_type then
    raise exception 'ShipsGo shipment does not match this expedition.';
  end if;

  for v_event in select value from jsonb_array_elements(p_events) loop
    v_type := v_event->>'type';
    v_ref := v_event->>'ref';
    if jsonb_typeof(v_event) <> 'object'
       or v_type is null
       or v_type not in ('en_transit', 'arrive_dakar')
       or v_event->>'visible_client' is distinct from 'true'
       or v_ref is null
       or v_ref !~ '^[a-f0-9]{64}$'
       or v_event->>'au' is null then
      raise exception 'Invalid ShipsGo event.';
    end if;
    v_at := (v_event->>'au')::timestamptz;
    insert into public.expedition_etapes (expedition_code, type, au, visible_client, note_interne, par, source, ref_shipsgo)
    values (upper(btrim(p_code)), v_type::public.etape_type, v_at, true, null, 'ShipsGo', 'shipsgo', v_ref)
    on conflict (expedition_code, ref_shipsgo) where ref_shipsgo is not null do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
    if v_type = 'en_transit' then v_depart_at := least(v_depart_at, v_at); end if;
    if v_type = 'arrive_dakar' then v_arrive_at := least(v_arrive_at, v_at); end if;
  end loop;

  v_target := case
    when p_type = 'ocean' and p_status = 'SAILING' then 'partie'
    when p_type = 'air' and p_status = 'EN_ROUTE' then 'partie'
    when p_type = 'ocean' and p_status in ('ARRIVED', 'DISCHARGED')
      and exists (select 1 from jsonb_array_elements(p_events) e where e->>'type' = 'arrive_dakar') then 'arrivee'
    when p_type = 'air' and p_status in ('LANDED', 'DELIVERED')
      and exists (select 1 from jsonb_array_elements(p_events) e where e->>'type' = 'arrive_dakar') then 'arrivee'
    else null
  end;

  update public.expeditions
     set shipsgo_status = p_status,
         shipsgo_synced_at = now(),
         statut = case
           when v_target = 'partie' and statut in ('ouverte', 'cloturee') then 'partie'::public.expedition_statut
           when v_target = 'arrivee' and statut in ('ouverte', 'cloturee', 'partie') then 'arrivee'::public.expedition_statut
           else statut
         end,
         partie_le = case when v_target = 'partie' then coalesce(partie_le, v_depart_at) else partie_le end,
         arrivee_le = case when v_target = 'arrivee' then coalesce(arrivee_le, v_arrive_at) else arrivee_le end,
         updated_at = now()
   where code = upper(btrim(p_code));

  return v_inserted;
end;
$$;

revoke all on function public.shipsgo_claim_tracking(text) from public, anon, authenticated;
revoke all on function public.shipsgo_finish_tracking(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.shipsgo_fail_tracking(text) from public, anon, authenticated;
revoke all on function public.shipsgo_apply_sync(text, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.shipsgo_claim_tracking(text) to service_role;
grant execute on function public.shipsgo_finish_tracking(text, text, integer, text) to service_role;
grant execute on function public.shipsgo_fail_tracking(text) to service_role;
grant execute on function public.shipsgo_apply_sync(text, text, integer, text, jsonb) to service_role;
