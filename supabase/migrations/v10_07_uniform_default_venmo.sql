-- v10_07: new uniform orders are billed separately (Venmo), not inside dues. Decision 2026-10-23.
-- Also fixes Dylan Carbonella's order UNI-261103-40A38, which the site wrongly marked as covered by dues.
begin;
alter table public.uniform_orders alter column payment_method set default 'venmo';

update public.uniform_orders
   set payment_method = 'venmo', updated_at = now(),
       notes = coalesce(notes,'') || ' [2026-11-16: kit billed separately for new players ($207.78, Venmo @Coachsco). Site wrongly said it was inside dues; payment_method corrected dues -> venmo.]'
 where order_number = 'UNI-261103-40A38' and payment_method = 'dues';

update public.athletes set jersey_number = 7, updated_at = now()
 where display_name = 'Dylan Carbonella' and jersey_number is null;
commit;
