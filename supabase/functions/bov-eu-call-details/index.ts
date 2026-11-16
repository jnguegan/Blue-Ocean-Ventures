// Supabase Edge Function: bov-eu-call-details
// Fetches the full official requirements of an EU call once from the EU Funding & Tenders Portal,
// stores them in bov_eu_call_details, and refreshes key figures in bov_call_requirements for matching.
// Auth: signed-in staff (Supabase JWT checked in-function + bov_hub_access()). Deploy with Verify JWT OFF.
// Body: { call_id: uuid, refresh?: boolean }            -> one call (stored copy unless refresh)
//       { mode: "missing", limit?: number }             -> fetch live calls not stored yet (batch)
//       { mode: "status" }                              -> counts only
// Requires supabase/blue-ocean-call-details.sql.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOPIC_JSON = "https://ec.europa.eu/info/funding-tenders/opportunities/data/topicDetails/";
const TOPIC_PAGE = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";
const SEARCH_API = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const UA = { "Accept": "application/json", "Accept-Encoding": "identity", "User-Agent": "Mozilla/5.0 (compatible; BlueOceanVenturesCallDetails/1.0)" };
const TIME_BUDGET_MS = 100000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const allowedOrigins = new Set(["https://blueoceanventures.co", "https://www.blueoceanventures.co"]);
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    ...(allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "3600",
  };
}
const json = (data: unknown, status: number, headers: Record<string, string>) =>
  Response.json(data, { status, headers: { ...headers, "Cache-Control": "no-store" } });

// ---------- helpers ----------
const str = (v: unknown): string => typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : Array.isArray(v) ? str(v.find((x) => typeof x === "string" && x.trim()) ?? "") : "";
const list = (v: unknown): any[] => Array.isArray(v) ? v : v == null ? [] : [v];
const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();
const MONTHS: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  let m = s.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  if (/^\d{12,13}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10);
  m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  return null;
}
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

async function getJson(url: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw Error(`HTTP ${r.status} from ${new URL(url).host}`);
  const t = await r.text();
  try { return JSON.parse(t); } catch { throw Error("Non-JSON answer from " + new URL(url).host); }
}

