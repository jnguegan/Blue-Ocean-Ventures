// Supabase Edge Function: bov-eu-funding-scan  (v3.1: wider country detection incl. Africa & neighbourhood; placeholder budgets ignored)
// Deploy with Verify JWT OFF. Staff JWT is verified in-function; scheduled callers may use EU_SCAN_SECRET.
// Imports open and forthcoming EU Funding & Tenders opportunities: EU topics (types 1, 2) and
// cascade calls run by EU-funded projects (type 8). Requires blue-ocean-eu-scanner-v3.sql.
//
// v3: correct field mapping from the live API sample (callTitle, ccm2Id, url, budget, projectAcronym);
//     one record per real call; audience tags (SMEs, students, research, public, NGOs, individuals)
//     instead of a keyword filter; country detection; batched database writes; larger scans.
// v2.x: small pages, retries, fixed-size multipart body with GET fallback, raw sample logging.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAGE_SIZE = 50;           // rows per EU API request
const MAX_PAGES = 20;           // up to 1,000 calls per run
const PAGE_TIMEOUT_MS = 25000;  // per request
const TIME_BUDGET_MS = 110000;  // stop starting new pages after this (Edge limit is ~150s)

const API_BASE = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const TOPIC_URL = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";

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




// ---- Audience tags -------------------------------------------------------
const AUDIENCE_RULES: [string, RegExp][] = [
  ["sme", /\b(smes?|small and medium|micro[- ]?enterprises?|start[- ]?ups?|scale[- ]?ups?|entrepreneurs?|companies|company|businesses|business|industry|industrial|enterprises?|farmers?|cooperatives?)\b/i],
  ["students", /\b(students?|internships?|traineeships?|trainees?|scholarships?|master'?s?|bachelor|phd|doctoral|graduates?|young people|youth|learners?)\b/i],
  ["research", /\b(research(ers)?|universit(y|ies)|academi(a|c)|institutes?|scientists?|laborator(y|ies)|r&d|higher education)\b/i],
  ["public", /\b(public authorit(y|ies)|public bodies|municipalit(y|ies)|local authorit(y|ies)|regional authorit(y|ies)|governments?|public administrations?|cities)\b/i],
  ["ngo", /\b(ngos?|non[- ]?profit|not[- ]for[- ]profit|civil society|associations?|foundations?|charit(y|ies)|social economy)\b/i],
  ["individuals", /\b(individuals?|natural persons?|artists?|creators?|freelancers?|professionals?)\b/i],
];
function audienceTags(text: string): string[] {
  return AUDIENCE_RULES.filter(([, re]) => re.test(text)).map(([tag]) => tag);
}
// Map onto the older single-value `audience` column (kept for compatibility).
function audienceLegacy(tags: string[], text: string) {
  if (/\b(public authorities only|public administrations only|government bodies only)\b/i.test(text)) return "public_only";
  if (tags.includes("sme") || tags.includes("individuals")) return tags.length > 1 ? "mixed" : "private_possible";
  return tags.length ? "mixed" : "unreviewed";
}

// ---- Country detection (only when a call clearly targets specific countries) ----
const COUNTRIES: [string, string[]][] = [
  ["AT", ["austria", "austrian"]], ["BE", ["belgium", "belgian"]], ["BG", ["bulgaria", "bulgarian"]],
  ["HR", ["croatia", "croatian"]], ["CY", ["cyprus", "cypriot"]], ["CZ", ["czechia", "czech republic", "czech"]],
  ["DK", ["denmark", "danish"]], ["EE", ["estonia", "estonian"]], ["FI", ["finland", "finnish"]],
  ["FR", ["france", "french"]], ["DE", ["germany", "german"]], ["GR", ["greece", "greek"]],
  ["HU", ["hungary", "hungarian"]], ["IE", ["ireland", "irish"]], ["IT", ["italy", "italian"]],
  ["LV", ["latvia", "latvian"]], ["LT", ["lithuania", "lithuanian"]], ["LU", ["luxembourg"]],
  ["MT", ["malta", "maltese"]], ["NL", ["netherlands", "dutch"]], ["PL", ["poland", "polish"]],
  ["PT", ["portugal", "portuguese", "madeira", "azores"]], ["RO", ["romania", "romanian"]],
  ["SK", ["slovakia", "slovak"]], ["SI", ["slovenia", "slovenian"]], ["ES", ["spain", "spanish", "canary islands", "canarias"]],
  ["SE", ["sweden", "swedish"]], ["NO", ["norway", "norwegian"]], ["IS", ["iceland", "icelandic"]],
  ["UA", ["ukraine", "ukrainian"]], ["RS", ["serbia", "serbian"]], ["AL", ["albania", "albanian"]],
  ["MK", ["north macedonia"]], ["ME", ["montenegro"]], ["BA", ["bosnia"]], ["MD", ["moldova"]],
  ["TR", ["türkiye", "turkey", "turkish"]], ["GE", ["georgia"]], ["AM", ["armenia"]],
  ["BJ", ["benin"]],
  ["SN", ["senegal"]],
  ["GH", ["ghana"]],
  ["NG", ["nigeria"]],
  ["KE", ["kenya"]],
  ["ET", ["ethiopia"]],
  ["TZ", ["tanzania"]],
  ["UG", ["uganda"]],
  ["RW", ["rwanda"]],
  ["CM", ["cameroon"]],
  ["CI", ["côte d'ivoire", "cote d'ivoire", "ivory coast"]],
  ["ML", ["mali"]],
  ["BF", ["burkina faso"]],
  ["NE", ["niger"]],
  ["TD", ["chad"]],
  ["MA", ["morocco"]],
  ["DZ", ["algeria"]],
  ["TN", ["tunisia"]],
  ["EG", ["egypt"]],
  ["LY", ["libya"]],
  ["ZA", ["south africa"]],
  ["MZ", ["mozambique"]],
  ["ZM", ["zambia"]],
  ["ZW", ["zimbabwe"]],
  ["MW", ["malawi"]],
  ["MG", ["madagascar"]],
  ["CD", ["democratic republic of the congo", "dr congo", "drc"]],
  ["CG", ["republic of the congo", "congo-brazzaville"]],
  ["GA", ["gabon"]],
  ["TG", ["togo"]],
  ["GN", ["republic of guinea", "guinea-conakry"]],
  ["SL", ["sierra leone"]],
  ["LR", ["liberia"]],
  ["GM", ["gambia"]],
  ["MR", ["mauritania"]],
  ["SO", ["somalia"]],
  ["SD", ["sudan"]],
  ["SS", ["south sudan"]],
  ["AO", ["angola"]],
  ["NA", ["namibia"]],
  ["BW", ["botswana"]],
  ["CV", ["cabo verde", "cape verde"]],
  ["LB", ["lebanon"]],
  ["JO", ["jordan"]],
  ["PS", ["palestine", "gaza", "west bank"]],
  ["IL", ["israel"]],
  ["SY", ["syria"]],
  ["IQ", ["iraq"]],
  ["XK", ["kosovo"]],
  ["CH", ["switzerland", "swiss"]],
  ["GB", ["united kingdom"]],
];
const COUNTRY_CODES = new Set(COUNTRIES.map(([c]) => c));
// Looks only at the call name and organiser (not the long description, which mentions many countries).
function detectCountries(nameText: string, acronym: string): string[] {
  const found = new Set<string>();
  const t = nameText.toLowerCase();
  for (const [code, words] of COUNTRIES) if (words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(t))) found.add(code);
  const ncc = /\bNCC[-_ ]([A-Z]{2})\b/.exec(acronym + " " + nameText);   // e.g. NCC-HU = Hungarian national coordination centre
  if (ncc && COUNTRY_CODES.has(ncc[1])) found.add(ncc[1]);
  return [...found];
}

// ---- Map one EU API row to a register record ------------------------------
function toRecord(raw: any, now: string, today: string) {
  const type = field(raw, "type");
  const isCascade = type === "8";
  const topicId = field(raw, "identifier");
  const topicTitle = field(raw, "title");
  const callName = field(raw, "callTitle", "caName") || String(raw?.summary ?? raw?.content ?? "");

  // Unique ID per real call: cascade calls have their own portal ID (ccm2Id); EU topics use the topic identifier.
  const externalId = isCascade ? (field(raw, "ccm2Id") ? "cs-" + field(raw, "ccm2Id") : "") : topicId;
  const title = isCascade ? callName : (topicTitle || callName);
  if (!externalId || !title) return null;

  const description = stripHtml(field(raw, "description", "descriptionByte"));
  const extra = stripHtml(field(raw, "furtherInformation") + " " + field(raw, "beneficiaryAdministration"));
  const deadline = nextDeadline(raw, today);
  if (deadline && deadline < today) return null;

  const organiser = isCascade ? [field(raw, "projectAcronym"), field(raw, "projectName")].filter(Boolean).join(" — ") : "";
  const tagText = [title, description, extra].join(" ");
  const tags = audienceTags(tagText);
  const countries = detectCountries(title + " " + field(raw, "projectName"), field(raw, "projectAcronym"));
  const budget = Number(field(raw, "budget"));
  const statusCode = field(raw, "status");
  const link = field(raw, "url", "esST_URL") || (raw?.url as string) || TOPIC_URL + encodeURIComponent(topicId.toLowerCase());

  return {
    source_key: "eu-ft",
    source_external_id: externalId,
    title: title.slice(0, 250),
    programme: (isCascade ? (topicTitle || "EU cascade funding") : (field(raw, "callTitle") || topicTitle || "EU Funding & Tenders")).slice(0, 200),
    category: "regional",
    country_region: countries.length ? countries.join(", ") : "EU-wide",
    theme: (isCascade ? "Cascade funding (third-party call)" : "EU topic").slice(0, 200),
    summary: (description || extra).slice(0, 5000),
    official_url: link.startsWith("https://") ? link : TOPIC_URL + encodeURIComponent(topicId.toLowerCase()),
    deadline,
    eligibility_notes: "Eligibility must be verified against the official call. Automated audience tags are preliminary.",
    audience: audienceLegacy(tags, tagText),
    audience_tags: tags,
    country_codes: countries,
    call_kind: isCascade ? "cascade" : "topic",
    parent_topic: topicTitle.slice(0, 250) || null,
    parent_topic_id: topicId || null,
    organiser: organiser.slice(0, 300) || null,
    total_budget_eur: Number.isFinite(budget) && budget >= 1000 ? budget : null, // values under €1,000 are placeholders in EU data
    eu_status: statusCode === "31094501" ? "forthcoming" : "open",
    opening_date: dateOf(field(raw, "startDate")),
    last_seen_at: now,
  };
}

// Fields the scanner may refresh on records staff have not reviewed yet (status 'research', not verified).
const SCANNER_FIELDS = ["title", "programme", "country_region", "theme", "summary", "official_url", "deadline", "audience",
  "audience_tags", "country_codes", "call_kind", "parent_topic", "parent_topic_id", "organiser", "total_budget_eur", "eu_status", "opening_date"];

function trimDeep(v: any, depth = 0): any {
  if (typeof v === "string") return v.length > 400 ? v.slice(0, 400) + "…" : v;
  if (Array.isArray(v)) return v.slice(0, 8).map((x) => trimDeep(x, depth + 1));
  if (v && typeof v === "object" && depth < 6) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trimDeep(x, depth + 1)]));
  return v;
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

  let fetched = 0, inserted = 0, updated = 0, skipped = 0, pages = 0, method = "";
  let partialError: string | null = null;
  let rawSample: any = null;

  try {
    const now = new Date().toISOString(), today = now.slice(0, 10);

    for (let page = 1; page <= MAX_PAGES; page++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { partialError = `Stopped after page ${page - 1}: time budget reached`; break; }

      let results: any[], rawCount = 0;
      try {
        const got = await fetchPage(page);
        results = got.rows; rawCount = got.rawCount; method = got.method;
      } catch (e) {
        if (page === 1) throw e;
        partialError = errText(e);
        break;
      }
      pages++;
      if (!rawCount) {
        if (page === 1) throw Error("EU API returned no recognisable result rows; check response schema before import");
        break;
      }
      fetched += results.length;
      if (!rawSample && results.length) rawSample = { method, rows: trimDeep(results.slice(0, 3)) };

      // Build records, de-duplicated within the page.
      const byId = new Map<string, any>();
      for (const raw of results) {
        const rec = toRecord(raw, now, today);
        if (!rec) { skipped++; continue; }
        byId.set(rec.source_external_id, rec);
      }
      const ids = [...byId.keys()];
      if (ids.length) {
        const { data: existing, error: findErr } = await db.from("bov_eu_funding_calls")
          .select("id,source_external_id,status,verified_on").eq("source_key", "eu-ft").in("source_external_id", ids);
        if (findErr) throw findErr;
        const known = new Map((existing ?? []).map((r: any) => [r.source_external_id, r]));

        // New calls: one bulk insert.
        const fresh = ids.filter((id) => !known.has(id)).map((id) => ({ ...byId.get(id), status: "research", discovered_at: now }));
        if (fresh.length) {
          const { error } = await db.from("bov_eu_funding_calls").insert(fresh);
          if (error) throw error;
          inserted += fresh.length;
        }

        // Existing calls: refresh scanner fields only if staff have not reviewed them; otherwise just last_seen_at.
        const reviewedIds: string[] = [];
        for (const id of ids.filter((i) => known.has(i))) {
          const row: any = known.get(id);
          if (row.status === "research" && !row.verified_on) {
            const rec = byId.get(id);
            const patch: Record<string, unknown> = { last_seen_at: now };
            for (const k of SCANNER_FIELDS) patch[k] = rec[k];
            const { error } = await db.from("bov_eu_funding_calls").update(patch).eq("id", row.id);
            if (error) throw error;
          } else reviewedIds.push(row.id);
          updated++;
        }
        if (reviewedIds.length) {
          const { error } = await db.from("bov_eu_funding_calls").update({ last_seen_at: now }).in("id", reviewedIds);
          if (error) throw error;
        }
      }
      if (rawCount < PAGE_SIZE) break; // last page
    }

    const finished = new Date().toISOString();
    await db.from("bov_eu_scan_runs").update({
      finished_at: finished, status: "success", fetched_count: fetched, inserted_count: inserted, updated_count: updated,
      error_message: partialError ? ("Partial: " + partialError).slice(0, 1500) : null,
    }).eq("id", run.id);
    if (rawSample) await db.from("bov_eu_scan_runs").update({ raw_sample: rawSample }).eq("id", run.id);
    await db.from("bov_eu_funding_sources").update({ last_scanned_at: finished, scan_status: "success", last_error: partialError }).eq("source_key", "eu-ft");

    return reply({ ok: true, method, pages, fetched, inserted, updated, skipped, partialError,
      source: "EU Funding & Tenders official API", note: "Imported records require eligibility and deadline verification" });
  } catch (e) {
    const message = e instanceof Error ? errText(e) : (typeof e === "object" && e && "message" in e) ? String((e as any).message) : String(e);
    await db.from("bov_eu_scan_runs").update({ finished_at: new Date().toISOString(), status: "error", fetched_count: fetched,
      inserted_count: inserted, updated_count: updated, error_message: message.slice(0, 1500) }).eq("id", run.id);
    if (rawSample) await db.from("bov_eu_scan_runs").update({ raw_sample: rawSample }).eq("id", run.id);
    await db.from("bov_eu_funding_sources").update({ scan_status: "error", last_error: message.slice(0, 1000) }).eq("source_key", "eu-ft");
    return reply({ ok: false, error: message, pages, fetched, inserted }, 502);
  }
});
