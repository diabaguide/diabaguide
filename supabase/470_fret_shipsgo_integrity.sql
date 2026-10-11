-- Tighten ShipsGo provenance: only the server service role may introduce or
-- change tracking metadata and provider-attributed events.

create or replace function public.protect_shipsgo_expedition_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      if new.shipsgo_id is not null
         or new.shipsgo_type is not null
         or new.shipsgo_status is not null
         or new.shipsgo_synced_at is not null
         or new.shipsgo_tracking_state is distinct from 'inactive'
         or new.shipsgo_claimed_at is not null then
        raise exception 'ShipsGo fields can only be changed by the server.';
      end if;
    elsif new.shipsgo_id is distinct from old.shipsgo_id
       or new.shipsgo_type is distinct from old.shipsgo_type
       or new.shipsgo_status is distinct from old.shipsgo_status
       or new.shipsgo_synced_at is distinct from old.shipsgo_synced_at
       or new.shipsgo_tracking_state is distinct from old.shipsgo_tracking_state
       or new.shipsgo_claimed_at is distinct from old.shipsgo_claimed_at then
      raise exception 'ShipsGo fields can only be changed by the server.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_shipsgo_expedition_fields on public.expeditions;
create trigger protect_shipsgo_expedition_fields
before insert or update on public.expeditions
for each row execute function public.protect_shipsgo_expedition_fields();

create or replace function public.protect_shipsgo_event_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      if new.source is distinct from 'equipe' or new.ref_shipsgo is not null then
        raise exception 'ShipsGo event provenance can only be set by the server.';
      end if;
    elsif new.source is distinct from old.source
       or new.ref_shipsgo is distinct from old.ref_shipsgo then
      raise exception 'ShipsGo event provenance can only be changed by the server.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_shipsgo_event_fields on public.expedition_etapes;
create trigger protect_shipsgo_event_fields
before insert or update on public.expedition_etapes
for each row execute function public.protect_shipsgo_event_fields();
