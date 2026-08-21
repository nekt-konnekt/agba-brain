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

  const {data:persistentState,error:stateError}=await admin.from("agba_state_items").select("title,summary,recommended_action").eq("organization_id",organizationId).in("status",["active","monitoring"]);
  if(stateError)throw new Error(`Persistent-state verification failed: ${stateError.message}`);
  const stateText=JSON.stringify(persistentState??[]).toLowerCase();
  for(const signal of ["620","120"]){if(!stateText.includes(signal))throw new Error(`Persistent state missing signal: ${signal}`);}
  if(!stateText.includes("cash")&&!stateText.includes("unpaid")&&!stateText.includes("payment"))throw new Error("Persistent state missing cash/payment signal");
  console.log("PASS persistent state preserves CEO query evidence: 620, 120, cash/payment");

  const query=await expect("CEO query",await fetch(`${base}/ceo-query`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"What needs my attention right now, and what should I do about the cash issue?"})}),201);
  if(query.answer?.provider!=="alibaba")throw new Error(`Expected Alibaba provider, got ${query.answer?.provider}`);
  const answerText=String(query.answer?.answer??"").trim();
  if(answerText.length<20)throw new Error("CEO query returned an empty or unusably short answer");
  if(!query.query?.provenance?.state_count)throw new Error("CEO query did not report persistent-state provenance");
  console.log(`PASS CEO query: provider=${query.answer.provider}, state=${query.query.provenance.state_count}, reports=${query.query.provenance.report_count}`);

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

  const {data:completedAction,error:completedActionError}=await admin.from("agba_actions").insert({organization_id:organizationId,description:"Contact supplier about the previous material delay affecting two existing orders",owner_name:"Chinedu",status:"open",priority:"high",metadata:{created_from:"e2e-completed-history"}}).select("id").single();
  if(completedActionError||!completedAction)throw new Error(`Completed-action fixture creation failed: ${completedActionError?.message??"no action"}`);
  const completedAt=new Date().toISOString();
  const {error:completeError}=await admin.from("agba_actions").update({status:"done",metadata:{created_from:"e2e-completed-history",completed_at:completedAt}}).eq("id",completedAction.id);
  if(completeError)throw new Error(`Completed-action fixture completion failed: ${completeError.message}`);
  const {data:completedMemory,error:memoryError}=await admin.from("agba_state_items").select("id,metadata").eq("organization_id",organizationId).eq("state_key",`completed_action:${completedAction.id}`).maybeSingle();
  if(memoryError||!completedMemory)throw new Error(`Completed-action memory fixture missing: ${memoryError?.message??"no state item"}`);
  console.log("PASS completed action fixture persisted as historical memory");

  const newReport=await expect("new incident report",await fetch(`${base}/report-ingestion`,{method:"POST",headers:{...headers,"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({department_id:departments.sales,source:"agba-ceo-query-new-incident-e2e",report_text:"A new customer wants 50 branded shirts delivered in 3 days. Production reports the required fabric is currently out of stock. This is a new order and is not the same as the previously completed supplier-delay incident."})}),201);
  const newReasoning=await expect("new incident reasoning",await fetch(`${base}/agba-reasoning`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"Identify the current operational blocker for the new 50-shirt order and preserve its distinct context.",evidence:[{report_id:newReport.report.id}]})}),201);
  await expect("new incident state",await fetch(`${base}/company-state-v2`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,reasoning_item_id:newReasoning.item.id})}),201);
  console.log("PASS new incident -> reasoning -> persistent state");

  const beforeNewIncident=await admin.from("agba_actions").select("id,description,status").eq("organization_id",organizationId).in("status",["open","in_progress"]);
  if(beforeNewIncident.error)throw new Error(`New-incident baseline action lookup failed: ${beforeNewIncident.error.message}`);
  const newIncidentQuery=await expect("new incident CEO query",await fetch(`${base}/ceo-query`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,question:"What should we do about the new 50 branded shirt order that must be delivered in 3 days but has no fabric available?"})}),201);
  const afterNewIncident=await admin.from("agba_actions").select("id,description,status,source_ceo_query_id").eq("organization_id",organizationId).in("status",["open","in_progress"]);
  if(afterNewIncident.error)throw new Error(`New-incident action lookup failed: ${afterNewIncident.error.message}`);
  const beforeCount=(beforeNewIncident.data??[]).length;
  const afterCount=(afterNewIncident.data??[]).length;
  if(afterCount<=beforeCount)throw new Error(`New incident did not create any new open action: before=${beforeCount}, after=${afterCount}`);
  if((newIncidentQuery.actions??[]).some((a:any)=>a.id===completedAction.id))throw new Error("New incident CEO query reused the completed historical action");
  const newActions=(afterNewIncident.data??[]).filter((a:any)=>!(beforeNewIncident.data??[]).some((old:any)=>old.id===a.id));
  if(!newActions.length)throw new Error("New incident did not create a new management action");
  const newIncidentActionsFromQuery=(newIncidentQuery.actions??[]).filter((a:any)=>newActions.some((created:any)=>created.id===a.id));
  if(!newIncidentActionsFromQuery.length)throw new Error("New incident response did not return the newly created management action(s)");
  const newActionText=newActions.map((a:any)=>String(a.description).toLowerCase()).join(" ");
  if(!newActionText.includes("fabric")&&!newActionText.includes("shirt")&&!newActionText.includes("order"))throw new Error(`New action does not describe the new incident: ${newActionText}`);
  console.log(`PASS incident isolation: ${newActions.length} new action(s) created; completed action ${completedAction.id} remained historical`);
  console.log("AGBA CEO QUERY + ACTION MEMORY E2E PASS");
}finally{await cleanup();}
