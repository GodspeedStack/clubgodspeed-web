-- v10_07: new uniform orders are billed separately (Stripe card checkout, live 2026-11-16), not inside dues.
-- 'venmo' kept as a value for orders placed before Stripe went live (Dylan Carbonella).
-- Also fixes Dylan Carbonella's order UNI-261103-40A38, which the site wrongly marked as covered by dues.
begin;
alter table public.uniform_orders drop constraint if exists uniform_orders_payment_method_check;
alter table public.uniform_orders add constraint uniform_orders_payment_method_check
  check (payment_method in ('dues','stripe','venmo'));
alter table public.uniform_orders alter column payment_method set default 'stripe';

update public.uniform_orders
   set payment_method = 'venmo', updated_at = now(),
       notes = coalesce(notes,'') || ' [2026-11-16: kit billed separately for new players ($207.78, Venmo @Coachsco). Site wrongly said it was inside dues; payment_method corrected dues -> venmo.]'
 where order_number = 'UNI-261103-40A38' and payment_method = 'dues';

update public.athletes
   set jersey_number = coalesce(jersey_number, 7),
       notes = coalesce(notes,'') || ' [$200 practice fee PAID (Jeff Carbonella). Do not bill. Dues on hold until posted by Coach Scott.]',
       updated_at = now()
 where display_name = 'Dylan Carbonella';
commit;
