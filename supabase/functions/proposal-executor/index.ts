import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const H={"Content-Type":"application/json"};
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const env=(k:string)=>Deno.env.get(k)||"";

Deno.serve(async(req)=>{
  if(req.method!=="POST") return json({ok:true,service:"agba-proposal-executor"});
  const url=env("SUPABASE_URL"),key=env("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({error:"not_configured"},500);
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:workerSecret,error:secretError}=await db.rpc("agba_telegram_worker_secret");
  if(secretError||!workerSecret||req.headers.get("x-agba-worker-secret")!==String(workerSecret))return json({error:"forbidden"},403);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const proposalId=String(body.proposal_id||"").trim();
  if(!proposalId)return json({error:"proposal_id_required"},400);
  const {data:proposal,error:proposalError}=await db.from("agba_proposals").select("*").eq("id",proposalId).maybeSingle();
  if(proposalError)throw proposalError;
  if(!proposal)return json({error:"proposal_not_found"},404);
  if(proposal.status!=="approved")return json({error:"proposal_not_approved",status:proposal.status},409);
  const plan=proposal.metadata?.execution_plan;
  if(!plan||typeof plan!=="object")return json({error:"execution_plan_required"},409);
  if(String(plan.tool)!=="action_mutation")return json({error:"execution_tool_not_allowed"},403);
  if(String(plan.operation)!=="status"||String(plan.status)!=="in_progress")return json({error:"execution_plan_not_allowed"},403);
  if(!proposal.action_id||String(plan.action_id)!==String(proposal.action_id))return json({error:"execution_action_mismatch"},409);
  const idem=`proposal:${proposal.id}`;
  const {data:existing,error:existingError}=await db.from("agba_action_executions").select("*").eq("organization_id",proposal.organization_id).eq("idempotency_key",idem).maybeSingle();
  if(existingError)throw existingError;
  if(existing)return json({ok:existing.status==="succeeded",replayed:true,execution:existing});
  const {data:execution,error:createError}=await db.from("agba_action_executions").insert({organization_id:proposal.organization_id,action_id:proposal.action_id,tool_name:"action_mutation",status:"pending",idempotency_key:idem,input:{operation:"status",status:"in_progress",proposal_id:proposal.id},metadata:{source:"approved_proposal",proposal_id:proposal.id}}).select("*").single();
  if(createError||!execution)return json({error:"execution_create_failed",detail:createError?.message},400);
  const {data:running,error:runningError}=await db.from("agba_action_executions").update({status:"running",started_at:new Date().toISOString()}).eq("id",execution.id).eq("status","pending").select("*").single();
  if(runningError||!running)return json({error:"execution_start_failed",detail:runningError?.message},400);
  try{
    const {data:mutated,error:mutationError}=await db.rpc("agba_mutate_action",{p_operation:"status",p_action_id:proposal.action_id,p_organization_id:proposal.organization_id,p_created_by:null,p_description:null,p_owner_name:null,p_deadline:null,p_status:"in_progress",p_priority:null,p_metadata:{approved_proposal_id:proposal.id}});
    if(mutationError)throw new Error(`action_mutation_failed:${mutationError.message}`);
    const output={ok:true,tool:"action_mutation",operation:"status",status:"in_progress",action:mutated};
    const {data:done,error:doneError}=await db.from("agba_action_executions").update({status:"succeeded",output,completed_at:new Date().toISOString()}).eq("id",execution.id).eq("status","running").select("*").single();
    if(doneError||!done)throw new Error(`execution_complete_failed:${doneError?.message||"empty result"}`);
    await db.from("agba_proposals").update({metadata:{...(proposal.metadata||{}),execution_result:{execution_id:done.id,status:done.status,completed_at:done.completed_at}}}).eq("id",proposal.id).eq("status","approved");
    return json({ok:true,proposal_id:proposal.id,execution:done,action:mutated});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    const {data:failed}=await db.from("agba_action_executions").update({status:"failed",error:{message},completed_at:new Date().toISOString()}).eq("id",execution.id).eq("status","running").select("*").single();
    return json({ok:false,error:"proposal_execution_failed",detail:message,execution:failed},502);
  }
});
