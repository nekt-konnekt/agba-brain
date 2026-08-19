import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url=Deno.env.get("SUPABASE_URL");
const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if(!url||!serviceRole)throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

const admin=createClient(url,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
const marker=`action-memory-e2e-${Date.now()}-${crypto.randomUUID()}`;

const {data:org,error:orgError}=await admin.from("agba_organizations").select("id").order("created_at",{ascending:false}).limit(1).maybeSingle();
if(orgError||!org)throw new Error(`Organization lookup failed: ${orgError?.message??"none"}`);

const description=`${marker}: contact supplier and confirm delivery schedule`;
const {data:action,error:createError}=await admin.from("agba_actions").insert({
  organization_id:org.id,
  description,
  owner_name:"Chinedu",
  status:"in_progress",
  priority:"high",
  metadata:{created_from:"action-memory-e2e"},
}).select("id,status,owner_name,description").single();
if(createError||!action)throw new Error(`Action creation failed: ${createError?.message??"none"}`);

try{
  const completedAt=new Date().toISOString();
  const {error:updateError}=await admin.from("agba_actions").update({
    status:"done",
    metadata:{created_from:"action-memory-e2e",completed_via:"e2e",completed_at:completedAt},
  }).eq("id",action.id);
  if(updateError)throw new Error(`Action completion failed: ${updateError.message}`);

  const {data:memory,error:memoryError}=await admin.from("agba_state_items").select("id,title,summary,status,metadata").eq("organization_id",org.id).eq("state_key",`completed_action:${action.id}`).maybeSingle();
  if(memoryError)throw new Error(`Completed-action memory lookup failed: ${memoryError.message}`);
  if(!memory)throw new Error("Completed action was not persisted as durable company memory");
  if(memory.status!=="active")throw new Error(`Completed-action memory is not active: ${memory.status}`);
  if(memory.metadata?.owner_name!=="Chinedu")throw new Error("Completed-action memory lost the owner");
  if(!String(memory.summary).includes("Chinedu"))throw new Error("Completed-action memory summary is missing the owner");
  if(!String(memory.summary).includes("completed"))throw new Error("Completed-action memory summary is missing completion status");
  if(memory.metadata?.memory_type!=="completed_management_action")throw new Error("Completed-action memory has the wrong memory type");

  console.log("PASS completed action -> durable company memory");
  console.log(`PASS action history: owner=${memory.metadata.owner_name}, memory=${memory.id}`);
  console.log("AGBA ACTION MEMORY E2E PASS");
}finally{
  await admin.from("agba_state_items").delete().eq("organization_id",org.id).eq("state_key",`completed_action:${action.id}`);
  await admin.from("agba_actions").delete().eq("id",action.id);
}
