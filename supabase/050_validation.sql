-- ============================================================
-- Diaba Guide — Validation des données côté base (Supabase)
-- Sécurité (Point E-1 de l'audit)
-- Ajoute des contraintes CHECK pour garantir la taille et le format des données
-- ============================================================

-- ------------------------------------------------------------
-- Table : proposals (Propositions)
-- ------------------------------------------------------------
alter table public.proposals
  add constraint proposals_name_len check (char_length(name) <= 100),
  add constraint proposals_cn_len check (char_length(cn) <= 100),
  add constraint proposals_author_len check (char_length(author) <= 100),
  add constraint proposals_tel_len check (char_length(tel) <= 50),
  add constraint proposals_wechat_len check (char_length(wechat) <= 50),
  add constraint proposals_loc_len check (char_length(loc) <= 1000),
  add constraint proposals_products_len check (char_length(products) <= 1000),
  add constraint proposals_moq_len check (char_length(moq) <= 1000),
  add constraint proposals_addr_cn_len check (char_length(addr_cn) <= 1000),
  add constraint proposals_feedback_len check (feedback is null or char_length(feedback) <= 1000);

-- ------------------------------------------------------------
-- Table : reports (Signalements)
-- ------------------------------------------------------------
alter table public.reports
  add constraint reports_provider_name_len check (char_length(provider_name) <= 100),
  add constraint reports_type_len check (char_length(type) <= 50),
  add constraint reports_about_len check (char_length(about) <= 100),
  add constraint reports_text_len check (char_length(text) > 0 and char_length(text) <= 1000);

-- ------------------------------------------------------------
-- Table : decisions (Décisions de l'équipe)
-- ------------------------------------------------------------
alter table public.decisions
  add constraint decisions_proposal_name_len check (proposal_name is null or char_length(proposal_name) <= 100),
  add constraint decisions_cn_len check (cn is null or char_length(cn) <= 100),
  add constraint decisions_decision_len check (decision is null or char_length(decision) <= 50),
  add constraint decisions_note_len check (note is null or char_length(note) <= 1000),
  add constraint decisions_by_len check (by is null or char_length(by) <= 100);
