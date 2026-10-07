-- v32_02_athlete_media_policies.sql
--
-- The athlete-media bucket was created 2026-03-25 and has been empty ever since.
-- The reason is that storage.objects has RLS enabled and NO policy mentions this
-- bucket, so every read and write except service_role is denied. Any upload UI
-- built against it would fail silently until this exists.
--
-- THE SHARE GATE IS INHERITED, NOT DUPLICATED
-- The parent read policy does not carry its own idea of who may see what. It asks
-- player_film: is there a row pointing at this object, for one of this parent's
-- athletes, that has been shared? That means flipping shared_with_parent_at on a
-- film row opens the image at the same instant, and un-sharing closes it, with no
-- second switch to forget. One gate, defined once, enforced in both places.
--
-- Staff write, nobody else. Parents never upload here, and anon has no access at
-- any point, which matters because every object in this bucket is a photograph or
-- video of somebody's child.

begin;

drop policy if exists athlete_media_staff_read   on storage.objects;
drop policy if exists athlete_media_staff_write  on storage.objects;
drop policy if exists athlete_media_staff_update on storage.objects;
drop policy if exists athlete_media_staff_delete on storage.objects;
drop policy if exists athlete_media_parent_read  on storage.objects;

-- Staff: full control of the bucket.
create policy athlete_media_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'athlete-media' and public.current_user_is_staff());

create policy athlete_media_staff_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'athlete-media' and public.current_user_is_staff());

create policy athlete_media_staff_update on storage.objects
  for update to authenticated
  using (bucket_id = 'athlete-media' and public.current_user_is_staff())
  with check (bucket_id = 'athlete-media' and public.current_user_is_staff());

create policy athlete_media_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'athlete-media' and public.current_user_is_staff());

-- Parents: read an object only while a SHARED film row for their own athlete
-- points at it. The gate lives on player_film and is inherited here.
create policy athlete_media_parent_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'athlete-media'
    and exists (
      select 1
        from public.player_film f
       where f.storage_path = storage.objects.name
         and f.shared_with_parent_at is not null
         and f.athlete_id in (select public.get_my_athlete_ids())
    )
  );

commit;
