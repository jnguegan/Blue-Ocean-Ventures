-- Blue Ocean Ventures — Project package, phase 1: guided intake + evidence checklist + readiness
-- Tables:
--   bov_project_intake          one structured intake per project (promoter, land, ownership, idea, money, timeline)
--   bov_evidence_catalog        the documents a funding package can need (EN/ES labels, when they apply)
--   bov_project_evidence        per project: status of each required document (missing / received / verified / n.a.)
-- Function:
--   bov_project_readiness(project_id)  completeness score + list of gaps (EN/ES)
-- Working language is English; clients may submit in English, German, French or Spanish.
-- Staff only (bov_hub_access()). Client access will follow once client accounts are linked to projects.
begin;

create table if not exists public.bov_project_intake (
  project_id uuid primary key references public.bov_projects(id) on delete cascade,
  -- promoter
  promoter_name text,
  promoter_type text check (promoter_type in ('individual','company','cooperative','ngo','public_body','other')),
  legal_form text,
  tax_id text,
  promoter_experience text,
  contact_email text,
  contact_phone text,
  -- land / site
  site_address text,
  municipality text,
  region text,
  country text,
  cadastral_reference text,
  land_area_m2 numeric(14,2) check (land_area_m2 is null or land_area_m2 >= 0),
  land_classification text check (land_classification in ('rustic','urban','developable','protected','unknown')),
  current_land_use text,
  water_access boolean,
  power_access boolean,
  road_access boolean,
  existing_buildings text,
  -- ownership
  ownership_type text check (ownership_type in ('owner','co_owner','company_owned','lease','permission_of_owner','purchase_option','other','unknown')),
  owner_names text,
  owner_entity text,
  land_registry_reference text,
  ownership_notes text,
  -- idea
  idea_title text,
  idea_summary text,
  activities text[] not null default '{}',
  sectors text[] not null default '{}',
  target_beneficiaries text,
  jobs_created int check (jobs_created is null or jobs_created >= 0),
  environmental_benefits text,
  innovation_aspects text,
  -- money & timeline
  total_investment_eur numeric(16,2) check (total_investment_eur is null or total_investment_eur >= 0),
  own_contribution_eur numeric(16,2) check (own_contribution_eur is null or own_contribution_eur >= 0),
  funding_requested_eur numeric(16,2) check (funding_requested_eur is null or funding_requested_eur >= 0),
  other_financing text,
  planned_start date,
  duration_months int check (duration_months is null or duration_months between 1 and 240),
  -- workflow
  submission_language text not null default 'en' check (submission_language in ('en','de','fr','es')),  -- language the client submitted in
  document_language text not null default 'en' check (document_language in ('en','de','fr','es')),    -- working / output language (English by default)
  status text not null default 'draft' check (status in ('draft','in_review','complete')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.bov_evidence_catalog (
  code text primary key,
  sort int not null,
  category text not null check (category in ('promoter','land','ownership','permits','financial','technical','other')),
  label_en text not null,
  label_es text not null,
  help_en text,
  help_es text,
  applies_to text not null default 'all' check (applies_to in ('all','land','company','individual','works'))
);

insert into public.bov_evidence_catalog (code,sort,category,label_en,label_es,help_en,help_es,applies_to) values
 ('id_promoter',10,'promoter','Promoter identity document','Documento de identidad del promotor','Passport, DNI or NIE of the promoter / legal representative.','Pasaporte, DNI o NIE del promotor o representante legal.','all'),
 ('company_deeds',20,'promoter','Company deeds and statutes','Escritura de constitución y estatutos','Incorporation deed, statutes and current officers.','Escritura de constitución, estatutos y cargos vigentes.','company'),
 ('tax_registration',30,'promoter','Tax registration (NIF/CIF) and good standing','Alta fiscal (NIF/CIF) y certificados de estar al corriente','Tax ID plus certificates of being up to date with tax and social security.','NIF/CIF y certificados de estar al corriente con Hacienda y Seguridad Social.','all'),
 ('cv_promoter',40,'promoter','Promoter CV / track record','CV / trayectoria del promotor','Experience relevant to the project.','Experiencia relevante para el proyecto.','all'),
 ('nota_simple',50,'ownership','Land Registry extract (Nota Simple)','Nota Simple del Registro de la Propiedad','Proves who owns the land and any charges (mortgages, easements).','Acredita la titularidad del terreno y sus cargas (hipotecas, servidumbres).','land'),
 ('cadastral_certificate',60,'land','Cadastral certificate and map','Certificación catastral y plano','Cadastral reference, area and boundaries (Sede del Catastro).','Referencia catastral, superficie y linderos (Sede Electrónica del Catastro).','land'),
 ('title_or_lease',70,'ownership','Title deed, lease or owner authorisation','Escritura, contrato de arrendamiento o autorización del propietario','If the promoter is not the owner: a long-enough lease or written owner consent.','Si el promotor no es propietario: arrendamiento suficiente o autorización escrita del propietario.','land'),
 ('planning_compatibility',80,'permits','Planning / land-use compatibility report','Informe de compatibilidad urbanística','Confirms the planned use is allowed on this land (rustic land is restricted; in the Canary Islands certain uses need specific authorisation).','Confirma que el uso previsto está permitido en el suelo (el suelo rústico está restringido; en Canarias ciertos usos requieren autorización específica).','land'),
 ('environmental_screening',90,'permits','Environmental screening / assessment','Evaluación o informe ambiental','Whether an environmental impact assessment is required and its status.','Si se requiere evaluación de impacto ambiental y su estado.','works'),
 ('site_photos',100,'land','Site photos and location map','Fotografías y plano de situación','Current state of the land and access.','Estado actual del terreno y accesos.','land'),
 ('technical_project',110,'technical','Technical project / preliminary design','Proyecto técnico / anteproyecto','Drawings and description of works, by a qualified technician where required.','Planos y memoria de las obras, firmados por técnico competente cuando proceda.','works'),
 ('quotes',120,'financial','Supplier quotes for main costs','Presupuestos / ofertas de proveedores','Usually 3 quotes for significant items.','Normalmente 3 ofertas para las partidas relevantes.','all'),
 ('financial_statements',130,'financial','Financial statements / tax returns','Cuentas anuales / declaraciones de impuestos','Last 2–3 years, or a start-up plan if new.','Últimos 2–3 ejercicios, o plan de viabilidad si es de nueva creación.','all'),
 ('cofinancing_proof',140,'financial','Proof of co-financing','Acreditación de la cofinanciación','Bank letter, savings, loan offer or investor commitment.','Carta bancaria, ahorros, oferta de préstamo o compromiso de inversor.','all'),
 ('water_power_rights',150,'technical','Water and power supply evidence','Acreditación de suministro de agua y energía','Water rights / supply contract and electricity connection options.','Derechos o contrato de agua y opciones de conexión eléctrica.','land'),
 ('support_letters',160,'other','Letters of support / partnership','Cartas de apoyo / colaboración','Local authority, cooperatives, buyers or partners.','Ayuntamiento, cooperativas, compradores o socios.','all')
on conflict (code) do update set sort=excluded.sort, category=excluded.category, label_en=excluded.label_en, label_es=excluded.label_es,
  help_en=excluded.help_en, help_es=excluded.help_es, applies_to=excluded.applies_to;

create table if not exists public.bov_project_evidence (
  project_id uuid not null references public.bov_projects(id) on delete cascade,
  code text not null references public.bov_evidence_catalog(code) on delete cascade,
  status text not null default 'missing' check (status in ('missing','requested','received','verified','not_applicable')),
  document_id uuid references public.bov_hub_project_documents(id) on delete set null,
  note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (project_id, code)
);

-- Security: staff only
alter table public.bov_project_intake enable row level security;
alter table public.bov_evidence_catalog enable row level security;
alter table public.bov_project_evidence enable row level security;
revoke all on public.bov_project_intake, public.bov_evidence_catalog, public.bov_project_evidence from anon;
grant select, insert, update on public.bov_project_intake, public.bov_project_evidence to authenticated;
grant select on public.bov_evidence_catalog to authenticated;
drop policy if exists bov_intake_staff on public.bov_project_intake;
create policy bov_intake_staff on public.bov_project_intake for all to authenticated using (public.bov_hub_access()) with check (public.bov_hub_access());
drop policy if exists bov_evidence_staff on public.bov_project_evidence;
create policy bov_evidence_staff on public.bov_project_evidence for all to authenticated using (public.bov_hub_access()) with check (public.bov_hub_access());
drop policy if exists bov_catalog_read on public.bov_evidence_catalog;
create policy bov_catalog_read on public.bov_evidence_catalog for select to authenticated using (public.bov_hub_access());

-- Readiness: 50% intake completeness + 50% evidence (required items received/verified), with a list of gaps.
create or replace function public.bov_project_readiness(p_project uuid, p_lang text default 'en')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  i bov_project_intake%rowtype;
  has_land boolean; is_company boolean; has_works boolean;
  fields jsonb; filled int := 0; total int := 0; gaps jsonb := '[]'::jsonb;
  ev_total int; ev_done int; ev_gaps jsonb; f record; score int; es boolean := (p_lang = 'es');
begin
  if not public.bov_hub_access() then raise exception 'Knowledge Hub staff permission required'; end if;
  select * into i from bov_project_intake where project_id = p_project;
  if i.project_id is null then
    return jsonb_build_object('score',0,'status','not_started','intake_pct',0,'evidence_pct',0,
      'gaps', jsonb_build_array(case when es then 'Completar el formulario de inicio del proyecto' else 'Complete the project intake form' end));
  end if;
  has_land := coalesce(i.land_area_m2,0) > 0 or i.cadastral_reference is not null or i.site_address is not null;
  is_company := i.promoter_type in ('company','cooperative','ngo');
  has_works := coalesce(array_to_string(i.activities,' '),'') ~* '(build|construct|install|works|obra|constru|instal|rehabil)' or i.existing_buildings is not null;

  -- intake fields that matter for a funding package: (label_en, label_es, filled?)
  for f in select * from (values
    ('Promoter name','Nombre del promotor', i.promoter_name is not null),
    ('Promoter type','Tipo de promotor', i.promoter_type is not null),
    ('Project title','Título del proyecto', i.idea_title is not null),
    ('Project summary','Resumen del proyecto', length(coalesce(i.idea_summary,'')) >= 200),
    ('Main activities','Actividades principales', cardinality(i.activities) > 0),
    ('Sectors','Sectores', cardinality(i.sectors) > 0),
    ('Target beneficiaries','Beneficiarios', i.target_beneficiaries is not null),
    ('Jobs created','Empleos creados', i.jobs_created is not null),
    ('Country and region','País y región', i.country is not null and i.region is not null),
    ('Total investment','Inversión total', i.total_investment_eur is not null),
    ('Own contribution','Aportación propia', i.own_contribution_eur is not null),
    ('Planned start and duration','Inicio y duración previstos', i.planned_start is not null and i.duration_months is not null),
    ('Cadastral reference','Referencia catastral', not has_land or i.cadastral_reference is not null),
    ('Land area','Superficie del terreno', not has_land or i.land_area_m2 is not null),
    ('Land classification','Clasificación del suelo', not has_land or coalesce(i.land_classification,'unknown') <> 'unknown'),
    ('Ownership / right to use the land','Titularidad / derecho de uso del terreno', not has_land or coalesce(i.ownership_type,'unknown') <> 'unknown'),
    ('Owner names','Nombre de los propietarios', not has_land or coalesce(i.ownership_type,'unknown') not in ('lease','permission_of_owner','purchase_option','co_owner','company_owned') or i.owner_names is not null or i.owner_entity is not null)
  ) v(l_en, l_es, ok) loop
    total := total + 1;
    if f.ok then filled := filled + 1;
    else gaps := gaps || to_jsonb(case when es then 'Falta: ' || f.l_es else 'Missing: ' || f.l_en end); end if;
  end loop;

  -- evidence that applies to this project
  with req as (
    select c.* from bov_evidence_catalog c
    where c.applies_to = 'all' or (c.applies_to = 'land' and has_land) or (c.applies_to = 'company' and is_company)
       or (c.applies_to = 'individual' and not is_company) or (c.applies_to = 'works' and has_works)
  ), st as (
    select req.*, coalesce(e.status,'missing') as status from req left join bov_project_evidence e on e.project_id = p_project and e.code = req.code
  )
  select count(*) filter (where status <> 'not_applicable'),
         count(*) filter (where status in ('received','verified')),
         coalesce(jsonb_agg(to_jsonb((case when es then 'Documento pendiente: ' || label_es else 'Document missing: ' || label_en end))) filter (where status in ('missing','requested')), '[]'::jsonb)
    into ev_total, ev_done, ev_gaps from st;

  -- land-use permission is the first thing funders check for works on rustic land
  if has_land and i.land_classification = 'rustic' and not exists (
       select 1 from bov_project_evidence where project_id = p_project and code = 'planning_compatibility' and status in ('received','verified')) then
    gaps := jsonb_build_array(case when es then 'Prioridad: confirmar que el uso previsto está permitido en suelo rústico (informe de compatibilidad urbanística).'
                                   else 'Priority: confirm the planned use is allowed on rustic land (planning compatibility report).' end) || gaps;
  end if;

  score := round(50.0 * filled / greatest(total,1) + 50.0 * coalesce(ev_done,0) / greatest(coalesce(ev_total,0),1));
  return jsonb_build_object(
    'score', score,
    'status', case when score >= 85 then 'ready_for_review' when score >= 50 then 'requires_improvement' else 'not_ready' end,
    'intake_pct', round(100.0 * filled / greatest(total,1)),
    'evidence_pct', round(100.0 * coalesce(ev_done,0) / greatest(coalesce(ev_total,0),1)),
    'evidence_required', coalesce(ev_total,0), 'evidence_received', coalesce(ev_done,0),
    'gaps', gaps || ev_gaps);
end;
$$;
revoke all on function public.bov_project_readiness(uuid, text) from public, anon;
grant execute on function public.bov_project_readiness(uuid, text) to authenticated;

commit;
