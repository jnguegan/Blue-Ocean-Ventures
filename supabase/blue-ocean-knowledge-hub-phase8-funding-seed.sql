-- Phase 8: internal RESEARCH LEADS, not open calls or eligibility approvals.
-- Run in Blue Ocean Supabase SQL Editor after Phase 6. Existing records retained.
-- Staff-only RLS inherited from bov_hub_opportunities. No public/client grants.
-- Sources are agency landing pages; confirm each mechanism and its current terms before outreach.
insert into public.bov_hub_opportunities(agency,title,country,theme,applicant_types,source_url,status,eligibility,notes)
select 'UNDP','Country programme implementing partnerships','Cameroon','governance education youth livelihoods climate resilience',array['Foundation']::text[],'https://www.undp.org/cameroon','unverified','Research lead only; no active call, grant amount, deadline or foundation eligibility confirmed.','Country office partnerships depend on specific calls and programme arrangements; applicant and country eligibility unverified.'
where not exists(select 1 from public.bov_hub_opportunities where agency='UNDP' and title='Country programme implementing partnerships');

insert into public.bov_hub_opportunities(agency,title,country,theme,applicant_types,source_url,status,eligibility,notes)
select 'UNICEF','Civil society programme partnerships','Cameroon','education children youth protection health nutrition',array['Foundation']::text[],'https://www.unpartnerportal.org/','unverified','Research lead only; no active call, grant amount, deadline or foundation eligibility confirmed.','UN Partner Portal partnership opportunities; specific call, applicant registration and due diligence must be checked.'
where not exists(select 1 from public.bov_hub_opportunities where agency='UNICEF' and title='Civil society programme partnerships');

insert into public.bov_hub_opportunities(agency,title,country,theme,applicant_types,source_url,status,eligibility,notes)
select 'UNESCO','Participation Programme','Cameroon','education skills youth culture science',array['Foundation']::text[],'https://www.unesco.org/en/member-states-portal/participation-programme','unverified','Research lead only; no active call, grant amount, deadline or foundation eligibility confirmed.','Member States and eligible NGOs in official partnership; an independent foundation cannot be presumed eligible. National Commission route required.'
where not exists(select 1 from public.bov_hub_opportunities where agency='UNESCO' and title='Participation Programme');

insert into public.bov_hub_opportunities(agency,title,country,theme,applicant_types,source_url,status,eligibility,notes)
select 'FAO','Country programme technical cooperation','Cameroon','agriculture food security rural livelihoods training',array['Foundation']::text[],'https://www.fao.org/cameroon/en/','unverified','Research lead only; no active call, grant amount, deadline or foundation eligibility confirmed.','FAO is not a general grant-maker; country programmes and specific partner opportunities require confirmation.'
where not exists(select 1 from public.bov_hub_opportunities where agency='FAO' and title='Country programme technical cooperation');

insert into public.bov_hub_opportunities(agency,title,country,theme,applicant_types,source_url,status,eligibility,notes)
select 'IFAD','Rural development grants and country programmes','Cameroon','rural agriculture smallholder livelihoods youth employment',array['Foundation']::text[],'https://www.ifad.org/en/grants','unverified','Research lead only; no active call, grant amount, deadline or foundation eligibility confirmed.','IFAD grant recipients and conditions vary by programme. An education/sports campus alone is not evidence of mandate fit.'
where not exists(select 1 from public.bov_hub_opportunities where agency='IFAD' and title='Rural development grants and country programmes');

select agency,title,status from public.bov_hub_opportunities order by agency,title;
