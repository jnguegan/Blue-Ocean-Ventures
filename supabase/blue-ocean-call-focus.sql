-- Blue Ocean Ventures — "Focus" tags on stored EU call requirements.
-- Tags every call in bov_eu_call_details from its official text:
--   SME / entrepreneur, open to individuals, public bodies only, EU-only,
--   Africa (lead applicant / funded partner / check / not eligible), which African entity types,
--   single applicant or consortium. Runs automatically for every call stored later (trigger).
-- Run once in the Supabase SQL Editor after blue-ocean-call-details.sql. Safe to run again.
begin;

alter table public.bov_eu_call_details
  add column if not exists focus_sme boolean not null default false,
  add column if not exists focus_individual boolean not null default false,
  add column if not exists public_only boolean not null default false,
  add column if not exists eu_only boolean not null default false,
  add column if not exists africa text not null default 'check',
  add column if not exists africa_focus boolean not null default false,
  add column if not exists africa_entities text,
  add column if not exists effort text not null default 'unknown',
  add column if not exists focus_reasons text[] not null default '{}';

create or replace function public.bov_call_focus() returns trigger
language plpgsql set search_path = public as $fn$
declare
  c text; d text; t text; ext text; toa text; prog text;
  africa_rx constant text := '\m(africa|african|sub-saharan|sahel|maghreb|algeria|angola|benin|botswana|burkina faso|burundi|cabo verde|cape verde|cameroon|central african republic|chad|comoros|congo|cote d.ivoire|ivory coast|djibouti|egypt|eritrea|eswatini|ethiopia|gabon|gambia|ghana|guinea-bissau|kenya|lesotho|liberia|libya|madagascar|malawi|mali|mauritania|mauritius|morocco|mozambique|namibia|nigeria|rwanda|senegal|seychelles|sierra leone|somalia|south sudan|sudan|tanzania|togo|tunisia|uganda|zambia|zimbabwe)\M';
  af_codes constant text[] := array['DZ','AO','BJ','BW','BF','BI','CV','CM','CF','TD','KM','CG','CD','CI','DJ','EG','GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN','SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW'];
  codes text[]; horizon boolean; eu_programme boolean; cascade boolean;
  sme boolean; indiv boolean; pub boolean; euonly boolean; af_target boolean;
  reasons text[] := '{}';
