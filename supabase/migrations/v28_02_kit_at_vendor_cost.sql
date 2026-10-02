-- v28_02_kit_at_vendor_cost.sql
--
-- The kit moves to exact vendor pass-through. team_gear records what the club
-- actually paid: jersey $56.94 x2, blue shorts $54.96, practice penny $38.94 =
-- $207.78. Billing the previous $194.77 cost the club $13.01 per new player.
-- Zero markup, nothing added.
--
-- Kyra Gale and Shawon Smith move with it. Both were set at $667.67 and neither
-- has paid a cent or ever seen the figure: no email to either contains a dollar
-- amount, and Kyra's last portal session was an hour before her balance was
-- written. So this is a correction before first sight, not a re-invoice.
--
-- The eleven earlier families at $627.78 are NOT touched. Grandfathered.

begin;

update public.uniform_config
   set jersey_price = 56.94,
       shorts_price = 54.96,
       penny_price  = 38.94,
       set_price    = 207.78,
       updated_at   = now()
 where id = 1;

-- Guarded on purpose: only rows still at the old figure with nothing paid, so
-- this cannot touch anyone who has started paying or been corrected since.
update public.parent_dues_enrollment
   set total_owed = 680.68,
       updated_at = now()
 where parent_email in ('galekyra1@gmail.com', 'shawonsmith89@gmail.com')
   and total_paid = 0.00
   and total_owed = 667.67;

do $$
declare s numeric; j numeric; sh numeric; p numeric; n int;
begin
  select set_price, jersey_price, shorts_price, penny_price
    into s, j, sh, p from public.uniform_config where id = 1;

  if (j * 2 + sh + p) <> s then
    raise exception 'kit does not reconcile: 2*% + % + % = % but set_price = %',
      j, sh, p, (j * 2 + sh + p), s;
  end if;

  -- 472.90 Fall dues + 207.78 kit
  select count(*) into n from public.parent_dues_enrollment
   where parent_email in ('galekyra1@gmail.com', 'shawonsmith89@gmail.com')
     and total_owed = 680.68;

  if n <> 2 then
    raise exception 'expected 2 enrollments at 680.68, found %', n;
  end if;
end $$;

commit;
