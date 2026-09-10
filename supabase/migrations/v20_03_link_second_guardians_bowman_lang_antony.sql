-- v20_03: link three approved parent accounts (no athlete link, so the portal
-- showed them zero documents) to their athletes as second guardian. Confirmed
-- by the director. Idempotent; matched by email and athlete name, never by id.
-- Applied live 2026-09-10 via MCP.
do $$
declare r record; v_uid uuid; v_aid uuid;
begin
  for r in select * from (values
      ('bowmanfamilyfrenchies_bff@gmail.com', 'Ashton', 'Bowman', 'Ashton'),
      ('meganlang888@yahoo.com',              'Carter', null,     'Carter'),
      ('sheila.antony@gmail.com',             'Oliver', null,     'Oliver')
    ) as t(email, first_name, last_name, player_name)
  loop
    select id into v_uid from auth.users where lower(email) = r.email;
    select id into v_aid from public.athletes
      where first_name = r.first_name and (r.last_name is null or last_name = r.last_name)
        and enrollment_status = 'active' order by created_at limit 1;
    if v_uid is null or v_aid is null then
      raise notice 'v20_03: skipped % (user % athlete %)', r.email, v_uid, v_aid; continue;
    end if;
    insert into public.parent_player_links (profile_id, athlete_id, relationship, is_primary)
    select v_uid, v_aid, 'guardian', false
    where not exists (select 1 from public.parent_player_links where profile_id = v_uid and athlete_id = v_aid);
    update public.profiles set player_name = coalesce(player_name, r.player_name), approved = true where id = v_uid;
  end loop;
end $$;
