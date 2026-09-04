const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!supabaseUrl||!serviceKey)throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"};
async function rest(path:string,options:RequestInit={}){const r=await fetch(`${supabaseUrl}/rest/v1/${path}`,{...options,headers:{...headers,...(options.headers||{})}});const text=await r.text();if(!r.ok)throw new Error(`${options.method||"GET"} ${path}: ${r.status} ${text}`);return text?JSON.parse(text):null;}
async function rpc(name:string,args:Record<string,unknown>){return rest(`rpc/${name}`,{method:"POST",body:JSON.stringify(args)});}
async function fn(name:string,body:Record<string,unknown>,secret:string){const r=await fetch(`${supabaseUrl}/functions/v1/${name}`,{method:"POST",headers:{"Content-Type":"application/json","x-agba-worker-secret":secret},body:JSON.stringify(body)});const text=await r.text();let data:any={};try{data=JSON.parse(text)}catch{data={raw:text}}if(!r.ok)throw new Error(`${name}: ${r.status} ${text}`);return data;}
const org=(await rest("agba_organizations?select=id&limit=1"))[0]?.id;if(!org)throw new Error("no organization available");
const binding=(await rest(`agba_telegram_bindings?organization_id=eq.${org}&select=chat_id,agba_user_id&limit=1`))[0];if(!binding?.agba_user_id)throw new Error("no Telegram binding available");
const secret=await rpc("agba_telegram_worker_secret",{});if(!secret)throw new Error("worker secret unavailable");
const scope=`telegram-connector-e2e-${crypto.randomUUID()}`;
const action=await rpc("agba_mutate_action",{p_operation:"create",p_action_id:null,p_organization_id:org,p_created_by:null,p_description:`TELEGRAM-CONNECTOR-E2E-${crypto.randomUUID()}`,p_owner_name:"Chinedu",p_deadline:null,p_status:"open",p_priority:"high",p_metadata:{test_only:true}});const actionRow=Array.isArray(action)?action[0]:action;if(!actionRow?.id)throw new Error("action creation failed");
let proposalId:string|null=null;let approvalId:string|null=null;let executionId:string|null=null;try{
 const proposal=(await rest("agba_proposals",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({organization_id:org,action_id:actionRow.id,kind:"task",title:"Send governed Telegram test",summary:"Synthetic proposal for governed external connector verification.",recommendation:"Send the approved test message through the Telegram delivery connector.",priority:1,status:"proposed",fingerprint:`${scope}-proposal`,metadata:{test_only:true,execution_plan:{tool:"telegram_send",recipient_agba_user_id:binding.agba_user_id,message:"Agba connector E2E test — no action required.",test_only:true,test_scope:scope}}})}))[0];proposalId=proposal.id;
 approvalId=await rpc("agba_create_proposal_approval",{p_proposal_id:proposalId,p_requested_by:null});
 await rpc("agba_decide_proposal",{p_proposal_id:proposalId,p_approval_id:approvalId,p_decision:"approved",p_decided_by:null});
 const first=await fn("proposal-executor",{proposal_id:proposalId},String(secret));if(first.ok!==true||first.execution?.status!=="succeeded")throw new Error(`Telegram connector execution did not succeed: ${JSON.stringify(first)}`);
 executionId=first.execution.id;
 const outbox=(await rest(`agba_telegram_delivery_outbox?organization_id=eq.${org}&select=id,status,chat_id,payload&order=created_at.desc&limit=20`)).find((x:any)=>x.payload?.execution_id===executionId||x.payload?.test_scope===scope);if(!outbox)throw new Error("Telegram connector did not enqueue a delivery");
 if(outbox.status!=="pending")throw new Error(`expected test delivery to remain pending, got ${outbox.status}`);
 if(outbox.chat_id!==String(binding.chat_id))throw new Error("Telegram connector targeted the wrong chat");
 if(outbox.payload?.test_only!==true||outbox.payload?.test_scope!==scope)throw new Error("Telegram connector did not preserve test isolation");
 const replay=await fn("proposal-executor",{proposal_id:proposalId},String(secret));if(replay.replayed!==true||replay.execution?.id!==executionId)throw new Error("Telegram connector execution was not idempotent");
 console.log("TELEGRAM CONNECTOR EXECUTION E2E: PASS");
 console.log("- approved proposal reaches governed Telegram connector: PASS");
 console.log("- recipient is resolved through an organization Telegram binding: PASS");
 console.log("- delivery is queued through the durable Telegram outbox: PASS");
 console.log("- test-only delivery remains isolated from the real Telegram sender: PASS");
 console.log("- connector execution idempotency/replay: PASS");
}finally{
 if(proposalId)await rest(`agba_proposals?id=eq.${proposalId}`,{method:"DELETE"}).catch(()=>{});
 if(approvalId)await rest(`agba_approvals?id=eq.${approvalId}`,{method:"DELETE"}).catch(()=>{});
 if(executionId)await rest(`agba_action_executions?id=eq.${executionId}`,{method:"DELETE"}).catch(()=>{});
 await rest(`agba_telegram_delivery_outbox?organization_id=eq.${org}&payload->>test_scope=eq.${encodeURIComponent(scope)}`,{method:"DELETE"}).catch(()=>{});
 await rpc("agba_mutate_action",{p_operation:"status",p_action_id:actionRow.id,p_organization_id:org,p_created_by:null,p_description:null,p_owner_name:null,p_deadline:null,p_status:"cancelled",p_priority:null,p_metadata:{test_cleanup:true}}).catch(()=>{});
 await rest(`agba_actions?id=eq.${actionRow.id}`,{method:"DELETE"}).catch(()=>{});
}
