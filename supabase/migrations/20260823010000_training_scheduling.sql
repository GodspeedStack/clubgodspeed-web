-- 20260823010000: Training session scheduling (coach-sets-open-slots model)
-- Coach/director opens availability slots; a parent books an open slot for their
-- athlete; booking auto-confirms: creates a training_sessions row (the record of
-- the individual session) and marks the slot booked. Hours are consumed later via
-- training_attendance when the session is marked present (existing model).
--
-- Privacy: individual training is private to the booking family + coaches. It is
-- surfaced as "Upcoming Training" lists on the parent portal and the coach admin,
-- NOT written to the shared calendar_events feed (whose visibility model is
-- public/team_only/coaches_only and cannot express per-family private events).
-- Calendar-tile rendering is a scoped follow-on (needs a private-visibility model).
--
-- SECURITY DEFINER throughout; identity from caller JWT; anon revoked.

-- 1. Availability slots the coach opens ------------------------------------
CREATE TABLE IF NOT EXISTS public.training_availability (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_name    text NOT NULL DEFAULT 'Coach Scott',
  slot_date     date NOT NULL,
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  location      text,
  notes         text,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','cancelled')),
  booked_by_email   text,
  booked_athlete_id uuid,
  session_id    uuid REFERENCES public.training_sessions(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_window CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_train_avail_open ON public.training_availability(slot_date) WHERE status = 'open';

-- PRIVACY: no direct table access for anyone but the table owner. Booked rows carry
-- family email + athlete id, so parents must never query this table directly. All reads
-- go through SECURITY DEFINER RPCs below, which return only open slots (no PII) or rows
-- scoped to the caller's own athletes. RLS on + zero policies + revoked grants = deny-all
-- for anon/authenticated; the RPCs run as owner and bypass it.
ALTER TABLE public.training_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_availability FROM anon, authenticated;

-- 2. Coach adds an availability slot ---------------------------------------
CREATE OR REPLACE FUNCTION public.add_training_slot(
  p_date date, p_start time, p_end time, p_location text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_coach text DEFAULT 'Coach Scott')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $FN$
DECLARE caller_role text; new_id uuid;
BEGIN
  SELECT role::text INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('director','coach') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized: director or coach only');
  END IF;
  IF p_end <= p_start THEN
    RETURN jsonb_build_object('ok', false, 'error', 'End time must be after start time');
  END IF;
  INSERT INTO training_availability (coach_name, slot_date, start_time, end_time, location, notes, created_by)
  VALUES (coalesce(p_coach,'Coach Scott'), p_date, p_start, p_end, p_location, p_notes, auth.uid())
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('ok', true, 'slot_id', new_id);
END;
$FN$;

-- 3. Parent lists open, future slots ---------------------------------------
CREATE OR REPLACE FUNCTION public.get_open_training_slots()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $FN$
DECLARE slots jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'slot_id', id, 'coach', coach_name, 'date', slot_date,
           'start_time', to_char(start_time,'HH12:MI AM'),
           'end_time', to_char(end_time,'HH12:MI AM'),
           'location', location, 'notes', notes
         ) ORDER BY slot_date, start_time), '[]'::jsonb)
    INTO slots FROM training_availability
   WHERE status = 'open' AND slot_date >= current_date;
  RETURN jsonb_build_object('ok', true, 'slots', slots);
END;
$FN$;

-- 4. Parent books an open slot (auto-confirm) ------------------------------
CREATE OR REPLACE FUNCTION public.book_training_slot(p_slot_id uuid, p_athlete_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $FN$
DECLARE
  caller_email text := lower(coalesce(auth.jwt() ->> 'email',''));
  owns boolean; slot record; new_session uuid;
BEGIN
  IF caller_email = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated'); END IF;

  -- caller must own the athlete
  SELECT true INTO owns FROM athlete_parents ap JOIN parent_accounts pa ON pa.id = ap.parent_account_id
   WHERE lower(pa.email) = caller_email AND ap.athlete_id = p_athlete_id LIMIT 1;
  IF owns IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'error', 'Athlete not linked to your account'); END IF;

  -- lock the slot row; must still be open
  SELECT * INTO slot FROM training_availability WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Slot not found'); END IF;
  IF slot.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'error', 'That slot was just taken. Please pick another.'); END IF;

  -- Generic title only: training_sessions is readable by all authenticated users, so it
  -- must not carry a child's name. The who lives in training_availability (RPC-scoped).
  INSERT INTO training_sessions (session_date, start_time, end_time, session_type, title, location, status)
  VALUES (slot.slot_date, slot.start_time, slot.end_time, 'individual_workout',
          'Individual Training', slot.location, 'scheduled')
  RETURNING id INTO new_session;

  UPDATE training_availability
     SET status='booked', booked_by_email=caller_email, booked_athlete_id=p_athlete_id,
         session_id=new_session, updated_at=now()
   WHERE id = p_slot_id;

  RETURN jsonb_build_object('ok', true, 'session_id', new_session,
    'date', slot.slot_date, 'start_time', to_char(slot.start_time,'HH12:MI AM'), 'location', slot.location);
END;
$FN$;

-- 5. Parent's upcoming individual sessions ---------------------------------
CREATE OR REPLACE FUNCTION public.get_my_upcoming_training()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $FN$
DECLARE caller_email text := lower(coalesce(auth.jwt() ->> 'email','')); a_ids uuid[]; items jsonb;
BEGIN
  IF caller_email = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated'); END IF;
  SELECT array_agg(DISTINCT ap.athlete_id) INTO a_ids FROM athlete_parents ap
    JOIN parent_accounts pa ON pa.id = ap.parent_account_id WHERE lower(pa.email) = caller_email;
  IF a_ids IS NULL THEN RETURN jsonb_build_object('ok', true, 'sessions', '[]'::jsonb); END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'date', av.slot_date, 'start_time', to_char(av.start_time,'HH12:MI AM'),
           'end_time', to_char(av.end_time,'HH12:MI AM'), 'location', av.location
         ) ORDER BY av.slot_date, av.start_time), '[]'::jsonb)
    INTO items FROM training_availability av
   WHERE av.status='booked' AND av.booked_athlete_id = ANY(a_ids) AND av.slot_date >= current_date;
  RETURN jsonb_build_object('ok', true, 'sessions', items);
END;
$FN$;

REVOKE ALL ON FUNCTION public.add_training_slot(date,time,time,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_open_training_slots() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.book_training_slot(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_upcoming_training() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_training_slot(date,time,time,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_training_slots() TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_training_slot(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_upcoming_training() TO authenticated;

-- 6. Caller's linked athletes (for the booking selector) -------------------
CREATE OR REPLACE FUNCTION public.get_my_booking_athletes()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $FN$
DECLARE caller_email text := lower(coalesce(auth.jwt() ->> 'email','')); items jsonb;
BEGIN
  IF caller_email = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('athlete_id', a.id,
           'name', coalesce(a.name, a.full_name, 'Athlete')) ORDER BY coalesce(a.name,a.full_name)), '[]'::jsonb)
    INTO items
    FROM athlete_parents ap
    JOIN parent_accounts pa ON pa.id = ap.parent_account_id
    JOIN athletes a ON a.id = ap.athlete_id
   WHERE lower(pa.email) = caller_email;
  RETURN jsonb_build_object('ok', true, 'athletes', items);
END;
$FN$;
REVOKE ALL ON FUNCTION public.get_my_booking_athletes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_booking_athletes() TO authenticated;
