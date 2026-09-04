import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const H={"Content-Type":"application/json"}; const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const env=(k:string)=>Deno.env.get(k)||"";
Deno.serve(async(req)=>{
  if(req.method!=="POST") return json({ok:true,service:"agba-proposal-router"});
  const url=env("SUPABASE_URL"),key=env("SUPABASE_SERVICE_ROLE_KEY"); if(!url||!key)return json({error:"not_configured"},500);
  const sb=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const expected=(await sb.rpc("agba_telegram_worker_secret")).data;
  if(!expected||req.headers.get("x-agba-worker-secret")!==String(expected))return json({error:"forbidden"},403);
  let update:any={};try{update=await req.json()}catch{return json({ok:true})}
  const msg=update?.message,text=String(msg?.text||"").trim(),chat=Number(msg?.chat?.id||0),inbox=String(update?._agba_inbox_id||""); if(!chat||!text)return json({ok:true,handled:false});
  const {data:b}=await sb.from("agba_telegram_bindings").select("organization_id,agba_user_id,role_code").eq("chat_id",chat).maybeSingle(); if(!b)return json({ok:true,handled:false});
  const role=String(b.role_code||""); if(!["ceo","owner","company_owner"].includes(role)){await send("Proposal decisions are restricted to the company owner/CEO.");return json({ok:true,handled:true});}
  async function send(t:string){const {error}=await sb.from("agba_telegram_delivery_outbox").insert({organization_id:b.organization_id,inbox_id:/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inbox)?inbox:null,chat_id:String(chat),payload:{chat_id:chat,text:t},status:"pending",attempts:0,max_attempts:5,next_attempt_at:new Date().toISOString()});if(error&&error.code!=="23505")throw error;}
  if(/^\/?proposals$/i.test(text)){
    const {data,error}=await sb.from("agba_proposals").select("id,title,summary,recommendation,priority,status,approval_id,created_at").eq("organization_id",b.organization_id).eq("status","proposed").order("priority",{ascending:true}).order("created_at",{ascending:true}).limit(20);if(error)throw error;
    if(!data?.length){await send("Agba 🧠\n\nThere are no pending proposals.");return json({ok:true,handled:true,count:0});}
    const body=data.map((p:any)=>{const id=String(p.id).slice(0,8);return `• ${id} — ${p.title}${p.priority===1?" 🔴":p.priority===2?" 🟠":""}\n  ${p.summary||""}\n  Recommendation: ${p.recommendation||"Review and decide."}\n  /approve ${id}   /reject ${id}   /defer ${id}`}).join("\n\n");await send(`🧠 Agba — Pending Proposals\n\n${body}`);return json({ok:true,handled:true,count:data.length});
  }
  const m=text.match(/^\/(approve|reject|defer)\s+([0-9a-f-]{6,36})$/i); if(!m)return json({ok:true,handled:false});
  const decision=m[1].toLowerCase(),prefix=m[2].toLowerCase(); const {data:rows,error:pe}=await sb.from("agba_proposals").select("*").eq("organization_id",b.organization_id).eq("status","proposed").ilike("id",`${prefix}%`).limit(2);if(pe)throw pe;
  if(!rows?.length){await send(`Agba 🧠\n\nI couldn't find a pending proposal starting with **${prefix}**.`);return json({ok:true,handled:true});}
  if(rows.length>1){await send("Agba 🧠\n\nThat proposal reference is ambiguous. Use /proposals and copy the full 8-character reference.");return json({ok:true,handled:true});}
  const p=rows[0]; let approvalId=p.approval_id;
  if(!approvalId){const {data:a,error:ae}=await sb.rpc("agba_create_proposal_approval",{p_proposal_id:p.id,p_requested_by:b.agba_user_id});if(ae)throw ae;approvalId=a;}
  const {data:decided,error:de}=await sb.rpc("agba_decide_proposal",{p_proposal_id:p.id,p_approval_id:approvalId,p_decision:decision,p_decided_by:b.agba_user_id});if(de)throw de;
  const label=decision==="approved"?"APPROVED":decision==="rejected"?"REJECTED":"DEFERRED";await send(`Agba 🧠\n\nProposal **${String(p.id).slice(0,8)}** — **${label}**.\n\n${p.title}\n\nI recorded your decision. No action was executed by this approval step.`);return json({ok:true,handled:true,proposal:decided});
});
