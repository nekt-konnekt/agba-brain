const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase test environment");
const headers={apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,"Content-Type":"application/json",Prefer:"return=representation"};
async function rest(path:string,init:RequestInit={}){const response=await fetch(`${supabaseUrl}/rest/v1/${path}`,{...init,headers:{...headers,...(init.headers??{})}});const text=await response.text();if(!response.ok)throw new Error(`${init.method||"GET"} ${path}: ${response.status} ${text}`);return text?JSON.parse(text):null;}

const marker=`e2e-action-execution-${crypto.randomUUID()}`;
const orgSlug=marker.toLowerCase();
let organizationId:string|null=null;
let actionId:string|null=null;
let executionId:string|null=null;

const cleanup=async()=>{
  if(executionId)await rest(`agba_action_executions?id=eq.${executionId}`,{method:"DELETE",headers:{Prefer:"return=minimal"}}).catch(()=>{});
  if(actionId)await rest(`agba_actions?id=eq.${actionId}`,{method:"DELETE",headers:{Prefer:"return=minimal"}}).catch(()=>{});
  if(organizationId)await rest(`agba_organizations?id=eq.${organizationId}`,{method:"DELETE",headers:{Prefer:"return=minimal"}}).catch(()=>{});
};

try{
 const createdOrg=await rest("agba_organizations",{method:"POST",body:JSON.stringify({name:`Agba E2E ${marker}`,slug:orgSlug})});
 if(!Array.isArray(createdOrg)||!createdOrg[0]?.id)throw new Error("Failed to create isolated E2E organization");
 organizationId=createdOrg[0].id;

 const createdAction=await rest("agba_actions",{method:"POST",body:JSON.stringify({organization_id:organizationId,description:marker,status:"open",priority:"medium"})});
 if(!Array.isArray(createdAction)||!createdAction[0]?.id)throw new Error("Failed to create isolated E2E action");
 actionId=createdAction[0].id;

 const createdExecution=await rest("agba_action_executions",{method:"POST",body:JSON.stringify({organization_id:organizationId,action_id:actionId,tool_name:"noop",idempotency_key:marker,input:{probe:true}})});
 if(!Array.isArray(createdExecution)||!createdExecution[0]?.id)throw new Error("Failed to create E2E action execution");
 executionId=createdExecution[0].id;
 console.log("PASS execution creation");

 await rest(`agba_action_executions?id=eq.${executionId}&status=eq.pending`,{method:"PATCH",body:JSON.stringify({status:"running",started_at:new Date().toISOString()})});console.log("PASS execution running transition");
 await rest(`agba_action_executions?id=eq.${executionId}&status=eq.running`,{method:"PATCH",body:JSON.stringify({status:"succeeded",output:{ok:true},completed_at:new Date().toISOString()})});console.log("PASS execution success transition");

 const duplicate=await fetch(`${supabaseUrl}/rest/v1/agba_action_executions`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,action_id:actionId,tool_name:"noop",idempotency_key:marker})});if(duplicate.ok)throw new Error("Idempotency key unexpectedly allowed duplicate");console.log("PASS execution idempotency guard");
 const invalid=await fetch(`${supabaseUrl}/rest/v1/agba_action_executions`,{method:"POST",headers,body:JSON.stringify({organization_id:organizationId,action_id:actionId,tool_name:"noop",status:"failed"})});if(invalid.ok)throw new Error("Terminal execution without completed_at unexpectedly succeeded");console.log("PASS terminal-state constraint");
 console.log("AGBA ACTION EXECUTION E2E PASS");
}finally{await cleanup();}
