-- v13_05_parent_self_service.sql
-- Real persistence for the parent Settings screen (was a localStorage mock).
-- Parents may edit their own profile (RLS allows) and their linked athlete's
-- name/DOB via a security-definer RPC (parents have no direct UPDATE on athletes).
-- Both paths RETURN the persisted row so the client can prove the save.
begin;

-- Read: profile + linked athletes for the signed-in parent.
create or replace function public.get_my_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED' using errcode='28000'; end if;
  select jsonb_build_object(
    'profile', (select jsonb_build_object('full_name',p.full_name,'email',p.email,'phone',p.phone,'player_name',p.player_name)
                  from public.profiles p where p.id = uid),
    'athletes', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', a.id,
                    'first_name', a.first_name, 'last_name', a.last_name,
                    'display_name', a.display_name, 'date_of_birth', a.date_of_birth
                  ) order by l.is_primary desc nulls last, a.first_name)
                  from public.parent_player_links l join public.athletes a on a.id = l.athlete_id
                 where l.profile_id = uid), '[]'::jsonb)
  ) into result;
  return result;
end;
$fn$;

-- Write: update a linked athlete's name / DOB, return the persisted row.
create or replace function public.update_my_athlete(
  p_athlete_id uuid, p_first_name text default null, p_last_name text default null, p_date_of_birth date default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare uid uuid := auth.uid(); v_ok boolean; v public.athletes%rowtype;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED' using errcode='28000'; end if;
  select exists(select 1 from public.parent_player_links l where l.profile_id=uid and l.athlete_id=p_athlete_id) into v_ok;
  if not v_ok and not public.is_gs_admin() then raise exception 'NOT_YOUR_ATHLETE' using errcode='42501'; end if;

  update public.athletes set
     first_name    = coalesce(nullif(btrim(p_first_name),''), first_name),
     last_name     = case when p_last_name is null then last_name else btrim(p_last_name) end,
     date_of_birth = coalesce(p_date_of_birth, date_of_birth),
     updated_at    = now()
   where id = p_athlete_id
   returning * into v;

  if v.id is null then raise exception 'NOT_PERSISTED' using errcode='P0001'; end if;

  return jsonb_build_object('id',v.id,'first_name',v.first_name,'last_name',v.last_name,
    'display_name',v.display_name,'date_of_birth',v.date_of_birth);
end;
$fn$;

grant execute on function public.get_my_settings() to authenticated;
grant execute on function public.update_my_athlete(uuid,text,text,date) to authenticated;
commit;