begin
  c := lower(regexp_replace(coalesce(new.conditions_html, ''), '<[^>]*>', ' ', 'g'));
  d := lower(regexp_replace(coalesce(new.description_html, ''), '<[^>]*>', ' ', 'g'));
  c := regexp_replace(replace(replace(c, '&nbsp;', ' '), '&amp;', '&'), '\s+', ' ', 'g');
  d := regexp_replace(replace(replace(d, '&nbsp;', ' '), '&amp;', '&'), '\s+', ' ', 'g');
  t := c || ' ' || d || ' ' || lower(coalesce(new.title, ''));
  ext := upper(coalesce(new.source_external_id, '')) || ' ' || upper(coalesce(new.call_identifier, ''));
  toa := lower(coalesce(new.type_of_action, ''));
  prog := lower(coalesce(new.programme, ''));
  cascade := coalesce(new.call_kind, '') = 'cascade' or ext ~ '^(CS-|LEGACY-)';
  horizon := ext ~ '(^|\s)HORIZON-' or prog ~ 'horizon europe';
  select f.country_codes into codes from bov_eu_funding_calls f where f.id = new.call_id;

  -- Who the call is restricted to
  pub := t ~ '(only|exclusively|limited to|restricted to)[^.]{0,90}(public authorit|public bod|competent authorit|ministr|national authorit|designated by (the )?member states|national coordination cent)'
      or toa ~ '(joint action|grants? to identified|direct grant)'
      or ext ~ '(-JA-|-NCC-|-NCC\M)';
  euonly := c ~ '(limited|restricted) to (legal )?entit[^.]{0,80}established in[^.]{0,60}member states'
      or c ~ 'only[^.]{0,60}(legal entities|organisations|applicants|beneficiaries)[^.]{0,60}established in[^.]{0,40}(eu |the eu |eu )?member states'
      or ext ~ '(^|\s)(LIFE|DIGITAL|EU4H|CERV|SMP|CEF|EDF|ISF|AMIF|BMVI|INNOVFUND|RFCS|PPPA|UCPM|EMFAF|JUST|PERICLES|SOCPL|EUAF|RENEWFM|I3)-'
      or ext ~ 'HORIZON-(EIC-[0-9]{4}-ACCELERATOR|ERC|EIT-|MSCA-[0-9]{4}-PF)'
      or ext ~ '(^|\s)ERC-';

  -- SMEs, entrepreneurs, individuals
  sme := t ~ '\m(smes?|start-?ups?|scale-?ups?|small and medium|micro[- ]enterprises?|entrepreneurs?|innovators|companies)\M'
      or ext ~ '(EIC|EUROSTARS|COSME|INNOVSMES|EIE-)';
  indiv := t ~ '(natural persons?|individuals? (can|may|are eligible to) apply|individual applicants?|freelancers?|self-employed)'
      or (cascade and t ~ '\m(students?|researchers?|artists?|individuals?|citizens?|young people|phd)\M')
      or toa ~ '(msca-pf|postdoctoral|erc-)' or ext ~ '(MSCA-[0-9]{4}-PF|(^|\s)ERC-|PRIZE)';

  -- Africa
  af_target := t ~ africa_rx or coalesce(codes, '{}') && af_codes
      or ext ~ '(GLOBAL-HEALTH|JU-GH-|EDCTP|PRIMA|NDICI|AU-EU|AFRICA)';
  new.africa_focus := af_target;
  if pub and t !~ africa_rx then
    new.africa := 'no';
  elsif ext ~ '(NDICI|EUROPEAID|GLOBAL-EUROPE)' or prog ~ '(global europe|ndici)' then
    new.africa := 'lead';
  elsif euonly then
    new.africa := case when af_target then 'check' else 'no' end;
  elsif horizon then
    new.africa := 'partner';
  elsif ext ~ 'ERASMUS-[A-Z0-9-]*(CBHE|CB-|CAPACITY|SPORT-[0-9]{4}-CB)' then
    new.africa := 'partner';
  else
    new.africa := 'check';
  end if;
  if new.africa in ('lead', 'partner') and af_target and new.africa = 'partner' and ext ~ '(GLOBAL-HEALTH|JU-GH-|EDCTP|PRIMA)' then
    new.africa := 'lead';
  end if;

  -- Which African organisations: governments, ministries, public bodies, NGOs, universities, companies
  if new.africa = 'no' then
    new.africa_entities := null;
  elsif c ~ '(only|exclusively|limited to)[^.]{0,80}(civil society|non-governmental|non-profit|ngos?)\M' then
    new.africa_entities := 'NGOs / civil society only (no ministries or public bodies)';
  elsif c ~ '(only|exclusively|limited to)[^.]{0,80}(public authorit|public bod|ministr|government)' then
    new.africa_entities := 'Ministries and public bodies only';
  elsif horizon then
    new.africa_entities := 'Ministries, government agencies, public bodies, NGOs, universities and companies (any legal entity)';
  else
    new.africa_entities := 'Check the conditions: entity types not stated in a standard way';
  end if;

  -- Effort
  if cascade or toa ~ '(mono-?beneficiary|msca-pf|erc-|prize|eic accelerator)' or ext ~ '(PRIZE|ACCELERATOR|MSCA-[0-9]{4}-PF|(^|\s)ERC-)'
     or t ~ '(single (applicant|beneficiary)|mono-?beneficiary|individual applicant|a single legal entity|one legal entity)' then
    new.effort := 'solo';
  elsif t ~ 'at least (two|three|four|2|3|4) (independent )?(legal )?(entities|applicants|beneficiaries|partners|organisations)'
     or (horizon and toa ~ '\m(ria|ia|csa)\M') or toa ~ '(research and innovation actions|innovation actions|coordination and support)' then
    new.effort := 'consortium';
  else
    new.effort := 'unknown';
  end if;

  new.public_only := pub;
  new.eu_only := euonly;
  new.focus_individual := indiv and not pub;
  new.focus_sme := (sme or indiv or cascade) and not pub;

  if cascade then reasons := array_append(reasons, 'Project-run small grant (cascade)'::text); end if;
  if new.focus_individual then reasons := array_append(reasons, 'Open to individuals'::text); end if;
  if sme and not pub and not cascade then reasons := array_append(reasons, 'SMEs / entrepreneurs named'::text); end if;
  if new.effort = 'solo' then reasons := array_append(reasons, 'Single applicant possible'::text); elsif new.effort = 'consortium' then reasons := array_append(reasons, 'Consortium needed'::text); end if;
  if new.africa = 'lead' then reasons := array_append(reasons, 'African organisations can apply'::text);
  elsif new.africa = 'partner' then reasons := array_append(reasons, 'African organisations funded as partners'::text); end if;
  if af_target then reasons := array_append(reasons, 'Africa mentioned in the call'::text); end if;
  if pub then reasons := array_append(reasons, 'Public authorities only'::text); end if;
  if euonly then reasons := array_append(reasons, 'EU / associated countries only'::text); end if;
  new.focus_reasons := reasons;
  return new;
end
$fn$;

drop trigger if exists bov_call_focus_trg on public.bov_eu_call_details;
create trigger bov_call_focus_trg before insert or update on public.bov_eu_call_details
  for each row execute function public.bov_call_focus();

-- Tag the calls already stored
update public.bov_eu_call_details set fetched_at = fetched_at;

commit;
select count(*) filter (where focus_sme) as sme_and_citizen,
       count(*) filter (where focus_individual) as open_to_individuals,
       count(*) filter (where africa = 'lead') as africa_can_apply,
       count(*) filter (where africa = 'partner') as africa_funded_partner,
       count(*) filter (where africa_focus) as africa_mentioned,
       count(*) filter (where public_only) as public_only,
       count(*) as stored
from public.bov_eu_call_details where fetch_status <> 'failed';
