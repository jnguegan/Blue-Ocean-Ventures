// Supabase Edge Function: bov-eu-funding-scan  (v2)
// Deploy with Verify JWT OFF. Staff JWT is verified in-function; scheduled callers may use EU_SCAN_SECRET.
// Only imports official European Commission grants, not tenders or fabricated regional calls.
//
// v2.1: multipart body sent as fixed-size bytes; GET fallback; detailed network error causes.
// v2 changes:
//  - Small pages (PAGE_SIZE) fetched one after another, instead of one huge 100-row reply
//    (fixes "error reading a body from connection").
//  - One automatic retry per page on network errors, and an overall time budget.
//  - Reads fields from the nested `metadata` object the EU search API uses (values are arrays).
//  - Only asks for forthcoming + open calls (closed calls are no longer requested).
//  - Response includes `sampleKeys` so we can confirm the live EU schema.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAGE_SIZE = 10;          // rows per EU API request — keep small
const MAX_PAGES = 5;           // max pages per run (PAGE_SIZE x MAX_PAGES rows scanned)
const PAGE_TIMEOUT_MS = 20000; // per request
const TIME_BUDGET_MS = 100000; // stop starting new pages after this (Edge limit is ~150s)

const API_BASE = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const ORIGIN = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";
const keywords = /agricultur|farm|food|rural|sme|small business|entrepreneur|start.up|renewable|solar|energy|touris|hospitality|digital|innovation|manufactur|circular|bioeconomy|local develop/i;

// Read a value from the result, checking `metadata` first, then the top level.
// EU metadata values are usually arrays of strings, e.g. { identifier: ["HORIZON-..."] }.
function field(raw: any, ...keys: string[]): string {
  const sources = [raw?.metadata, raw?._source?.metadata, raw?._source, raw];
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const k of keys) {
      const v = src[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
      if (Array.isArray(v)) {
        const first = v.find((s) => typeof s === "string" && s.trim());
        if (first) return first.trim();
      }
    }
  }
  return "";
}

// All values for a key (used for deadlines, which can be a list).
function fieldAll(raw: any, key: string): string[] {
  for (const src of [raw?.metadata, raw?._source?.metadata, raw?._source, raw]) {
    const v = src?.[key];
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === "string" || typeof v === "number") return [String(v)];
  }
  return [];
}

function rowsFrom(x: any): any[] {
  for (const a of [x?.results, x?.items, x?.data?.results, x?.data?.items, x?.response?.results, x?.hits?.hits, x?.results?.results, x?.results?.items]) {
    if (Array.isArray(a)) return a;
  }
  return [];
}

function dateOf(v: string): string | null {
  if (!v) return null;
  const m = v.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  if (/^\d{13}$/.test(v)) return new Date(Number(v)).toISOString().slice(0, 10);
  return null;
}

// Next deadline that is today or later; otherwise the latest one.
function nextDeadline(raw: any, today: string): string | null {
  const dates = [...fieldAll(raw, "deadlineDate"), ...fieldAll(raw, "deadline"), ...fieldAll(raw, "submissionDeadline")]
    .map(dateOf).filter((d): d is string => !!d).sort();
  if (!dates.length) return null;
  return dates.find((d) => d >= today) ?? dates[dates.length - 1];
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function classify(text: string) {
  return /\b(public authorities only|public administrations only|government bodies only)\b/i.test(text) ? "public_only"
    : /\b(sme|micro.enterprise|entrepreneur|start.up|farmer|private enterprise|business|company|cooperative)\b/i.test(text) ? "private_possible"
    : "unreviewed";
}

// type 1,2,8 = grant topics / cascade; status 31094501 = forthcoming, 31094502 = open
const WANTED_TYPES = new Set(["1", "2", "8"]);
const WANTED_STATUS = new Set(["31094501", "31094502"]);

// Build the multipart body ourselves as fixed-size bytes (sent with Content-Length),
// instead of FormData, which Deno may stream in chunks — some servers drop such uploads.
function multipartBody(parts: Record<string, unknown>) {
  const boundary = "----BOVBoundary" + crypto.randomUUID().replace(/-/g, "");
  let text = "";
  for (const [name, value] of Object.entries(parts)) {
    text += `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}.json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(value)}\r\n`;
  }
  text += `--${boundary}--\r\n`;
  return { body: new TextEncoder().encode(text), contentType: `multipart/form-data; boundary=${boundary}` };
}

function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const cause = (e as any)?.cause;
  return cause ? `${msg} (cause: ${cause instanceof Error ? cause.message : String(cause)})` : msg;
}

