// Knowledge Hub › Call Requirements
// Search an EU call (title, ID, programme), read its full official requirements once from the
// EU Funding & Tenders Portal (Edge Function bov-eu-call-details), store them, and reuse the stored copy.
// Needs supabase/blue-ocean-call-details.sql and the bov-eu-call-details function.
const FN = 'bov-eu-call-details';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => n == null || n === '' ? '' : '€' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 });
const day = d => { if (!d) return ''; const x = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); return isNaN(x) ? String(d) : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const today = () => new Date().toISOString().slice(0, 10);
const daysLeft = d => d ? Math.round((new Date(String(d).slice(0, 10) + 'T12:00:00Z') - new Date(today() + 'T12:00:00Z')) / 864e5) : null;
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pgRegex = p => { try { return p ? new RegExp(String(p).replace(/\\[mM]/g, '\\b'), 'i') : null; } catch { return null; } };

// ---------- HTML from the EU portal: allowlist sanitiser ----------
const TAGS = new Set(['P', 'BR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'A', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'SPAN', 'DIV', 'HR', 'SUP', 'SUB', 'BLOCKQUOTE']);
export function sanitize(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const root = doc.body.firstChild;
  const walk = node => {
    for (const el of [...node.children]) {
      if (!TAGS.has(el.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'IMG', 'SVG', 'VIDEO', 'AUDIO'].includes(el.tagName)) { el.remove(); continue; }
        walk(el); el.replaceWith(...el.childNodes); continue;
      }
      const href = el.tagName === 'A' ? el.getAttribute('href') || '' : '';
      const kind = el.tagName === 'SPAN' && /topicdescriptionkind/.test(el.getAttribute('class') || '');
      for (const a of [...el.attributes]) if (!['colspan', 'rowspan'].includes(a.name)) el.removeAttribute(a.name);
      if (el.tagName === 'A') {
        const abs = /^https?:\/\//i.test(href) ? href : /^\//.test(href) ? 'https://ec.europa.eu' + href : '';
        if (abs) { el.setAttribute('href', abs); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (kind) el.setAttribute('class', 'cr-kind');
      walk(el);
    }
  };
  walk(root);
  // "Expected Outcome:" / "Scope:" paragraphs become headings
  for (const p of [...root.querySelectorAll('p')]) {
    const t = p.textContent.replace(/\s+/g, ' ').trim();
    if (/^(expected outcomes?|expected impacts?|scope|objective|objectives|themes and priorities.*|activities that can be funded.*|description|eligibility|expected results?)\s*:?$/i.test(t)) {
      const h = doc.createElement('h4'); h.textContent = t.replace(/:$/, ''); p.replaceWith(h);
    }
  }
  return root.innerHTML;
}

const CSS = `
#crRoot{--ink:#14304f;--mut:#5b6b7f;--line:#dce6f0;--soft:#f4f8fd}
#crRoot .cr-search{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#crRoot .cr-search input[type=search]{flex:1 1 320px;padding:12px;border:1px solid #ccd8e7;border-radius:8px;font:inherit}
#crRoot .cr-search label{font-size:13px;display:inline-flex;gap:6px;align-items:center;color:var(--mut);flex:0 0 auto;width:auto;margin:0;white-space:nowrap}#crRoot .cr-search label input{width:16px!important;min-width:16px!important;height:16px;padding:0;margin:0;flex:0 0 16px}
#crRoot .cr-meta{font-size:13px;color:var(--mut);margin:8px 0}
#crRoot .cr-list{border:1px solid var(--line);border-radius:10px;margin:10px 0;max-height:420px;overflow:auto;background:#fff}
#crRoot .cr-item{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:#fff;padding:10px 12px;cursor:pointer;font:inherit;color:var(--ink)}
#crRoot .cr-item:hover,#crRoot .cr-item:focus{background:var(--soft)}
#crRoot .cr-item small{display:block;color:var(--mut);margin-top:3px}
#crRoot .cr-tag{display:inline-block;font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;background:#e8f0fa;color:#17365c;margin-left:6px}
#crRoot .cr-tag.ok{background:#e3f4ea;color:#155c32}#crRoot .cr-tag.warn{background:#fff3dc;color:#7a4b00}#crRoot .cr-tag.bad{background:#fde8e8;color:#8a1c1c}
#crRoot .cr-card{border:1px solid var(--line);border-radius:12px;padding:18px;margin:14px 0;background:#fff}
#crRoot .cr-card h3{margin:0 0 4px}
#crRoot .cr-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
#crRoot .cr-fact{background:var(--soft);border-radius:8px;padding:10px 12px}
#crRoot .cr-fact span{display:block;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--mut)}
#crRoot .cr-fact strong{display:block;margin-top:3px}
#crRoot .cr-sec{border-top:1px solid var(--line);padding-top:12px;margin-top:16px}
#crRoot .cr-sec>h4{margin:0 0 8px;font-size:15px;color:#0b3a6e}
#crRoot .cr-body{font-size:14px;line-height:1.55;overflow-wrap:anywhere}
#crRoot .cr-body h4{margin:14px 0 6px;font-size:14px;color:var(--ink)}
#crRoot .cr-body table{border-collapse:collapse;width:100%;margin:8px 0}#crRoot .cr-body td,#crRoot .cr-body th{border:1px solid var(--line);padding:5px 7px;vertical-align:top}
#crRoot table.cr-budget{border-collapse:collapse;width:100%;font-size:13px}#crRoot table.cr-budget td,#crRoot table.cr-budget th{border-bottom:1px solid var(--line);padding:6px;text-align:left}
#crRoot .cr-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
#crRoot .cr-docs{columns:2 280px;padding-left:18px;font-size:14px}#crRoot .cr-docs li{margin:0 0 6px;break-inside:avoid}
#crRoot .cr-note{width:100%;font:inherit;padding:10px;border:1px solid #ccd8e7;border-radius:8px}
#crRoot .cr-prog{background:var(--soft)}
#crRoot .cr-progress{height:8px;background:var(--line);border-radius:6px;overflow:hidden;margin:6px 0}#crRoot .cr-progress i{display:block;height:100%;background:#1f5fa8;width:0}
@media print{#crRoot .cr-noprint{display:none!important}}
`;

export function mount(el, opts) {
  if (el.dataset.mounted) { el._crRefresh?.(); return; }
  el.dataset.mounted = '1';
  const db = () => { let c = null; try { c = opts.db(); } catch {}  if (!c) throw Error('Connecting…'); return c; };
  const isAdmin = () => { try { return !!opts.isAdmin(); } catch { return false; } };
  if (!document.getElementById('crStyle')) { const s = document.createElement('style'); s.id = 'crStyle'; s.textContent = CSS; document.head.appendChild(s); }
  el.innerHTML = `<div id="crRoot">
   <p class="muted">Search any EU call by title, call ID or programme. The full official requirements are read once from the EU Funding &amp; Tenders Portal and stored; afterwards they open instantly from our database. Always confirm against the official page before submitting.</p>
   <div class="cr-search cr-noprint"><input type="search" id="crQ" placeholder="Paste a call title, call ID (e.g. HORIZON-CL6-2026-…) or programme name" aria-label="Search EU calls" autocomplete="off">
    <label><input type="checkbox" id="crClosed" style="width:auto">Include closed calls</label><button type="button" id="crGo">Search</button></div>
   <p class="cr-meta" id="crMeta">Loading the call register…</p>
   <div id="crResults"></div>
   <div id="crDetail"></div>
   <div class="cr-card cr-noprint" id="crSavedCard"><strong>Saved requirements</strong><p class="muted" style="margin:4px 0 8px">Calls you saved with a note. Saved items stay even after the deadline.</p><div id="crSaved" class="muted">Nothing saved yet.</div></div>
   <div class="cr-card cr-noprint" id="crAdmin" hidden><strong>Fill the stored list</strong><p class="muted" style="margin:4px 0 8px">Reads the official requirements of every live call not stored yet (about 25 per round, a few minutes in total). Already stored calls are not fetched again.</p>
    <div class="cr-actions"><button type="button" id="crFetchAll">Fetch all live calls</button><button type="button" id="crRetry" class="btn alt">Retry failed ones</button><button type="button" id="crStop" class="btn alt" hidden>Stop</button></div><div class="cr-progress"><i id="crBar"></i></div><p class="cr-meta" id="crFetchMsg"></p></div>
  </div>`;
  const $ = id => el.querySelector('#' + id);
  let calls = [], programmes = [], stored = new Map(), saved = [], current = null, stop = false;

  async function fn(body) {
    const { data: { session } } = await db().auth.getSession();
    if (!session) throw Error('Sign in again');
    let r;
    try {
      r = await fetch(opts.url + '/functions/v1/' + FN, { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token, apikey: opts.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw Error('The requirements service is not reachable (is the bov-eu-call-details function deployed?)'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.details) throw Error(j.error || 'Service error ' + r.status);
    return j;
  }

  async function loadBase() {
    const [c, p, s] = await Promise.all([
      db().from('bov_eu_funding_calls').select('id,source_external_id,title,programme,deadline,call_kind,eu_status,official_url').or(`deadline.is.null,deadline.gte.${today()}`).order('deadline', { ascending: true, nullsFirst: false }).limit(3000),
      db().from('bov_funding_programmes').select('*').order('no'),
      db().from('bov_eu_call_details').select('call_id,fetch_status,fetched_at,next_deadline').limit(10000),
    ]);
    if (c.error) throw c.error;
    calls = c.data || []; programmes = p.data || [];
    if (s.error) { $('crMeta').textContent = `${calls.length} live calls · stored requirements unavailable: run the Call Requirements SQL first.`; return; }
    stored = new Map((s.data || []).map(r => [r.call_id, r]));
    const have = calls.filter(x => stored.has(x.id) && stored.get(x.id).fetch_status !== 'failed').length;
    $('crMeta').textContent = `${calls.length} live calls · ${programmes.length} programmes · requirements stored for ${have} of ${calls.length} live calls (${stored.size} stored in total).`;
    $('crAdmin').hidden = !isAdmin();
  }

  async function loadSaved() {
    const { data, error } = await db().from('bov_eu_call_saves').select('id,call_id,note,created_at').order('created_at', { ascending: false });
    if (error) { $('crSaved').textContent = 'Saved list unavailable: ' + error.message; return; }
    saved = data || [];
    if (!saved.length) { $('crSaved').textContent = 'Nothing saved yet.'; return; }
    const ids = saved.map(s => s.call_id);
    const { data: info } = await db().from('bov_eu_call_details').select('call_id,title,source_external_id,next_deadline').in('call_id', ids);
    const byId = new Map((info || []).map(i => [i.call_id, i]));
    $('crSaved').innerHTML = '<div class="cr-list" style="max-height:300px">' + saved.map(s => {
      const i = byId.get(s.call_id) || calls.find(c => c.id === s.call_id) || {};
      const dl = i.next_deadline || i.deadline, left = daysLeft(dl);
      return `<button type="button" class="cr-item" data-open="${s.call_id}">${esc(i.title || 'Call ' + s.call_id)}${left != null ? `<span class="cr-tag ${left < 0 ? 'bad' : left <= 30 ? 'warn' : 'ok'}">${left < 0 ? 'closed' : left + ' days left'}</span>` : ''}<small>${esc(i.source_external_id || '')} · deadline ${esc(day(dl) || 'n/a')} · saved ${esc(day(s.created_at))}${s.note ? ' · ' + esc(s.note) : ''}</small></button>`;
    }).join('') + '</div>';
  }

  function callItem(c) {
    const st = stored.get(c.id), left = daysLeft(c.deadline);
    const tag = st ? (st.fetch_status === 'failed' ? '<span class="cr-tag bad">fetch failed</span>' : '<span class="cr-tag ok">stored</span>') : '';
    return `<button type="button" class="cr-item" data-open="${c.id}">${esc(c.title)}${tag}${left != null && left >= 0 && left <= 30 ? `<span class="cr-tag warn">${left} days left</span>` : ''}<small>${esc(c.source_external_id || '')} · ${esc(c.programme || '')} · deadline ${esc(day(c.deadline) || 'not set')}${c.call_kind === 'cascade' ? ' · cascade call' : ''}</small></button>`;
  }

  function programmeCalls(p) {
    const idR = pgRegex(p.id_pattern), nmR = pgRegex(p.name_pattern);
    return calls.filter(c => (idR && idR.test(c.source_external_id || '')) || (nmR && nmR.test((c.programme || '') + ' ' + (c.title || ''))));
  }

  async function search() {
    const raw = $('crQ').value.trim(), q = norm(raw);
    $('crDetail').innerHTML = '';
    if (q.length < 2) { $('crResults').innerHTML = ''; return; }
    const words = q.split(/\s+/).filter(Boolean);
    const hit = c => { const t = norm([c.title, c.source_external_id, c.programme].join(' ')); return words.every(w => t.includes(w)); };
    let found = calls.filter(hit);
    if ($('crClosed').checked) {
      const term = raw.replace(/[,()%*\\]/g, ' ').trim().slice(0, 120);
      const { data } = await db().from('bov_eu_funding_calls').select('id,source_external_id,title,programme,deadline,call_kind,eu_status,official_url')
        .or(`title.ilike.%${term}%,source_external_id.ilike.%${term}%,programme.ilike.%${term}%`).lt('deadline', today()).order('deadline', { ascending: false }).limit(60);
      found = found.concat((data || []).filter(c => !found.some(f => f.id === c.id)));
    }
    // exact ID first
    found.sort((a, b) => (norm(b.source_external_id) === q) - (norm(a.source_external_id) === q));
    const progs = programmes.filter(p => words.every(w => norm([p.code, p.name, p.category].join(' ')).includes(w))).slice(0, 4);
    let html = '';
    if (progs.length) html += progs.map(p => `<div class="cr-card cr-prog"><strong>Programme: ${esc(p.name)}</strong> <span class="cr-tag">${esc(p.code)}</span>
      <div class="cr-facts">${[['Management', p.management_mode], ['Funding rate', p.funding_rate_min != null ? `${p.funding_rate_min}–${p.funding_rate_max}%` : ''], ['Typical grant', p.typical_grant_min ? `${eur(p.typical_grant_min)} – ${eur(p.typical_grant_max)}` : ''], ['Consortium', p.consortium ? p.consortium + (p.min_partners ? ` · min ${p.min_partners} partners / ${p.min_countries || 1} countries` : '') : ''], ['Who can apply', (p.applicant_types || []).join(', ')], ['Geography', p.geography]].filter(x => x[1]).map(([k, v]) => `<div class="cr-fact"><span>${k}</span><strong>${esc(v)}</strong></div>`).join('')}</div>
      ${p.notes ? `<p style="margin:0 0 8px">${esc(p.notes)}</p>` : ''}<button type="button" data-prog="${esc(p.code)}">Show its ${programmeCalls(p).length} live calls</button></div>`).join('');
    html += `<p class="cr-meta">${found.length ? found.length + ' call' + (found.length > 1 ? 's' : '') + ' found' + (found.length > 80 ? ' (first 80 shown — refine the search)' : '') : 'No call matches. Try part of the title or the call ID.'}</p>`;
    if (found.length) html += '<div class="cr-list">' + found.slice(0, 80).map(callItem).join('') + '</div>';
    $('crResults').innerHTML = html;
  }

  function showProgramme(code) {
    const p = programmes.find(x => x.code === code); if (!p) return;
    const list = programmeCalls(p);
    $('crResults').innerHTML = `<p class="cr-meta">${list.length} live calls in ${esc(p.name)}</p>` + (list.length ? '<div class="cr-list">' + list.map(callItem).join('') + '</div>' : '');
  }

  async function open(callId, refresh = false) {
    $('crDetail').innerHTML = `<div class="cr-card">${refresh ? 'Reading the official record again…' : 'Opening requirements…'}</div>`;
    $('crDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      let det = null, fromStore = false;
      if (!refresh) {
        const { data } = await db().from('bov_eu_call_details').select('*').eq('call_id', callId).maybeSingle();
        if (data && data.fetch_status !== 'failed') { det = data; fromStore = true; }
      }
      if (!det) {
        $('crDetail').innerHTML = '<div class="cr-card">Reading the official EU record for the first time and storing it (about 5–20 seconds)…</div>';
        const j = await fn({ call_id: callId, refresh: true });
        det = j.details;
        if (!j.ok) throw Error(j.error || 'The official record could not be read');
      }
      const { data: req } = await db().from('bov_call_requirements').select('*').eq('call_id', callId).maybeSingle();
      current = { det, req, call: calls.find(c => c.id === callId) || {} };
      stored.set(callId, { call_id: callId, fetch_status: det.fetch_status, fetched_at: det.fetched_at });
      render(fromStore);
    } catch (e) {
      const c = calls.find(x => x.id === callId) || {};
      $('crDetail').innerHTML = `<div class="cr-card"><strong>${esc(c.title || 'Call')}</strong><p style="color:#8a1c1c">${esc(e.message)}</p>${c.official_url ? `<p><a href="${esc(c.official_url)}" target="_blank" rel="noopener noreferrer">Open the official call page ↗</a></p>` : ''}<button type="button" data-refresh="${callId}">Try again</button></div>`;
    }
  }

  function render(fromStore) {
    const { det: d, req } = current;
    const isSaved = saved.find(s => s.call_id === d.call_id);
    const dls = (d.deadline_dates || []).length ? d.deadline_dates : d.next_deadline ? [d.next_deadline] : [];
    const left = daysLeft(d.next_deadline);
    const fact = (k, v) => v ? `<div class="cr-fact"><span>${k}</span><strong>${v}</strong></div>` : '';
    const grant = d.grant_min_eur || d.grant_max_eur ? (d.grant_min_eur && d.grant_max_eur && d.grant_min_eur !== d.grant_max_eur ? `${eur(d.grant_min_eur)} – ${eur(d.grant_max_eur)}` : eur(d.grant_max_eur || d.grant_min_eur)) : '';
    const reqFacts = req ? [
      ['Applicant types', (req.applicant_types || []).join(', ')], ['Eligible countries', (req.eligible_countries || []).join(', ') || (req.call_id ? 'EU Member States + associated countries (check conditions)' : '')],
      ['Funding rate', req.funding_rate_min != null ? `${req.funding_rate_min}${req.funding_rate_max != null && req.funding_rate_max !== req.funding_rate_min ? '–' + req.funding_rate_max : ''}%` : ''],
      ['Consortium', req.consortium_required == null ? '' : req.consortium_required ? `Required${req.min_partners ? ` · at least ${req.min_partners} partners` : ''}${req.min_countries ? ` from ${req.min_countries} countries` : ''}` : 'Single applicant possible'],
      ['TRL', req.trl_min ? `${req.trl_min}${req.trl_max ? '–' + req.trl_max : ''}` : ''], ['Max duration', req.duration_months_max ? req.duration_months_max + ' months' : ''],
    ].filter(x => x[1]) : [];
    const budgetRows = (d.budget || []).filter(b => b.amount_eur || b.max_contribution_eur);
    const sec = (title, body) => body ? `<div class="cr-sec"><h4>${title}</h4>${body}</div>` : '';
    $('crDetail').innerHTML = `<div class="cr-card" id="crPrintable">
      <p class="cr-meta" style="margin:0 0 6px">${esc(d.programme || '')}${d.call_kind === 'cascade' ? ' · cascade call' : ''}</p>
      <h3>${esc(d.title)}</h3>
      <p class="cr-meta" style="margin:4px 0">${esc(d.source_external_id)}${d.call_identifier && d.call_identifier !== d.source_external_id ? ' · call ' + esc(d.call_identifier) : ''}${d.call_title ? ' · ' + esc(d.call_title) : ''}</p>
      <p class="cr-meta">${fromStore ? 'Stored copy' : 'Read from the official source'} · last fetched ${esc(day(d.fetched_at))}${d.fetch_status === 'partial' ? ' · <span class="cr-tag warn">some sections not published by the EU</span>' : ''}</p>
      <div class="cr-actions cr-noprint">
        ${d.official_url ? `<a class="btn" href="${esc(d.official_url)}" target="_blank" rel="noopener noreferrer" style="padding:9px 14px;border-radius:8px;background:#0b3a6e;color:#fff;text-decoration:none;font-weight:650">Official call page ↗</a>` : ''}
        <button type="button" id="crPrint">Print</button>
        <button type="button" id="crRefresh" class="btn alt">Refresh from source</button>
        <button type="button" id="crDelete" class="btn alt">Delete stored copy</button>
        <button type="button" id="crNew" class="btn alt">New search</button>
      </div>
      <div class="cr-facts">
        ${fact('Status', esc(d.status || current.call.eu_status || ''))}
        ${fact('Deadline', dls.length ? dls.map(x => esc(day(x))).join('<br>') + (left != null ? `<br><small>${left < 0 ? 'closed' : left + ' days left'}</small>` : '') : 'See official page')}
        ${fact('Opening', esc(day(d.opening_date) || d.opening_date || ''))}
        ${fact('Submission', esc(d.deadline_model || ''))}
        ${fact('Type of action', esc(d.type_of_action || ''))}
        ${fact('Call budget', esc(eur(d.total_budget_eur)))}
        ${fact('Grant per project', esc(grant))}
        ${fact('Expected grants', esc(d.expected_grants || ''))}
      </div>
      ${budgetRows.length > 1 ? sec('Budget by action', `<div style="overflow-x:auto"><table class="cr-budget"><tr><th>Action</th><th>Budget</th><th>Per project</th><th>Grants</th><th>Deadline</th></tr>${budgetRows.map(b => `<tr><td>${esc(b.action)}</td><td>${esc(eur(b.amount_eur))}</td><td>${esc(b.min_contribution_eur && b.max_contribution_eur && b.min_contribution_eur !== b.max_contribution_eur ? eur(b.min_contribution_eur) + ' – ' + eur(b.max_contribution_eur) : eur(b.max_contribution_eur || b.min_contribution_eur))}</td><td>${esc(b.expected_grants || '')}</td><td>${esc((b.deadlines || []).map(day).join(', '))}</td></tr>`).join('')}</table></div>`) : ''}
      ${reqFacts.length ? sec('Key requirements (for matching)', `<div class="cr-facts">${reqFacts.map(([k, v]) => fact(k, esc(v))).join('')}</div><p class="cr-meta">Source: ${esc(req.source === 'staff_verified' ? 'verified by staff' : req.source === 'auto_extracted' ? 'read from the official text' : 'programme defaults')}. The official conditions below prevail.</p>`) : ''}
      ${sec('What it funds', d.description_html ? `<div class="cr-body">${sanitize(d.description_html)}</div>` : '')}
      ${sec('Who can apply, conditions and award criteria', d.conditions_html ? `<div class="cr-body">${sanitize(d.conditions_html)}</div>` : '')}
      ${sec('Documents and templates', (d.documents || []).length ? `<ul class="cr-docs">${d.documents.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title || x.url)}</a></li>`).join('')}</ul>` : '')}
      ${sec('Support and contacts', d.support_html ? `<div class="cr-body">${sanitize(d.support_html)}</div>` : '')}
      ${sec('Latest updates from the EU', d.latest_info_html ? `<div class="cr-body">${sanitize(d.latest_info_html)}</div>` : '')}
      ${sec('Keywords', (d.keywords || []).length ? `<p>${d.keywords.map(k => `<span class="cr-tag">${esc(k)}</span>`).join(' ')}</p>` : '')}
      ${!d.description_html && !d.conditions_html ? `<p class="cr-meta">The EU record for this call has no published text yet. Open the official call page for details.</p>` : ''}
      <div class="cr-sec cr-noprint"><h4>${isSaved ? 'Saved to your list' : 'Save to your list'}</h4>
        <textarea id="crNote" class="cr-note" rows="2" maxlength="1000" placeholder="Note (optional): which project, next step…">${esc(isSaved?.note || '')}</textarea>
        <div class="cr-actions">${isSaved ? '<button type="button" id="crUnsave" class="btn alt">Remove from saved</button>' : '<button type="button" id="crSave">Save</button>'}</div></div>
      <p class="cr-meta">Source: EU Funding &amp; Tenders Portal${d.source_url ? ' (' + esc(d.source_url.split(' ')[0]) + ')' : ''}. Internal research copy; check the official page before applying.</p>
    </div>`;
  }

  function printCurrent() {
    const node = el.querySelector('#crPrintable'); if (!node) return;
    const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print'); return; }
    const clone = node.cloneNode(true); clone.querySelectorAll('.cr-noprint').forEach(n => n.remove());
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(current.det.title)} · Call requirements</title><style>${CSS.replace(/#crRoot/g, 'body')} body{font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#14304f;margin:28px}.cr-card{border:0;padding:0}a{color:#0b3a6e}</style></head><body><p style="font-weight:700;letter-spacing:.08em;font-size:12px">BLUE OCEAN VENTURES · CALL REQUIREMENTS · ${esc(day(today()))}</p>${clone.outerHTML}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  async function fetchAll(retry) {
    stop = false; $('crStop').hidden = false; $('crFetchAll').disabled = $('crRetry').disabled = true;
    let total = null, done = 0, failed = 0;
    try {
      while (!stop) {
        const r = await fn({ mode: 'missing', limit: 25, retry_failed: !!retry });
        done += r.stored || 0; failed += r.failed || 0;
        if (total == null) total = (r.processed || 0) + (r.remaining || 0);
        $('crBar').style.width = total ? Math.min(100, Math.round(100 * (total - r.remaining) / total)) + '%' : '100%';
        $('crFetchMsg').textContent = `Stored ${done} · failed ${failed} · remaining ${r.remaining}` + ((r.errors || []).length ? ` · last error: ${r.errors[0]}` : '');
        if (!r.remaining || !r.processed) break;
        if (!r.stored) { $('crFetchMsg').textContent += ' · paused: nothing could be stored in this round'; break; }
      }
      $('crFetchMsg').textContent += stop ? ' · stopped' : ' · finished';
    } catch (e) { $('crFetchMsg').textContent = 'Stopped: ' + e.message; }
    $('crStop').hidden = true; $('crFetchAll').disabled = $('crRetry').disabled = false;
    await loadBase().catch(() => {});
  }

  let t;
  $('crQ').addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
  $('crQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  $('crGo').onclick = search; $('crClosed').onchange = search;
  $('crFetchAll').onclick = () => fetchAll(false); $('crRetry').onclick = () => fetchAll(true); $('crStop').onclick = () => { stop = true; };
  el.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || !el.contains(b)) return;
    if (b.dataset.open) return open(b.dataset.open);
    if (b.dataset.refresh) return open(b.dataset.refresh, true);
    if (b.dataset.prog) return showProgramme(b.dataset.prog);
    if (!current) return;
    const id = current.det.call_id;
    if (b.id === 'crPrint') printCurrent();
    if (b.id === 'crRefresh') open(id, true);
    if (b.id === 'crNew') { current = null; $('crDetail').innerHTML = ''; $('crQ').focus(); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 80, behavior: 'smooth' }); }
    if (b.id === 'crDelete') {
      if (!confirm('Delete the stored copy? It will be read again from the EU portal next time it is opened.')) return;
      const { error } = await db().from('bov_eu_call_details').delete().eq('call_id', id);
      if (error) return alert('Not deleted: ' + error.message);
      stored.delete(id); current = null; $('crDetail').innerHTML = '<div class="cr-card">Stored copy deleted.</div>'; loadBase().catch(() => {});
    }
    if (b.id === 'crSave') {
      const { error } = await db().from('bov_eu_call_saves').insert({ call_id: id, note: $('crNote').value.trim() || null });
      if (error) return alert('Not saved: ' + error.message);
      await loadSaved(); render(true);
    }
    if (b.id === 'crUnsave') {
      const s = saved.find(x => x.call_id === id);
      const { error } = await db().from('bov_eu_call_saves').delete().eq('id', s.id);
      if (error) return alert('Not removed: ' + error.message);
      await loadSaved(); render(true);
    }
  });
  el._crRefresh = () => { loadBase().catch(() => {}); loadSaved().catch(() => {}); };
  (async () => {
    for (let i = 0; i < 60; i++) { try { if (opts.db()) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
    await loadBase().then(() => { if ($('crQ').value) search(); }).catch(e => { $('crMeta').textContent = 'Call register unavailable: ' + e.message; });
    loadSaved().catch(() => {});
  })();
}
