// Evidence-first automatic eligibility assessment. No LLM or keyword guess can grant eligibility.
// Deploy as Supabase Edge Function with verify_jwt=false and private x-eu-scan-secret.
// For opportunity screening: POST {} or {"call_id":"uuid"}. All reads/writes stay server-side.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
type Rule={key:string;result:"pass"|"fail"|"unknown";reason:string;source:string};
function assess(call:Record<string,unknown>){
 const text=[call.title,call.summary,call.eligibility_notes,call.partner_requirements].filter(Boolean).join(" ");
 const source=String(call.official_url||"");
 const rules:Rule[]=[];
 const add=(key:string,result:Rule["result"],reason:string)=>rules.push({key,result,reason,source});
 const applicantEvidence=String(call.eligibility_notes||"");
 // We deliberately do NOT treat broad promotional summaries as authoritative eligibility rules.
 if(/(?:only|exclusively)\s+(?:public authorities|government bodies|public administrations|municipalities)\b/i.test(applicantEvidence))
   add("private_applicant","fail","Official eligibility notes explicitly restrict applicants to public authorities");
 else if(/(?:eligible applicants?|beneficiaries?)\s*[:\-]\s*[^.\n]{0,150}\b(?:SMEs?|micro.?enterprises?|private (?:companies|enterprises)|entrepreneurs?|farmers?|start.?ups?|cooperatives?)\b/i.test(applicantEvidence))
   add("private_applicant","pass","Eligibility notes explicitly list private applicants");
 else add("private_applicant","unknown","No explicit verified private-applicant rule available");
 if(!source.startsWith("https://"))add("official_source","unknown","Official HTTPS source missing");
 else add("official_source","pass","HTTPS source URL recorded; authenticity and document content not independently validated");
 const deadline=String(call.deadline||"");
 if(deadline&&/^\d{4}-\d{2}-\d{2}$/.test(deadline)){
  const today=new Date().toISOString().slice(0,10);
  add("deadline",deadline<today?"fail":"pass",deadline<today?"Recorded deadline has passed":"Recorded deadline has not passed; official current status still requires confirmation");
 }else add("deadline","unknown","Deadline unavailable or unparseable");
 const geography=String(call.country_region||"");
 add("geography",geography?"unknown":"unknown",geography?"Recorded geography: "+geography+"; project-specific eligibility not assessed":"Eligible territories not documented");
 const result=rules.some(r=>r.result==="fail")?"ineligible":rules.every(r=>r.result==="pass")?"preliminarily_eligible":"unconfirmed";
 return {result,rule_snapshot:{applicant_type:"private_enterprise",geography,deadline},evidence:rules.filter(r=>r.result!=="unknown").map(r=>({rule:r.key,source:r.source,reason:r.reason})),reasons:rules.map(r=>({rule:r.key,status:r.result,reason:r.reason})),missing_information:rules.filter(r=>r.result==="unknown").map(r=>r.reason)};
}
Deno.serve(async req=>{
 if(req.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
 const secret=Deno.env.get("EU_SCAN_SECRET"),url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!secret||!url||!key)return Response.json({error:"Server not configured"},{status:503});
 if(req.headers.get("x-eu-scan-secret")!==secret)return Response.json({error:"Unauthorized"},{status:401});
 let body:Record<string,unknown>={};try{body=await req.json()}catch{}
 const db=createClient(url,key,{auth:{persistSession:false}});
 let q=db.from("bov_eu_funding_calls").select("id,title,summary,eligibility_notes,partner_requirements,official_url,deadline,country_region").limit(500);
 if(typeof body.call_id==="string")q=q.eq("id",body.call_id);
 const {data,error}=await q;if(error)return Response.json({error:error.message},{status:500});
 const results=[];
 for(const call of data||[]){
  const assessment=assess(call);
  const {error:writeError}=await db.from("bov_eu_eligibility_assessments").insert({call_id:call.id,assessment_type:"opportunity",...assessment});
  if(writeError)return Response.json({error:writeError.message,processed:results.length},{status:500});
  results.push({call_id:call.id,result:assessment.result});
 }
 return Response.json({ok:true,processed:results.length,counts:{preliminarily_eligible:results.filter(r=>r.result==="preliminarily_eligible").length,ineligible:results.filter(r=>r.result==="ineligible").length,unconfirmed:results.filter(r=>r.result==="unconfirmed").length},note:"Evidence-limited preliminary screening; not an official eligibility determination"});
});
