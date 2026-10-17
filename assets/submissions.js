// Final submission UI. Existing local drafts stay in their original assignment storage.
window.TrialSubmission = async function (ctx) {
  const bar=document.createElement('div');bar.className='ta-submit';
  bar.innerHTML='<button type="button" disabled>Submit homework</button><p role="status">Checking submission status…</p>';
  ctx.main.appendChild(bar);
  const button=bar.querySelector('button'),status=bar.querySelector('p');
  let ready=false,busy=false,receiving=false;
  function lock(value){ctx.state.submitted=value;ctx.items.forEach(i=>{const a=i.querySelector('textarea');if(a)a.readOnly=value; i.querySelectorAll('.ta-choice').forEach(c=>{c.setAttribute('aria-disabled',String(value));});});}
  function receipt(r){
    if(!r || !r.receiptId || !r.submittedAt)throw new Error('No confirmed receipt.');
    ctx.state.responses=r.responses;ctx.save();ctx.paint();lock(true);button.disabled=true;button.textContent='Submitted';
    status.textContent='Submitted · '+new Date(r.submittedAt).toLocaleString()+' · Receipt '+r.receiptId;
    ctx.refreshCorrection();
  }
  function state(d){
    if(!d || !d.ok)throw new Error(d&&d.error||'Unable to check submission status.');
    ready=true;receiving=d.receiving;
    if(d.test)bar.dataset.test='true';
    if(d.receipt){receipt(d.receipt);return;}
    if(!d.configured){bar.remove();return;}
    button.disabled=!receiving; status.textContent=(d.test?'Teacher test · ':'')+(receiving?'Draft saved in this browser. Submit when every answer is ready.':'Submissions are currently closed. Your draft stays in this browser.');
    if(receiving){loadOrigin().then(o=>{if(o)o.warm();});}
  }
  let originPromise;
  function loadOrigin(){
    if(window.PortalSubmissionOrigin)return Promise.resolve(window.PortalSubmissionOrigin);
    if(!originPromise)originPromise=new Promise(resolve=>{const script=document.createElement('script');script.src='assets/submission-origin.js';script.onload=()=>resolve(window.PortalSubmissionOrigin);script.onerror=()=>resolve(null);document.head.appendChild(script);setTimeout(()=>resolve(null),4000);});
    return originPromise;
  }
  button.onclick=async()=>{
    if(!ready || !receiving || busy || ctx.state.submitted)return;
    if(ctx.items.some(i=>!String(ctx.state.responses[i.dataset.n]||'').trim())){status.textContent='Please answer every question before submitting.';return;}
    busy=true;button.disabled=true;lock(true);status.textContent='Submitting… Please keep this page open.';
    try{
      const origin=await loadOrigin();let submissionOrigin=null;try{if(origin)submissionOrigin=await origin.collect();}catch(e){}
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
      try{
        const response=await fetch(ctx.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'submitHomework',t:ctx.key,assignment:ctx.assignmentId,responses:ctx.state.responses,submissionOrigin}),signal:controller.signal});
        const result=await response.json();if(!result.ok)throw new Error(result.error||'Submission failed.');receipt(result.receipt);
      }finally{clearTimeout(timer);}
    }catch(error){
      // A lost POST response is not a lost hand-in: verify the authoritative receipt before retrying.
      try{const d=await ctx.read();if(d.ok&&d.receipt){receipt(d.receipt);}else{lock(false);status.textContent=(d.ok&&!d.receiving?'Submissions are currently closed. ': 'Submission not confirmed. ')+(error.message||'Check your connection.')+' Your answers are still saved here; retry when ready.';}}
      catch(e){lock(false);status.textContent='Submission not confirmed. Your answers are still saved here. Check your connection and retry.';}
    }finally{busy=false;button.disabled=ctx.state.submitted||!receiving;}
  };
  try{state(await ctx.read());}catch(e){status.textContent='Could not check submission status. Your draft is safe; reload before submitting.';}
};
