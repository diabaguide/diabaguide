-- ============================================================
-- Diaba Guide — seed du workflow de contributions (démonstration)
-- Propositions de la file équipe + journal des décisions.
-- user_id reste NULL (défaut) => visibles par l'équipe (RLS is_team),
-- invisibles pour les voyageurs réels. À exécuter après auth.sql.
-- Idempotent.
-- ============================================================

insert into public.proposals (id, name, cn, cat, city, loc, status, date, feedback, author) values
  ('p2', 'Tianhe Sample Hotel', '天河示例酒店', 'hotel', 'Guangzhou', 'Tianhe, près de la gare Est',
   'Soumise', 'Envoyée le 19 sept.', null, 'Bacary D.'),
  ('p3', 'Nanshan Cargo Express', '南山快运', 'transport', 'Shenzhen', 'Nanshan',
   'En vérification', 'Envoyée le 18 sept.', null, 'Bacary D.'),
  ('p4', 'Yuexiu Halal Kitchen', '越秀清真小厨', 'resto', 'Guangzhou', 'Yuexiu',
   'Complément demandé', 'Envoyée le 16 sept.',
   'Merci pour votre proposition. Pour la publier, il nous manque : un numéro de téléphone joignable et une photo de la devanture ou de l''enseigne.',
   'Bacary D.'),
  ('p5', 'Liwan Lace House', '荔湾蕾丝行', 'gros', 'Guangzhou', 'Liwan',
   'Publiée', 'Publiée le 15 sept.', 'Votre proposition est publiée. Merci pour votre contribution.', 'Bacary D.'),
  ('p6', 'Baiyun Textiles Co.', '白云纺织有限公司', 'gros', 'Guangzhou', 'Baiyun',
   'Rattachée à une adresse existante', 'Traitée le 14 sept.',
   'Cette adresse existait déjà dans Diaba Guide. Votre proposition a été rattachée à la fiche existante et vos informations l''ont complétée.',
   'Bacary D.'),
  ('p7', 'Shekou Guesthouse', '蛇口民宿', 'hotel', 'Shenzhen', 'Shekou',
   'Refusée', 'Traitée le 11 sept.',
   'Motif : établissement fermé. Selon nos vérifications, cette adresse n''est plus en activité. Vous pouvez proposer une autre adresse à tout moment.',
   'Bacary D.'),
  ('t1', 'Panyu Sea Freight', '番禺海运代理', 'transitaire', 'Guangzhou', 'Quartier à préciser',
   'Soumise', '20 sept.', null, 'A. Ndiaye'),
  ('t2', 'Futian Phone Cases', '福田手机壳批发', 'gros', 'Shenzhen', 'Quartier à préciser',
   'En vérification', '17 sept.', null, 'M. Sow')
on conflict (id) do nothing;

-- Journal des décisions (inséré seulement si la table est vide → idempotent).
insert into public.decisions (date, proposal_name, cn, decision, note, by, last_check)
select v.* from (values
  ('20 sept. 2026, 09:10', 'Liwan Lace House', '荔湾蕾丝行', 'Publiée', 'Fiche créée, vérifiée par téléphone.', 'Agent Diaba', '20 sept. 2026'),
  ('19 sept. 2026, 17:30', 'Yuexiu Halal Kitchen', '越秀清真小厨', 'Complément demandé', 'Téléphone et photo de la devanture demandés.', 'Agent Diaba', '—'),
  ('14 sept. 2026, 11:02', 'Baiyun Textiles Co.', '白云纺织有限公司', 'Rattachée à une adresse existante', 'Doublon de « Baiyun Textile Trading ».', 'Agent Diaba', '12 sept. 2026'),
  ('11 sept. 2026, 15:45', 'Shekou Guesthouse', '蛇口民宿', 'Refusée', 'Motif : établissement fermé.', 'Agent Diaba', '—')
) as v(date, proposal_name, cn, decision, note, by, last_check)
where not exists (select 1 from public.decisions);
