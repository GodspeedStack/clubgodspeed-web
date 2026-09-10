-- v20_02: link parent elizabeth.jacob@icloud.com (approved login request names
-- athlete "Zaydrien Alec Drumgold", 5th grade) to athlete row "Zaydrien A".
-- Same repair pattern as v20_01 (Sly Brandon). Idempotent. Match by email and
-- athlete name, never by generated id. Applied live 2026-09-10 via MCP.
do $$
declare v_uid uuid; v_aid uuid;
begin
  select id into v_uid from auth.users where lower(email) = 'elizabeth.jacob@icloud.com';
  select id into v_aid from public.athletes
    where first_name = 'Zaydrien' and grade = '5' and enrollment_status = 'active' limit 1;
  if v_uid is null or v_aid is null then
    raise notice 'v20_02: skipped (user % athlete %)', v_uid, v_aid; return;
  end if;
  insert into public.parent_player_links (profile_id, athlete_id, relationship, is_primary)
  select v_uid, v_aid, 'guardian', true
  where not exists (select 1 from public.parent_player_links where profile_id = v_uid and athlete_id = v_aid);
  update public.profiles set player_name = coalesce(player_name, 'Zaydrien'), approved = true where id = v_uid;
end $$;
