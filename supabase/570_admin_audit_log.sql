-- Diaba Guide — Journal d'audit des actions d'administration (additif, idempotent).

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_ids text[] not null default '{}',
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
drop policy if exists "admin_audit_log_admin_read" on public.admin_audit_log;
create policy "admin_audit_log_admin_read" on public.admin_audit_log
  for select to authenticated using (public.is_admin());
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

-- Écriture uniquement par cette fonction : l'auteur est toujours l'appelant, jamais une valeur fournie.
create or replace function public.admin_log_action(
  p_action text, p_target_type text, p_target_ids text[], p_detail jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;
  insert into public.admin_audit_log (actor_id, action, target_type, target_ids, detail)
  values (auth.uid(), left(p_action, 80), left(p_target_type, 40), coalesce(p_target_ids, '{}'), p_detail);
end; $$;
revoke all on function public.admin_log_action(text, text, text[], jsonb) from public, anon;
grant execute on function public.admin_log_action(text, text, text[], jsonb) to authenticated;
