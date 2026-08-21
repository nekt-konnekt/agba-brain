import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url=Deno.env.get("SUPABASE_URL");
const anon=Deno.env.get("SUPABASE_ANON_KEY");
const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const dashscopeKey=Deno.env.get("DASHSCOPE_API_KEY");
if(!url||!anon||!serviceRole||!dashscopeKey)throw new Error("Set Supabase and DashScope environment variables");

const admin=createClient(url,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
const email=`agba-ceo-query-reliability-${Date.now()}@gmail.com`;
const password=`AgbaCEOQueryReliability-${crypto.randomUUID()}-X9!`;
const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:"Agba CEO Query Reliability E2E"}});
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

  const setup=await expect("company setup",await fetch(`${base}/company-setup`,{method:"POST",headers,body:JSON.stringify({company:{name:`Agba CEO Query Reliability ${Date.now()}`,slug:`agba-ceo-query-reliability-${Date.now()}`,timezone:"Africa/Lagos",currency_code:"NGN"},ceo:{full_name:"Agba CEO Query Reliability E2E"},departments:[{name:"Sales",slug:"sales",head:{full_name:"Sales Head",email:`ceo-query-rel-sales-${Date.now()}@gmail.com`}},{name:"Finance",slug:"finance",head:{full_name:"Finance Head",email:`ceo-query-rel-finance-${Date.now()}@gmail.com`}}]})}),201);
  organizationId=setup.organization.id;
  const departments=Object.fromEntries(setup.departments.map((d:any)=>[d.slug,d.id]));
  console.log("PASS company setup: CEO query reliability company");

  const report=await expect("evidence report",await fetch(`${base}/report-ingestion`,{method:"POST",headers:{...headers,"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({department_id:departments.sales,source:"agba-ceo-query-reliability-e2e",report_text:"Sales closed ₦620,000 from 29 orders. Gross margin is 30%. A ₦120,000 customer invoice remains unpaid. Customer complaints fell to 3."})}),201);
  const reasoning=await expect("evidence reasoning",await fetch(`${base}/agba-reasoning`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"Extract durable business state and the unresolved cash issue.",evidence:[{report_id:report.report.id}]})}),201);
  await expect("evidence state",await fetch(`${base}/company-state-v2`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,reasoning_item_id:reasoning.item.id})}),201);

  const query=await expect("CEO query",await fetch(`${base}/ceo-query`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"What needs my attention right now, and what should I do about the cash issue?"})}),201);
  if(query.answer?.provider!=="alibaba")throw new Error(`Expected Alibaba provider, got ${query.answer?.provider}`);
  if(String(query.answer?.answer??"").trim().length<20)throw new Error("CEO query returned an unusably short answer");
  if(!query.query?.provenance?.state_count)throw new Error("CEO query did not report persistent-state provenance");
  console.log(`PASS CEO query: provider=${query.answer.provider}, state=${query.query.provenance.state_count}, reports=${query.query.provenance.report_count}`);

  const firstActions=await admin.from("agba_actions").select("id,description,status,priority,source_ceo_query_id").eq("organization_id",organizationId).in("status",["open","in_progress"]);
  if(firstActions.error)throw new Error(`Action lookup failed: ${firstActions.error.message}`);
  if(!(firstActions.data??[]).some((a:any)=>a.source_ceo_query_id===query.query.id))throw new Error("CEO query did not persist a linked management action");
  console.log(`PASS action memory: ${(firstActions.data??[]).length} action(s) persisted and linked`);

  const repeat=await expect("repeat CEO query",await fetch(`${base}/ceo-query`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"What should I do about the unpaid customer invoice?"})}),201);
  const secondActions=await admin.from("agba_actions").select("id,description,status,priority,source_ceo_query_id").eq("organization_id",organizationId).in("status",["open","in_progress"]);
  if(secondActions.error)throw new Error(`Repeat action lookup failed: ${secondActions.error.message}`);
  if((secondActions.data??[]).length!==(firstActions.data??[]).length)throw new Error(`CEO action deduplication failed: action count changed from ${(firstActions.data??[]).length} to ${(secondActions.data??[]).length}`);
  if(!(repeat.actions??[]).length||repeat.actions.some((a:any)=>!firstActions.data?.some((existing:any)=>existing.id===a.id)))throw new Error("Repeat CEO query did not reuse the existing management action");
  console.log(`PASS action deduplication: ${(secondActions.data??[]).length} open action(s)`);

  const {data:completedAction,error:completedActionError}=await admin.from("agba_actions").insert({organization_id:organizationId,description:"Contact supplier about the previous material delay affecting two existing orders",owner_name:"Chinedu",status:"open",priority:"high",metadata:{created_from:"e2e-completed-history"}}).select("id").single();
  if(completedActionError||!completedAction)throw new Error(`Historical-action fixture creation failed: ${completedActionError?.message??"no action"}`);
  const {error:completeError}=await admin.from("agba_actions").update({status:"done",metadata:{created_from:"e2e-completed-history",completed_at:new Date().toISOString()}}).eq("id",completedAction.id);
  if(completeError)throw new Error(`Historical-action fixture completion failed: ${completeError.message}`);
  const {data:completedMemory,error:memoryError}=await admin.from("agba_state_items").select("id,metadata").eq("organization_id",organizationId).eq("state_key",`completed_action:${completedAction.id}`).maybeSingle();
  if(memoryError||!completedMemory)throw new Error(`Completed-action memory fixture missing: ${memoryError?.message??"no state item"}`);
  console.log("PASS completed action fixture persisted as historical memory");

  const newReport=await expect("new incident report",await fetch(`${base}/report-ingestion`,{method:"POST",headers:{...headers,"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({department_id:departments.sales,source:"agba-ceo-query-new-incident-reliability-e2e",report_text:"A new customer wants 50 branded shirts delivered in 3 days. Production reports the required fabric is currently out of stock. This is a new order and is not the same as the previously completed supplier-delay incident."})}),201);
  const newReasoning=await expect("new incident reasoning",await fetch(`${base}/agba-reasoning`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"Identify the blocker for the new 50-shirt order and preserve its distinct context.",evidence:[{report_id:newReport.report.id}]})}),201);
  await expect("new incident state",await fetch(`${base}/company-state-v2`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,reasoning_item_id:newReasoning.item.id})}),201);

  const before=await admin.from("agba_actions").select("id,description,status").eq("organization_id",organizationId).in("status",["open","in_progress"]);
  if(before.error)throw new Error(`New-incident baseline lookup failed: ${before.error.message}`);
  const newQuery=await expect("new incident CEO query",await fetch(`${base}/ceo-query`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"What should we do about the new 50 branded shirt order that must be delivered in 3 days but has no fabric available?"})}),201);
  const after=await admin.from("agba_actions").select("id,description,status,source_ceo_query_id").eq("organization_id",organizationId).in("status",["open","in_progress"]);
  if(after.error)throw new Error(`New-incident action lookup failed: ${after.error.message}`);
  const beforeCount=(before.data??[]).length;
  const afterCount=(after.data??[]).length;
  if(afterCount<beforeCount+1)throw new Error(`New incident did not create a distinct management action: expected at least ${beforeCount+1}, got ${afterCount}`);
  if((newQuery.actions??[]).some((a:any)=>a.id===completedAction.id))throw new Error("New incident CEO query reused the completed historical action");
  const newActions=(after.data??[]).filter((a:any)=>!(before.data??[]).some((old:any)=>old.id===a.id));
  if(!newActions.length)throw new Error("New incident did not create a new management action");
  if(!newActions.some((a:any)=>/fabric|shirt|order/i.test(String(a.description))))throw new Error(`New actions do not describe the new incident: ${newActions.map((a:any)=>a.description).join(" | ")}`);
  console.log(`PASS incident isolation: ${newActions.length} new action(s); historical action ${completedAction.id} remained historical`);
  console.log("AGBA CEO QUERY ACTION-MEMORY RELIABILITY E2E PASS");
}finally{await cleanup();}
