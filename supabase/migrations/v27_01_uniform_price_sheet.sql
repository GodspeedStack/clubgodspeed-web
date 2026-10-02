-- v27_01_uniform_price_sheet.sql
--
-- WHY
-- Four different uniform prices were live at once:
--   * parent-portal.html hardcoded 2 jerseys $52.93 + shorts $49.97 and no penny,
--     under a banner that claimed "$102.90 (1 jersey + 2 shorts)" -- wrong total,
--     wrong quantities, both backwards.
--   * uniform_config, which order-uniform.html actually charges from, held
--     jersey $63.00 / shorts $61.00 / penny $43.00 with set_price $187.00, and
--     set_price excluded the penny even though the penny is required.
--   * Kyra Gale was invoiced $667.67 = $472.90 Fall dues + $194.77 kit.
--   * Eleven earlier families were billed $627.78, a $154.88 kit that nothing in
--     this repo or database derives.
--
-- WHAT
-- $194.77 is the approved price: 2 jerseys $52.93 + shorts $49.97 + penny $38.94.
-- It is the figure a parent has actually been invoiced at, so it is the one the
-- portal and the checkout both have to show. This sets uniform_config to it.
--
-- The portal no longer carries its own copy of these numbers: gear-price-sheet.js
-- renders the card from this row, and create_uniform_order already charges
-- set_price from this row. After this migration there is exactly one place a
-- uniform price is written down.
--
-- NOT CHANGED ON PURPOSE
-- The eleven families at $627.78 are left alone -- grandfathered, no re-invoicing.
--
-- MARGIN NOTE, NOT A CHANGE
-- team_gear records what the club actually paid the vendor: jersey $56.94 x2,
-- blue shorts $54.96, penny $38.94 = $207.78. Billing $194.77 therefore costs the
-- club $13.01 per new player. $207.78 would be exact pass-through at zero markup.
-- Changing that is a one-line edit to the numbers below; it is deliberately not
-- made here, because Kyra's invoice is already out at $194.77.

begin;

update public.uniform_config
   set jersey_price   = 52.93,
       shorts_price   = 49.97,
       penny_price    = 38.94,
       backpack_price = 35.00,
       -- set_price is what create_uniform_order writes to uniform_orders.
       -- It must equal the required kit, penny included, or the checkout
       -- undercharges every new family by the price of a penny.
       set_price      = 194.77,
       product_name   = 'Godspeed Uniform Kit (2 Stitched Jerseys + Shorts + Practice Penny)',
       updated_at     = now()
 where id = 1;

-- Fail loudly rather than leave a billing surface half-set.
do $$
declare s numeric; j numeric; sh numeric; p numeric;
begin
  select set_price, jersey_price, shorts_price, penny_price
    into s, j, sh, p
    from public.uniform_config where id = 1;

  if s is null then
    raise exception 'uniform_config row 1 is missing';
  end if;

  if (j * 2 + sh + p) <> s then
    raise exception 'uniform_config does not reconcile: 2*% + % + % = % but set_price = %',
      j, sh, p, (j * 2 + sh + p), s;
  end if;

  raise notice 'uniform_config set: required kit %, itemised 2 x % + % + %', s, j, sh, p;
end $$;

commit;
