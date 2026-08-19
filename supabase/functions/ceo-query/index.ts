import "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAgbaJson, AIGatewayError, aiConfigured } from "../_shared/ai.ts";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});

function coerce(value:any){
  const source=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  let confidence=String(source.confidence??"medium").trim().toLowerCase();
  confidence=confidence==="moderate"?"medium":confidence==="certain"?"high":confidence==="uncertain"?"low":confidence;
  if(!["high","medium","low"].includes(confidence))confidence="medium";
  const signals=Array.isArray(source.signals)?source.signals.map((s:any)=>({signal:String(s.signal??s.title??s.name??s.summary??s.text??"Business signal").trim().slice(0,300),evidence:String(s.evidence??s.detail??s.reason??s.summary??s.text??"").trim().slice(0,1000)})).filter((s:any)=>s.signal):[];
  const actions=Array.isArray(source.actions)?source.actions.map((a:any)=>{
    let priority=String(a.priority??a.severity??"medium").toLowerCase();
    if(priority==="urgent"||priority==="severe")priority="high";
    if(!["low","medium","high","critical"].includes(priority))priority="medium";
    return {description:String(a.description??a.action??a.title??a.task??"").trim().slice(0,1000),owner_name:a.owner_name??a.owner??null,deadline:a.deadline??null,priority};
  }).filter((a:any)=>a.description):[];
  return {answer:String(source.answer??source.response??source.summary??source.message??source.text??"Agba could not produce an answer from the available evidence.").trim(),confidence,confidence_reason:String(source.confidence_reason??source.reason??source.rationale??"Confidence is based on the available company state and report evidence.").trim(),signals,actions};
}

