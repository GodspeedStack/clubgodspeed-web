-- v13_04_athlete_profile_rpc.sql
-- Admin RPCs to read/write player profile details (birthday, sizes, allergies,
-- emergency contact) so the master roster grows from inside the app.
begin;

create or replace function public.set_athlete_profile(
  p_athlete_id uuid,
  p_date_of_birth date default null,
  p_jersey_size text default null,
  p_shorts_size text default null,
  p_allergies text default null,
  p_medical_notes text default null,
  p_emergency_contact text default null,
  p_emergency_phone text default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_gs_admin() then raise exception 'ADMIN_ONLY' using errcode='42501'; end if;
  update public.athletes set
    date_of_birth     = coalesce(p_date_of_birth, date_of_birth),
    jersey_size       = coalesce(nullif(p_jersey_size,''), jersey_size),
    shorts_size       = coalesce(nullif(p_shorts_size,''), shorts_size),
    allergies         = coalesce(p_allergies, allergies),
    medical_notes     = coalesce(p_medical_notes, medical_notes),
    emergency_contact = coalesce(p_emergency_contact, emergency_contact),
    emergency_phone   = coalesce(p_emergency_phone, emergency_phone),
    updated_at        = now()
  where id = p_athlete_id;
  return jsonb_build_object('ok', true, 'athlete_id', p_athlete_id);
end;
$fn$;

create or replace function public.get_athlete_profiles()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare result jsonb;
begin
  if not public.is_gs_admin() then raise exception 'ADMIN_ONLY' using errcode='42501'; end if;
  select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'name', coalesce(a.display_name, a.first_name||' '||a.last_name),
      'number', a.jersey_number,
      'teams', coalesce((select string_agg(replace(t.name,'Godspeed ',''),' + ' order by t.name)
                           from public.team_rosters r join public.teams t on t.id=r.team_id and t.uniform_scoped
                          where r.athlete_id=a.id and r.left_at is null),''),
      'date_of_birth', a.date_of_birth,
      'jersey_size', a.jersey_size,
      'shorts_size', a.shorts_size,
      'allergies', a.allergies,
      'medical_notes', a.medical_notes,
      'emergency_contact', a.emergency_contact,
      'emergency_phone', a.emergency_phone
    ) order by a.first_name)
    into result
    from public.athletes a
    where a.enrollment_status='active'
      and exists (select 1 from public.team_rosters r join public.teams t on t.id=r.team_id and t.uniform_scoped where r.athlete_id=a.id and r.left_at is null);
  return coalesce(result,'[]'::jsonb);
end;
$fn$;

grant execute on function public.set_athlete_profile(uuid,date,text,text,text,text,text,text) to authenticated;
grant execute on function public.get_athlete_profiles() to authenticated;
commit;
