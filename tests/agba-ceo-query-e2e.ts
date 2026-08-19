import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url=Deno.env.get("SUPABASE_URL");
const anon=Deno.env.get("SUPABASE_ANON_KEY");
const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const dashscopeKey=Deno.env.get("DASHSCOPE_API_KEY");
if(!url||!anon||!serviceRole||!dashscopeKey)throw new Error("Set Supabase and DashScope environment variables");

const admin=createClient(url,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
const email=`agba-ceo-query-e2e-${Date.now()}@gmail.com`;
const password=`AgbaCEOQueryE2E-${crypto.randomUUID()}-X9!`;
const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:"Agba CEO Query E2E"}});
if(createError||!created.user)throw new Error(`CEO creation failed: ${createError?.message??"no user"}`);
let organizationId:string|null=null;
const cleanup=async()=>{if(organizationId)await admin.from("agba_organizations").delete().eq("id",organizationId);await admin.auth.admin.deleteUser(created.user.id);};
const read=async(r:Response)=>{const text=await r.text();try{return JSON.parse(text);}catch{return {raw:text};}};
const expect=async(label:string,r:Response,status:number)=>{const body=await read(r);if(r.status!==status)throw new Error(`${label}: expected ${status}, got ${r.status}: ${JSON.stringify(body)}`);return body;};

try{
  const supabase=createClient(url,anon);
  const {data:auth,error:signInError}=await supabase.auth.signInWithPassword({email,password});
  if(signInError||!auth.session)throw new Error(`Auth failed: ${signInError?.message??"no session"}`);
  const headers={Authorization:`Bearer ${auth.session.access_token}`,apikey:anon,"Content-Type":"application/json"};
  const base=`${url}/functions/v1`;

  const setup=await expect("company setup",await fetch(`${base}/company-setup`,{method:"POST",headers,body:JSON.stringify({company:{name:`Agba CEO Query E2E ${Date.now()}`,slug:`agba-ceo-query-e2e-${Date.now()}`,timezone:"Africa/Lagos",currency_code:"NGN"},ceo:{full_name:"Agba CEO Query E2E"},departments:[{name:"Sales",slug:"sales",head:{full_name:"Sales Head",email:`ceo-query-sales-${Date.now()}@gmail.com`}},{name:"Finance",slug:"finance",head:{full_name:"Finance Head",email:`ceo-query-finance-${Date.now()}@gmail.com`}}]})}),201);
  organizationId=setup.organization.id;
  const departments=Object.fromEntries(setup.departments.map((d:any)=>[d.slug,d.id]));
  console.log("PASS company setup: CEO query company");

  const report=await expect("CEO evidence report",await fetch(`${base}/report-ingestion`,{method:"POST",headers:{...headers,"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({department_id:departments.sales,source:"agba-ceo-query-e2e",report_text:"Sales closed ₦620,000 from 29 orders. Gross margin is 30%. Twelve deliveries used the second courier partner with no reported delay. A ₦120,000 customer invoice remains unpaid. Customer complaints fell to 3."})}),201);
  const reasoning=await expect("CEO evidence reasoning",await fetch(`${base}/agba-reasoning`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"Extract the durable business state from this report. Preserve the key numbers and unresolved cash issue.",evidence:[{report_id:report.report.id}]})}),201);
  await expect("CEO evidence state",await fetch(`${base}/company-state-v2`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,reasoning_item_id:reasoning.item.id})}),201);
  console.log("PASS evidence -> reasoning -> persistent state");

  const query=await expect("CEO query",await fetch(`${base}/ceo-query`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"What needs my attention right now, and what should I do about the cash issue?"})}),201);
  if(query.answer?.provider!=="alibaba")throw new Error(`Expected Alibaba provider, got ${query.answer?.provider}`);
  const text=JSON.stringify(query).toLowerCase();
  for(const signal of ["620","120","cash"]){if(!text.includes(signal))throw new Error(`CEO answer missing signal: ${signal}`);}
  if(!text.includes("unpaid")&&!text.includes("outstanding"))throw new Error("CEO answer missing unpaid/outstanding payment signal");
  if(!query.query?.provenance?.state_count)throw new Error("CEO query did not report persistent-state provenance");
  console.log(`PASS CEO query: provider=${query.answer.provider}, state=${query.provenance.state_items}, reports=${query.provenance.recent_reports}`);

  const firstActions=await admin.from("agba_actions").select("id,description,status,priority,source_ceo_query_id").eq("organization_id",organizationId).in("status",["open","in_progress"]);
  if(firstActions.error)throw new Error(`Action lookup failed: ${firstActions.error.message}`);
  if((firstActions.data??[]).length<1)throw new Error("CEO query did not persist a management action");
  if(!firstActions.data?.some((a:any)=>a.source_ceo_query_id===query.query.id))throw new Error("Persisted action is not linked to CEO query");
  console.log(`PASS action memory: ${(firstActions.data??[]).length} action(s) persisted and linked`);

  const repeat=await expect("CEO repeat query",await fetch(`${base}/ceo-query`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"What should I do about the unpaid customer invoice?"})}),201);
  const secondActions=await admin.from("agba_actions").select("id,description,status,priority,source_ceo_query_id").eq("organization_id",organizationId).in("status",["open","in_progress"]);
  if(secondActions.error)throw new Error(`Repeat action lookup failed: ${secondActions.error.message}`);
  if((secondActions.data??[]).length!==(firstActions.data??[]).length)throw new Error(`CEO action deduplication failed: action count changed from ${(firstActions.data??[]).length} to ${(secondActions.data??[]).length}`);
  if(!(repeat.actions??[]).length)throw new Error("Repeat CEO query did not resolve to an existing management action");
  if(repeat.actions.some((a:any)=>!firstActions.data?.some((existing:any)=>existing.id===a.id)))throw new Error("Repeat CEO query returned a new action instead of reusing the existing action");
  console.log(`PASS action deduplication: ${(secondActions.data??[]).length} open action(s) after repeated management query`);
  console.log("AGBA CEO QUERY + ACTION MEMORY E2E PASS");
}finally{await cleanup();}
