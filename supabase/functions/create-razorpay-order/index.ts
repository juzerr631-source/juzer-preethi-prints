import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const origins=new Set(["https://thestorytellerframes.com","https://www.thestorytellerframes.com","https://juzerr631-source.github.io","http://localhost:8000","http://127.0.0.1:8000"]);
function reply(data:unknown,status=200,origin="null"){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"}})}
const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,key=Deno.env.get("RAZORPAY_KEY_ID")!,secret=Deno.env.get("RAZORPAY_KEY_SECRET")!;
const dbHeaders={apikey:service,Authorization:"Bearer "+service};
function basic(){return "Basic "+btoa(key+":"+secret)}
async function lookup(order:string,email:string){const u=url+"/rest/v1/orders?order_number=eq."+encodeURIComponent(order)+"&email=eq."+encodeURIComponent(email.toLowerCase())+"&select=id,order_number,email,customer_name,phone,artist,total_paise,payment_method,payment_status,razorpay_order_id,razorpay_payment_id";const r=await fetch(u,{headers:dbHeaders});if(!r.ok)throw Error("Order lookup failed");const rows=await r.json();return rows?.[0]||null}
async function patch(id:string,fields:Record<string,unknown>){const r=await fetch(url+"/rest/v1/orders?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{...dbHeaders,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(fields)});if(!r.ok)throw Error("Order update failed");return (await r.json())?.[0]}
function start(req:Request){const origin=req.headers.get("Origin")||"";if(req.method==="OPTIONS")return {origin,response:new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origins.has(origin)?origin:"null","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"}})};if(req.method!=="POST"||!origins.has(origin))return {origin,response:reply({error:"Request not allowed"},403,"null")};return {origin,response:null}}
function valid(s:unknown,max=160){return typeof s==="string"&&s.length>0&&s.length<=max?s.trim():""}

Deno.serve(async(req)=>{const gate=start(req);if(gate.response)return gate.response;const origin=gate.origin;
try{if(!key.startsWith("rzp_test_"))return reply({error:"Test mode only"},503,origin);
const input=await req.json();const number=valid(input.order_number,50),email=valid(input.email,254);
if(!number||!email)return reply({error:"Missing order details"},400,origin);
const order=await lookup(number,email);if(!order)return reply({error:"Order not found"},404,origin);
if(order.payment_status==="verified")return reply({error:"This order is already paid"},409,origin);
if(order.payment_method==="upi"&&order.razorpay_order_id===null){/* Existing UPI orders may opt into card checkout before payment. */}
if(!Number.isInteger(order.total_paise)||order.total_paise<100)return reply({error:"Invalid amount"},400,origin);
let rpId=order.razorpay_order_id;
if(!rpId){const r=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{"Authorization":basic(),"Content-Type":"application/json"},body:JSON.stringify({amount:order.total_paise,currency:"INR",receipt:order.order_number,notes:{artist:order.artist,order_number:order.order_number}})});
const data=await r.json();if(!r.ok||!data.id)throw Error("Razorpay order creation failed");
rpId=data.id;await patch(order.id,{razorpay_order_id:rpId,payment_method:"razorpay"});}
return reply({key_id:key,razorpay_order_id:rpId,amount:order.total_paise,currency:"INR",order_number:order.order_number,name:order.customer_name,email:order.email,phone:order.phone},200,origin)
}catch(e){console.error("create-razorpay-order",e);return reply({error:"Unable to start card checkout. Please try again."},500,origin)}});
