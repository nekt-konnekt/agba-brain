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

  const tool=String(plan.tool||"");
  if(tool!=="action_mutation"&&tool!=="telegram_send")return json({error:"execution_tool_not_allowed"},403);

  if(tool==="action_mutation"){
    if(String(plan.operation)!=="status"||String(plan.status)!=="in_progress")return json({error:"execution_plan_not_allowed"},403);
    if(!proposal.action_id||String(plan.action_id)!==String(proposal.action_id))return json({error:"execution_action_mismatch"},409);
  }

  if(tool==="telegram_send"){
    const recipient=String(plan.recipient_agba_user_id||"").trim();
    const message=String(plan.message||"").trim();
    if(!recipient||!message)return json({error:"telegram_execution_plan_incomplete"},409);
    const {data:binding,error:bindingError}=await db.from("agba_telegram_bindings").select("chat_id,agba_user_id,organization_id,role_code").eq("organization_id",proposal.organization_id).eq("agba_user_id",recipient).maybeSingle();
    if(bindingError)throw bindingError;
    if(!binding)return json({error:"telegram_recipient_not_bound"},409);
    if(!proposal.action_id)return json({error:"telegram_execution_action_required"},409);
  }

  const idem=`proposal:${proposal.id}`;
  const {data:existing,error:existingError}=await db.from("agba_action_executions").select("*").eq("organization_id",proposal.organization_id).eq("idempotency_key",idem).maybeSingle();
  if(existingError)throw existingError;
  if(existing)return json({ok:existing.status==="succeeded",replayed:true,execution:existing});

  const input=tool==="telegram_send"
    ? {tool,recipient_agba_user_id:String(plan.recipient_agba_user_id),chat_id:Number((await db.from("agba_telegram_bindings").select("chat_id").eq("organization_id",proposal.organization_id).eq("agba_user_id",String(plan.recipient_agba_user_id)).maybeSingle()).data?.chat_id),message:String(plan.message),proposal_id:proposal.id,source:"approved_proposal",test_only:Boolean(plan.test_only),test_scope:plan.test_scope?String(plan.test_scope):undefined}
    : {operation:"status",status:"in_progress",proposal_id:proposal.id,source:"approved_proposal"};

  const {data:execution,error:createError}=await db.from("agba_action_executions").insert({organization_id:proposal.organization_id,action_id:proposal.action_id,tool_name:tool,status:"pending",idempotency_key:idem,input}).select("*").single();
  if(createError||!execution)return json({error:"execution_create_failed",detail:createError?.message},400);
  const {data:running,error:runningError}=await db.from("agba_action_executions").update({status:"running",started_at:new Date().toISOString()}).eq("id",execution.id).eq("status","pending").select("*").single();
  if(runningError||!running)return json({error:"execution_start_failed",detail:runningError?.message},400);

  try{
    if(tool==="action_mutation"){
      const {data:mutated,error:mutationError}=await db.rpc("agba_mutate_action",{p_operation:"status",p_action_id:proposal.action_id,p_organization_id:proposal.organization_id,p_created_by:null,p_description:null,p_owner_name:null,p_deadline:null,p_status:"in_progress",p_priority:null,p_metadata:{approved_proposal_id:proposal.id}});
      if(mutationError)throw new Error(`action_mutation_failed:${mutationError.message}`);
      const output={ok:true,tool,operation:"status",status:"in_progress",action:mutated};
      const {data:done,error:doneError}=await db.from("agba_action_executions").update({status:"succeeded",output,completed_at:new Date().toISOString()}).eq("id",execution.id).eq("status","running").select("*").single();
      if(doneError||!done)throw new Error(`execution_complete_failed:${doneError?.message||"empty result"}`);
      await db.from("agba_proposals").update({metadata:{...(proposal.metadata||{}),execution_result:{execution_id:done.id,status:done.status,completed_at:done.completed_at}}}).eq("id",proposal.id).eq("status","approved");
      return json({ok:true,proposal_id:proposal.id,execution:done,action:mutated});
    }

    const chatId=Number(input.chat_id);
    const text=String(input.message);
    if(!chatId||!text)throw new Error("telegram_execution_payload_invalid");
    const outboxPayload={chat_id:chatId,text,...(input.test_only?{test:true,test_only:true,test_scope:String(input.test_scope||`proposal-${proposal.id}`)}:{type:"proposal_execution",proposal_id:proposal.id,execution_id:execution.id})};
    const {data:existingOutbox,error:outboxLookupError}=await db.from("agba_telegram_delivery_outbox").select("id,status,telegram_message_id").eq("organization_id",proposal.organization_id).contains("payload",{proposal_id:proposal.id,execution_id:execution.id}).limit(1).maybeSingle();
    if(outboxLookupError)throw outboxLookupError;
    let outbox=existingOutbox;
    if(!outbox){
      const {data:createdOutbox,error:outboxError}=await db.from("agba_telegram_delivery_outbox").insert({organization_id:proposal.organization_id,chat_id:String(chatId),payload:outboxPayload,status:"pending",attempts:0,max_attempts:5,next_attempt_at:new Date().toISOString()}).select("id,status,telegram_message_id").single();
      if(outboxError||!createdOutbox)throw new Error(`telegram_outbox_create_failed:${outboxError?.message||"empty result"}`);
      outbox=createdOutbox;
    }
    const output={ok:true,tool,queued:true,delivery_id:outbox.id,chat_id:chatId,test_only:Boolean(input.test_only)};
    const {data:done,error:doneError}=await db.from("agba_action_executions").update({status:"succeeded",output,completed_at:new Date().toISOString()}).eq("id",execution.id).eq("status","running").select("*").single();
    if(doneError||!done)throw new Error(`execution_complete_failed:${doneError?.message||"empty result"}`);
    await db.from("agba_proposals").update({metadata:{...(proposal.metadata||{}),execution_result:{execution_id:done.id,status:done.status,completed_at:done.completed_at,delivery_id:outbox.id}}}).eq("id",proposal.id).eq("status","approved");
    return json({ok:true,proposal_id:proposal.id,execution:done,delivery:outbox});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    const {data:failed}=await db.from("agba_action_executions").update({status:"failed",error:{message},completed_at:new Date().toISOString()}).eq("id",execution.id).eq("status","running").select("*").single();
    return json({ok:false,error:"proposal_execution_failed",detail:message,execution:failed},502);
  }
});
