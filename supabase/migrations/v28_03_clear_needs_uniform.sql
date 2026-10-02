-- v28_03_clear_needs_uniform.sql
--
-- needs_uniform drives the parent portal gear card. While it is true, the card
-- shows "New players: the required set is $207.78" and a Start order button.
--
-- team_gear's own notes record a bulk order placed 2026-08-25 for eight players.
-- Their needs_uniform flag was never cleared, so they would be invited to buy
-- and pay for a second uniform they already own and already paid for inside the
-- $627.78 they were billed.
--
-- Names come from the team_gear notes, matched on first name within the active
-- uniform-scoped roster. Sylvester and Phyer are not in that August note but
-- Scott confirmed on 2026-10-02 that both already have uniforms; both are also
-- paid in full. Run v28_02 first.

begin;

update public.athletes a
   set needs_uniform = false,
       updated_at    = now()
 where a.enrollment_status = 'active'
   and a.needs_uniform
   and a.first_name in ('Samire', 'Carter', 'Oliver', 'Zach', 'Dennis', 'Zaydrien', 'K.D.', 'Romeo',
                        'Sylvester', 'Phyer')
   and exists (
     select 1 from public.team_rosters r
       join public.teams t on t.id = r.team_id
      where r.athlete_id = a.id and r.left_at is null and t.uniform_scoped
   );

commit;
