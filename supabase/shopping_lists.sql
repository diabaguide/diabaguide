-- ============================================================
-- Diaba Guide — Liste d'achats du voyageur
--
-- Chaque voyageur compose ses listes d'achats : un produit, une
-- quantité, un prix visé et, si besoin, la fiche du fournisseur.
-- Il coche sur place, partage par WhatsApp ou enregistre en PDF.
--
-- Confidentialité : chaque compte ne lit et n'écrit que ses propres
-- listes. L'équipe et l'administration gardent un accès en lecture
-- seule, pour le support.
--
-- À exécuter après security_fixes.sql (nécessite is_team() et la table
-- providers). Idempotent : peut être relancé sans risque.
-- ============================================================

create table if not exists public.shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null default 'Ma liste d''achats',
  city       text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_lists_user_idx
  on public.shopping_lists (user_id, updated_at desc);

create table if not exists public.shopping_items (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.shopping_lists(id) on delete cascade,
  label       text not null,
  qty         text,
  price       text,
  note        text,
  provider_id text references public.providers(id) on delete set null,
  done        boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists shopping_items_list_idx
  on public.shopping_items (list_id, sort, created_at);

-- Un libellé vide n'a pas de sens : on refuse aussi les espaces seuls.
alter table public.shopping_items drop constraint if exists shopping_items_label_check;
alter table public.shopping_items add constraint shopping_items_label_check
  check (length(btrim(label)) between 1 and 120);

-- ------------------------------------------------------------
-- Accès
-- ------------------------------------------------------------
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

-- Le propriétaire seul écrit dans ses listes.
drop policy if exists "shopping_lists_owner_rw" on public.shopping_lists;
create policy "shopping_lists_owner_rw" on public.shopping_lists
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- L'équipe lit (support), sans pouvoir modifier.
drop policy if exists "shopping_lists_staff_read" on public.shopping_lists;
create policy "shopping_lists_staff_read" on public.shopping_lists
  for select to authenticated using (public.is_team());

-- Les lignes suivent la liste à laquelle elles appartiennent.
drop policy if exists "shopping_items_owner_rw" on public.shopping_items;
create policy "shopping_items_owner_rw" on public.shopping_items
  for all to authenticated
  using (exists (select 1 from public.shopping_lists l
                 where l.id = shopping_items.list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.shopping_lists l
                      where l.id = shopping_items.list_id and l.user_id = auth.uid()));

drop policy if exists "shopping_items_staff_read" on public.shopping_items;
create policy "shopping_items_staff_read" on public.shopping_items
  for select to authenticated using (public.is_team());

-- ------------------------------------------------------------
-- updated_at : la liste remonte en tête dès qu'elle change,
-- y compris quand c'est une ligne qui change.
-- ------------------------------------------------------------
create or replace function public.touch_shopping_list()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.shopping_lists set updated_at = now()
   where id = coalesce(new.list_id, old.list_id);
  return null;
end; $$;

drop trigger if exists on_shopping_item_change on public.shopping_items;
create trigger on_shopping_item_change
  after insert or update or delete on public.shopping_items
  for each row execute function public.touch_shopping_list();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists on_shopping_list_update on public.shopping_lists;
create trigger on_shopping_list_update
  before update on public.shopping_lists
  for each row execute function public.touch_updated_at();
