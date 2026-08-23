-- 20260823020000: Coach-side training availability RPCs (staff only).
-- get_coach_training_slots: all upcoming slots incl who booked (coach may see this).
-- cancel_training_slot: cancel a slot (and its linked session if booked).

CREATE OR REPLACE FUNCTION public.get_coach_training_slots()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $FN$
DECLARE caller_role text; items jsonb;
BEGIN
  SELECT role::text INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('director','coach') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized: director or coach only');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'slot_id', av.id, 'date', av.slot_date,
           'start_time', to_char(av.start_time,'HH12:MI AM'),
           'end_time', to_char(av.end_time,'HH12:MI AM'),
           'location', av.location, 'status', av.status,
           'booked_athlete', a.name, 'booked_by', av.booked_by_email
         ) ORDER BY av.slot_date, av.start_time), '[]'::jsonb)
    INTO items
    FROM training_availability av
    LEFT JOIN athletes a ON a.id = av.booked_athlete_id
   WHERE av.slot_date >= current_date AND av.status <> 'cancelled';
  RETURN jsonb_build_object('ok', true, 'slots', items);
END;
$FN$;

CREATE OR REPLACE FUNCTION public.cancel_training_slot(p_slot_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $FN$
DECLARE caller_role text; sess uuid;
BEGIN
  SELECT role::text INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('director','coach') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized: director or coach only');
  END IF;
  SELECT session_id INTO sess FROM training_availability WHERE id = p_slot_id;
  UPDATE training_availability SET status='cancelled', updated_at=now() WHERE id = p_slot_id;
  IF sess IS NOT NULL THEN
    UPDATE training_sessions SET status='cancelled', updated_at=now() WHERE id = sess;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$FN$;

REVOKE ALL ON FUNCTION public.get_coach_training_slots() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_training_slot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_training_slots() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_training_slot(uuid) TO authenticated;
