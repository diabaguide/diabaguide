-- ============================================================
-- Nouvelles fiches « Achats en gros » — Guangzhou et Shenzhen
-- ============================================================
-- Origine : recherche documentaire (travelchinaguide.com) + géocodage
-- individuel sur OpenStreetMap (Nominatim), 22 septembre 2026. Détail
-- complet, sources et niveau de confiance par fiche : fichiers
-- recherche/diaba_guangzhou_marches_gros.xlsx et
-- recherche/diaba_shenzhen_marches_gros.xlsx (feuilles « Lisez-moi »).
--
-- IMPORTANT : ces fiches n'ont PAS été vérifiées sur le terrain par
-- l'équipe Diaba (adresse exacte, horaires réels, contact). Le champ
-- verified est volontairement laissé vide : ne pas y mettre de date
-- tant qu'une vérification n'a pas eu lieu. `on conflict do nothing`
-- rend le script rejouable sans dupliquer les fiches.
--
-- Exclus de ce lot (à reprendre séparément si besoin) :
--   - Guangda Vast Foreign Trade Shoes Plaza (Guangzhou) : coordonnées
--     non fiables (centre du quartier, pas une position réelle).
--   - Cyber Mart, New Asia International (Shenzhen) : nom chinois non
--     confirmé, or `cn` est obligatoire — non inventé.
--   - Les 17 marchés secondaires de Guangzhou et les 3 fiches Bao'an/
--     Luohu de Shenzhen (« en attente ») : laissés de côté par choix.
--   À exécuter dans Supabase → SQL Editor (écriture réservée à
-- service_role ; la clé anon ne peut pas écrire dans providers).

insert into public.providers
  (id, name, cn, cat, city, district, lat, lng, description,
   addr_cn, addr_fr, reperes, metro, hours, products)
