-- Public, aggregate-only funding summary for the landing page.
-- Returns totals only (no titles, links, organisers or sources). Safe to call with the public (anon) key.
create or replace function public.bov_public_funding_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select audience_tags, country_codes, deadline, total_budget_eur
    from public.bov_eu_funding_calls
    where status <> 'archived' and (deadline is null or deadline >= current_date)
  )
  select jsonb_build_object(
    'total',      (select count(*) from c),
    'closing30',  (select count(*) from c where deadline is not null and deadline <= current_date + 30),
    'budget',     (select coalesce(sum(total_budget_eur), 0) from c where total_budget_eur >= 1000),
    'euWide',     (select count(*) from c where coalesce(cardinality(country_codes), 0) = 0),
    'noDeadline', (select count(*) from c where deadline is null),
    'audience',   (select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb) from (
                     select tag, count(*) as n
                     from c cross join lateral unnest(
                       case when coalesce(cardinality(c.audience_tags), 0) = 0 then array['none'] else c.audience_tags end
                     ) as tag
                     group by tag) a),
    'countries',  (select coalesce(jsonb_object_agg(cc, n), '{}'::jsonb) from (
                     select cc, count(*) as n from c cross join lateral unnest(c.country_codes) as cc group by cc) x),
    'months',     (select coalesce(jsonb_object_agg(m, n), '{}'::jsonb) from (
                     select to_char(deadline, 'YYYY-MM') as m, count(*) as n from c where deadline is not null group by 1) y),
    'updatedAt',  (select max(finished_at) from public.bov_eu_scan_runs where status = 'success')
  );
$$;

revoke all on function public.bov_public_funding_summary() from public;
grant execute on function public.bov_public_funding_summary() to anon, authenticated;
