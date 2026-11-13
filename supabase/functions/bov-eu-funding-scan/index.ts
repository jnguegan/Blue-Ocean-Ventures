// Supabase Edge Function: bov-eu-funding-scan
// Deploy with JWT verification ON. Scheduled calls use the private EU_SCAN_SECRET header.
// Only imports official European Commission grants, not tenders or fabricated regional calls.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const API="https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&language=en&pageSize=100&pageNumber=1";
const ORIGIN="https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";
const keywords=/agricultur|farm|food|rural|sme|small business|entrepreneur|start.up|renewable|solar|energy|touris|hospitality|digital|innovation|manufactur|circular|bioeconomy|local develop/i;
function field(x,...keys){for(const k of keys){const v=x?.[k];if(typeof v==="string"&&v.trim())return v.trim();if(typeof v==="number")return String(v);if(Array.isArray(v)&&v.length&&typeof v[0]==="string")return v[0]}return ""}
function rowsFrom(x){for(const a of [x?.results,x?.items,x?.data?.results,x?.data?.items,x?.response?.results,x?.hits?.hits,x?.results?.results,x?.results?.items])if(Array.isArray(a))return a;return []}
function dateOf(v){if(!v)return null;const s=String(v);const match=s.match(/\d{4}-\d{2}-\d{2}/);if(match)return match[0];if(/^\d{13}$/.test(s))return new Date(Number(s)).toISOString().slice(0,10);return null}
function classify(text){return /\b(public authorities only|public administrations only|government bodies only)\b/i.test(text)?"public_only":/\b(sme|micro.enterprise|entrepreneur|start.up|farmer|private enterprise|business|company|cooperative)\b/i.test(text)?"private_possible":"unreviewed"}
Deno.serve(async req=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("EU_SCAN_SECRET");
 if(!service||!url||!secret)return Response.json({error:"Missing server configuration"},{status:503});
 const provided=req.headers.get("x-eu-scan-secret");
 if(provided!==secret)return Response.json({error:"Not authorised"},{status:401});
 const db=createClient(url,service,{auth:{persistSession:false}});
 const {data:run,error:runErr}=await db.from("bov_eu_scan_runs").insert({source_key:"eu-ft"}).select("id").single();
 if(runErr)return Response.json({error:"Scanner migration missing or scan log unavailable",detail:runErr.message},{status:500});
 let fetched=0,inserted=0,updated=0;
 try{
  const query={bool:{must:[{terms:{type:["1","2","8"]}},{terms:{status:["31094501","31094502","31094503"]}}]}};
  const form=new FormData();form.append("query",new Blob([JSON.stringify(query)],{type:"application/json"}),"query.json");
  const response=await fetch(API,{method:"POST",body:form,signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw Error("EU API returned HTTP "+response.status);
  const payload=await response.json(),results=rowsFrom(payload);fetched=results.length;
  if(!results.length)throw Error("EU API returned no recognisable result rows; check response schema before import");
  const now=new Date().toISOString(),today=now.slice(0,10);
  for(const raw of results){
   const x=raw?._source||raw;
   const id=field(x,"identifier","topicIdentifier","topicId","reference","id");
   const title=field(x,"title","topicTitle","name");
   if(!id||!title)continue;
   const summary=field(x,"description","summary","topicDescription");
   const programme=field(x,"frameworkProgramme","programme","programmeName")||"EU Funding & Tenders";
   const text=[title,summary,programme].join(" ");
   if(!keywords.test(text))continue;
   const deadline=dateOf(field(x,"deadlineDate","deadline","submissionDeadline","deadlineDates"));
   if(deadline&&deadline<today)continue;
   const sourceUrl=ORIGIN+encodeURIComponent(id);
   const audience=classify(text);
   if(audience==="public_only")continue;
   const record={source_key:"eu-ft",source_external_id:id,title:title.slice(0,250),programme:String(programme).slice(0,200),category:"regional",country_region:"EU-wide",theme:field(x,"topicType","tags","keywords").slice(0,200)||"EU funding",summary:summary.slice(0,5000),official_url:sourceUrl,status:"research",deadline,eligibility_notes:"Eligibility must be verified against the official call. Automated private-sector relevance is preliminary.",audience,discovered_at:now,last_seen_at:now};
   const {data:existing,error:findErr}=await db.from("bov_eu_funding_calls").select("id").eq("source_key","eu-ft").eq("source_external_id",id).maybeSingle();
   if(findErr)throw findErr;
   if(existing){
    // Preserve staff-reviewed status, notes and verification. Only update discovery timestamps.
    const {error}=await db.from("bov_eu_funding_calls").update({last_seen_at:now}).eq("id",existing.id);if(error)throw error;updated++;
   }else{
    const {error}=await db.from("bov_eu_funding_calls").insert(record);if(error)throw error;inserted++;
   }
  }
  await db.from("bov_eu_scan_runs").update({finished_at:new Date().toISOString(),status:"success",fetched_count:fetched,inserted_count:inserted,updated_count:updated}).eq("id",run.id);
  await db.from("bov_eu_funding_sources").update({last_scanned_at:new Date().toISOString(),scan_status:"success",last_error:null}).eq("source_key","eu-ft");
  return Response.json({ok:true,fetched,inserted,updated,source:"EU Funding & Tenders official API",note:"Imported records require eligibility and deadline verification"});
 }catch(e){
  const message=e instanceof Error?e.message:String(e);
  await db.from("bov_eu_scan_runs").update({finished_at:new Date().toISOString(),status:"error",fetched_count:fetched,inserted_count:inserted,updated_count:updated,error_message:message.slice(0,1500)}).eq("id",run.id);
  await db.from("bov_eu_funding_sources").update({scan_status:"error",last_error:message.slice(0,1000)}).eq("source_key","eu-ft");
  return Response.json({ok:false,error:message},{status:502});
 }
});
