-- Let parents create their own waiver rows.
--
-- PROBLEM
-- Roughly ten approved parents could not fill out any waiver. Three causes
-- stacked:
--   1. They were never linked to a player in parent_player_links.
--   2. Waivers are assigned per parent x athlete, so an unlinked parent was
--      never assigned any rows to sign.
--   3. user_agreements had no INSERT policy at all. Under deny-by-default RLS
--      that means the portal could not create the missing row either, so there
--      was no path to recover. The failure was silent: no error, no rows.
--
-- Causes 1 and 2 were repaired as data. This migration fixes cause 3 so the
-- same gap cannot become unrecoverable again.
--
-- The check constraints matter. A parent may create only a row for themselves,
-- and only in an unsigned state. Signing still goes through
-- record_document_signature, so a parent cannot self-sign by inserting a row
-- that already looks signed.

create policy "Parents insert own agreements"
  on public.user_agreements
  for insert
  to authenticated
  with check (
    parent_user_id = auth.uid()
    and status = 'pending'
    and signed_at is null
    and signature_value is null
  );
