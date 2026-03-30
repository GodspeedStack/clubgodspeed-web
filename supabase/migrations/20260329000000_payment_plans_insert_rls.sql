-- Fix: parents were blocked from enrolling because no INSERT policy existed.
-- SELECT-only policies were added in 20260320000000_payment_plans.sql
-- but INSERT was never granted, causing silent RLS failures on enroll.

-- payment_plans: parent can insert their own row
create policy "Parents insert own plans"
  on public.payment_plans
  for insert
  with check (auth.uid() = parent_id);

-- payments: parent can insert installments belonging to their own plan
create policy "Parents insert own payments"
  on public.payments
  for insert
  with check (auth.uid() = parent_id);

-- payments: stripe webhook (service_role) must be able to update status to 'completed'
-- service_role bypasses RLS by default, so no additional policy needed for the webhook.
-- However, parents should also be able to read their own payments by parent_id
-- (existing policy covers profile_id match; add parent_id match as well)
drop policy if exists "Parents view own payments" on public.payments;
create policy "Parents view own payments"
  on public.payments
  for select
  using (auth.uid() = parent_id or auth.uid() = profile_id);