// One page from the EU API. Tries POST with filters (twice), then a plain GET with local filtering.
async function fetchPage(pageNumber: number): Promise<{ rows: any[]; rawCount: number; method: string }> {
  const url = `${API_BASE}?apiKey=SEDIA&text=***&pageSize=${PAGE_SIZE}&pageNumber=${pageNumber}`;
  const query = { bool: { must: [{ terms: { type: [...WANTED_TYPES] } }, { terms: { status: [...WANTED_STATUS] } }] } };
  const baseHeaders = { "Accept": "application/json", "Accept-Encoding": "identity", "User-Agent": "Mozilla/5.0 (compatible; BlueOceanVenturesFundingScanner/1.2)" };
  const errors: string[] = [];

  // 1) POST with server-side filters
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { body, contentType } = multipartBody({ query, languages: ["en"] });
      const response = await fetch(url, {
        method: "POST",
        body,
        headers: { ...baseHeaders, "Content-Type": contentType },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      });
      const rows = await readRows(response, pageNumber);
      return { rows, rawCount: rows.length, method: "POST" };
    } catch (e) {
      if ((e as any)?.noRetry) throw e;
      errors.push(`POST#${attempt}: ${errText(e)}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // 2) Fallback: GET without a body, filter type/status locally
  try {
    const response = await fetch(url, { method: "GET", headers: baseHeaders, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    const rows = await readRows(response, pageNumber);
    const keep = rows.filter((r) => {
      const t = fieldAll(r, "type"), s = fieldAll(r, "status");
      return (!t.length || t.some((v) => WANTED_TYPES.has(v))) && (!s.length || s.some((v) => WANTED_STATUS.has(v)));
    });
    return { rows: keep, rawCount: rows.length, method: "GET" };
  } catch (e) {
    if ((e as any)?.noRetry) throw e;
    errors.push(`GET: ${errText(e)}`);
  }
  throw Error(`EU API page ${pageNumber} network error: ${errors.join(" | ")}`);
}

async function readRows(response: Response, pageNumber: number): Promise<any[]> {
  if (!response.ok) {
    let body = "";
    try { body = (await response.text()).slice(0, 600); } catch { body = "response body unreadable"; }
    throw Object.assign(Error(`EU API page ${pageNumber} returned HTTP ${response.status}${body ? ": " + body : ""}`), { noRetry: true });
  }
  const text = await response.text();
  try { return rowsFrom(JSON.parse(text)); }
  catch { throw Object.assign(Error(`EU API page ${pageNumber} was not valid JSON: ${text.slice(0, 300)}`), { noRetry: true }); }
}

const allowedOrigins = new Set(["https://blueoceanventures.co", "https://www.blueoceanventures.co"]);

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    ...(allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-eu-scan-secret",
    "Cache-Control": "no-store",
  };
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), url = Deno.env.get("SUPABASE_URL"), secret = Deno.env.get("EU_SCAN_SECRET");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!service || !url || !anon) return reply({ error: "Missing Supabase server configuration" }, 503);

  // --- Access control (unchanged) ---
  const provided = req.headers.get("x-eu-scan-secret");
  const scheduled = !!secret && !!provided && provided === secret;
  if (!scheduled) {
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "")?.[1]?.trim();
    if (!token) return reply({ error: "Staff sign-in required" }, 401);
    const userDb = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await userDb.auth.getUser(token);
    if (userError || !userData.user) return reply({ error: "Invalid staff session" }, 401);
    const { data: allowed, error: accessError } = await userDb.rpc("bov_hub_access");
    if (accessError || allowed !== true) return reply({ error: "Knowledge Hub staff permission required" }, 403);
  }

  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: run, error: runErr } = await db.from("bov_eu_scan_runs").insert({ source_key: "eu-ft" }).select("id").single();
  if (runErr) return reply({ error: "Scanner migration missing or scan log unavailable", detail: runErr.message }, 500);

  let fetched = 0, inserted = 0, updated = 0, skipped = 0, pages = 0;
  let sampleKeys: { top: string[]; metadata: string[] } | null = null;
  let partialError: string | null = null;
  let method = "";

  try {
    const now = new Date().toISOString(), today = now.slice(0, 10);

    for (let page = 1; page <= MAX_PAGES; page++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { partialError = `Stopped after page ${page - 1}: time budget reached`; break; }

      let results: any[], rawCount = 0;
      try {
        const got = await fetchPage(page);
        results = got.rows; rawCount = got.rawCount; method = got.method;
      } catch (e) {
        if (page === 1) throw e; // nothing fetched at all: real failure
        partialError = e instanceof Error ? e.message : String(e); // keep what we already imported
        break;
      }
      pages++;
      if (!rawCount) {
        if (page === 1) throw Error("EU API returned no recognisable result rows; check response schema before import");
        break;
      }
      fetched += results.length;
      if (!sampleKeys) {
        const r = results[0];
        sampleKeys = { top: Object.keys(r ?? {}), metadata: Object.keys(r?.metadata ?? r?._source?.metadata ?? {}) };
      }

      for (const raw of results) {
        const id = field(raw, "identifier", "topicIdentifier", "callIdentifier", "topicId");
        const title = field(raw, "title", "topicTitle", "callTitle", "name");
        if (!id || !title) { skipped++; continue; }

        const summary = stripHtml(field(raw, "descriptionByte", "description", "summary", "topicDescription") || String(raw?.summary ?? raw?.content ?? ""));
        const programme = field(raw, "frameworkProgrammeName", "programmeName", "programme", "callTitle") || "EU Funding & Tenders";
        const text = [title, summary, programme].join(" ");
        if (!keywords.test(text)) { skipped++; continue; }

        const deadline = nextDeadline(raw, today);
        if (deadline && deadline < today) { skipped++; continue; }

        const audience = classify(text);
        if (audience === "public_only") { skipped++; continue; }

        const record = {
          source_key: "eu-ft", source_external_id: id, title: title.slice(0, 250), programme: programme.slice(0, 200),
          category: "regional", country_region: "EU-wide",
          theme: field(raw, "keywords", "tags", "typesOfAction").slice(0, 200) || "EU funding",
          summary: summary.slice(0, 5000), official_url: ORIGIN + encodeURIComponent(id.toLowerCase()),
          status: "research", deadline,
          eligibility_notes: "Eligibility must be verified against the official call. Automated private-sector relevance is preliminary.",
          audience, discovered_at: now, last_seen_at: now,
        };

        const { data: existing, error: findErr } = await db.from("bov_eu_funding_calls").select("id")
          .eq("source_key", "eu-ft").eq("source_external_id", id).maybeSingle();
        if (findErr) throw findErr;
        if (existing) {
          // Preserve staff-reviewed status, notes and verification. Only refresh last_seen_at.
          const { error } = await db.from("bov_eu_funding_calls").update({ last_seen_at: now }).eq("id", existing.id);
          if (error) throw error; updated++;
        } else {
          const { error } = await db.from("bov_eu_funding_calls").insert(record);
          if (error) throw error; inserted++;
        }
      }
      if (rawCount < PAGE_SIZE) break; // last page
    }

    const finished = new Date().toISOString();
    await db.from("bov_eu_scan_runs").update({
      finished_at: finished, status: "success", fetched_count: fetched, inserted_count: inserted, updated_count: updated,
      error_message: partialError ? ("Partial: " + partialError).slice(0, 1500) : null,
    }).eq("id", run.id);
    await db.from("bov_eu_funding_sources").update({ last_scanned_at: finished, scan_status: "success", last_error: partialError }).eq("source_key", "eu-ft");

    return reply({ ok: true, method, pages, fetched, inserted, updated, skipped, partialError, sampleKeys,
      source: "EU Funding & Tenders official API", note: "Imported records require eligibility and deadline verification" });
  } catch (e) {
    const message = e instanceof Error ? errText(e) : (typeof e === "object" && e && "message" in e) ? String((e as any).message) : String(e);
    await db.from("bov_eu_scan_runs").update({ finished_at: new Date().toISOString(), status: "error", fetched_count: fetched,
      inserted_count: inserted, updated_count: updated, error_message: message.slice(0, 1500) }).eq("id", run.id);
    await db.from("bov_eu_funding_sources").update({ scan_status: "error", last_error: message.slice(0, 1000) }).eq("source_key", "eu-ft");
    return reply({ ok: false, error: message, pages, fetched, inserted, sampleKeys }, 502);
  }
});
