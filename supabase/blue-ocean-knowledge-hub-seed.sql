-- Blue Ocean Knowledge Hub starter reference records.
-- Run only in the Blue Ocean Supabase project SQL Editor.
-- General mandate profiles only. Do not label as verified funding opportunities.
-- Idempotent by institution title; does not overwrite edited records.

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','UNDP — United Nations Development Programme','Poverty reduction, democratic governance, climate action and sustainable development',array['Governance','Climate','Development','Jobs'],'https://www.undp.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='UNDP — United Nations Development Programme');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','UNICEF — United Nations Children''s Fund','Children''s rights, health, nutrition, education, WASH and protection',array['Education','Health','Children','WASH'],'https://www.unicef.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='UNICEF — United Nations Children''s Fund');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','UNESCO — United Nations Educational, Scientific and Cultural Organization','Education, sciences, culture, communication and information',array['Education','Culture','Science'],'https://www.unesco.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='UNESCO — United Nations Educational, Scientific and Cultural Organization');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','FAO — Food and Agriculture Organization of the United Nations','Food security, agriculture, fisheries, forestry and sustainable agrifood systems',array['Agriculture','Food security','Rural development'],'https://www.fao.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='FAO — Food and Agriculture Organization of the United Nations');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','IFAD — International Fund for Agricultural Development','Rural poverty reduction, smallholder agriculture and rural livelihoods',array['Rural development','Agriculture','Food systems'],'https://www.ifad.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='IFAD — International Fund for Agricultural Development');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','UNIDO — United Nations Industrial Development Organization','Inclusive and sustainable industrial development',array['Industry','SMEs','Energy','Skills'],'https://www.unido.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='UNIDO — United Nations Industrial Development Organization');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','UN Women — United Nations Entity for Gender Equality and the Empowerment of Women','Gender equality and empowerment of women and girls',array['Gender equality','Women''s economic empowerment'],'https://www.unwomen.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='UN Women — United Nations Entity for Gender Equality and the Empowerment of Women');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','UNFPA — United Nations Population Fund','Sexual and reproductive health, maternal health, population and young people',array['Health','Youth','Population'],'https://www.unfpa.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='UNFPA — United Nations Population Fund');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','WHO — World Health Organization','International public health, health systems and disease prevention',array['Health','Health systems'],'https://www.who.int/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='WHO — World Health Organization');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','WFP — World Food Programme','Food assistance, emergency response, nutrition and resilience',array['Food security','Humanitarian','Nutrition'],'https://www.wfp.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='WFP — World Food Programme');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','UNHCR — United Nations High Commissioner for Refugees','Protection of refugees, forcibly displaced and stateless people',array['Protection','Displacement','Humanitarian'],'https://www.unhcr.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='UNHCR — United Nations High Commissioner for Refugees');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','IOM — International Organization for Migration','Humane and orderly migration, migration governance and migrant assistance',array['Migration','Displacement','Labour mobility'],'https://www.iom.int/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='IOM — International Organization for Migration');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','UN-Habitat — United Nations Human Settlements Programme','Sustainable urbanisation, housing and human settlements',array['Housing','Cities','Urban planning'],'https://unhabitat.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='UN-Habitat — United Nations Human Settlements Programme');

insert into public.bov_hub_records (category,title,summary,sectors,source_url,source_reference,verification,details)
select 'institution','UNOPS — United Nations Office for Project Services','Infrastructure, procurement and project management services',array['Infrastructure','Procurement','Project delivery'],'https://www.unops.org/','Official agency homepage (mandate overview); programme-level eligibility and contacts require separate verification','unverified',jsonb_build_object('funding_status','Not assessed; no open call implied','contact_status','Named contacts not yet researched','research_note','Check country office, partnership portal and UNGM for current eligibility, funding and official contact details')
where not exists(select 1 from public.bov_hub_records where category='institution' and title='UNOPS — United Nations Office for Project Services');

-- Confirm the seeded records:
select category,count(*) as records from public.bov_hub_records group by category order by category;
