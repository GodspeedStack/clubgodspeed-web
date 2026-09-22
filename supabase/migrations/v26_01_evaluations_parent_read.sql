-- ============================================================================
-- v26_01  Let parents read their own child's coach notes
--
-- The problem, measured 2026-09-21: 24 active athletes, 5 with a
-- parent_account_id, 19 without. The read policy on player_evaluations
-- resolved families through athletes.parent_account_id -> parent_accounts,
-- a legacy path holding 5 rows. Everything built since (documents, dues,
-- reminders) resolves families through parent_player_links.
--
-- So a coach note written about a child whose family is linked the modern way
-- returned an EMPTY SET to that family. Not an error, not a permission
-- warning -- nothing. The portal rendered "no notes" and no one could tell
-- the difference between "no feedback yet" and "you are not allowed to see
-- it". Four in five families were in that state.
--
-- The fix accepts EITHER path, which is precisely what pds_parent_read
-- already does on player_development_shares. That table was fixed and this
-- one was missed. Keeping the legacy arm means the 5 families who resolve
-- the old way do not regress on the day this ships.
--
-- Scope: this widens read access to records about minors, so it grants
-- exactly what parent_player_links already grants for documents and dues,
-- and not one row more. Verified on PostgreSQL 16 before shipping:
--   parent linked via parent_player_links  -> sees only their own child
--   parent linked via parent_accounts      -> unchanged, still sees theirs
--   unrelated parent                       -> sees nothing
--   signed out (auth.uid() is null)        -> sees nothing
--   staff / admin                          -> unchanged, see everything
--   parent attempting an INSERT            -> permission denied
--
-- SELECT only. Writing evaluations stays with staff and admin.
-- ============================================================================

drop policy if exists "Parents read own athlete evaluations" on public.player_evaluations;

create policy "Parents read own athlete evaluations"
  on public.player_evaluations
  for select
  using (
    -- current path: how the rest of the platform resolves a family
    athlete_id in (
      select l.athlete_id
        from public.parent_player_links l
       where l.profile_id = auth.uid()
    )
    -- legacy path: retained so the 5 families on parent_accounts keep access
    or athlete_id in (
      select a.id
        from public.athletes a
        join public.parent_accounts pa on pa.id = a.parent_account_id
       where pa.user_id = auth.uid()
    )
  );

comment on table public.player_evaluations is
  'Coach notes. Parents read their own child only, resolved via parent_player_links or the legacy parent_accounts path (v26_01).';
