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

async function hexHmac(message:string){const cryptoKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const signature=await crypto.subtle.sign("HMAC",cryptoKey,new TextEncoder().encode(message));return [...new Uint8Array(signature)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function equal(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
Deno.serve(async(req)=>{const gate=start(req);if(gate.response)return gate.response;const origin=gate.origin;
try{if(!key.startsWith("rzp_test_"))return reply({error:"Test mode only"},503,origin);
const input=await req.json(),number=valid(input.order_number,50),email=valid(input.email,254),paymentId=valid(input.razorpay_payment_id,100),rpOrder=valid(input.razorpay_order_id,100),signature=valid(input.razorpay_signature,128);
if(!number||!email||!/^pay_[A-Za-z0-9]+$/.test(paymentId)||!/^order_[A-Za-z0-9]+$/.test(rpOrder)||!/^[0-9a-f]{64}$/i.test(signature))return reply({error:"Invalid payment details"},400,origin);
const order=await lookup(number,email);if(!order||order.razorpay_order_id!==rpOrder)return reply({error:"Payment does not match order"},400,origin);
if(!equal(await hexHmac(rpOrder+"|"+paymentId),signature.toLowerCase()))return reply({error:"Payment signature could not be verified"},400,origin);
const r=await fetch("https://api.razorpay.com/v1/payments/"+encodeURIComponent(paymentId),{headers:{Authorization:basic()}});const payment=await r.json();
if(!r.ok||payment.order_id!==rpOrder||payment.amount!==order.total_paise||payment.currency!=="INR")return reply({error:"Payment details could not be confirmed"},409,origin);
if(payment.status!=="captured")return reply({verified:false,status:payment.status,message:"Payment is not captured yet. Please check again later."},202,origin);
if(order.payment_status==="verified")return reply({verified:order.razorpay_payment_id===paymentId,status:"verified"},200,origin);
if(order.razorpay_payment_id&&order.razorpay_payment_id!==paymentId)return reply({error:"Order already has another payment"},409,origin);
await patch(order.id,{payment_method:"razorpay",payment_status:"verified",razorpay_payment_id:paymentId,payment_verified_at:new Date().toISOString()});
return reply({verified:true,status:"verified",order_number:number},200,origin)
}catch(e){console.error("verify-razorpay-payment",e);return reply({error:"Could not verify payment. Do not pay again; contact support with your payment ID."},500,origin)}});
