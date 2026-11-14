-- Blue Ocean Ventures: store the text read from project documents for matching.
-- Run once in the Supabase SQL Editor. Safe to run again.
alter table public.bov_hub_project_documents
  add column if not exists extracted_text text,
  add column if not exists extraction_status text,
  add column if not exists extracted_at timestamptz;

alter table public.bov_hub_project_documents drop constraint if exists bov_hub_project_documents_extraction_status_check;
alter table public.bov_hub_project_documents add constraint bov_hub_project_documents_extraction_status_check
  check (extraction_status is null or extraction_status in ('read','empty','unsupported'));

-- Only active Knowledge Hub staff may record the text of a document.
create or replace function public.bov_set_document_text(p_id uuid, p_text text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.bov_hub_staff s where s.user_id = auth.uid() and s.active = true) then
    raise exception 'Not authorised';
  end if;
  if p_status not in ('read','empty','unsupported') then
    raise exception 'Invalid status';
  end if;
  update public.bov_hub_project_documents
     set extracted_text = left(coalesce(p_text, ''), 300000),
         extraction_status = p_status,
         extracted_at = now()
   where id = p_id;
  if not found then
    raise exception 'Document not found';
  end if;
end;
$$;

revoke all on function public.bov_set_document_text(uuid, text, text) from public, anon;
grant execute on function public.bov_set_document_text(uuid, text, text) to authenticated;
