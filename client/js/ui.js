/* CareFlow UI layer: loading effects only (splash, top progress bar, skeletons,
   button spinner, chart styling). Does not touch any business logic. */
(function(){
  'use strict';
  var started=Date.now();

  /* ---------- Boot splash ---------- */
  var MIN_SPLASH=650,doneCalled=false;
  window.cfBootDone=function(){
    if(doneCalled)return;doneCalled=true;
    var wait=Math.max(0,MIN_SPLASH-(Date.now()-started));
    setTimeout(function(){
      var s=document.getElementById('boot-splash');
      if(!s)return;
      s.classList.add('is-done');
      setTimeout(function(){if(s.parentNode)s.parentNode.removeChild(s)},700);
    },wait);
  };

  /* ---------- Top progress bar (tracks every network request) ---------- */
  var bar=document.createElement('div');bar.id='cf-progress';bar.setAttribute('aria-hidden','true');
  var fill=document.createElement('i');bar.appendChild(fill);document.body.appendChild(bar);
  var inflight=0,running=false,progress=0,tick=null,showT=null,hideT=null;
  function startBar(){
    if(running)return;running=true;clearTimeout(hideT);
    fill.style.transition='none';fill.style.width='0';void fill.offsetWidth;fill.style.transition='';
    bar.classList.add('on');progress=10;fill.style.width='10%';
    tick=setInterval(function(){progress+=(92-progress)*.07;fill.style.width=progress.toFixed(1)+'%'},260);
  }
  function finishBar(){
    if(!running)return;running=false;clearInterval(tick);fill.style.width='100%';
    hideT=setTimeout(function(){bar.classList.remove('on');hideT=setTimeout(function(){fill.style.width='0'},350)},240);
  }
  function begin(){inflight++;if(inflight===1){clearTimeout(showT);showT=setTimeout(startBar,140)}}
  function end(){inflight=Math.max(0,inflight-1);if(inflight===0){clearTimeout(showT);finishBar()}}
  if(window.fetch){
    var nativeFetch=window.fetch.bind(window);
    window.fetch=function(){
      begin();
      return nativeFetch.apply(null,arguments).then(function(r){end();return r},function(e){end();throw e});
    };
  }

  /* ---------- Skeleton templates ---------- */
  function statCard(){return '<div class="cf-sk-card"><div class="row"><span class="cf-sk"></span><span class="cf-sk"></span></div><span class="cf-sk big"></span><span class="cf-sk small"></span></div>'}
  function row(){return '<div class="cf-sk-row"><span class="cf-sk"></span><span class="cf-sk"></span><span class="cf-sk"></span><span class="cf-sk"></span></div>'}
  window.cfSkeleton=function(kind){
    var compact=kind==='compact',rows=compact?4:6,i,stats='',list='';
    for(i=0;i<4;i++)stats+=statCard();
    for(i=0;i<rows;i++)list+=row();
    return '<div class="cf-loader'+(compact?' cf-loader-compact':'')+'" role="status" aria-live="polite">'
      +(compact?'':'<div class="cf-sk-head"><span class="cf-sk"></span><span class="cf-sk"></span></div>')
      +'<div class="cf-sk-stats">'+stats+'</div>'
      +'<div class="cf-sk-panel"><span class="cf-sk title"></span>'+list+'</div>'
      +'<span class="sr-only">Loading workspace…</span></div>';
  };

  /* ---------- Sign-in button spinner ---------- */
  var form=document.getElementById('login-form');
  if(form){
    var btn=form.querySelector('button.btn-primary'),err=document.getElementById('login-error'),auth=document.getElementById('auth-screen'),safety=null;
    var stop=function(){if(!btn)return;btn.classList.remove('is-loading');btn.disabled=false;clearTimeout(safety)};
    form.addEventListener('submit',function(){
      if(!btn)return;btn.classList.add('is-loading');btn.disabled=true;
      clearTimeout(safety);safety=setTimeout(stop,20000);
    });
    if(err)new MutationObserver(function(){if(err.textContent!=='')stop()}).observe(err,{childList:true,characterData:true,subtree:true});
    if(auth)new MutationObserver(function(){if(auth.classList.contains('hidden'))stop()}).observe(auth,{attributes:true,attributeFilter:['class']});
  }

  /* ---------- Chart.js look & feel (only fills in what pages don't set) ---------- */
  if(window.Chart){
    var C=Chart.defaults;
    C.font.family="'Figtree',system-ui,sans-serif";C.font.size=11;C.color='#667a73';C.borderColor='#e6eeea';
    C.animation={duration:900,easing:'easeOutQuart'};
    C.elements.line.borderColor='#0e8f78';C.elements.line.backgroundColor='rgba(14,143,120,.12)';C.elements.line.borderWidth=2.5;
    C.elements.point.backgroundColor='#0e8f78';C.elements.point.radius=3;C.elements.point.hoverRadius=5;
    C.elements.bar.backgroundColor='rgba(14,143,120,.85)';C.elements.bar.borderRadius=6;C.elements.bar.borderSkipped=false;
    C.plugins.legend.labels.usePointStyle=true;C.plugins.legend.labels.boxWidth=8;
    var t=C.plugins.tooltip;t.backgroundColor='#082a25';t.padding=10;t.cornerRadius=10;t.titleFont={weight:'700'};t.boxPadding=4;
  }
})();
