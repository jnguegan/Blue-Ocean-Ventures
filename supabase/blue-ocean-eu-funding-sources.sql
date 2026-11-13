-- EU Funding Intelligence: official source registry. Run in Blue Ocean Supabase SQL Editor.
begin;
create table if not exists public.bov_eu_funding_sources (
 id uuid primary key default gen_random_uuid(),
 source_key text not null unique,
 source_name text not null,
 country_code text,
 region text,
 scope text not null check(scope in ('eu','national','regional','cross_border')),
 official_url text not null check(official_url ~* '^https://'),
 ingestion_method text not null default 'manual_review' check(ingestion_method in ('official_api','official_feed','manual_review')),
 enabled boolean not null default true,
 scan_status text not null default 'not_configured',
 last_scanned_at timestamptz,
 last_error text,
 created_at timestamptz not null default now()
);
alter table public.bov_eu_funding_sources enable row level security;
revoke all on public.bov_eu_funding_sources from anon;
grant select on public.bov_eu_funding_sources to authenticated;
drop policy if exists bov_eu_sources_read on public.bov_eu_funding_sources;
create policy bov_eu_sources_read on public.bov_eu_funding_sources for select to authenticated using(public.bov_hub_access());
insert into public.bov_eu_funding_sources(source_key,source_name,country_code,region,scope,official_url,ingestion_method) values
('eu-ft','EU Funding & Tenders Portal',null,null,'eu','https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home','official_api'),
('eu-national','European Commission national funding portals',null,null,'eu','https://commission.europa.eu/funding-and-tenders/find-funding/funding-management-mode/national-single-portals_en','manual_review'),
('es-funds','Spain European Funds','ES',null,'national','https://fondoseuropeos.gob.es/','manual_review'),
('es-canarias','Canary Islands European Funds','ES','Canary Islands','regional','https://www.gobiernodecanarias.org/fondoseuropeos/temas/convocatorias/index.html','manual_review'),
('pt-2030','Portugal 2030 calls','PT',null,'national','https://transparencia.gov.pt/pt/fundos-europeus/pt2030/avisos/','manual_review'),
('pt-madeira','Portugal 2030 - Madeira','PT','Madeira','regional','https://transparencia.gov.pt/pt/fundos-europeus/pt2030/avisos/','manual_review'),
('pt-acores','Portugal 2030 - Azores','PT','Azores','regional','https://transparencia.gov.pt/pt/fundos-europeus/pt2030/avisos/','manual_review'),
('interreg-mac','Interreg MAC','ES','Canary Islands / Madeira / Azores','cross_border','https://interregmac.org/','manual_review'),
('interreg-eu','Interreg programmes',null,null,'cross_border','https://interreg.eu/','manual_review')
on conflict(source_key) do update set source_name=excluded.source_name,country_code=excluded.country_code,region=excluded.region,scope=excluded.scope,official_url=excluded.official_url;
commit;