values
  ('gz-baima-clothing', 'Baima Clothing Wholesale Market', '白马服装批发市场', 'gros', 'Guangzhou', 'Yuexiu', 23.1494, 113.2485, 'Le plus grand marché de gros de vêtements haut de gamme de Canton, réputé pour sa décoration soignée et sa gestion structurée. Vêtements femme en majorité aux étages 1, 4 et 5 (qualité et prix plus élevés) ; étages 2 et 3 plus abordables.', '广东省广州市越秀区站南路16号（广州火车站附近）', '16 Zhannan Road, district de Yuexiu, à proximité de la gare de Guangzhou', 'À proximité immédiate de la gare ferroviaire de Guangzhou', 'Lignes 2 et 5 · Gare de Guangzhou', '8h30 – 17h30', array['Vêtements femme','vêtements homme','mode']),
  ('gz-shahe-clothing', 'Shahe Clothes Wholesale Market', '沙河服装批发市场', 'gros', 'Guangzhou', 'Tianhe', 23.1579, 113.3063, 'L''un des trois plus grands pôles de vêtements en gros de Canton. Vêtements femme et homme d''entrée de gamme à bas prix ; bon choix de jeans toutes gammes.', '广东省广州市天河区广园东路', 'East Guangyuan Road, district de Tianhe', 'Quartier de Shahe', 'Ligne 6 · Station Shaheding, puis à pied vers le nord-ouest', '5h00 – 11h00 (jours ouvrés) ; 5h00 – 14h00 (week-ends et jours fériés)', array['Vêtements femme','vêtements homme','jeans']),
  ('gz-shisanhang-clothing', 'Shisanhang Clothes Wholesale Market', '十三行服装批发市场', 'gros', 'Guangzhou', 'Liwan', 23.1134, 113.2443, 'Marché très fréquenté vendant des vêtements milieu et bas de gamme : cuir, maille, pulls, costumes, chemises, jeans. Prix bas recherchés par une clientèle internationale, notamment de Russie et d''Asie du Sud-Est.', '广东省广州市荔湾区十三行路与豆栏上街交界处', 'Croisement de Shisanhang Road et Doulangshang Street, district de Liwan', 'Près du parc culturel (Cultural Park)', 'Ligne 6 · Station Cultural Park, puis environ 400 m à pied vers l''est', '9h00 – 14h00', array['Vêtements en cuir','maille','pulls','costumes','chemises','jeans']),
  ('gz-liwan-toys', 'Liwan Toys Wholesale Market', '荔湾玩具批发市场', 'gros', 'Guangzhou', 'Liwan', 23.1283, 113.2345, 'L''un des plus grands marchés de gros de jouets du Guangdong : jouets électriques, à commande vocale, télécommandés, peluches. Vente en gros et au détail.', '广东省广州市荔湾区中山八路36-38号', '36-38 Zhongshan Eighth Road, district de Liwan', 'Près de l''arrêt Shiluji', 'Bus uniquement (arrêt Shiluji) — pas de station de métro à proximité immédiate', null, array['Jouets électriques','jouets télécommandés','peluches']),
  ('gz-sanyuanli-leather', 'Sanyuanli Leather Product Wholesale Market', '三元里皮具批发市场', 'gros', 'Guangzhou', 'Baiyun', 23.168, 113.248, 'Marché spécialisé dans les articles en cuir, en particulier sacs et valises, toutes gammes, marques chinoises et étrangères. Remises significatives à partir d''un volume d''achat important.', '广东省广州市白云区三元里大道（广州火车站附近）', 'Sanyuanli Grand Avenue, à proximité de la gare de Guangzhou, district de Baiyun', 'À proximité de la gare ferroviaire de Guangzhou', 'Lignes 2 et 5 · Gare de Guangzhou, puis environ 700 m à pied vers l''est', '9h00 – 18h00', array['Sacs','valises','articles en cuir']),
  ('gz-beauty-exchange-center', 'Beauty Exchange Center', '美博城化妆品批发市场', 'gros', 'Guangzhou', 'Yuexiu', 23.157, 113.2454, 'Le plus grand marché de cosmétiques de Canton : produits de beauté haut de gamme, articles de toilette, produits capillaires.', '广东省广州市越秀区广园西路121号', '121 West Guangyuan Road, district de Yuexiu', null, 'Ligne 2 · Station Sanyuanli, puis environ 700 m à pied vers le sud-est', '9h00 – 17h00', array['Cosmétiques','articles de toilette','produits capillaires']),
  ('sz-hq-mart', 'HQ-Mart (Huaqiang Electronic World)', '华强电子世界', 'gros', 'Shenzhen', 'Futian', 22.5442, 114.081, 'La plus grande galerie électronique de Shenzhen : 150 000 m², 4 étages, environ 12 000 boutiques. Composants électroniques, sécurité, informatique, communication, produits numériques et LED.', '广东省深圳市福田区华强北路1001号', 'No.1001, North Huaqiang Road, district de Futian', 'Quartier de Huaqiangbei', 'Ligne 1 · Huaqiang Road, sortie A ; ou ligne 7 · Huaqiangbei, sortie D1', '9h30 – 18h00', array['Composants électroniques','sécurité','informatique','communication','LED']),
  ('sz-seg-electronics', 'SEG Electronics Mall', '赛格广场', 'gros', 'Shenzhen', 'Futian', 22.544, 114.0823, 'Plus de 3 000 boutiques : composants électroniques, informatique, produits numériques, audiovisuel, sécurité. Marques internationales présentes (IBM, Epson, Acer, Lenovo…). Occupe les étages 1 à 10 de SEG Plaza et 1 à 4 du bâtiment Baohua.', '广东省深圳市福田区华强北路1002号赛格广场', 'No.1002, North Huaqiang Road (SEG Plaza), district de Futian', 'SEG Plaza, immeuble emblématique de Huaqiangbei', 'Ligne 7 · Huaqiangbei, sortie D1 ; ou ligne 1 · Huaqiang Road, sortie A', '9h30 – 18h30', array['Composants électroniques','informatique','numérique','audiovisuel','sécurité']),
  ('sz-yuanwang-digital', 'Yuanwang Digital Mall', '远望数码城', 'gros', 'Shenzhen', 'Futian', 22.5525, 114.0828, 'Plus grand centre d''achat « tout-en-un » de téléphones et produits numériques : plus de 60 % des achats en gros de téléphones mobiles en Chine y transitent. Plus de 90 % des marques chinoises de téléphonie y sont présentes.', '广东省深圳市福田区华强北路2006号', 'No.2006, North Huaqiang Road, district de Futian', 'Quartier de Huaqiangbei', 'Lignes 2 et 7 · Huaqiangbei, sortie B', '10h30 – 20h00', array['Téléphones mobiles','produits numériques']),
  ('sz-mingtong-digital', 'Mingtong Digital City', '明通数码城', 'gros', 'Shenzhen', 'Futian', 22.5478, 114.0834, 'Présenté comme le plus grand marché de téléphonie mobile de Chine et le plus grand marché de communication numérique d''Asie du Sud-Est. Vente en gros de téléphones chinois et étrangers vers l''Asie, l''Afrique, l''Amérique, l''Europe et l''Océanie.', '广东省深圳市福田区华发北路44-1号', 'No. 44-1, North Huafa Road, district de Futian', 'Quartier de Huaqiangbei', 'Lignes 2 et 7 · Huaqiangbei, sortie B', '10h00 – 20h00', array['Téléphones mobiles (gros)','communication numérique']),
  ('sz-huaqiangbei-women-world', 'Huaqiangbei Women World', '女人世界外贸城', 'gros', 'Shenzhen', 'Futian', 22.5499, 114.0809, 'Marché de gros dédié aux articles féminins : cosmétiques, produits de coiffure, vêtements de marques réputées. Présenté par la source comme un paradis du shopping pour les femmes, à prix abordables.', '广东省深圳市福田区华强路步行街（女人世界外贸城）', 'Huaqiang Road Pedestrian Street (Women''s World Foreign Trade City), district de Futian', 'Rue piétonne de Huaqiang, quartier de Huaqiangbei', 'Lignes 1 et 7 · Huaqiang Road / Huaqiangbei', null, array['Cosmétiques','produits de coiffure','vêtements femme'])
on conflict (id) do nothing;
