import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers={"Content-Type":"application/json"};
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers});
const url=()=>Deno.env.get("SUPABASE_URL")||"";
const key=()=>Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const token=()=>Deno.env.get("TELEGRAM_BOT_TOKEN")||"";
const api=()=>`https://api.telegram.org/bot${token()}`;

async function telegram(method:string,body:Record<string,unknown>){
  const r=await fetch(`${api()}/${method}`,{method:"POST",headers,body:JSON.stringify(body)});
  let data:any=null;try{data=await r.json()}catch{data={ok:false,description:`telegram_http_${r.status}`}};
  if(!r.ok||!data?.ok)throw new Error(`telegram_${method}_failed:${data?.description||r.status}`);
  return data;
}

async function secret(sb:any){const {data,error}=await sb.rpc("agba_telegram_worker_secret");if(error)throw error;return String(data||"")}

async function send(chatId:number,text:string){
  const chunks=text.match(/[\s\S]{1,3800}/g)||[text];
  let lastMessageId:number|null=null;
  for(const chunk of chunks){
    let result:any;
    try{result=await telegram("sendMessage",{chat_id:chatId,text:chunk,parse_mode:"Markdown"})}
    catch{result=await telegram("sendMessage",{chat_id:chatId,text:chunk})}
    lastMessageId=Number(result?.result?.message_id)||lastMessageId;
  }
  return lastMessageId;
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({ok:true,service:"agba-telegram-delivery-worker"});
  if(!url()||!key())return json({error:"worker_not_configured"},500);
  if(!token())return json({error:"telegram_not_configured"},500);
  const sb=createClient(url(),key(),{auth:{autoRefreshToken:false,persistSession:false}});
  let body:any={};try{body=await req.json()}catch{}
  const expected=await secret(sb).catch(e=>{console.error("delivery_secret_lookup_failed",e);return""});
  if(!expected||body?.secret!==expected)return json({error:"forbidden"},403);
  const workerId=`telegram-delivery-${crypto.randomUUID()}`;
  const {data:claimed,error:claimError}=await sb.rpc("agba_claim_telegram_delivery",{p_worker_id:workerId,p_lease_seconds:120});
  if(claimError){console.error("delivery_claim_failed",claimError);return json({error:"delivery_claim_failed"},500)}
  const item=claimed?.[0];
  if(!item)return json({ok:true,processed:0});
  try{
    const payload=item.payload||{};
    const chatId=Number(payload.chat_id??item.chat_id);
    const text=String(payload.text??"");
    if(!chatId||!text)throw new Error("invalid_delivery_payload");
    const messageId=await send(chatId,text);
    const {data:completed,error}=await sb.rpc("agba_complete_telegram_delivery",{p_id:item.id,p_telegram_message_id:messageId});
    if(error)throw error;
    return json({ok:true,processed:1,delivery_id:item.id,telegram_message_id:messageId,status:completed?.[0]?.status||"sent",attempts:item.attempts});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    const {data:failed,error:failError}=await sb.rpc("agba_fail_telegram_delivery",{p_id:item.id,p_error:message,p_retry_delay_seconds:Math.min(300,Math.max(10,2**Math.min(Number(item.attempts)||1,5)))});
    if(failError)console.error("delivery_failure_state_update_failed",failError);
    console.error("telegram_delivery_failed",{deliveryId:item.id,attempts:item.attempts,message,terminal:failed?.[0]?.status==="dead"});
    return json({ok:false,processed:0,delivery_id:item.id,attempts:item.attempts,status:failed?.[0]?.status||"failed",error:message},500);
  }
});
