-- Correct the earlier country-specific UNIDO research lead.
-- Use official UNIDO terminology. No country restriction on the generic technical-cooperation mechanism.
-- This is NOT an open funding call or eligibility determination.
update public.bov_hub_opportunities
set title='Technical Cooperation',
    country=null,
    theme='inclusive and sustainable industrial development industrial policy agro-industries local value addition clean energy energy efficiency climate action sustainable supply chains quality standards digitalization industrial skills entrepreneurship',
    applicant_types='{}'::text[],
    source_url='https://www.unido.org/technical-cooperation',
    status='unverified',
    eligibility='UNIDO Technical Cooperation is a global institutional service, not a universal grant programme. Country and applicant eligibility must be established for each specific initiative or call.',
    notes='Official UNIDO mechanism: Technical Cooperation. Generic international research lead; country offices and programme-specific eligibility must be recorded separately. No open call, deadline or funding ceiling verified.',
    updated_at=now()
where agency='UNIDO' and title='Industrial development and technical cooperation — Cameroon';
-- Prevent duplicate generic entries if this correction is re-run.
select agency,title,country,status,source_url from public.bov_hub_opportunities where agency='UNIDO';