const STOP_WORDS=new Set(["a","an","and","at","by","for","from","get","in","into","is","it","of","on","or","our","the","this","to","up","with","we","you","your","now","today","immediately","current","currently","please","should","what","do","about","my","me","need","needs","right","can","could"]);
const ACTION_SYNONYMS:[RegExp,string][]=[[/\b(delaying|delayed|delay)\b/g,"delay"],[/\b(materials?|items?|supplies?)\b/g,"material"],[/\b(schedule|timeline|delivery date)\b/g,"delivery"],[/\b(contact|call|reach out to|speak to)\b/g,"contact"],[/\b(expedite|expedited|expediting|rush)\b/g,"expedite"],[/\b(shipment|ship|shipping)\b/g,"shipment"],[/\b(unpaid|outstanding|receivable|receivables|invoice|invoices|payment|payments|collect|collection)\b/g,"cash"]];
function normalizeAction(description:string){
  let text=description.toLowerCase();
  for(const [pattern,replacement] of ACTION_SYNONYMS)text=text.replace(pattern,replacement);
  return [...new Set(text.replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter((word)=>word&&word.length>2&&!STOP_WORDS.has(word)))].sort();
}
function actionSimilarity(a:string,b:string){
  const aa=new Set(normalizeAction(a)),bb=new Set(normalizeAction(b));
  if(!aa.size||!bb.size)return 0;
  let intersection=0;for(const token of aa)if(bb.has(token))intersection++;
  return intersection/(aa.size+bb.size-intersection);
}
function isDuplicateAction(a:string,b:string){
  const similarity=actionSimilarity(a,b);
  const aa=normalizeAction(a).join(" "),bb=normalizeAction(b).join(" ");
  return similarity>=0.72||aa.includes(bb)||bb.includes(aa);
}
function priorityRank(value:string){return ({low:1,medium:2,high:3,critical:4} as Record<string,number>)[value]??2;}
function questionMatchesAction(question:string,description:string){
  const q=new Set(normalizeAction(question)),a=new Set(normalizeAction(description));
  if(!q.size||!a.size)return false;
  let overlap=0;for(const token of q)if(a.has(token))overlap++;
  return overlap>=1 && overlap/Math.min(q.size,a.size)>=0.34;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!supabaseUrl||!serviceRoleKey||!aiConfigured())return json({error:"server_configuration_error"},500);
  const authHeader=req.headers.get("Authorization");if(!authHeader)return json({error:"missing_authorization"},401);
  const admin=createClient(supabaseUrl,serviceRoleKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const token=authHeader.replace(/^Bearer\s+/i,"");
  const {data:{user},error:userError}=await admin.auth.getUser(token);if(userError||!user)return json({error:"invalid_authorization"},401);
  let body:any;try{body=await req.json();}catch{return json({error:"invalid_json"},400)}
  if(!body.organization_id)return json({error:"organization_id is required"},400);
  const question=String(body.question??"").trim();if(!question)return json({error:"question is required"},400);

  const {data:actor,error:actorError}=await admin.from("agba_users").select("id, organization_id, department_id, active, agba_roles(code)").eq("auth_user_id",user.id).eq("organization_id",body.organization_id).eq("active",true).maybeSingle();
  if(actorError||!actor)return json({error:"actor_not_registered_for_organization"},403);
  const role=Array.isArray(actor.agba_roles)?actor.agba_roles[0]?.code:actor.agba_roles?.code;if(role!=="ceo")return json({error:"ceo_role_required"},403);

  const {data:state,error:stateError}=await admin.from("agba_state_items").select("id,department_id,kind,state_key,title,summary,status,confidence,severity,recommended_action,first_seen_at,last_seen_at,source_report_id").eq("organization_id",body.organization_id).in("status",["active","monitoring"]).order("last_seen_at",{ascending:false}).limit(40);
  if(stateError)return json({error:"state_lookup_failed",detail:stateError.message},400);
  const {data:reports,error:reportsError}=await admin.from("agba_reports").select("id,department_id,raw_text,created_at").eq("organization_id",body.organization_id).order("created_at",{ascending:false}).limit(20);
  if(reportsError)return json({error:"report_lookup_failed",detail:reportsError.message},400);
  const {data:openActions,error:openActionsError}=await admin.from("agba_actions").select("id,owner_name,description,deadline,status,priority,created_at,metadata").eq("organization_id",body.organization_id).in("status",["open","in_progress"]).order("created_at",{ascending:false}).limit(30);
  if(openActionsError)return json({error:"action_lookup_failed",detail:openActionsError.message},400);

  const stateContext=(state??[]).map((s:any)=>`STATE ${s.id}\nkind=${s.kind}\nkey=${s.state_key}\ntitle=${s.title}\nsummary=${s.summary}\nstatus=${s.status}\nconfidence=${s.confidence}\nseverity=${s.severity??"null"}\nrecommended_action=${s.recommended_action??"null"}\nfirst_seen=${s.first_seen_at}\nlast_seen=${s.last_seen_at}\nsource_report=${s.source_report_id??"null"}`).join("\n\n")||"No active persistent state.";
  const reportContext=(reports??[]).map((r:any)=>`REPORT ${r.id}\ncreated_at=${r.created_at}\n${r.raw_text}`).join("\n\n")||"No recent reports.";
  const actionContext=(openActions??[]).map((a:any)=>`ACTION ${a.id}\nstatus=${a.status}\npriority=${a.priority}\nowner=${a.owner_name??"unassigned"}\ndeadline=${a.deadline??"none"}\ndescription=${a.description}`).join("\n\n")||"No open actions.";
  const prompt=`You are Agba, the operating brain of a company. Answer the CEO directly. Use persistent state, recent reports, and existing open actions. Prefer newer evidence when facts conflict. Identify trends, unresolved problems, changes, and management priorities. Never invent facts. Distinguish confirmed facts from inference. Do not give generic management advice when the company evidence is sufficient.\n\nCEO QUESTION:\n${question}\n\nPERSISTENT STATE:\n${stateContext}\n\nRECENT REPORTS:\n${reportContext}\n\nOPEN ACTIONS:\n${actionContext}\n\nReturn ONLY valid JSON with exactly these fields: {"answer":"direct CEO answer","confidence":"high|medium|low","confidence_reason":"evidence-based reason","signals":[{"signal":"short business signal","evidence":"specific supporting evidence"}],"actions":[{"description":"specific action Agba recommends","owner_name":"person or null","deadline":"ISO timestamp or null","priority":"low|medium|high|critical"}]}. If the CEO asks what needs attention, what should be done, how to respond, what to prioritize, or otherwise asks for management action, and the evidence supports a concrete action, you MUST include at least one action. Use the strongest evidence-backed management action, not generic advice. Do not create an action merely because an existing open action already covers the same operational intent. If an existing open action already covers the recommendation, refer to that existing action in the answer instead of creating a duplicate. Only omit actions when no concrete management action is supported by the evidence. Keep answer concise but substantive.`;

  let result;try{result=await callAgbaJson(prompt,()=>true);}catch(error){if(error instanceof AIGatewayError)return json({error:error.code,detail:{message:error.message,attempts:error.attempts}},502);return json({error:"ai_gateway_unavailable"},502)}
  const answer=coerce(result.value);
  const {data:query,error:queryError}=await admin.from("agba_ceo_queries").insert({organization_id:body.organization_id,asked_by:actor.id,question,answer:answer.answer,confidence:answer.confidence,confidence_reason:answer.confidence_reason,provenance:{state_count:(state??[]).length,report_count:(reports??[]).length,open_action_count:(openActions??[]).length,signals:answer.signals,provider:result.provider??"unknown",model:result.model??"unknown"}}).select("*").single();
  if(queryError||!query)return json({error:"ceo_query_persist_failed",detail:queryError?.message},400);

  let workingActions=[...(openActions??[])];
  const persistedActions:any[]=[];
  for(const action of answer.actions){
    const matches=workingActions.filter((existing:any)=>isDuplicateAction(action.description,existing.description));
    if(matches.length){
      const primary=matches[0];
      const mergedPriority=priorityRank(action.priority)>priorityRank(primary.priority)?action.priority:primary.priority;
      const updates:any={priority:mergedPriority,source_ceo_query_id:query.id,metadata:{...(primary.metadata??{}),created_from:primary.metadata?.created_from??"ceo-query",last_reaffirmed_by_ceo_query_id:query.id}};
      if(action.owner_name&&!primary.owner_name)updates.owner_name=action.owner_name;
      if(action.deadline&&!primary.deadline)updates.deadline=action.deadline;
      const {data:updated,error:updateError}=await admin.from("agba_actions").update(updates).eq("id",primary.id).select("*").single();
      if(updateError)return json({error:"action_update_failed",detail:updateError.message},400);
      persistedActions.push(updated);
      for(const duplicate of matches.slice(1))await admin.from("agba_actions").update({status:"cancelled",metadata:{...(duplicate.metadata??{}),duplicate_of:primary.id,closed_by_deduplication_query_id:query.id}}).eq("id",duplicate.id);
    }else{
      const {data:created,error:createError}=await admin.from("agba_actions").insert({organization_id:body.organization_id,created_by:actor.id,owner_name:action.owner_name,description:action.description,deadline:action.deadline,status:"open",priority:action.priority,source_ceo_query_id:query.id,metadata:{created_from:"ceo-query",action_intent:normalizeAction(action.description)}}).select("*").single();
      if(createError)return json({error:"action_persist_failed",detail:createError.message},400);
      persistedActions.push(created);workingActions.push(created);
    }
  }

  if(!persistedActions.length){
    const relevantExisting=workingActions.filter((a:any)=>questionMatchesAction(question,a.description));
    for(const action of relevantExisting){
      await admin.from("agba_actions").update({source_ceo_query_id:query.id,metadata:{...(action.metadata??{}),last_reaffirmed_by_ceo_query_id:query.id}}).eq("id",action.id);
      persistedActions.push({...action,source_ceo_query_id:query.id,metadata:{...(action.metadata??{}),last_reaffirmed_by_ceo_query_id:query.id}});
    }
  }

  await admin.from("agba_audit_logs").insert({action:"ceo.query",entity_id:query.id,organization_id:body.organization_id,actor_agba_user_id:actor.id});
  return json({query,answer:{...answer,provider:result.provider??"unknown",model:result.model??"unknown"},actions:persistedActions,provenance:{state_items:(state??[]).length,recent_reports:(reports??[]).length,open_actions:(openActions??[]).length}},201);
});
