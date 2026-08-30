import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers={"Content-Type":"application/json"};
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers});
const tg=()=>Deno.env.get("TELEGRAM_BOT_TOKEN")||"";
const api=()=>`https://api.telegram.org/bot${tg()}`;
async function telegram(method:string,body:Record<string,unknown>){const r=await fetch(`${api()}/${method}`,{method:"POST",headers,body:JSON.stringify(body)});return r.json();}
async function send(chat_id:number,text:string){for(const chunk of text.match(/[\s\S]{1,3800}/g)||[text]){const result=await telegram("sendMessage",{chat_id,text:chunk,parse_mode:"Markdown"});if(!result?.ok){const fallback=await telegram("sendMessage",{chat_id,text:chunk});if(!fallback?.ok)throw new Error(`telegram_send_failed:${fallback?.description||result?.description||"unknown"}`);}}}
function bytesToHex(bytes:Uint8Array){return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function hashToken(token:string){return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))));}
function randomToken(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({ok:true,service:"agba-telegram"});
  if(!tg())return json({error:"telegram_not_configured"},500);
  const secret=Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if(secret&&req.headers.get("x-telegram-bot-api-secret-token")!==secret)return json({error:"forbidden"},403);
  let update:any;try{update=await req.json()}catch{return json({ok:true})}
  const msg=update?.message;if(!msg?.chat?.id)return json({ok:true});
  const chatId=Number(msg.chat.id);const text=String(msg.text||"").trim();
  const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
  const bindingQuery=()=>supabase.from("agba_telegram_bindings").select("organization_id,agba_user_id,role_code,agba_organizations(name,currency_code)").eq("chat_id",chatId).maybeSingle();
  const {data:binding}=await bindingQuery();
  const startToken=text.match(/^\/start(?:\s+(.+))?$/i)?.[1]?.trim()||null;

  if(startToken){
    const tokenHash=await hashToken(startToken);
    const {data:invite}=await supabase.from("agba_telegram_invitations").select("id,organization_id,role_code,expires_at,used_at,created_by").eq("token_hash",tokenHash).maybeSingle();
    if(!invite){await send(chatId,"This invitation is not valid. Ask the company owner to generate a new one.");return json({ok:true});}
    if(invite.used_at||new Date(invite.expires_at).getTime()<Date.now()){await send(chatId,"This invitation has expired or has already been used. Ask the company owner to generate a new one.");return json({ok:true});}

    // Connect the Telegram chat to the invitation creator when the creator is the
    // account owner. This is the dashboard's self-connect flow. Employee invites
    // continue through the existing user onboarding flow.
    if(invite.role_code==="ceo"||invite.role_code==="owner"||invite.role_code==="company_owner"){
      const {data:owner}=await supabase.from("agba_users").select("id,organization_id").eq("id",invite.created_by).eq("organization_id",invite.organization_id).maybeSingle();
      if(owner){
        const {data:existing}=await supabase.from("agba_telegram_bindings").select("chat_id").eq("chat_id",chatId).maybeSingle();
        if(!existing){
          const {error:e}=await supabase.from("agba_telegram_bindings").insert({organization_id:owner.organization_id,agba_user_id:owner.id,role_code:"ceo",chat_id:chatId,telegram_user_id:msg.from?.id?String(msg.from.id):null,telegram_username:msg.from?.username||null});
          if(e){console.error("telegram_self_connect_failed",e);await send(chatId,"I couldn't complete the Telegram connection right now. Please try the connection again.");return json({ok:true});}
        }
        await supabase.from("agba_telegram_invitations").update({used_at:new Date().toISOString()}).eq("id",invite.id);
        await send(chatId,"Agba 🧠\n\nTelegram is now connected to your Agba account. You can talk to me normally.");
        return json({ok:true});
      }
    }

    await send(chatId,"This invitation is valid, but the account connection step is not available for this user yet. Ask the company owner to finish setting up your Agba user first.");
    return json({ok:true});
  }

  if(text==="/id"){await send(chatId,`Your Telegram chat ID is ${chatId}.`);return json({ok:true});}
  if(text==="/start"||text==="/help"){
    await send(chatId,binding?"Agba 🧠\n\nThis Telegram chat is connected. Just talk to me normally.\n\nTry:\n• How is the business doing today?\n• What needs my attention?\n• What did we spend today?\n• Which tasks are overdue?\n\n/actions\nSee open management actions.\n\n/briefing\nGet today's business briefing.":"Agba 🧠\n\nThis chat is not connected yet. Open Connect Telegram from your Agba dashboard and use the Telegram link it provides.");
    return json({ok:true});
  }
  if(text==="/connect"){await send(chatId,binding?"This chat is already connected. Just talk to Agba normally.":"Open Connect Telegram from your Agba dashboard to link this chat.");return json({ok:true});}
  if(!binding){if(text)await send(chatId,"This chat is not connected yet. Open Connect Telegram from your Agba dashboard and use the Telegram link it provides.");return json({ok:true});}

  await send(chatId,"Agba 🧠\n\nYour Telegram connection is active. Your message has been received.");
  return json({ok:true});
});
