import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { updateActionStatus } from "../_shared/action-service.ts";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});

type Tool=(input:Record<string,unknown>)=>Promise<Record<string,unknown>>;
const tools:Record<string,Tool>={"noop":async(input)=>({ok:true,tool:"noop",message:String(input.message??"No-op execution completed.")})};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({error:"server_configuration_error"},500);
  const auth=req.headers.get("Authorization");if(!auth)return json({error:"missing_authorization"},401);
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const token=auth.replace(/^Bearer\s+/i,"");
  const {data:{user},error:userError}=await admin.auth.getUser(token);if(userError||!user)return json({error:"invalid_authorization"},401);
  let body:any;try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const organizationId=String(body.organization_id??"").trim(),actionId=String(body.action_id??"").trim(),toolName=String(body.tool??"").trim(),input=body.input&&typeof body.input==="object"?body.input:{};
  if(!organizationId||!actionId||!toolName)return json({error:"organization_id, action_id and tool are required"},400);
  if(!tools[toolName])return json({error:"tool_not_allowed",tool:toolName},403);
  const {data:actor,error:actorError}=await admin.from("agba_users").select("id,organization_id,active,agba_roles(code)").eq("auth_user_id",user.id).eq("organization_id",organizationId).eq("active",true).maybeSingle();
  if(actorError||!actor)return json({error:"actor_not_registered_for_organization"},403);
  const role=Array.isArray(actor.agba_roles)?actor.agba_roles[0]?.code:actor.agba_roles?.code;if(role!=="ceo")return json({error:"ceo_role_required"},403);
  const {data:action,error:actionError}=await admin.from("agba_actions").select("id,organization_id,status,description,owner_name,deadline,metadata").eq("id",actionId).eq("organization_id",organizationId).maybeSingle();
  if(actionError||!action)return json({error:"action_not_found"},404);
  if(["done","cancelled"].includes(action.status))return json({error:"action_not_executable",status:action.status},409);
  const idem=String(body.idempotency_key??crypto.randomUUID());
  const {data:existing}=await admin.from("agba_action_executions").select("*").eq("organization_id",organizationId).eq("idempotency_key",idem).maybeSingle();
  if(existing)return json({execution:existing,replayed:true});
  const {data:execution,error:createError}=await admin.from("agba_action_executions").insert({organization_id:organizationId,action_id:actionId,tool_name:toolName,status:"pending",idempotency_key:idem,input,metadata:{requested_by:actor.id}}).select("*").single();
  if(createError||!execution)return json({error:"execution_create_failed",detail:createError?.message},400);
  const {data:running,error:runningError}=await admin.from("agba_action_executions").update({status:"running",started_at:new Date().toISOString()}).eq("id",execution.id).eq("status","pending").select("*").single();
  if(runningError||!running)return json({error:"execution_start_failed",detail:runningError?.message},400);
  try{
    await updateActionStatus(admin,{organizationId,actionId,actorId:actor.id,status:"in_progress"});
    const result=await tools[toolName](input);
    const {data:done,error:doneError}=await admin.from("agba_action_executions").update({status:"succeeded",output:result,completed_at:new Date().toISOString()}).eq("id",execution.id).eq("status","running").select("*").single();
    if(doneError||!done)return json({error:"execution_complete_failed",detail:doneError?.message},400);
    return json({execution:done,action:{...action,status:"in_progress"}});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    const {data:failed}=await admin.from("agba_action_executions").update({status:"failed",error:message,completed_at:new Date().toISOString()}).eq("id",execution.id).eq("status","running").select("*").single();
    return json({error:"tool_execution_failed",detail:message,execution:failed},502);
  }
});
