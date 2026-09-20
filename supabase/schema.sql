-- ============================================================
-- Diaba Guide — schéma Supabase (Postgres)
-- Étape « données d'abord » : adresses (providers), propositions,
-- décisions. L'authentification reste simulée côté app pour l'instant ;
-- les politiques RLS seront resserrées quand Supabase Auth sera branché.
--
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run.
-- Idempotent : peut être relancé sans erreur.
-- ============================================================

-- ---------- Types ----------
do $$ begin
  create type provider_cat as enum ('gros', 'hotel', 'resto', 'transport', 'transitaire');
exception when duplicate_object then null; end $$;

do $$ begin
  create type provider_city as enum ('Guangzhou', 'Shenzhen');
exception when duplicate_object then null; end $$;

-- ============================================================
-- Table : providers (les adresses / fiches — données de référence)
-- ============================================================
create table if not exists public.providers (
  id          text primary key,
  name        text not null,
  cn          text not null,
  cat         provider_cat not null,
  city        provider_city not null,
  district    text not null,
  lat         double precision not null,
  lng         double precision not null,
  featured    boolean not null default false,
  verified    text,                       -- date de dernière vérification (texte affiché tel quel)
  description  text,                       -- « desc » dans le code (mot réservé en SQL)
  addr_cn     text,
  addr_fr     text,
  entree      text,
  reperes     text,
  metro       text,
  tel         text,
  wechat      text,
  products    text[],
  moq         text,
  services    text[],
  cuisine     text,
  hours       text,
  halal       text,
  freight     text[],                      -- 'air' | 'sea'
  goods       text,
  senegal     text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Table : proposals (contributions des voyageurs + file équipe)
-- ============================================================
create table if not exists public.proposals (
  id          text primary key,
  name        text not null default '',
  cn          text not null default '',
  cat         provider_cat not null default 'gros',
  city        provider_city not null default 'Guangzhou',
  loc         text not null default '',
  products    text not null default '',
  moq         text not null default '',
  tel         text not null default '',
  wechat      text not null default '',
  addr_cn     text not null default '',
  photos      integer not null default 0,
  card_front  boolean not null default false,
  card_back   boolean not null default false,
  status      text not null default 'Brouillon',
  date        text not null default '',
  feedback    text,
  author      text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- Table : decisions (journal des décisions de l'équipe)
-- ============================================================
create table if not exists public.decisions (
  id             uuid primary key default gen_random_uuid(),
  date           text,
  proposal_name  text,
  cn             text,
  decision       text,
  note           text,
  by             text,
  last_check     text,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- Sécurité (RLS)
-- ============================================================
alter table public.providers  enable row level security;
alter table public.proposals  enable row level security;
alter table public.decisions  enable row level security;

-- providers : lecture publique (anon + connectés). Écriture : personne
-- via la clé anon (réservée à l'équipe / service_role plus tard).
drop policy if exists "providers_read_all" on public.providers;
create policy "providers_read_all" on public.providers
  for select using (true);

-- proposals & decisions : TEMPORAIRE (pré-auth) — accès ouvert avec la
-- clé anon pour faire fonctionner le workflow de démo. À REMPLACER par
-- des politiques basées sur auth.uid() dès que Supabase Auth sera branché.
drop policy if exists "proposals_demo_all" on public.proposals;
create policy "proposals_demo_all" on public.proposals
  for all using (true) with check (true);

drop policy if exists "decisions_demo_all" on public.decisions;
create policy "decisions_demo_all" on public.decisions
  for all using (true) with check (true);

-- ============================================================
-- Seed : les 7 adresses de démonstration (données FICTIVES)
-- ============================================================
insert into public.providers
  (id, name, cn, cat, city, district, lat, lng, featured, verified, description,
   addr_cn, addr_fr, entree, reperes, metro, tel, wechat, products, moq,
   services, cuisine, hours, halal, freight, goods, senegal)
values
  ('baiyun', 'Baiyun Textile Trading', '白云纺织贸易有限公司', 'gros', 'Guangzhou', 'Baiyun',
   23.17, 113.26, true, '12 sept. 2026',
   'Grossiste en tissus et textiles pour la confection : wax, bazin, coton imprimé et dentelle. Vente en gros, sur présentation au stand.',
   '广东省广州市白云区示例路88号 三楼312档', '88, route Shili (adresse fictive), 3e étage, stand 312, district de Baiyun, Guangzhou',
   'Entrée par la porte nord, côté parking. Ascenseur à gauche, puis stand 312 au fond du couloir.',
   'En face d''un magasin de boutons et de fermetures à glissière ; enseigne verte au-dessus du stand.',
   'Ligne 2 · Station Sanyuanli (三元里) · Sortie B, puis 6 min à pied', '+86 130 0000 0000', 'baiyun_textile_demo',
   array['Tissus wax et imprimés','Bazin riche','Coton et popeline','Dentelle et broderie'], '50 pièces par référence',
   null, null, null, null, null, null, null),

  ('zhongda', 'Zhongda Fabric Market, stand 217', '中大布匹市场217档', 'gros', 'Guangzhou', 'Haizhu',
   23.08, 113.34, false, '3 sept. 2026',
   'Stand de tissus au marché de gros de Zhongda : tissus d''ameublement et étoffes au mètre.',
   '广东省广州市海珠区示例路217号', '217, route de l''Exemple (adresse fictive), district de Haizhu, Guangzhou',
   null, null, null, '+86 134 0000 0000', null,
   array['Tissus au mètre','Tissus d''ameublement'], null,
   null, null, null, null, null, null, null),

  ('lihua', 'Lihua Lace & Bazin', '丽华蕾丝布行', 'gros', 'Guangzhou', 'Liwan',
   23.11, 113.23, false, '28 août 2026',
   'Boutique de dentelles et de bazin, vente en gros et au détail.',
   '广东省广州市荔湾区示例街9号', '9, rue de l''Exemple (adresse fictive), district de Liwan, Guangzhou',
   null, null, null, null, 'lihua_lace_demo',
   array['Dentelle','Bazin'], null,
   null, null, null, null, null, null, null),

  ('jinyuan', 'Jinyuan Business Hotel', '金源商务酒店', 'hotel', 'Guangzhou', 'Yuexiu',
   23.14, 113.26, true, '8 sept. 2026',
   'Hôtel d''affaires à proximité de la gare de Guangzhou, adapté aux séjours de quelques nuits pour les acheteurs en déplacement.',
   '广东省广州市越秀区示例大道26号', '26, avenue de l''Exemple (adresse fictive), district de Yuexiu, Guangzhou',
   'Entrée principale sur l''avenue, réception au rez-de-chaussée.',
   'À côté d''une pharmacie ; l''enseigne est visible depuis la sortie de métro.',
   'Ligne 2 · Gare de Guangzhou (广州火车站) · Sortie C, puis 4 min à pied', '+86 131 0000 0000', 'jinyuan_hotel_demo',
   null, null,
   array['Wi-Fi dans les chambres','Petit-déjeuner disponible','Bagagerie','Chambres pour 1 à 3 personnes'],
   null, null, null, null, null, null),

  ('alnour', 'Lanzhou Al-Nour', '兰州清真拉面馆', 'resto', 'Guangzhou', 'Yuexiu',
   23.135, 113.275, false, '5 sept. 2026',
   'Restaurant de nouilles tirées à la main, souvent fréquenté par des commerçants africains du quartier.',
   '广东省广州市越秀区示例街15号 一楼', '15, rue de l''Exemple (adresse fictive), rez-de-chaussée, district de Yuexiu, Guangzhou',
   'Porte vitrée donnant sur la rue, à côté d''un magasin de téléphones.',
   'Grande enseigne rouge avec des caractères dorés.',
   'Ligne 5 · Station proche (exemple) · Sortie A, puis 3 min à pied', '+86 132 0000 0000', 'alnour_demo',
   null, null, null,
   'Chinoise, nouilles tirées à la main', '10 h 30 – 22 h 00', 'Indiquée par l''établissement, à confirmer sur place',
   null, null, null),

  ('sinodakar', 'Sino-Dakar Cargo', '中达国际货运代理有限公司', 'transitaire', 'Guangzhou', 'Baiyun',
   23.155, 113.29, false, '10 sept. 2026',
   'Transitaire spécialisé dans l''envoi de marchandises depuis Guangzhou vers l''Afrique de l''Ouest.',
   '广东省广州市白云区示例路120号 B座 508室', '120, route de l''Exemple (adresse fictive), tour B, bureau 508, district de Baiyun, Guangzhou',
   'Tour B, entrée côté ouest. Prendre l''ascenseur jusqu''au 5e étage.',
   'Face à un entrepôt de colis, près du carrefour principal.',
   'Ligne 3 · Station proche (exemple) · Sortie D, puis 8 min à pied', '+86 133 0000 0000', 'sinodakar_demo',
   null, null, null, null, null, null,
   array['air','sea'], 'Textiles, pièces détachées, appareils électroménagers', 'Dakar : port et aéroport'),

  ('huaqiang', 'Huaqiang Digital Parts', '华强数码配件', 'gros', 'Shenzhen', 'Futian',
   22.545, 114.085, true, '9 sept. 2026',
   'Accessoires et pièces pour téléphones : coques, câbles, chargeurs, écouteurs.',
   '深圳市福田区示例路华强北 远望数码城 2楼', 'Huaqiangbei, marché Yuanwang, 2e étage (adresse fictive), Futian, Shenzhen',
   null, null, null, '+86 135 0000 0000', null,
   array['Coques','Câbles','Chargeurs','Écouteurs'], null,
   null, null, null, null, null, null, null)
on conflict (id) do nothing;
