-- ============================================================
-- Diaba Guide — Annonces : image, et contact de l'équipe
--
-- 1. Une image facultative par annonce (bucket privé `annonces-photos`) :
--    lecture pour tout utilisateur connecté (comme les annonces), dépôt et
--    retrait réservés à l'administration.
-- 2. Le contact de l'équipe : le bouton « Contacter l'équipe Diaba Guide » de la page
--    d'une annonce ouvre WhatsApp sur un numéro saisi une fois, dans la console des
--    annonces (table `reglages`, lisible de tous les connectés, modifiable par
--    l'administration seule via une fonction qui vérifie le numéro).
--
-- Dépend de : 230_annonces.sql, 020_auth.sql (is_admin).
-- Idempotent.
-- ============================================================

-- ---------- 1. Image des annonces ----------
alter table public.annonces add column if not exists image_path text;

alter table public.annonces drop constraint if exists annonces_image_path_len;
alter table public.annonces add constraint annonces_image_path_len
  check (image_path is null or char_length(image_path) <= 300);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('annonces-photos', 'annonces-photos', false, 3145728,
        array['image/avif', 'image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'annonces_photos_select') then
    create policy "annonces_photos_select" on storage.objects
      for select to authenticated using (bucket_id = 'annonces-photos');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'annonces_photos_insert_admin') then
    create policy "annonces_photos_insert_admin" on storage.objects
      for insert to authenticated with check (bucket_id = 'annonces-photos' and public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'annonces_photos_delete_admin') then
    create policy "annonces_photos_delete_admin" on storage.objects
      for delete to authenticated using (bucket_id = 'annonces-photos' and public.is_admin());
  end if;
end $$;

-- Associe (ou retire, avec null) l'image d'une annonce. Rend l'ancien chemin pour que
-- la console supprime le fichier remplacé.
create or replace function public.admin_annonce_image(p_id uuid, p_path text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ancien text;
  v_path   text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  if v_path is not null and char_length(v_path) > 300 then
    raise exception 'Chemin d''image trop long.';
  end if;
  select image_path into v_ancien from public.annonces where id = p_id;
  if not found then
    raise exception 'Annonce introuvable';
  end if;
  update public.annonces set image_path = v_path where id = p_id;
  return v_ancien;
end; $$;

revoke all on function public.admin_annonce_image(uuid, text) from public, anon;
grant execute on function public.admin_annonce_image(uuid, text) to authenticated;

-- ---------- 2. Réglages du site (contact de l'équipe) ----------
create table if not exists public.reglages (
  cle        text primary key,
  valeur     text not null,
  updated_at timestamptz not null default now()
);

alter table public.reglages drop constraint if exists reglages_cle_connue;
alter table public.reglages add constraint reglages_cle_connue check (cle in ('contact_whatsapp'));
alter table public.reglages drop constraint if exists reglages_valeur_len;
alter table public.reglages add constraint reglages_valeur_len check (char_length(valeur) <= 60);

alter table public.reglages enable row level security;
drop policy if exists "reglages_lecture" on public.reglages;
create policy "reglages_lecture" on public.reglages for select to authenticated using (true);

-- Lecture seule pour l'API ; l'écriture passe par la fonction ci-dessous.
revoke all on public.reglages from public, anon, authenticated;
grant select on public.reglages to authenticated;

-- Numéro WhatsApp de l'équipe : chiffres avec l'indicatif du pays, 8 à 15 chiffres
-- (« +221 77 123 45 67 » → « 221771234567 »). Vide : le numéro est retiré.
create or replace function public.admin_definir_contact(p_whatsapp text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_num text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  if v_num = '' then
    delete from public.reglages where cle = 'contact_whatsapp';
    return '';
  end if;
  if char_length(v_num) < 8 or char_length(v_num) > 15 then
    raise exception 'Le numéro WhatsApp doit avoir de 8 à 15 chiffres, avec l''indicatif du pays (par exemple +221 77 123 45 67).';
  end if;
  insert into public.reglages (cle, valeur) values ('contact_whatsapp', v_num)
    on conflict (cle) do update set valeur = excluded.valeur, updated_at = now();
  return v_num;
end; $$;

revoke all on function public.admin_definir_contact(text) from public, anon;
grant execute on function public.admin_definir_contact(text) to authenticated;
