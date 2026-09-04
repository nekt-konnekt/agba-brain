const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!supabaseUrl||!serviceKey)throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey},Content-Type":"application/json"};
async function rest(path:string,options:RequestInit={}){const r=await fetch(`${supabaseUrl}/rest/v1/${path}`,{...options,headers:{...headers,...(options.headers||{})}});const text=await r.text();if(!r.ok)throw new Error(`${options.method||"GET"} ${path}: ${r.status} ${text}`);return text?JSON.parse(text):null;}
async function rpc(name:string,args:Record<string,unknown>){return rest(`rpc/${name}`,{method:"POST",body:JSON.stringify(args)});}
async function fn(name:string,body:Record<string,unknown>,secret:string){const r=await fetch(`${supabaseUrl}/functions/v1/${name}`,{method:"POST",headers:{"Content-Type":"application/json","x-agba-worker-secret":secret},body:JSON.stringify(body)});const text=await r.text();let data:any={};try{data=JSON.parse(text)}catch{data={raw:text}}if(!r.ok)throw new Error(`${name}: ${r.status} ${text}`);return data;}
const org=(await rest("agba_organizations?select=id&limit=1"))[0]?.id;if(!org)throw new Error("no organization available");
const secret=await rpc("agba_telegram_worker_secret",{});if(!secret)throw new Error("worker secret unavailable");
const action=await rpc("agba_mutate_action",{p_operation:"create",p_action_id:null,p_organization_id:org,p_created_by:null,p_description:`PROPOSAL-EXECUTION-E2E-${crypto.randomUUID()}`,p_owner_name:"Chinedu",p_deadline:null,p_status:"open",p_priority:"high",p_metadata:{test_only:true}});const actionRow=Array.isArray(action)?action[0]:action;if(!actionRow?.id)throw new Error("action creation failed");
let proposalId:string|null=null;let approvalId:string|null=null;try{
 const proposal=(await rest("agba_proposals",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({organization_id:org,action_id:actionRow.id,kind:"task",title:"Resume overdue E2E action",summary:"Synthetic proposal for governed execution verification.",recommendation:"Resume the overdue action by moving it to in-progress.",priority:1,status:"proposed",fingerprint:`proposal-execution-e2e-${crypto.randomUUID()}`,metadata:{test_only:true,execution_plan:{tool:"action_mutation",operation:"status",action_id:actionRow.id,status:"in_progress"}}})}))[0];proposalId=proposal.id;
 approvalId=await rpc("agba_create_proposal_approval",{p_proposal_id:proposalId,p_requested_by:null});
 await rpc("agba_decide_proposal",{p_proposal_id:proposalId,p_approval_id:approvalId,p_decision:"approved",p_decided_by:null});
 const first=await fn("proposal-executor",{proposal_id:proposalId},String(secret));if(first.ok!==true||first.execution?.status!=="succeeded")throw new Error(`proposal execution did not succeed: ${JSON.stringify(first)}`);
 const current=(await rest(`agba_actions?id=eq.${actionRow.id}&select=id,status`))[0];if(current?.status!=="in_progress")throw new Error(`expected action in_progress, got ${current?.status}`);
 const replay=await fn("proposal-executor",{proposal_id:proposalId},String(secret));if(replay.replayed!==true||replay.execution?.id!==first.execution?.id)throw new Error("proposal execution was not idempotent");
 const execution=(await rest(`agba_action_executions?id=eq.${first.execution.id}&select=id,status,tool_name,idempotency_key`))[0];if(execution?.status!=="succeeded"||execution?.tool_name!=="action_mutation")throw new Error("execution ledger verification failed");
 console.log("PROPOSAL EXECUTION E2E: PASS");
 console.log("- approved proposal executes through proposal-executor: PASS");
 console.log("- single action mutation authority moves action to in_progress: PASS");
 console.log("- execution evidence ledger records success: PASS");
 console.log("- proposal execution idempotency/replay: PASS");
}finally{
 if(proposalId)await rest(`agba_proposals?id=eq.${proposalId}`,{method:"DELETE"});
 if(approvalId)await rest(`agba_approvals?id=eq.${approvalId}`,{method:"DELETE"});
 await rpc("agba_mutate_action",{p_operation:"status",p_action_id:actionRow.id,p_organization_id:org,p_created_by:null,p_description:null,p_owner_name:null,p_deadline:null,p_status:"cancelled",p_priority:null,p_metadata:{test_cleanup:true}}).catch(()=>{});
 await rest(`agba_actions?id=eq.${actionRow.id}`,{method:"DELETE"}).catch(()=>{});
}
