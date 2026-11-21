import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const allowed=new Set(["https://thestorytellerframes.com","https://www.thestorytellerframes.com","https://juzerr631-source.github.io","http://localhost:8000","http://127.0.0.1:8000"]);
const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,key=Deno.env.get("RAZORPAY_KEY_ID")!,secret=Deno.env.get("RAZORPAY_KEY_SECRET")!;
function response(data:unknown,status:number,origin:string){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"apikey, authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"}})}
Deno.serve(async(req)=>{
const origin=req.headers.get("origin")||"";if(!allowed.has(origin))return response({error:"Origin not allowed"},403,"null");
if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"apikey, authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"}});
if(req.method!=="POST")return response({error:"Method not allowed"},405,origin);
try{
if(!key.startsWith("rzp_test_"))return response({error:"Test mode only"},503,origin);
const body=await req.json(),number=body.order_number,email=body.email;
if(typeof number!=="string"||!/^STF-[A-Z0-9]{8,20}$/.test(number)||typeof email!=="string"||email.length>254||!email.includes("@"))return response({error:"Invalid order details"},400,origin);
const headers={apikey:service,Authorization:"Bearer "+service};
const lookup=await fetch(url+"/rest/v1/orders?order_number=eq."+encodeURIComponent(number)+"&email=eq."+encodeURIComponent(email.toLowerCase())+"&select=id,order_number,total_paise,payment_status,payment_method,razorpay_order_id,razorpay_payment_id",{headers});
if(!lookup.ok)throw Error("Lookup failed");const orders=await lookup.json(),order=orders?.[0];
if(!order)return response({error:"Order not found"},404,origin);
if(order.payment_status==="verified")return response({verified:true,status:"verified"},200,origin);
if(!/^order_[a-zA-Z0-9]+$/.test(order.razorpay_order_id||""))return response({verified:false,status:"no_razorpay_order"},200,origin);
const paymentResponse=await fetch("https://api.razorpay.com/v1/orders/"+encodeURIComponent(order.razorpay_order_id)+"/payments",{headers:{Authorization:"Basic "+btoa(key+":"+secret)}});
if(!paymentResponse.ok)throw Error("Razorpay lookup failed");
const result=await paymentResponse.json();
const matches=(result.items||[]).filter((p:any)=>p.status==="captured"&&p.order_id===order.razorpay_order_id&&p.amount===order.total_paise&&p.currency==="INR");
if(matches.length!==1)return response({verified:false,status:matches.length>1?"needs_manual_review":"not_captured"},200,origin);
const payment=matches[0];
const update=await fetch(url+"/rest/v1/orders?id=eq."+encodeURIComponent(order.id)+"&payment_status=neq.verified",{method:"PATCH",headers:{...headers,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({payment_status:"verified",payment_method:"razorpay",razorpay_payment_id:payment.id,payment_verified_at:new Date().toISOString()})});
if(!update.ok)throw Error("Order update failed");const updated=await update.json();
return response({verified:updated.length===1,status:updated.length===1?"verified":"needs_manual_review"},200,origin);
}catch(e){console.error("reconcile-razorpay-order",e);return response({error:"Could not reconcile payment. Do not retry payment."},500,origin)}
});
