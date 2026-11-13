-- Blue Ocean Knowledge Hub: UNIDO industrial development research lead.
-- Run in Blue Ocean Supabase after Phase 6; staff-only RLS is inherited.
-- Official institutional mechanism, NOT a verified open call or grant.
insert into public.bov_hub_opportunities
(agency,title,country,theme,applicant_types,source_url,status,eligibility,notes)
select 'UNIDO','Industrial development and technical cooperation — Cameroon','Cameroon',
'industrial development manufacturing agro-processing vocational skills entrepreneurship youth employment renewable energy circular economy sustainable supply chains',
'{}'::text[],'https://www.unido.org/technical-cooperation','unverified',
'Technical cooperation, country partnerships, investment facilitation and project-based support. No general grant entitlement; verify programme-specific eligibility, Cameroon applicability and application process.',
'Mandate: inclusive and sustainable industrial development (SDG 9). Cameroon field office: Mr Raymond Tavares (officially listed representative), office.cameroon@unido.org, +237 222215582 / +237 222217445; https://www.unido.org/sub-sites/unido-worldwide/africa/offices/cameroon. Donor relations: donor-relations@unido.org (https://www.unido.org/funding-partners). No open call or deadline confirmed.'
where not exists (
 select 1 from public.bov_hub_opportunities
 where agency='UNIDO' and title='Industrial development and technical cooperation — Cameroon'
);
select agency,title,status from public.bov_hub_opportunities where agency='UNIDO';
