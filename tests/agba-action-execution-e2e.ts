const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase test environment");
const headers={apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,"Content-Type":"application/json",Prefer:"return=representation"};
async function rest(path:string,init:RequestInit={}){const response=await fetch(`${supabaseUrl}/rest/v1/${path}`,{...init,headers:{...headers,...(init.headers??{})}});const text=await response.text();if(!response.ok)throw new Error(`${response.status} ${path}: ${text}`);return text?JSON.parse(text):null;}
const marker=`e2e-action-execution-${crypto.randomUUID()}`;
const orgs=await rest("agba_organizations?select=id&limit=1");
if(!Array.isArray(orgs)||!orgs[0]?.id)throw new Error("No organization available");
const organizationId=orgs[0].id;
const actions=await rest(`agba_actions?organization_id=eq.${organizationId}&select=id&status=eq.open&limit=1`);
let actionId:string,createdAction=false;
if(actions?.[0]?.id)actionId=actions[0].id;else{const created=await rest("agba_actions",{method:"POST",body:JSON.stringify({organization_id:organizationId,description:marker,status:"open",priority:"medium"})});actionId=created[0].id;createdAction=true;}
let executionId:string|null=null;
try{
 const created=await rest("agba_action_executions",{method:"POST",body:JSON.stringify({organization_id:organizationId,action_id:actionId,tool_name:"noop",idempotency_key:marker,input:{probe:true}})});executionId=created[0].id;console.log("PASS execution creation");
 await rest(`agba_action_executions?id=eq.${executionId}&status=eq.pending`,{method:"PATCH",body:JSON.stringify({status:"running",started_at:new Date().toISOString()})});console.log("PASS execution running transition");
 await rest(`agba_action_executions?id=eq.${executionId}&status=eq.running`,{method:"PATCH",body:JSON.stringify({status:"succeeded",output:{ok:true},completed_at:new Date().toISOString()})});console.log("PASS execution success transition");
 const duplicate=await fetch(`${supabaseUrl}/rest/v1/agba_action_executions`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,action_id:actionId,tool_name:"noop",idempotency_key:marker})});if(duplicate.ok)throw new Error("Idempotency key unexpectedly allowed duplicate");console.log("PASS execution idempotency guard");
 const invalid=await fetch(`${supabaseUrl}/rest/v1/agba_action_executions`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,action_id:actionId,tool_name:"noop",status:"failed"})});if(invalid.ok)throw new Error("Terminal execution without completed_at unexpectedly succeeded");console.log("PASS terminal-state constraint");
 console.log("AGBA ACTION EXECUTION E2E PASS");
}finally{if(executionId)await rest(`agba_action_executions?id=eq.${executionId}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});if(createdAction)await rest(`agba_actions?id=eq.${actionId}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});}
