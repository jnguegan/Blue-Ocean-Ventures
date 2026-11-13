// Blue Ocean Ventures: staff-authenticated, evidence-limited EU opportunity screening.
// Authentication: Supabase Auth user JWT + server-side bov_hub_access() check.
// No EU_SCAN_SECRET, no public privileged endpoint. Deploy with Verify JWT OFF:
// auth.getUser(token) verifies JWT inside the function (supports modern signing keys).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Status = "pass" | "fail" | "unknown";
type Rule = { key: string; status: Status; reason: string; source: string };
type Call = { id: string; title: string; summary: string | null; eligibility_notes: string | null; partner_requirements: string | null; official_url: string; deadline: string | null; country_region: string | null };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assess(call: Call) {
  const rules: Rule[] = [];
  const source = call.official_url || "";
  const add = (key: string, status: Status, reason: string) => rules.push({ key, status, reason, source });
  const notes = call.eligibility_notes || "";
  // Treat these notes as recorded evidence, not as independently verified official rules.
  if (/(?:only|exclusively)\s+(?:public authorities|government bodies|public administrations|municipalities)\b/i.test(notes)) {
    add("private_applicant", "fail", "Recorded notes restrict applicants to public authorities; verify against the official call");
  } else if (/(?:eligible applicants?|beneficiaries?)\s*[:\-]\s*[^.\n]{0,150}\b(?:SMEs?|micro.?enterprises?|private (?:companies|enterprises)|entrepreneurs?|farmers?|start.?ups?|cooperatives?)\b/i.test(notes)) {
    add("private_applicant", "pass", "Recorded eligibility notes mention private applicants; official conditions still require verification");
  } else {
    add("private_applicant", "unknown", "Explicit private-applicant eligibility not established");
  }
  add("official_source", /^https:\/\//i.test(source) ? "pass" : "unknown", "An HTTPS URL is recorded; its authenticity and content have not been independently checked");
  const deadline = call.deadline || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    const past = deadline < new Date().toISOString().slice(0, 10);
    add("deadline", past ? "fail" : "pass", past ? "Recorded deadline has passed" : "Recorded deadline has not passed; official status needs verification");
  } else add("deadline", "unknown", "Deadline not recorded");
  add("geography", "unknown", call.country_region ? "Recorded territory: " + call.country_region + "; applicant/project location not supplied" : "Territorial eligibility not established");
  // Opportunity-only screening cannot certify applicant-specific eligibility.
  const result = rules.some(r => r.status === "fail") ? "ineligible" : "unconfirmed";
  return {
    assessment_type: "opportunity",
    result,
    applicant_type: "private_enterprise",
    rule_snapshot: { applicant_type: "private_enterprise", geography: call.country_region, deadline },
    evidence: rules.filter(r => r.status !== "unknown").map(r => ({ rule: r.key, source: r.source, reason: r.reason })),
    reasons: rules.map(r => ({ rule: r.key, status: r.status, reason: r.reason })),
    missing_information: rules.filter(r => r.status === "unknown").map(r => r.reason),
    engine_version: "rules-v2-auth",
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration incomplete" }, 503);

    const auth = req.headers.get("authorization") || "";
    const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
    if (!token) return json({ error: "Authentication required: send the signed-in staff user's Bearer access token" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid or expired staff session" }, 401);
    const { data: allowed, error: permissionError } = await userClient.rpc("bov_hub_access");
    if (permissionError) return json({ error: "Staff permission check failed" }, 500);
    if (allowed !== true) return json({ error: "Staff Knowledge Hub access required" }, 403);

    let payload: unknown;
    try { payload = await req.json(); } catch { return json({ error: "Request body must be valid JSON" }, 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "Request body must be a JSON object" }, 400);
    const body = payload as Record<string, unknown>;
    if (body.call_id !== undefined && (typeof body.call_id !== "string" || !uuid.test(body.call_id))) return json({ error: "call_id must be a UUID" }, 400);

    const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    let query = db.from("bov_eu_funding_calls").select("id,title,summary,eligibility_notes,partner_requirements,official_url,deadline,country_region").order("created_at", { ascending: false }).limit(500);
    if (typeof body.call_id === "string") query = query.eq("id", body.call_id);
    const { data: calls, error: readError } = await query;
    if (readError) return json({ error: "Unable to read funding opportunities" }, 500);
    const counts = { preliminarily_eligible: 0, ineligible: 0, unconfirmed: 0 };
    let processed = 0;
    for (const call of (calls || []) as Call[]) {
      const assessment = assess(call);
      const { error: writeError } = await db.from("bov_eu_eligibility_assessments").insert({ call_id: call.id, ...assessment });
      if (writeError) return json({ error: "Unable to save assessment", processed }, 500);
      counts[assessment.result] += 1;
      processed += 1;
    }
    return json({ ok: true, processed, counts, note: "Opportunity screening only. Client-specific eligibility and official terms remain unverified." });
  } catch (error) {
    console.error("bov-eu-eligibility unexpected error", error instanceof Error ? error.message : "unknown");
    return json({ error: "Internal function error" }, 500);
  }
});
