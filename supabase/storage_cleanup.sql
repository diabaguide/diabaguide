-- ============================================================
-- Diaba Guide — Photos d'un voyageur : ce qui part avec son compte
--
-- La suppression directe dans storage.objects est refusée par le déclencheur
-- storage.protect_delete, et retirer la seule fiche laisserait de toute façon
-- le fichier dans le stockage. Il faut donc passer par l'API Storage : ces
-- règles donnent ce droit à l'administration, et la fonction
-- admin_traveler_files dit ce qui doit partir et ce qui doit rester.
--
-- À exécuter après storage.sql et reviews.sql. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- L'administration peut supprimer les photos d'un voyageur
-- ------------------------------------------------------------
drop policy if exists "photos_voyageur_delete_admin" on storage.objects;
create policy "photos_voyageur_delete_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('proposal-photos', 'review-photos')
    and public.is_admin()
  );

-- La lecture est déjà couverte : « proposal_photos_select_team » (l'équipe et
-- donc l'administration) et « review_photos_select_all ».

-- ------------------------------------------------------------
-- Ce que la suppression d'un compte laisse derrière elle
--
--  • review-photos/<voyageur>/…   l'avis disparaît avec le compte : ses photos
--                                 deviennent inatteignables → elles partent.
--  • proposal-photos/<voyageur>/… les contributions sont conservées sans
--                                 auteur et gardent leurs photos → on ne
--                                 supprime que celles qu'aucune contribution
--                                 ne référence (envois abandonnés, brouillons).
-- ------------------------------------------------------------
create or replace function public.admin_traveler_files(p_user uuid)
returns table (bucket_id text, name text, taille bigint, supprimable boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Seule l’administration peut consulter les photos d’un voyageur.'
      using errcode = '42501';
  end if;
  return query
    select o.bucket_id,
           o.name,
           coalesce((o.metadata ->> 'size')::bigint, 0) as taille,
           case
             when o.bucket_id = 'review-photos' then true
             else not exists (
               select 1 from public.proposals p
                where array_position(p.photo_paths, o.name) is not null
             )
           end as supprimable
      from storage.objects o
     where o.bucket_id in ('proposal-photos', 'review-photos')
       and (storage.foldername(o.name))[1] = p_user::text
     order by o.bucket_id, o.name;
end; $$;

revoke all on function public.admin_traveler_files(uuid) from public, anon;
grant execute on function public.admin_traveler_files(uuid) to authenticated;