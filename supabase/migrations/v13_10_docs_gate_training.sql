-- v13_10_docs_gate_training.sql
-- Policy: parents must sign all mandatory player documents before a player can
-- play, practice, or train. Enforced server-side on training booking via a guard
-- wrapper (the original book_training_slot is left untouched).
begin;

-- True only when every mandatory active document has a SIGNED agreement for this athlete.
create or replace function public.athlete_docs_complete(p_athlete_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.documents d
    where d.is_mandatory and d.is_active
      and not exists (
        select 1 from public.user_agreements ua
        where ua.document_id = d.id and ua.athlete_id = p_athlete_id and ua.status = 'signed'
      )
  );
$$;
grant execute on function public.athlete_docs_complete(uuid) to authenticated;

-- Guard wrapper: same signature/return as book_training_slot, but blocks unsigned players.
create or replace function public.book_training_slot_guarded(p_slot_id uuid, p_athlete_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if not public.athlete_docs_complete(p_athlete_id) then
    return jsonb_build_object('ok', false, 'error',
      'Please sign all player documents before booking training. Open the Documents section to sign.');
  end if;
  return public.book_training_slot(p_slot_id, p_athlete_id);
end;
$fn$;
grant execute on function public.book_training_slot_guarded(uuid, uuid) to authenticated;

commit;
