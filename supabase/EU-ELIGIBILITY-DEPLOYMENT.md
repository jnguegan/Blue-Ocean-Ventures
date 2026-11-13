# Automated EU Eligibility — Deployment and limitations

1. Run `supabase/blue-ocean-eu-eligibility.sql` in the Blue Ocean Supabase SQL Editor.
2. Deploy the function at `supabase/functions/bov-eu-eligibility/index.ts` as `bov-eu-eligibility`, with JWT verification disabled **only because the function requires the private `x-eu-scan-secret` header**. Set `EU_SCAN_SECRET` in Supabase Edge Function secrets; never expose it in frontend code.
3. Test a POST with `{}` to assess up to 500 recorded opportunities or `{"call_id":"UUID"}` to assess one. Use the secret header. Review results in `bov_eu_eligibility_assessments`.
4. After validating results, invoke this function from a private scheduler after the EU funding scan. Do not expose the function secret in browser JavaScript.

**What works in code:** automatic rules-based preliminary applicant screening, expired recorded deadline checks, evidence/reasons, explicit unknowns, and private historical assessment records.

**What is not implemented:** extracting full authoritative eligibility rules from linked PDF documents, confirming authenticity of an official source, authoritative verification of application deadlines, matching against uploaded client project profiles, and the automatic scheduling/deployment. The function cannot prove that an opportunity is open or that an applicant qualifies. Incomplete source information must remain `unconfirmed`.

Do not market these outputs as verified eligibility or fully automated client matching.
