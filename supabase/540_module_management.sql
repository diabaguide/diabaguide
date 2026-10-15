-- Gestion réversible des modules voyageurs par l’administrateur principal.
-- La recherche et les fiches de lieux sont volontairement hors de cette table.

create table if not exists public.module_settings (
  module_key text primary key check (module_key in ('shopping', 'shipments', 'contributions', 'announcements')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.module_settings enable row level security;
revoke all on table public.module_settings from anon, authenticated;
grant select on table public.module_settings to anon, authenticated;

drop policy if exists module_settings_read_all on public.module_settings;
create policy module_settings_read_all on public.module_settings
  for select to anon, authenticated using (true);

insert into public.module_settings (module_key, enabled) values
  ('shopping', false),
  ('shipments', true),
  ('contributions', true),
  ('announcements', true)
on conflict (module_key) do nothing;

create or replace function public.set_module_enabled(p_module_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_primary_admin = true
  ) then
    raise exception 'Seul l’administrateur principal peut modifier les modules.';
  end if;

  if p_enabled is null then
    raise exception 'Un état actif ou inactif doit être fourni.';
  end if;

  update public.module_settings
     set enabled = p_enabled,
         updated_at = now(),
         updated_by = auth.uid()
   where module_key = p_module_key;

  if not found then
    raise exception 'Module inconnu.';
  end if;
end;
$$;

revoke all on function public.set_module_enabled(text, boolean) from public, anon;
grant execute on function public.set_module_enabled(text, boolean) to authenticated;
