-- Daily automatic EU funding scan (Supabase Cron + pg_net).
-- Prerequisites:
--   1. Edge Function secret EU_SCAN_SECRET is set (Edge Functions > Secrets).
--   2. The same value is stored in Supabase Vault under the name 'eu_scan_secret':
--        select vault.create_secret('<the same secret value>', 'eu_scan_secret');
--      (Never commit the value to GitHub.)
--   3. bov-eu-funding-scan runs with "Verify JWT" OFF (it checks the secret itself).
-- The EU list currently fits in 2 batches of 1,000 calls; a third batch is scheduled for growth.
-- An empty batch simply ends without changes.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove earlier versions of these jobs if re-running this file.
select cron.unschedule(jobname) from cron.job where jobname like 'bov-eu-scan-%';

-- Times are UTC: 03:00, 03:05 and 03:10 every day.
select cron.schedule('bov-eu-scan-batch-1', '0 3 * * *', $$
  select net.http_post(
    url := 'https://tzpbdfbedwmawmpygwpx.supabase.co/functions/v1/bov-eu-funding-scan',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-eu-scan-secret',(select decrypted_secret from vault.decrypted_secrets where name='eu_scan_secret')),
    body := '{"startPage":1}'::jsonb,
    timeout_milliseconds := 150000);
$$);

select cron.schedule('bov-eu-scan-batch-2', '5 3 * * *', $$
  select net.http_post(
    url := 'https://tzpbdfbedwmawmpygwpx.supabase.co/functions/v1/bov-eu-funding-scan',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-eu-scan-secret',(select decrypted_secret from vault.decrypted_secrets where name='eu_scan_secret')),
    body := '{"startPage":21}'::jsonb,
    timeout_milliseconds := 150000);
$$);

select cron.schedule('bov-eu-scan-batch-3', '10 3 * * *', $$
  select net.http_post(
    url := 'https://tzpbdfbedwmawmpygwpx.supabase.co/functions/v1/bov-eu-funding-scan',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-eu-scan-secret',(select decrypted_secret from vault.decrypted_secrets where name='eu_scan_secret')),
    body := '{"startPage":41}'::jsonb,
    timeout_milliseconds := 150000);
$$);

-- Check the jobs:      select jobname, schedule, active from cron.job where jobname like 'bov-eu-scan-%';
-- Check recent runs:   select * from cron.job_run_details order by start_time desc limit 10;
-- Check scan results:  select started_at, status, fetched_count, inserted_count, error_message from public.bov_eu_scan_runs order by started_at desc limit 5;
