-- Blue Ocean Ventures — Funding matching, phase 1
-- 1) bov_funding_programmes      : reference data for the 47 EU programmes 2021–2027 (typical rules, verify per call)
-- 2) bov_call_requirements       : one row of structured requirements per funding call
-- 3) bov_project_funding_profile : the matching profile of a client project
-- 4) bov_project_call_matches    : scored results (relevance, eligibility, criteria, total %)
-- Functions: bov_refresh_call_requirements(), bov_match_project(project_id)
-- Apply after the scanner v3 migration. Staff-only (bov_hub_access()).
begin;

-- ---------------------------------------------------------------------------
-- 1. Programme reference table
-- ---------------------------------------------------------------------------
create table if not exists public.bov_funding_programmes (
  code text primary key,
  no int unique,
  name text not null,
  category text not null,
  management_mode text not null check (management_mode in ('direct','indirect','shared','financial_instrument','external','special')),
  on_eu_portal boolean not null default false,
  id_pattern text,            -- regex on the EU topic identifier
  name_pattern text,          -- regex on programme / topic names
  applicant_types text[] not null default '{}',   -- sme, students, research, ngo, public, individuals
  themes text[] not null default '{}',
  funding_rate_min numeric(5,2),
  funding_rate_max numeric(5,2),
  consortium text not null default 'varies' check (consortium in ('none','optional','varies','required')),
  min_partners int,
  min_countries int,
  typical_grant_min numeric(16,2),
  typical_grant_max numeric(16,2),
  geography text,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.bov_funding_programmes
 (code,no,name,category,management_mode,on_eu_portal,id_pattern,name_pattern,applicant_types,themes,funding_rate_min,funding_rate_max,consortium,min_partners,min_countries,typical_grant_min,typical_grant_max,geography,notes) values
 ('HORIZON',1,'Horizon Europe','research_innovation','direct',true,'^HORIZON-(?!EIC|EIT)','Horizon Europe','{research,sme,public,ngo}','{research,innovation,science,health,climate,energy,digital,food,mobility}',70,100,'required',3,3,1000000,15000000,'EU + associated countries','Research & Innovation Actions usually 100%, Innovation Actions 70% for profit-making entities. Most actions need 3 independent entities from 3 countries.'),
 ('EIC',2,'European Innovation Council (EIC)','research_innovation','direct',true,'^HORIZON-EIC','European Innovation Council','{sme,individuals,research}','{deep tech,startups,breakthrough innovation,scale-up}',70,100,'varies',1,1,500000,2500000,'EU + associated countries','Accelerator: single start-up/SME, grant up to €2.5M (70%) plus optional equity. Pathfinder usually consortia.'),
 ('EIT',3,'European Institute of Innovation and Technology (EIT)','research_innovation','indirect',true,'^HORIZON-EIT','\mEIT ?[A-Z]','{sme,students,research,individuals}','{entrepreneurship,education,innovation,climate,health,food,urban mobility,culture}',null,null,'varies',null,null,10000,1000000,'EU + associated countries','Calls run by EIT Knowledge and Innovation Communities (cascade funding); rules differ per call.'),
 ('DIGITAL',4,'Digital Europe','research_innovation','direct',true,'^DIGITAL-','Digital Europe','{sme,public,research}','{artificial intelligence,cybersecurity,digital skills,data,high performance computing}',50,100,'varies',null,null,500000,10000000,'EU + associated (restrictions for some actions)','Simple grants often 50%, SME support actions up to 75%.'),
 ('INVESTEU',5,'InvestEU','finance','financial_instrument',false,'^INVESTEU','InvestEU','{sme,public}','{investment,loans,guarantees,infrastructure}',null,null,'none',null,null,null,null,'EU','Not a grant programme: loans, guarantees and equity through banks and implementing partners.'),
 ('SMP',6,'Single Market Programme','business','direct',true,'^SMP-','Single Market Programme','{sme,public,ngo}','{sme competitiveness,clusters,tourism,consumers,standardisation}',50,90,'varies',null,null,100000,3000000,'EU + participating countries',null),
 ('CEF',7,'Connecting Europe Facility (CEF)','infrastructure','direct',true,'^CEF-','Connecting Europe Facility','{public,sme}','{transport,energy,digital infrastructure}',30,85,'optional',null,null,1000000,100000000,'EU','Co-funding rates depend on sector and cohesion status.'),
 ('EURATOM',8,'Euratom Research and Training','research_innovation','direct',true,'^EURATOM-','Euratom','{research,sme}','{nuclear safety,fusion,radiation protection}',40,100,'required',3,3,1000000,10000000,'EU + associated countries',null),
 ('ITER',9,'ITER','research_innovation','special',false,'^(ITER|F4E)','\mITER\M|Fusion for Energy','{sme,research}','{fusion}',null,null,'none',null,null,null,null,'ITER members','Mainly procurement contracts via Fusion for Energy, not open grants.'),
 ('SPACE',10,'European Space Programme','research_innovation','indirect',true,'^(EUSPA|SPACE)-','EU Space Programme|EUSPA','{sme,research}','{space,satellite,galileo,copernicus,earth observation}',70,100,'varies',null,null,500000,5000000,'EU + participating countries',null),
 ('RFCS',11,'Research Fund for Coal and Steel','research_innovation','direct',true,'^RFCS-','Coal and Steel','{research,sme}','{steel,coal,industrial research,decarbonisation}',60,100,'required',2,2,1000000,5000000,'EU','Annual call.'),
 ('ERASMUS',12,'Erasmus+','education_social','indirect',true,'^ERASMUS-','Erasmus','{public,ngo,research,students,individuals,sme}','{education,training,youth,sport,mobility}',80,100,'varies',null,null,60000,1000000,'EU + associated countries; some actions worldwide','Many actions via National Agencies; centralised actions on the EU portal. Lump sums common.'),
 ('ESF',13,'European Social Fund Plus (ESF+)','education_social','shared',false,'^(ESF|SOCPL)-','ESF\+|European Social Fund','{public,ngo,sme}','{employment,skills,social inclusion,poverty}',50,95,'optional',null,null,null,null,'EU (national programmes)','Mostly national/regional calls; EaSI strand on the EU portal.'),
 ('ESC',14,'European Solidarity Corps','education_social','indirect',false,'^ESC-','Solidarity Corps','{ngo,public,individuals,students}','{volunteering,youth,solidarity}',100,100,'optional',null,null,null,null,'EU + partner countries','Young people 18–30; mostly via National Agencies.'),
 ('CERV',15,'Citizens, Equality, Rights and Values (CERV)','education_social','direct',true,'^CERV-','Citizens, Equality, Rights','{ngo,public}','{democracy,human rights,equality,gender,anti-discrimination,civil society}',80,90,'varies',null,null,75000,1000000,'EU + participating countries',null),
 ('JUST',16,'Justice Programme','education_social','direct',true,'^JUST-','Justice Programme','{ngo,public,research}','{justice,judicial training,access to justice}',80,90,'varies',2,2,75000,1000000,'EU (participating MS)',null),
 ('CREA',17,'Creative Europe','education_social','direct',true,'^CREA-','Creative Europe','{sme,ngo,individuals,public}','{culture,audiovisual,media,creative industries}',50,80,'varies',3,3,200000,2000000,'EU + participating countries','Cooperation projects require partners from at least 3 countries.'),
 ('EU4H',18,'EU4Health','education_social','direct',true,'^EU4H-','EU4Health','{public,ngo,research}','{health,health systems,disease prevention,cancer}',60,80,'varies',null,null,500000,5000000,'EU + associated countries',null),
 ('ERDF',19,'European Regional Development Fund (ERDF)','regional','shared',false,'^ERDF','ERDF|EFRE|Regional Development Fund','{sme,public,research,ngo}','{regional development,innovation,sme,energy,digital}',40,85,'optional',null,null,null,null,'EU regions (national/regional programmes)','Calls published by national/regional managing authorities.'),
 ('JTF',20,'Just Transition Fund (JTF)','regional','shared',false,'^JTF','Just Transition Fund','{public,sme,ngo}','{economic diversification,reskilling,climate neutrality}',null,85,'optional',null,null,null,null,'Territories with Just Transition plans',null),
 ('CF',21,'Cohesion Fund','regional','shared',false,'^CF-','Cohesion Fund','{public}','{environment,transport}',null,85,'none',null,null,null,null,'Member States with GNI below 90% of EU average','Austria is not eligible.'),
 ('INTERREG',22,'Interreg','regional','shared',false,'^INTERREG','Interreg','{public,ngo,research,sme}','{cross-border cooperation,territorial cooperation}',60,85,'required',2,2,200000,3000000,'Programme areas (cross-border, transnational, interregional)','Partners from at least 2 countries (often 3 for transnational).'),
 ('EUI',23,'European Urban Initiative (EUI)','regional','indirect',false,'^EUI-','European Urban Initiative','{public}','{urban innovation,sustainable cities}',80,80,'optional',null,null,1000000,5000000,'EU urban authorities',null),
 ('URBACT',24,'URBACT','regional','special',false,'^URBACT','URBACT','{public}','{urban policy,city networks}',70,85,'required',null,null,null,null,'EU cities','Networks of cities.'),
 ('ESPON',25,'ESPON','regional','special',false,'^ESPON','ESPON','{research,public}','{territorial research,spatial planning}',null,null,'varies',null,null,null,null,'ESPON area','Mostly targeted analyses and service contracts.'),
 ('I3',26,'Interregional Innovation Investments (I3)','regional','direct',true,'^I3-','Interregional Innovation Investment','{sme,public,research}','{regional innovation ecosystems,smart specialisation}',70,100,'required',2,2,1000000,10000000,'EU regions',null),
 ('RRF',27,'Recovery and Resilience Facility (RRF)','regional','shared',false,'^RRF','Recovery and Resilience','{public,sme}','{green transition,digital transition,reforms}',null,null,'none',null,null,null,null,'EU (national recovery plans)','Implemented through national calls.'),
 ('TSI',28,'Technical Support Instrument (TSI)','regional','special',false,'^TSI','Technical Support Instrument','{public}','{public administration reform}',null,null,'none',null,null,null,null,'EU Member States','On request of Member State governments.'),
 ('LIFE',29,'LIFE','environment_climate','direct',true,'^LIFE-','\mLIFE\M programme','{sme,ngo,public,research}','{environment,biodiversity,nature,circular economy,climate action,clean energy transition}',60,95,'optional',null,null,500000,15000000,'EU + associated countries','Standard Action Projects typically 60–67%; operating grants for NGOs.'),
 ('INNOVFUND',30,'Innovation Fund','environment_climate','direct',true,'^INNOVFUND-','Innovation Fund','{sme}','{net-zero technologies,hydrogen,renewable energy,industrial decarbonisation,energy storage}',null,60,'none',1,1,2500000,100000000,'EU + EEA','Up to 60% of relevant costs; also competitive auctions.'),
 ('MODF',31,'Modernisation Fund','environment_climate','special',false,'^MODF','Modernisation Fund','{public}','{energy systems,energy efficiency}',null,null,'none',null,null,null,null,'13 lower-income Member States','Investments proposed by beneficiary Member States.'),
 ('EAGF',32,'European Agricultural Guarantee Fund (EAGF)','environment_climate','shared',false,'^(EAGF|AGRIP)-','Agricultural Guarantee|promotion of agricultural','{individuals,sme}','{agriculture,farm income,market support,promotion of agricultural products}',null,null,'none',null,null,null,null,'EU (national paying agencies)','CAP direct payments; agri-product promotion calls on the EU portal (AGRIP).'),
 ('EAFRD',33,'European Agricultural Fund for Rural Development (EAFRD)','environment_climate','shared',false,'^EAFRD','EAFRD|Fund for Rural Development','{individuals,sme,public,ngo}','{rural development,farms,leader,agri-environment}',null,null,'optional',null,null,null,null,'EU (national CAP plans)','Calls via national CAP Strategic Plans and LEADER groups.'),
 ('EMFAF',34,'European Maritime, Fisheries and Aquaculture Fund (EMFAF)','environment_climate','shared',true,'^EMFAF-','EMFAF|Maritime, Fisheries','{sme,public,ngo,research}','{fisheries,aquaculture,blue economy,maritime}',null,null,'varies',null,null,null,null,'EU','Mostly national programmes; some direct calls on the EU portal.'),
 ('AMIF',35,'Asylum, Migration and Integration Fund (AMIF)','security_migration','shared',true,'^AMIF-','Asylum, Migration and Integration','{public,ngo}','{migration,integration,asylum}',80,90,'varies',null,null,null,null,'EU','National programmes plus Union actions on the EU portal.'),
 ('ISF',36,'Internal Security Fund (ISF)','security_migration','shared',true,'^ISF-','Internal Security Fund','{public,research,ngo}','{security,organised crime,terrorism,cybercrime}',80,90,'varies',null,null,null,null,'EU',null),
 ('BMVI',37,'Border Management and Visa Instrument (BMVI)','security_migration','shared',true,'^BMVI-','Border Management and Visa','{public}','{border management,visa}',null,null,'varies',null,null,null,null,'EU (Schengen)',null),
 ('EDF',38,'European Defence Fund (EDF)','security_migration','direct',true,'^EDF-','European Defence Fund','{sme,research}','{defence research,defence capabilities}',20,100,'required',3,3,1000000,100000000,'EU + Norway','Consortia of at least 3 entities from 3 eligible countries; 100% research, lower for development.'),
 ('UCPM',39,'EU Civil Protection Mechanism (rescEU)','security_migration','direct',true,'^UCPM-','Civil Protection Mechanism|rescEU','{public,ngo,research}','{disaster prevention,preparedness,civil protection}',85,95,'varies',null,null,null,null,'EU + participating states',null),
 ('EUAF',40,'EU Anti-Fraud Programme','security_migration','direct',true,'^EUAF-','Anti-Fraud','{public,research,ngo}','{fraud prevention,customs,financial protection}',80,90,'varies',null,null,null,null,'EU',null),
 ('FISCALIS',41,'Fiscalis','security_migration','special',false,'^FISC','Fiscalis','{public}','{taxation}',null,null,'none',null,null,null,null,'Tax administrations','Cooperation between tax administrations; no open grants for private applicants.'),
 ('CUSTOMS',42,'Customs Programme','security_migration','special',false,'^CUST','Customs Programme','{public}','{customs}',null,null,'none',null,null,null,null,'Customs administrations',null),
 ('NDICI',43,'Global Europe (NDICI)','international','external',true,'^(NDICI|EUROPEAID)','Global Europe|NDICI|EuropeAid|civil society organisations for actions in','{ngo,public,sme,research}','{development,governance,human rights,civil society,climate,migration,education}',80,95,'varies',null,null,100000,5000000,'Partner countries worldwide (incl. Africa)','Calls often issued by EU Delegations; local co-applicants frequently required.'),
 ('IPA',44,'Instrument for Pre-Accession Assistance (IPA III)','international','external',true,'^IPA','IPA III|Pre-Accession','{public,ngo,sme}','{eu accession,institutional reform,economic development}',80,95,'varies',null,null,null,null,'Candidate and potential candidate countries',null),
 ('ECHO',45,'EU Humanitarian Aid','international','special',false,'^ECHO','Humanitarian Aid','{ngo}','{humanitarian aid,emergencies}',null,null,'none',null,null,null,null,'Worldwide','Only certified humanitarian partners (Humanitarian Partnership) and international organisations.'),
 ('CFSP',46,'Common Foreign and Security Policy (CFSP)','international','special',false,'^(CFSP|FPI)','Foreign and Security Policy','{public,ngo}','{peace,conflict prevention,security}',null,null,'none',null,null,null,null,'Worldwide','Mainly international organisations and Member State agencies.'),
 ('OCT',47,'Overseas Countries and Territories','international','external',false,'^OCT','Overseas Countries and Territories','{public,ngo}','{development,climate resilience}',null,null,'none',null,null,null,null,'EU Overseas Countries and Territories',null)
on conflict (code) do update set
  no=excluded.no,name=excluded.name,category=excluded.category,management_mode=excluded.management_mode,on_eu_portal=excluded.on_eu_portal,
  id_pattern=excluded.id_pattern,name_pattern=excluded.name_pattern,applicant_types=excluded.applicant_types,themes=excluded.themes,
  funding_rate_min=excluded.funding_rate_min,funding_rate_max=excluded.funding_rate_max,consortium=excluded.consortium,
  min_partners=excluded.min_partners,min_countries=excluded.min_countries,typical_grant_min=excluded.typical_grant_min,
  typical_grant_max=excluded.typical_grant_max,geography=excluded.geography,notes=excluded.notes,updated_at=now();

-- ---------------------------------------------------------------------------
-- 2. Requirements per call
-- ---------------------------------------------------------------------------
create table if not exists public.bov_call_requirements (
  call_id uuid primary key references public.bov_eu_funding_calls(id) on delete cascade,
  programme_code text references public.bov_funding_programmes(code),
  applicant_types text[] not null default '{}',
  eligible_countries text[] not null default '{}',     -- empty = EU Member States + associated countries (check call)
  themes text[] not null default '{}',
  grant_min numeric(16,2),
  grant_max numeric(16,2),
  total_call_budget numeric(16,2),
  funding_rate_min numeric(5,2),
  funding_rate_max numeric(5,2),
  consortium_required boolean,
  min_partners int,
  min_countries int,
  trl_min int check (trl_min between 1 and 9),
  trl_max int check (trl_max between 1 and 9),
  duration_months_max int,
  deadline date,
  extra jsonb not null default '{}'::jsonb,
  source text not null default 'programme_default' check (source in ('programme_default','auto_extracted','staff_verified')),
  confidence numeric(3,2) not null default 0.40,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists bov_call_requirements_programme on public.bov_call_requirements(programme_code);

-- ---------------------------------------------------------------------------
-- 3. Project funding profile (works with either bov_projects layout)
-- ---------------------------------------------------------------------------
create table if not exists public.bov_project_funding_profile (
  project_id uuid primary key references public.bov_projects(id) on delete cascade,
  applicant_type text check (applicant_type in ('sme','students','research','ngo','public','individuals')),
  country text,                                 -- ISO code, e.g. AT, ES, BJ
  sectors text[] not null default '{}',
  keywords text[] not null default '{}',
  summary text,
  budget_needed_eur numeric(16,2),
  cofinancing_available_pct numeric(5,2) check (cofinancing_available_pct between 0 and 100),
  trl int check (trl between 1 and 9),
  partner_count int not null default 1,
  partner_countries text[] not null default '{}',
  duration_months int,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Match results
-- ---------------------------------------------------------------------------
create table if not exists public.bov_project_call_matches (
  project_id uuid not null references public.bov_projects(id) on delete cascade,
  call_id uuid not null references public.bov_eu_funding_calls(id) on delete cascade,
  relevance_score numeric(5,2) not null,
  eligibility_score numeric(5,2) not null,
  criteria_score numeric(5,2) not null,
  total_score numeric(5,2) not null,
  eligibility_status text not null check (eligibility_status in ('eligible','ineligible','unconfirmed')),
  reasons jsonb not null default '[]'::jsonb,
  missing jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (project_id, call_id)
);
create index if not exists bov_matches_project_total on public.bov_project_call_matches(project_id, total_score desc);

-- Security: staff only
alter table public.bov_funding_programmes enable row level security;
alter table public.bov_call_requirements enable row level security;
alter table public.bov_project_funding_profile enable row level security;
alter table public.bov_project_call_matches enable row level security;
revoke all on public.bov_funding_programmes, public.bov_call_requirements, public.bov_project_funding_profile, public.bov_project_call_matches from anon;
grant select on public.bov_funding_programmes, public.bov_call_requirements, public.bov_project_call_matches to authenticated;
grant select, insert, update on public.bov_project_funding_profile to authenticated;
grant update on public.bov_call_requirements to authenticated;
drop policy if exists bov_prog_read on public.bov_funding_programmes;
create policy bov_prog_read on public.bov_funding_programmes for select to authenticated using (public.bov_hub_access());
drop policy if exists bov_req_read on public.bov_call_requirements;
create policy bov_req_read on public.bov_call_requirements for select to authenticated using (public.bov_hub_access());
drop policy if exists bov_req_verify on public.bov_call_requirements;
create policy bov_req_verify on public.bov_call_requirements for update to authenticated using (public.bov_hub_access()) with check (public.bov_hub_access());
drop policy if exists bov_profile_rw on public.bov_project_funding_profile;
create policy bov_profile_rw on public.bov_project_funding_profile for all to authenticated using (public.bov_hub_access()) with check (public.bov_hub_access());
drop policy if exists bov_match_read on public.bov_project_call_matches;
create policy bov_match_read on public.bov_project_call_matches for select to authenticated using (public.bov_hub_access());

-- ---------------------------------------------------------------------------
-- 5. Fill / refresh call requirements (programme defaults + rules read from call text)
--    Never overwrites rows verified by staff.
-- ---------------------------------------------------------------------------
create or replace function public.bov_refresh_call_requirements()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  with c as (
    select f.id, f.title, coalesce(f.summary,'') as summary, f.deadline, f.total_budget_eur,
           coalesce(f.audience_tags,'{}') as audience_tags, coalesce(f.country_codes,'{}') as country_codes,
           coalesce(f.parent_topic_id,'') as tid, concat_ws(' | ', f.parent_topic, f.programme, f.title) as txt,
           lower(concat_ws(' ', f.title, f.summary)) as body
    from bov_eu_funding_calls f
    where f.status <> 'archived' and (f.deadline is null or f.deadline >= current_date)
  ),
  cp as (
    select distinct on (c.id) c.*, p.code, p.applicant_types as p_app, p.themes as p_themes, p.funding_rate_min as p_rmin,
           p.funding_rate_max as p_rmax, p.consortium as p_cons, p.min_partners as p_minp, p.min_countries as p_minc,
           p.typical_grant_min as p_gmin, p.typical_grant_max as p_gmax
    from c left join bov_funding_programmes p on (c.tid ~ p.id_pattern or c.txt ~* p.name_pattern)
    order by c.id, (c.tid ~ coalesce(p.id_pattern,'^$')) desc, p.no
  ),
  x as (
    select cp.*,
      nullif(substring(body from '(?:funding rate|co-?financ\w*|reimburs\w*|up to|cover\w*)[^.%]{0,60}?(\d{2,3})\s?%'),'')::numeric as t_rate,
      (select min(m[1]::int) from regexp_matches(body, '\mtrl\s?([1-9])', 'g') m) as t_trl_a,
      (select max(greatest(m[1]::int, coalesce(m[2],'0')::int)) from regexp_matches(body, '\mtrl\s?([1-9])(?:\s?(?:-|to|–)\s?(?:trl\s?)?([1-9]))?', 'g') m) as t_trl_b,
      case when body ~ 'at least (three|3) (independent )?(legal )?(entities|partners|organisations|organizations|applicants)' then 3
           when body ~ 'at least (two|2) (independent )?(legal )?(entities|partners|organisations|organizations|applicants)' then 2 end as t_minp,
      case when body ~ '(from|in|established in) at least (three|3) (different )?(eligible )?(countries|member states)' then 3
           when body ~ '(from|in|established in) at least (two|2) (different )?(eligible )?(countries|member states)' then 2 end as t_minc,
      nullif(regexp_replace(regexp_replace(substring(body from '(?:maximum|up to|max\.?)\s*(?:of\s*)?(?:eur|€)\s?([0-9][0-9 .,]{2,12})'),'[.,][0-9]{2}\s*$',''),'[^0-9]','','g'),'')::numeric as t_gmax,
      substring(body from 'duration[^.]{0,40}?(\d{1,2})\s?months')::int as t_dur,
      (body ~ '\m(single|mono)[- ]beneficiary|individual applicants? (may|can) apply|one applicant') as t_single
    from cp
  ),
  ins as (
    insert into bov_call_requirements as r (call_id, programme_code, applicant_types, eligible_countries, themes, grant_min, grant_max, total_call_budget,
      funding_rate_min, funding_rate_max, consortium_required, min_partners, min_countries, trl_min, trl_max, duration_months_max, deadline, extra, source, confidence, updated_at)
    select x.id, x.code,
      case when cardinality(x.audience_tags) > 0 then x.audience_tags else coalesce(x.p_app,'{}') end,
      x.country_codes,
      coalesce(x.p_themes,'{}'),
      x.p_gmin,
      coalesce(case when x.t_gmax between 1000 and 500000000 then x.t_gmax end, x.p_gmax),
      x.total_budget_eur,
      x.p_rmin,
      coalesce(case when x.t_rate between 10 and 100 then x.t_rate end, x.p_rmax),
      case when x.t_single then false when coalesce(x.t_minp,0) >= 2 then true when x.p_cons = 'required' then true when x.p_cons in ('none','optional') then false end,
      case when x.t_single then 1 else coalesce(x.t_minp, x.p_minp) end,
      case when x.t_single then 1 else coalesce(x.t_minc, x.p_minc) end,
      x.t_trl_a, coalesce(x.t_trl_b, x.t_trl_a), x.t_dur, x.deadline,
      jsonb_build_object('rate_from_text', x.t_rate, 'grant_max_from_text', x.t_gmax, 'partners_from_text', x.t_minp, 'countries_from_text', x.t_minc),
      case when x.t_rate is not null or x.t_minp is not null or x.t_trl_a is not null or x.t_gmax is not null then 'auto_extracted' else 'programme_default' end,
      case when x.code is null then 0.25 when x.t_rate is not null or x.t_minp is not null then 0.6 else 0.4 end,
      now()
    from x
    on conflict (call_id) do update set
      programme_code=excluded.programme_code, applicant_types=excluded.applicant_types, eligible_countries=excluded.eligible_countries,
      themes=excluded.themes, grant_min=excluded.grant_min, grant_max=excluded.grant_max, total_call_budget=excluded.total_call_budget,
      funding_rate_min=excluded.funding_rate_min, funding_rate_max=excluded.funding_rate_max, consortium_required=excluded.consortium_required,
      min_partners=excluded.min_partners, min_countries=excluded.min_countries, trl_min=excluded.trl_min, trl_max=excluded.trl_max,
      duration_months_max=excluded.duration_months_max, deadline=excluded.deadline, extra=excluded.extra, source=excluded.source,
      confidence=excluded.confidence, updated_at=now()
    where r.source <> 'staff_verified'
    returning 1
  )
  select count(*) into n from ins;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Match one project against all live calls
--    total = 40% relevance + 35% eligibility + 25% criteria fit; ineligible calls are capped at 20%.
-- ---------------------------------------------------------------------------
create or replace function public.bov_match_project(p_project uuid)
returns table (call_id uuid, title text, total_score numeric, relevance_score numeric, eligibility_score numeric,
               criteria_score numeric, eligibility_status text, reasons jsonb, missing jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  eu text[] := '{AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE}';
  prof bov_project_funding_profile%rowtype;
  ptext text; pq tsquery; nlex int;
begin
  if not public.bov_hub_access() then raise exception 'Knowledge Hub staff permission required'; end if;
  select * into prof from bov_project_funding_profile where project_id = p_project;
  -- project text: profile + whatever the project record holds (title/name, description/objectives, sector)
  select concat_ws(' ', prof.summary, array_to_string(prof.sectors,' '), array_to_string(prof.keywords,' '), array_to_string(prof.keywords,' '),
           j->>'title', j->>'project_name', j->>'description', j->>'objectives', j->>'sector', j->>'beneficiaries')
    into ptext from (select to_jsonb(p) j from bov_projects p where p.id = p_project) s;
  if ptext is null then raise exception 'Project not found'; end if;
  if prof.project_id is null then
    prof.project_id := p_project; prof.partner_count := 1; prof.sectors := '{}'; prof.keywords := '{}'; prof.partner_countries := '{}';
    select upper(nullif(j->>'country','')), nullif(j->>'applicant_type','') into prof.country, prof.applicant_type
      from (select to_jsonb(p) j from bov_projects p where p.id = p_project) s;
    if length(coalesce(prof.country,'')) <> 2 then prof.country := null; end if;
    if prof.applicant_type not in ('sme','students','research','ngo','public','individuals') then prof.applicant_type := null; end if;
  end if;
  -- the project's most frequent meaningful words (max 40) → OR query
  select string_agg(quote_literal(word), ' | '), count(*) into pq, nlex from (
    select word from ts_stat(format('select to_tsvector(''english'', %L)', ptext)) where length(word) > 2 order by nentry desc, word limit 40) w;
  if nlex is null or nlex = 0 then raise exception 'Add a project summary or keywords before matching'; end if;

  perform bov_refresh_call_requirements() where not exists (select 1 from bov_call_requirements);

  delete from bov_project_call_matches m where m.project_id = p_project;

  insert into bov_project_call_matches (project_id, call_id, relevance_score, eligibility_score, criteria_score, total_score, eligibility_status, reasons, missing, computed_at)
  select p_project, s.id, s.rel, s.elig, s.crit,
         round(case when s.status = 'ineligible' then least(20, .4*s.rel + .35*s.elig + .25*s.crit) else .4*s.rel + .35*s.elig + .25*s.crit end, 2),
         s.status, s.reasons, s.missing, now()
  from (
    select f.id,
      -- relevance: share of the project's key words found in the call, plus a bonus for matching sectors
      least(100, round(100.0 * (select count(*) from unnest(tsvector_to_array(to_tsvector('english', concat_ws(' ', f.title, f.summary, array_to_string(r.themes,' '))))) l
                                  where l = any(string_to_array(regexp_replace(pq::text, '[''\s]', '', 'g'), '|')))
                     / greatest(8, least(nlex, 25))
            + case when prof.sectors && coalesce(r.themes,'{}') then 15 else 0 end, 2)) as rel,
      e.elig, e.status, cr.crit,
      e.reasons || cr.reasons as reasons, e.missing || cr.missing as missing
    from bov_eu_funding_calls f
    join bov_call_requirements r on r.call_id = f.id
    cross join lateral (
      select
        round(avg(v.score), 2) as elig,
        case when bool_or(v.result = 'fail') then 'ineligible' when bool_or(v.result = 'unknown') then 'unconfirmed' else 'eligible' end as status,
        coalesce(jsonb_agg(v.reason) filter (where v.reason is not null), '[]'::jsonb) as reasons,
        coalesce(jsonb_agg(v.miss) filter (where v.miss is not null), '[]'::jsonb) as missing
      from (values
        -- applicant type
        (case when cardinality(r.applicant_types)=0 or prof.applicant_type is null then 'unknown' when prof.applicant_type = any(r.applicant_types) then 'pass' else 'fail' end,
         case when cardinality(r.applicant_types)=0 or prof.applicant_type is null then 50 when prof.applicant_type = any(r.applicant_types) then 100 else 0 end,
         case when prof.applicant_type = any(r.applicant_types) then jsonb_build_object('ok', 'Applicant type accepted') when prof.applicant_type is not null and cardinality(r.applicant_types)>0 then jsonb_build_object('fail','Applicant type not targeted by this call') end,
         case when prof.applicant_type is null then to_jsonb('Applicant type'::text) end),
        -- country
        (case when prof.country is null then 'unknown'
              when cardinality(r.eligible_countries)>0 and (prof.country = any(r.eligible_countries) or prof.partner_countries && r.eligible_countries) then 'pass'
              when cardinality(r.eligible_countries)>0 then 'unknown'
              when prof.country = any(eu) then 'pass' else 'unknown' end,
         case when prof.country is null then 50
              when cardinality(r.eligible_countries)>0 and (prof.country = any(r.eligible_countries) or prof.partner_countries && r.eligible_countries) then 100
              when cardinality(r.eligible_countries)>0 then 25
              when prof.country = any(eu) then 100 else 50 end,
         case when cardinality(r.eligible_countries)>0 and prof.country is not null and not (prof.country = any(r.eligible_countries) or prof.partner_countries && r.eligible_countries)
                then jsonb_build_object('warn','Call targets '||array_to_string(r.eligible_countries,', ')||' — a local partner may be needed')
              when prof.country = any(eu) or prof.country = any(r.eligible_countries) then jsonb_build_object('ok','Country eligible')
              when prof.country is not null then jsonb_build_object('warn','Applicant country outside the EU — check association / third-country rules') end,
         case when prof.country is null then to_jsonb('Country'::text) end),
        -- deadline
        (case when f.deadline is null then 'unknown' when f.deadline < current_date + 14 then 'unknown' else 'pass' end,
         case when f.deadline is null then 60 when f.deadline < current_date + 14 then 40 else 100 end,
         case when f.deadline < current_date + 14 then jsonb_build_object('warn','Deadline in less than 14 days') when f.deadline is not null then jsonb_build_object('ok','Deadline '||to_char(f.deadline,'DD Mon YYYY')) end,
         null::jsonb),
        -- consortium
        (case when r.consortium_required is not true then 'pass'
              when prof.partner_count >= coalesce(r.min_partners,2) and cardinality(prof.partner_countries) + 1 >= coalesce(r.min_countries,1) then 'pass' else 'unknown' end,
         case when r.consortium_required is not true then 100
              when prof.partner_count >= coalesce(r.min_partners,2) and cardinality(prof.partner_countries) + 1 >= coalesce(r.min_countries,1) then 100 else 40 end,
         case when r.consortium_required and prof.partner_count < coalesce(r.min_partners,2)
                then jsonb_build_object('warn','Consortium needed: at least '||coalesce(r.min_partners,2)||' partners'||coalesce(' from '||r.min_countries||' countries',''))
              when r.consortium_required then jsonb_build_object('ok','Consortium requirement met') end,
         null::jsonb)
      ) v(result, score, reason, miss)
    ) e
    cross join lateral (
      select round(avg(k.score), 2) as crit,
             coalesce(jsonb_agg(k.reason) filter (where k.reason is not null), '[]'::jsonb) as reasons,
             coalesce(jsonb_agg(k.miss) filter (where k.miss is not null), '[]'::jsonb) as missing
      from (values
        (case when prof.budget_needed_eur is null or (r.grant_min is null and r.grant_max is null) then 60
              when prof.budget_needed_eur between coalesce(r.grant_min,0) and coalesce(r.grant_max, 1e15) then 100
              when prof.budget_needed_eur > coalesce(r.grant_max,1e15) then 40 else 70 end,
         case when prof.budget_needed_eur is not null and r.grant_max is not null and prof.budget_needed_eur > r.grant_max then jsonb_build_object('warn','Budget above typical grant size (€'||to_char(r.grant_max,'FM999G999G999')||')')
              when prof.budget_needed_eur is not null and r.grant_max is not null then jsonb_build_object('ok','Budget within grant range') end,
         case when prof.budget_needed_eur is null then to_jsonb('Budget needed'::text) end),
        (case when r.funding_rate_max is null or r.funding_rate_max >= 100 then 100 when prof.cofinancing_available_pct is null then 60
              when prof.cofinancing_available_pct >= 100 - r.funding_rate_max then 100 else 30 end,
         case when r.funding_rate_max < 100 and prof.cofinancing_available_pct is not null and prof.cofinancing_available_pct < 100 - r.funding_rate_max
                then jsonb_build_object('warn','Co-financing of '||trim_scale(100 - r.funding_rate_max)||'% needed')
              when r.funding_rate_max < 100 then jsonb_build_object('ok','Funding rate up to '||trim_scale(r.funding_rate_max)||'%') end,
         case when r.funding_rate_max < 100 and prof.cofinancing_available_pct is null then to_jsonb('Co-financing capacity'::text) end),
        (case when r.trl_min is null then 100 when prof.trl is null then 60 when prof.trl between r.trl_min - 1 and coalesce(r.trl_max, 9) then 100 else 40 end,
         case when r.trl_min is not null and prof.trl is not null and not (prof.trl between r.trl_min - 1 and coalesce(r.trl_max,9)) then jsonb_build_object('warn','Technology readiness should be TRL '||r.trl_min||coalesce('–'||r.trl_max,'')) end,
         case when r.trl_min is not null and prof.trl is null then to_jsonb('Technology readiness level (TRL)'::text) end),
        (case when r.duration_months_max is null or prof.duration_months is null then 100 when prof.duration_months <= r.duration_months_max then 100 else 50 end,
         case when prof.duration_months > r.duration_months_max then jsonb_build_object('warn','Project longer than '||r.duration_months_max||' months') end,
         null::jsonb)
      ) k(score, reason, miss)
    ) cr
    where f.status <> 'archived' and (f.deadline is null or f.deadline >= current_date)
  ) s;

  return query
    select m.call_id, f.title, m.total_score, m.relevance_score, m.eligibility_score, m.criteria_score, m.eligibility_status, m.reasons, m.missing
    from bov_project_call_matches m join bov_eu_funding_calls f on f.id = m.call_id
    where m.project_id = p_project
    order by m.total_score desc
    limit 50;
end;
$$;

revoke all on function public.bov_refresh_call_requirements() from public, anon;
revoke all on function public.bov_match_project(uuid) from public, anon;
grant execute on function public.bov_match_project(uuid) to authenticated;

-- Fill requirements for all live calls now
select public.bov_refresh_call_requirements();

-- Refresh requirements every night after the 03:00 scans (only if Supabase Cron is enabled)
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'bov-refresh-call-requirements';
    perform cron.schedule('bov-refresh-call-requirements', '20 3 * * *', 'select public.bov_refresh_call_requirements()');
  end if;
end
$cron$;

commit;
