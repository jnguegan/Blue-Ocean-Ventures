-- Apply after blue-ocean-eu-scanner.sql
-- Stores a small, truncated sample of raw EU API rows per scan run, used to verify field mapping.
alter table public.bov_eu_scan_runs add column if not exists raw_sample jsonb;
