-- ============================================================
-- Diaba Guide — Lot 2 : taxonomies administrables
-- Villes, quartiers, catégories et catalogue produits/services.
-- Convertit les ENUM figés (provider_cat / provider_city) en tables
-- de référence, pour pouvoir les gérer depuis le back-office.
-- À exécuter après admin_roles.sql. Idempotent.
-- ============================================================

-- ---------- 1. Villes ----------
create table if not exists public.cities (
  id         text primary key,          -- identifiant stable (slug)
  name       text not null,
  name_cn    text,
  lat        double precision,
  lng        double precision,
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.cities (id, name, name_cn, lat, lng, sort) values
  ('guangzhou', 'Guangzhou', '广州', 23.13, 113.27, 1),
  ('shenzhen',  'Shenzhen',  '深圳', 22.54, 114.06, 2)
on conflict (id) do nothing;

-- ---------- 2. Quartiers ----------
create table if not exists public.districts (
  id      uuid primary key default gen_random_uuid(),
  city_id text not null references public.cities(id) on delete cascade,
  name    text not null,
  lat     double precision not null,
  lng     double precision not null,
  active  boolean not null default true,
  sort    integer not null default 0,
  unique (city_id, name)
);

insert into public.districts (city_id, name, lat, lng, sort) values
  ('guangzhou', 'Baiyun', 23.16, 113.27, 1),
  ('guangzhou', 'Haizhu', 23.09, 113.32, 2),
  ('guangzhou', 'Liwan',  23.12, 113.24, 3),
  ('guangzhou', 'Yuexiu', 23.13, 113.27, 4),
  ('guangzhou', 'Tianhe', 23.13, 113.36, 5),
  ('shenzhen',  'Futian', 22.54, 114.06, 1),
  ('shenzhen',  'Nanshan',22.53, 113.93, 2)
on conflict (city_id, name) do nothing;

-- ---------- 3. Catégories ----------
-- `fields` = gabarit : blocs optionnels affichés sur la fiche.
-- Valeurs possibles : moq, hours, cuisine, halal, freight, goods, senegal.
create table if not exists public.categories (
  id         text primary key,
  label      text not null,
  label_cn   text,
  icon       text not null default 'box',   -- doit exister dans src/icons.ts
  cta_label  text,
  tags_label text not null default 'Produits proposés',
  fields     jsonb not null default '[]'::jsonb,
  is_freight boolean not null default false,
  active     boolean not null default true,
  sort       integer not null default 0
);

insert into public.categories (id, label, label_cn, icon, cta_label, tags_label, fields, is_freight, sort) values
  ('gros',        'Achats en gros', '批发', 'box',      'Contacter le fournisseur',  'Produits proposés', '["moq","hours"]',              false, 1),
  ('hotel',       'Hôtels',         '酒店', 'bed',      'Contacter pour réserver',   'Services',          '[]',                            false, 2),
  ('resto',       'Restaurants',    '餐厅', 'utensils', 'Contacter le restaurant',   'Spécialités',       '["cuisine","hours","halal"]',  false, 3),
  ('transport',   'Transporteurs',  '运输', 'truck',    'Contacter le transporteur', 'Services',          '["freight","goods","senegal"]', true,  4),
  ('transitaire', 'Transitaires',   '货代', 'ship',     'Contacter le transitaire',  'Services',          '["freight","goods","senegal"]', true,  5)
on conflict (id) do nothing;

-- ---------- 4. Catalogue produits / services ----------
create table if not exists public.product_tags (
  id          text primary key,
  category_id text not null references public.categories(id) on delete cascade,
  label       text not null,
  label_cn    text,
  active      boolean not null default true,
  sort        integer not null default 0
);

-- Repris des valeurs déjà présentes sur les fiches. Les libellés chinois
-- ne sont remplis que lorsqu'ils sont sûrs : l'admin complète le reste.
insert into public.product_tags (id, category_id, label, label_cn, sort) values
  ('tissus-wax',         'gros', 'Tissus wax et imprimés', '蜡染布',  1),
  ('bazin-riche',        'gros', 'Bazin riche',            null,      2),
  ('coton-popeline',     'gros', 'Coton et popeline',      '棉布',    3),
  ('dentelle-broderie',  'gros', 'Dentelle et broderie',   null,      4),
  ('tissus-metre',       'gros', 'Tissus au mètre',        '布料',    5),
  ('tissus-ameublement', 'gros', 'Tissus d''ameublement',  '家纺布料', 6),
  ('dentelle',           'gros', 'Dentelle',               '蕾丝',    7),
  ('bazin',              'gros', 'Bazin',                  null,      8),
  ('coques',             'gros', 'Coques',                 '手机壳',  9),
  ('cables',             'gros', 'Câbles',                 '数据线',  10),
  ('chargeurs',          'gros', 'Chargeurs',              '充电器',  11),
  ('ecouteurs',          'gros', 'Écouteurs',              '耳机',    12),

  ('wifi-chambre',   'hotel', 'Wi-Fi dans les chambres',    null,       1),
  ('petit-dejeuner', 'hotel', 'Petit-déjeuner disponible',  '早餐',     2),
  ('bagagerie',      'hotel', 'Bagagerie',                  '行李寄存', 3),
  ('chambres-1-3',   'hotel', 'Chambres pour 1 à 3 personnes', null,    4),

  ('nouilles-main', 'resto', 'Nouilles tirées à la main', '拉面', 1),
  ('halal',         'resto', 'Halal',                     '清真', 2),
  ('cuisine-chinoise','resto','Cuisine chinoise',         '中餐', 3),

  ('fret-aerien',    'transitaire', 'Fret aérien',          '空运', 1),
  ('fret-maritime',  'transitaire', 'Fret maritime',        '海运', 2),
  ('groupage',       'transitaire', 'Groupage',             null,   3),
  ('dedouanement',   'transitaire', 'Dédouanement',         '清关', 4),
  ('livraison-porte','transport',   'Livraison à domicile', null,   1),
  ('transport-local','transport',   'Transport local',      null,   2)
on conflict (id) do nothing;

-- ---------- 5. ENUM -> texte + clés étrangères ----------
alter table public.proposals alter column cat  drop default;
alter table public.proposals alter column city drop default;

alter table public.providers alter column cat  type text using cat::text;
alter table public.providers alter column city type text using city::text;
alter table public.proposals alter column cat  type text using cat::text;
alter table public.proposals alter column city type text using city::text;

-- Identifiants de ville normalisés (Guangzhou -> guangzhou)
update public.providers set city = lower(city) where city <> lower(city);
update public.proposals set city = lower(city) where city <> lower(city);

alter table public.proposals alter column cat  set default 'gros';
alter table public.proposals alter column city set default 'guangzhou';

alter table public.providers drop constraint if exists providers_city_fkey;
alter table public.providers add  constraint providers_city_fkey foreign key (city) references public.cities(id);
alter table public.providers drop constraint if exists providers_cat_fkey;
alter table public.providers add  constraint providers_cat_fkey  foreign key (cat)  references public.categories(id);
alter table public.proposals drop constraint if exists proposals_city_fkey;
alter table public.proposals add  constraint proposals_city_fkey foreign key (city) references public.cities(id);
alter table public.proposals drop constraint if exists proposals_cat_fkey;
alter table public.proposals add  constraint proposals_cat_fkey  foreign key (cat)  references public.categories(id);

drop type if exists provider_cat;
drop type if exists provider_city;

-- ---------- 6. Produits sélectionnés (ids de tags) ----------
-- `products` / `services` conservent le texte libre (« Autre, préciser »).
alter table public.providers add column if not exists product_tags text[] not null default '{}';
alter table public.proposals add column if not exists product_tags text[] not null default '{}';

update public.providers set product_tags = array['tissus-wax','bazin-riche','coton-popeline','dentelle-broderie'], products = '{}' where id = 'baiyun';
update public.providers set product_tags = array['tissus-metre','tissus-ameublement'], products = '{}' where id = 'zhongda';
update public.providers set product_tags = array['dentelle','bazin'],                  products = '{}' where id = 'lihua';
update public.providers set product_tags = array['coques','cables','chargeurs','ecouteurs'], products = '{}' where id = 'huaqiang';
update public.providers set product_tags = array['wifi-chambre','petit-dejeuner','bagagerie','chambres-1-3'], services = '{}' where id = 'jinyuan';
update public.providers set product_tags = array['nouilles-main','halal'] where id = 'alnour';
update public.providers set product_tags = array['fret-aerien','fret-maritime'] where id = 'sinodakar';

-- ---------- 7. RLS : lecture publique, écriture administrateur ----------
alter table public.cities       enable row level security;
alter table public.districts    enable row level security;
alter table public.categories   enable row level security;
alter table public.product_tags enable row level security;

drop policy if exists "cities_read"        on public.cities;
create policy "cities_read"        on public.cities        for select using (true);
drop policy if exists "districts_read"     on public.districts;
create policy "districts_read"     on public.districts     for select using (true);
drop policy if exists "categories_read"    on public.categories;
create policy "categories_read"    on public.categories    for select using (true);
drop policy if exists "product_tags_read"  on public.product_tags;
create policy "product_tags_read"  on public.product_tags  for select using (true);

drop policy if exists "cities_admin"       on public.cities;
create policy "cities_admin"       on public.cities        for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "districts_admin"    on public.districts;
create policy "districts_admin"    on public.districts     for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "categories_admin"   on public.categories;
create policy "categories_admin"   on public.categories    for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "product_tags_admin" on public.product_tags;
create policy "product_tags_admin" on public.product_tags  for all using (public.is_admin()) with check (public.is_admin());
