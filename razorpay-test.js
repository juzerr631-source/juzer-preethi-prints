/* Razorpay test checkout. Secret credentials stay in Supabase Edge Functions. */
(function(){
const $=id=>document.getElementById(id);
const originalShowPayment=showPayment;
showPayment=function(no,amount,notification){
 originalShowPayment(no,amount,notification);
 if($('razorpayChoice'))return;
 const wrap=document.createElement('section');wrap.id='razorpayChoice';
 wrap.style.cssText='border:1px solid #d3d1c6;padding:20px;margin:24px 0;background:#faf8f2';
 wrap.innerHTML='<span class="eyebrow">Payment options</span><h3 style="font:400 25px Playfair Display,Georgia,serif;margin:8px 0">Choose how to pay.</h3><p class="muted">UPI goes directly to the selected artist. Card checkout is currently in Razorpay TEST MODE; no real card charges.</p><button class="button" type="button" id="razorpayPay">Test debit / credit card payment →</button><button class="button" type="button" id="razorpayCheck" style="margin-top:10px">Check previous payment status</button><p class="muted" id="razorpayMessage" role="status"></p>';
 const upi=$('payment').querySelector('.upi');upi.parentNode.insertBefore(wrap,upi);
 $('razorpayPay').addEventListener('click',payCard);$('razorpayCheck').addEventListener('click',checkPayment);
};
async function checkPayment(){
 const btn=$('razorpayCheck'),msg=$('razorpayMessage');
 const saved=JSON.parse(sessionStorage.getItem('storyteller_payment')||'null');
 const draft=JSON.parse(sessionStorage.getItem('storyteller_order_draft')||'null');
 if(!saved?.order||!draft?.email){msg.textContent='Payment session expired. Contact support with your order number.';return false}
 btn.disabled=true;msg.textContent='Checking Razorpay payment status securely…';
 try{
  const result=await apiFetch('/functions/v1/reconcile-razorpay-order',{method:'POST',body:JSON.stringify({order_number:saved.order,email:draft.email})});
  if(result.verified){markPaid();msg.textContent='Test payment captured and verified. Order '+saved.order+' is paid.';const status=$('paymentStatus');if(status)status.textContent='Payment status: verified (Razorpay test transaction).';$('razorpayPay').disabled=true;$('razorpayPay').textContent='Test payment verified ✓';btn.textContent='Payment verified ✓';return true}
  msg.textContent=result.status==='not_captured'?'No captured payment found for this order. Do not retry until the order is checked.':'Payment needs manual review. Do not pay again.';return false
 }catch(e){msg.textContent='Unable to check payment status. Please contact support with your order number.';return false}
 finally{btn.disabled=false}
}
// Restored order pages call showPayment before this script loads.
if(document.getElementById('payment')?.classList.contains('show')){
 const saved=JSON.parse(sessionStorage.getItem('storyteller_payment')||'null');
 if(saved?.order)showPayment(saved.order,Number(saved.amount),saved.notification||'not_configured');
}
async function reconcileAfterCheckout(){
 const btn=$('razorpayPay'),msg=$('razorpayMessage');
 if(!btn||!msg)return;
 btn.disabled=true;msg.textContent='Checking captured payment status…';
 for(let attempt=0;attempt<3;attempt++){
  const verified=await checkPayment();
  if(verified)return;
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1500));
 }
 btn.disabled=false;msg.textContent='Payment status not confirmed. Use Check previous payment status before trying again.';
}
function markPaid(){
 const pay=document.getElementById('payment');
 if(pay){
  const upi=pay.querySelector('.upi');if(upi)upi.style.display='none';
  const payButton=document.getElementById('payButton');if(payButton)payButton.style.display='none';
  const qr=document.getElementById('qrOptions');if(qr)qr.style.display='none';
  const status=document.getElementById('paymentStatus');if(status)status.textContent='Payment status: verified (Razorpay test transaction).';
 }
}
function loadCheckout(){return new Promise((resolve,reject)=>{if(window.Razorpay)return resolve();const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.onload=resolve;s.onerror=()=>reject(Error('Razorpay checkout could not load.'));document.head.appendChild(s)})}
async function payCard(){
 const button=$('razorpayPay'),msg=$('razorpayMessage');
 if(!button||button.disabled)return;
 const saved=JSON.parse(sessionStorage.getItem('storyteller_payment')||'null');
 const draft=JSON.parse(sessionStorage.getItem('storyteller_order_draft')||'null');
 if(!saved?.order||!draft?.email){msg.textContent='Your payment session expired. Please return to checkout.';return}
 button.disabled=true;msg.textContent='Checking for any earlier captured payment…';
 if(await checkPayment()){return}
 button.disabled=true;msg.textContent='Preparing secure test checkout…';
 try{
  const data=await apiFetch('/functions/v1/create-razorpay-order',{method:'POST',body:JSON.stringify({order_number:saved.order,email:draft.email})});
  await loadCheckout();
  const checkout=new Razorpay({
   key:data.key_id,amount:data.amount,currency:data.currency,name:'The StoryTeller Frames',
   description:'TEST MODE · '+saved.order,order_id:data.razorpay_order_id,
   prefill:{name:data.name,email:data.email,contact:data.phone},
   theme:{color:'#344b32'},
   handler:async function(result){
    msg.textContent='Payment returned. Verifying securely…';
    try{
     const verification=await apiFetch('/functions/v1/verify-razorpay-payment',{method:'POST',body:JSON.stringify({order_number:saved.order,email:draft.email,razorpay_order_id:result.razorpay_order_id,razorpay_payment_id:result.razorpay_payment_id,razorpay_signature:result.razorpay_signature})});
     if(verification.verified){markPaid();msg.textContent='Test payment verified successfully. Order '+saved.order+' marked paid.';$('paymentStatus').textContent='Payment status: verified (Razorpay test transaction).';button.disabled=true;button.textContent='Test payment verified ✓';return}
     await reconcileAfterCheckout();return;
    }catch(e){await reconcileAfterCheckout();return}
    button.disabled=false;
   },
   modal:{ondismiss:function(){if(!button.textContent.includes('verified')){msg.textContent='Checkout closed. Checking payment status…';reconcileAfterCheckout()}}}
  });
  checkout.on('payment.failed',function(e){msg.textContent='Payment was declined or checkout could not finish. Checking whether any payment was captured…';reconcileAfterCheckout()});
  checkout.open();
 }catch(e){msg.textContent=e.message||'Unable to start test checkout.';button.disabled=false}
}
})();
