-- v30_01_uniform_payment_method.sql
--
-- WHY
-- The kit can be paid two ways and the parent chooses: inside season dues, or
-- separately by card at checkout. Nothing recorded which, so both were possible
-- at once. Kyra Gale's dues of $680.68 already contain the $207.78 kit AND she
-- has an open $207.78 uniform order; if Stripe went live she could pay $888.46
-- against a $680.68 obligation.
--
-- THE INVARIANT
-- parent_dues_enrollment.total_owed includes the kit price
--   IF AND ONLY IF the athlete's uniform order has payment_method = 'dues'.
--
-- status answers "has the money arrived". payment_method answers "by which
-- route". Overloading status with a 'covered_by_dues' value would have broken
-- every existing query that treats 'paid' as settled.
--
-- Default is 'dues' on purpose: it is the state every current family is already
-- in, it needs no live Stripe key, and it cannot double-charge anyone. Choosing
-- 'stripe' is the deliberate act.

begin;

alter table public.uniform_orders
  add column if not exists payment_method text not null default 'dues';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.uniform_orders'::regclass
       and conname = 'uniform_orders_payment_method_check'
  ) then
    alter table public.uniform_orders
      add constraint uniform_orders_payment_method_check
      check (payment_method in ('dues', 'stripe'));
  end if;
end $$;

comment on column public.uniform_orders.payment_method is
  'dues = the kit price sits inside parent_dues_enrollment.total_owed and this order must never be charged. stripe = the parent pays this order by card and the kit is NOT in their dues.';

-- Every order placed before this column existed was placed by a family whose
-- dues already carry the kit. Kyra is the only one, and 'dues' is her true state.
update public.uniform_orders
   set payment_method = 'dues', updated_at = now()
 where payment_method is distinct from 'dues'
   and status = 'pending_payment';

do $$
declare n int;
begin
  select count(*) into n from public.uniform_orders where payment_method = 'stripe';
  raise notice 'uniform orders set to pay by card: %', n;
end $$;

commit;