// Search API: one record by identifier or ccm2Id (fallback and cascade calls).
async function searchRecord(key: "identifier" | "ccm2Id", value: string): Promise<any | null> {
  const boundary = "----BOV" + crypto.randomUUID().replace(/-/g, "");
  const query = { bool: { must: [{ terms: { [key]: [value] } }] } };
  let body = "";
  for (const [name, v] of Object.entries({ query, languages: ["en"] })) body += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}.json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(v)}\r\n`;
  body += `--${boundary}--\r\n`;
  const j = await getJson(`${SEARCH_API}?apiKey=SEDIA&text=***&pageSize=5&pageNumber=1`, {
    method: "POST", body: new TextEncoder().encode(body), headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
  });
  const rows: any[] = j?.results || j?.items || j?.data?.results || [];
  const hit = rows.find((r) => str(r?.metadata?.[key]) === value) || rows[0];
  return hit ? (hit.metadata || hit) : null;
}

// ---------- parse an official topic record ----------
function parseTopic(td: any, meta: any) {
  const actions = list(td?.actions);
  const deadlines = new Set<string>();
  let opening = str(td?.plannedOpeningDate), model = str(td?.deadlineModel) || str(meta?.deadlineModel), status = "", action = "";
  for (const a of actions) {
    for (const d of list(a?.deadlineDates)) { const x = isoDate(d); if (x) deadlines.add(x); }
    opening ||= str(a?.plannedOpeningDate);
    model ||= str(a?.deadlineModel) || str(a?.submissionProcedure?.abbreviation);
    status ||= str(a?.status?.description) || str(a?.status?.abbreviation);
    action ||= list(a?.types).map((t: any) => str(t?.typeOfAction)).filter(Boolean).join("; ");
  }
  for (const d of list(td?.deadlineDates).concat(list(meta?.deadlineDate))) { const x = isoDate(d); if (x) deadlines.add(x); }
  // Budget: budgetOverviewJSONItem.budgetTopicActionMap (or a JSON string in the search index)
  let bo: any = td?.budgetOverviewJSONItem || td?.budgetOverview || meta?.budgetOverview;
  if (typeof bo === "string") { try { bo = JSON.parse(bo); } catch { bo = null; } }
  const budget: any[] = [];
  let total = 0, gmin: number | null = null, gmax: number | null = null, grants = 0;
  for (const rows of Object.values(bo?.budgetTopicActionMap || {})) for (const b of list(rows)) {
    const years = b?.budgetYearMap || {};
    const amount = Object.values(years).reduce((s: number, v: any) => s + (num(v) || 0), 0);
    total += amount;
    const mi = num(b?.minContribution), ma = num(b?.maxContribution), eg = num(b?.expectedGrants);
    if (mi != null) gmin = gmin == null ? mi : Math.min(gmin, mi);
    if (ma != null) gmax = gmax == null ? ma : Math.max(gmax, ma);
    if (eg) grants += eg;
    for (const d of list(b?.deadlineDates)) { const x = isoDate(d); if (x) deadlines.add(x); }
    budget.push({ action: str(b?.action), years, amount_eur: amount || null, expected_grants: eg, min_contribution_eur: mi, max_contribution_eur: ma, opening: str(b?.plannedOpeningDate), deadlines: list(b?.deadlineDates).map(str), model: str(b?.deadlineModel) });
  }
  const description = str(td?.description) || str(meta?.descriptionByte) || str(meta?.description);
  const conditions = str(td?.conditions) || str(meta?.topicConditions);
  const support = str(td?.supportInfo) || str(meta?.supportInfo);
  const latest = list(td?.latestInfos).map((x: any) => str(x?.content)).filter(Boolean).join("<hr>");
  // Documents: every https link in the conditions and support text, plus call documents listed separately.
  const docs = new Map<string, string>();
  for (const html of [conditions, support]) for (const m of html.matchAll(/<a[^>]+href="(https:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) { const t = plain(m[2]).slice(0, 200); if (t && !docs.has(m[1])) docs.set(m[1], t); }
  for (const d of [...list(td?.additionalDossiers), ...list(td?.infoPackDossiers), ...list(td?.links)]) { const u = str(d?.url) || str(d?.link) || str(d); if (/^https:\/\//.test(u) && !docs.has(u)) docs.set(u, str(d?.title) || str(d?.description) || "Document"); }
  const programme = str(td?.frameworkProgramme?.description) || str(td?.frameworkProgramme?.abbreviation) || str(meta?.programmePeriod);
  return {
    title: str(td?.title) || str(meta?.title), call_identifier: str(td?.callIdentifier) || str(meta?.callIdentifier), call_title: str(td?.callTitle) || str(meta?.callTitle),
    programme, status, type_of_action: action || str(meta?.typesOfAction), deadline_model: model, opening_date: isoDate(opening) || opening || isoDate(meta?.startDate),
    deadline_dates: [...deadlines].sort(), total_budget_eur: total || null, grant_min_eur: gmin, grant_max_eur: gmax, expected_grants: grants || null, budget,
    description_html: description || null, conditions_html: conditions || null, support_html: support || null, latest_info_html: latest || null,
    documents: [...docs].slice(0, 60).map(([url, title]) => ({ url, title })), keywords: list(td?.keywords || meta?.keywords).map(str).filter(Boolean).slice(0, 30),
  };
}

// Cascade (third-party) calls only exist in the search index.
function parseCascade(meta: any) {
  const deadlines = list(meta?.deadlineDate).map(isoDate).filter(Boolean) as string[];
  const description = [str(meta?.description), str(meta?.furtherInformation) && "<h4>Further information</h4>" + str(meta?.furtherInformation)].filter(Boolean).join("");
  const conditions = str(meta?.beneficiaryAdministration) ? "<h4>Who can apply / administration</h4>" + str(meta?.beneficiaryAdministration) : "";
  const docs = new Map<string, string>();
  for (const m of (description + conditions).matchAll(/<a[^>]+href="(https:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) docs.set(m[1], plain(m[2]).slice(0, 200) || "Link");
  const ext = str(meta?.url);
  if (/^https:\/\//.test(ext)) docs.set(ext, "Call page of the organiser");
  return {
    title: str(meta?.callTitle) || str(meta?.title), call_identifier: str(meta?.identifier), call_title: [str(meta?.projectAcronym), str(meta?.projectName)].filter(Boolean).join(" — "),
    programme: "EU cascade funding (call run by an EU-funded project)", status: "", type_of_action: "Financial support to third parties", deadline_model: "",
    opening_date: isoDate(meta?.startDate), deadline_dates: deadlines.sort(), total_budget_eur: num(meta?.budget), grant_min_eur: null, grant_max_eur: null, expected_grants: null, budget: [],
    description_html: description || null, conditions_html: conditions || null, support_html: null, latest_info_html: null,
    documents: [...docs].map(([url, title]) => ({ url, title })), keywords: list(meta?.keywords).map(str).filter(Boolean).slice(0, 30),
  };
}

// Key figures for the matching table (only figures stated in the official text).
function keyFigures(d: any) {
  const text = plain((d.conditions_html || "") + " " + (d.description_html || "")).toLowerCase();
  const m = text.match(/at least\s+(one|two|three|four|five|six|\d)\s+(?:independent\s+)?(?:legal\s+)?(?:entities|applicants|beneficiaries|partners|organisations)/);
  const c = text.match(/(?:from|established in)\s+(?:at least\s+)?(one|two|three|four|five|six|\d)\s+different\s+(?:eligible\s+)?countries/);
  const partners = m ? (WORDS[m[1]] ?? Number(m[1])) : null, countries = c ? (WORDS[c[1]] ?? Number(c[1])) : null;
  return { partners, countries, consortium: partners != null ? partners > 1 : null };
}

async function fetchDetails(call: any) {
  const ext = String(call.source_external_id || "");
  const errors: string[] = [];
  if (call.call_kind === "cascade" || ext.startsWith("cs-")) {
    const meta = await searchRecord("ccm2Id", ext.replace(/^cs-/, ""));
    if (!meta) throw Error("Call not found in the EU search index");
    return { parsed: parseCascade(meta), source_url: SEARCH_API + " (ccm2Id " + ext.replace(/^cs-/, "") + ")" };
  }
  for (const id of [ext.toLowerCase(), ext]) {
    try {
      const j = await getJson(TOPIC_JSON + encodeURIComponent(id) + ".json");
      const td = j?.TopicDetails || j?.topicDetails || j;
      if (td && (td.description || td.conditions || td.actions)) return { parsed: parseTopic(td, {}), source_url: TOPIC_JSON + id + ".json" };
      errors.push("topicDetails empty");
    } catch (e) { errors.push(String((e as Error).message)); }
  }
  const meta = await searchRecord("identifier", ext).catch((e) => { errors.push(String(e.message)); return null; });
  if (meta) return { parsed: parseTopic({}, meta), source_url: SEARCH_API + " (identifier " + ext + ")" };
  throw Error("Official record not reachable: " + errors.join(" | "));
}

async function storeOne(db: any, call: any, userId: string | null) {
  const now = new Date().toISOString(), today = now.slice(0, 10);
  const base = { call_id: call.id, source_external_id: call.source_external_id, call_kind: call.call_kind, fetched_at: now, fetched_by: userId,
    official_url: call.official_url || (call.source_external_id && !String(call.source_external_id).startsWith("cs-") ? TOPIC_PAGE + String(call.source_external_id).toLowerCase() : null) };
  try {
    const { parsed, source_url } = await fetchDetails(call);
    const nextDeadline = parsed.deadline_dates.find((d: string) => d >= today) || parsed.deadline_dates.at(-1) || call.deadline || null;
    const partial = !parsed.description_html || !parsed.conditions_html;
    const row = { ...base, ...parsed, title: parsed.title || call.title, programme: parsed.programme || call.programme, next_deadline: nextDeadline, source_url,
      fetch_status: partial ? "partial" : "ok", fetch_error: partial ? "Some sections were not published in the official record" : null };
    const { error } = await db.from("bov_eu_call_details").upsert(row, { onConflict: "call_id" });
    if (error) throw Error("Database: " + error.message);
    // Refresh key figures used by matching, unless staff verified them.
    const { data: cur } = await db.from("bov_call_requirements").select("source").eq("call_id", call.id).maybeSingle();
    if (!cur || cur.source !== "staff_verified") {
      const k = keyFigures(parsed);
      const upd: Record<string, unknown> = { call_id: call.id, source: "auto_extracted", confidence: 0.7, updated_at: now };
      if (parsed.grant_min_eur) upd.grant_min = parsed.grant_min_eur;
      if (parsed.grant_max_eur) upd.grant_max = parsed.grant_max_eur;
      if (parsed.total_budget_eur) upd.total_call_budget = parsed.total_budget_eur;
      if (nextDeadline) upd.deadline = nextDeadline;
      if (k.consortium != null) upd.consortium_required = k.consortium;
      if (k.partners) upd.min_partners = k.partners;
      if (k.countries) upd.min_countries = k.countries;
      const { error: e2 } = await db.from("bov_call_requirements").upsert(upd, { onConflict: "call_id" });
      if (e2) console.warn("bov_call_requirements not updated", e2.message);
    }
    return { ok: true, row };
  } catch (e) {
    const msg = String((e as Error).message || e).slice(0, 500);
    await db.from("bov_eu_call_details").upsert({ ...base, title: call.title, programme: call.programme, next_deadline: call.deadline, fetch_status: "failed", fetch_error: msg }, { onConflict: "call_id" });
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req: Request) => {
  const headers = cors(req);
  const respond = (d: unknown, s = 200) => json(d, s, headers);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const started = Date.now();
  try {
    if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
    const url = Deno.env.get("SUPABASE_URL"), anonKey = Deno.env.get("SUPABASE_ANON_KEY"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return respond({ error: "Server configuration incomplete" }, 503);
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "")?.[1]?.trim();
    if (!token) return respond({ error: "Sign in as staff first" }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: "Bearer " + token } }, auth: { autoRefreshToken: false, persistSession: false } });
    const { data: u, error: ue } = await userClient.auth.getUser(token);
    if (ue || !u.user) return respond({ error: "Invalid or expired staff session" }, 401);
    const { data: allowed } = await userClient.rpc("bov_hub_access");
    if (allowed !== true) return respond({ error: "Staff Knowledge Hub access required" }, 403);

    let body: any = {};
    try { body = await req.json(); } catch { return respond({ error: "Request body must be JSON" }, 400); }
    const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const cols = "id,source_external_id,call_kind,title,programme,official_url,deadline";
    const today = new Date().toISOString().slice(0, 10);

    if (body.mode === "status" || body.mode === "missing") {
      const { data: live, error } = await db.from("bov_eu_funding_calls").select(cols).or(`deadline.is.null,deadline.gte.${today}`).not("source_external_id", "is", null).limit(5000);
      if (error) return respond({ error: "Cannot read calls: " + error.message }, 500);
      const { data: have } = await db.from("bov_eu_call_details").select("call_id,fetch_status").limit(10000);
      const stored = new Map((have || []).map((h: any) => [h.call_id, h.fetch_status]));
      const missing = (live || []).filter((c: any) => !stored.has(c.id) || (body.retry_failed && stored.get(c.id) === "failed"));
      if (body.mode === "status") return respond({ live: live?.length || 0, stored: (live || []).filter((c: any) => stored.has(c.id)).length, missing: missing.length });
      const limit = Math.max(1, Math.min(60, Number(body.limit) || 25));
      let done = 0, failed = 0;
      const queue = missing.slice(0, limit);
      const worker = async () => { while (queue.length && Date.now() - started < TIME_BUDGET_MS) { const c = queue.shift(); const r = await storeOne(db, c, u.user.id); r.ok ? done++ : failed++; } };
      await Promise.all([worker(), worker(), worker(), worker()]);
      return respond({ ok: true, processed: done + failed, stored: done, failed, remaining: missing.length - done - failed });
    }

    if (typeof body.call_id !== "string" || !uuid.test(body.call_id)) return respond({ error: "call_id must be a UUID" }, 400);
    if (!body.refresh) {
      const { data: have } = await db.from("bov_eu_call_details").select("*").eq("call_id", body.call_id).maybeSingle();
      if (have && have.fetch_status !== "failed") return respond({ ok: true, cached: true, details: have });
    }
    const { data: call, error } = await db.from("bov_eu_funding_calls").select(cols).eq("id", body.call_id).maybeSingle();
    if (error || !call) return respond({ error: "Call not found in the register" }, 404);
    const r = await storeOne(db, call, u.user.id);
    const { data: details } = await db.from("bov_eu_call_details").select("*").eq("call_id", body.call_id).maybeSingle();
    return respond({ ok: r.ok, cached: false, error: r.ok ? undefined : r.error, details }, r.ok ? 200 : 502);
  } catch (e) {
    console.error("bov-eu-call-details", e instanceof Error ? e.message : e);
    return respond({ error: "Internal function error" }, 500);
  }
});
