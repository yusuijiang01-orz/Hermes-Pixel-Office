function applyServerState(data,source='poll'){
  if(data.error)throw Error(data.error);
  if(!_loadingCleared){_loadingCleared=true;window._corgiLoadingDone?.()}
  state=data;
  if(data.world?.iso){
    const parsed=Date.parse(data.world.iso);
    if(Number.isFinite(parsed)){worldBaseMs=parsed;worldReceivedMs=Date.now()}
  }
  state.messages=mergePendingMessages(data.messages||[]);
  syncFeed(data.team_feed);
  document.querySelector('#sync').textContent=(source==='sse'?'长连接实时 · ':'实时连接 · ')+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  updateWorldClockUi();
  document.querySelector('#project').textContent='当前项目：'+(data.board?.name||'暂无');
  data.agents.forEach((d,i)=>{
    if(!agents[d.id]){
      const p=officeSpawnFor(d.id);
      agents[d.id]={...d,x:p.x,y:p.y,mode:'working',seed:i*2,_spawned:true};
    }
    Object.assign(agents[d.id],d);
    const a=agents[d.id];
    const looksLikeBadBoot=(!a._spawned&&a.x<70&&a.y<70)||!Number.isFinite(a.x)||!Number.isFinite(a.y);
    if(looksLikeBadBoot){
      const p=officeSpawnFor(d.id);
      a.x=p.x;
      a.y=p.y;
    }
    a._spawned=true;
  });
  if(chatMode==='group')setChatMode('group');else if(selected)select(selected,false);else select(latestPrivateAgentId(),false);
  renderMobileShell()
}
function redirectToLogin(){
  const sync=document.querySelector('#sync');
  if(sync)sync.textContent='登录已过期 · 正在打开登录页';
  if(realtimeSource){realtimeSource.close();realtimeSource=null}
  const next=encodeURIComponent(location.pathname+location.search+location.hash);
  setTimeout(()=>{location.href='/login?next='+next},250);
}
function isAuthError(response,data){
  return response?.status===401||String(data?.error||'').includes('请先登录');
}
function connectRealtime(){
  if(!window.EventSource||realtimeSource)return;
  realtimeSource=new EventSource('/api/events');
  realtimeSource.addEventListener('open',()=>{
    realtimeConnected=true;
    clearTimeout(refreshTimer);
    clearTimeout(realtimeRetryTimer);
    document.querySelector('#sync').textContent='长连接实时 · 已连接';
    window._corgiLoadingDone?.()
  });
  realtimeSource.addEventListener('state',event=>{
    realtimeConnected=true;
    try{applyServerState(JSON.parse(event.data),'sse')}catch(e){console.warn(e)}
  });
  realtimeSource.addEventListener('error',()=>{
    realtimeConnected=false;
    if(realtimeSource){realtimeSource.close();realtimeSource=null}
    document.querySelector('#sync').textContent='长连接重连中 · 暂用普通同步';
    scheduleRefresh(600);
    clearTimeout(realtimeRetryTimer);
    realtimeRetryTimer=setTimeout(connectRealtime,1800)
  })
}
async function refresh(){
  try{
    const r=await fetch('/api/state',{cache:'no-store',credentials:'same-origin'});
    const data=await r.json();
    if(isAuthError(r,data)){redirectToLogin();return}
    applyServerState(data,'poll');
    setTimeout(()=>window._corgiLoadingDone?.(),800)
  }catch(e){
    document.querySelector('#sync').textContent='连接暂时中断，正在重试'
  }
  scheduleRefresh()
}
connectRealtime();
refresh();
async function sendChatMessage(inputSelector,mode,agentId){
  const input=document.querySelector(inputSelector),kind=draftKindFromInput(inputSelector),message=input.value.trim(),attachments=draftFor(kind).slice();
  if((!message&&!attachments.length)||(mode==='private'&&!agentId))return;
  const lockKey=`${inputSelector}:${mode}:${agentId||'group'}`;
  if(sendLocks.has(lockKey))return;
  sendLocks.add(lockKey);
  closeMentionMenu(inputSelector==='#mobileChatInput'?'mobile':'desktop');
  closeChatPanels();
  input.value='';
  attachmentDrafts[kind]=[];
  renderAttachmentPreview(kind);
  input.disabled=true;
  const createdAt=Date.now()/1000,tempId=`local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prompt=message||attachmentPrompt(attachments)||'[附件]';
  const tempMessage=mode==='group'?{
    id:tempId,agent:'planner',prompt,reply:null,status:'todo',created:createdAt,
    mode:'group',conversation:'local-'+tempId,round:1,origin:'boss',chat_lines:[],
    name:agents.planner?.name||'策划主编 小韩',attachments,_local:true
  }:{
    id:tempId,agent:agentId,prompt,reply:null,status:'todo',created:createdAt,
    mode:'private',conversation:null,round:null,chat_lines:[],
    name:agents[agentId]?.name||fallbackMentions.find(a=>a.id===agentId)?.name||'员工',attachments,_local:true
  };
  pendingMessages.push(tempMessage);
  if(state){
    state.messages=mergePendingMessages(state.messages||[]);
    if(mode==='group')mobileState.conversation='team';
    renderChat();
    renderMobileShell();
  }
  beginFastRefresh();
  scheduleRefresh(80);
  try{
    const r=await fetch('/api/message',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({mode,agent:agentId,message,attachments,board:state?.board?.slug||'default'})}),data=await r.json();
    if(isAuthError(r,data)){redirectToLogin();return}
    if(!r.ok)throw Error(data.error);
    pendingMessages=pendingMessages.filter(item=>item.id!==tempId);
    if(mode==='group')mobileState.conversation='team';
    rememberPending(data.messages||[]);
    beginFastRefresh();
    scheduleRefresh(80);
  }catch(err){
    pendingMessages=pendingMessages.map(item=>item.id===tempId?{...item,status:'blocked',reply:'消息未送达：'+err.message}:item);
    if(state){
      state.messages=mergePendingMessages(state.messages||[]);
      renderChat();
      renderMobileShell();
    }
    alert('消息未送达：'+err.message)
  }finally{
    sendLocks.delete(lockKey);
    input.disabled=false;
    input.focus()
  }
}
document.querySelector('#form').addEventListener('submit',async e=>{e.preventDefault();await sendChatMessage('#message',chatMode,selected)});
document.querySelector('#mobileChatForm').addEventListener('submit',async e=>{e.preventDefault();await sendChatMessage('#mobileChatInput',mobileState.chatMode,mobileState.chatMode==='private'?mobileState.agent:selected)});
document.querySelector('#fishMode')?.addEventListener('click',()=>{location.href='/fish.html'});
document.querySelector('#gameHub').addEventListener('click',()=>{location.href='/projects/companyverse/index.html'});
document.querySelector('#mobileGameHub').addEventListener('click',()=>{location.href='/projects/companyverse/index.html'});
updateRoomUI();

// === Corgi Yawning Loading Screen ===
(function(){
  const ls=document.getElementById('loading-screen');
  const lc=document.getElementById('loading-canvas');
  if(!ls||!lc)return;
  const lctx=lc.getContext('2d');
  let yawnT=0,yawnActive=true;

  // Draw pixel corgi yawning
  function drawYawnCorgi(t){
    lctx.fillStyle='#15191a';lctx.fillRect(0,0,128,128);

    const s=4.2; // pixel scale
    const cx=64,cy=68;

    // Body
    lctx.fillStyle='#d99a4e';
    lctx.fillRect(cx-16*s,s*5,28*s,16*s);
    // Head
    lctx.fillRect(cx-10*s,s*2,16*s,14*s);
    // Ears
    lctx.fillStyle='#8b5a2b';
    lctx.fillRect(cx-10*s,s*0,6*s,6*s);
    lctx.fillRect(cx+4*s,s*0,6*s,6*s);
    // Inner ears
    lctx.fillStyle='#f5b1a5';
    lctx.fillRect(cx-8*s,s*1,2*s,3*s);
    lctx.fillRect(cx+6*s,s*1,2*s,3*s);
    // Eyes - closed/happy squint
    lctx.fillStyle='#263238';
    lctx.fillRect(cx-6*s,s*5,4*s,2*s);
    lctx.fillRect(cx+2*s,s*5,4*s,2*s);
    // Nose
    lctx.fillStyle='#263238';
    lctx.fillRect(cx-1*s,s*7,3*s,2*s);
    // Yawning mouth - open wide with tongue
    lctx.fillStyle='#f5b1a5';
    lctx.fillRect(cx-5*s,s*8,11*s,3*s);
    lctx.fillStyle='#e88a8a';
    lctx.fillRect(cx-2*s,s*9,6*s,2*s);

    // Front legs
    lctx.fillStyle='#fff0cf';
    lctx.fillRect(cx-12*s,s*18,5*s,6*s);
    lctx.fillRect(cx+8*s,s*18,5*s,6*s);
    // Paws
    lctx.fillStyle='#263238';
    lctx.fillRect(cx-12*s,s*22,5*s,2*s);
    lctx.fillRect(cx+8*s,s*22,5*s,2*s);

    // Back
    lctx.fillStyle='#8b5a2b';
    lctx.fillRect(cx+12*s,s*6,6*s,10*s);

    // Tail (wagging)
    const wag=Math.sin(t/300)*2;
    lctx.fillStyle='#8b5a2b';
    lctx.fillRect(cx-18*s,s*8+wag,4*s,8*s);

    // Yawn sparkles
    const sparkle=Math.sin(t/400);
    if(sparkle>.5){
      lctx.fillStyle='#f2d06c';
      lctx.fillRect(cx+4*s,s*-2+Math.floor(sparkle*4),2*s,2*s);
      lctx.fillRect(cx+6*s,s*-1+Math.floor(sparkle*2),2*s,2*s);
    }

    // "z" text for sleeping/z-z-z
    if(t%2000>600){
      lctx.fillStyle='#d7e1dc';
      lctx.font='bold 14px monospace';
      lctx.fillText('Z',cx+18*s,s*6+Math.floor((t%2000-600)/200)*8);
    }

    // Loading bar below
    const barW=60,barH=4;
    const progress=(Math.sin(t/1200)*.5+.5)*.85; // oscillate but never reach 100% until ready
    lctx.fillStyle='#2a3a3a';
    lctx.fillRect(64-barW/2,110,barW,barH);
    lctx.fillStyle='#6ec3a0';
    lctx.fillRect(64-barW/2,110,barW*progress,barH);
  }

  function loadFrame(){
    if(yawnActive)drawYawnCorgi(yawnT);
    yawnT++;
    if(yawnActive)requestAnimationFrame(loadFrame);
  }
  loadFrame();

  // Expose a function to trigger the fade out
  window._corgiLoadingDone=function(){
    yawnActive=false;
    ls.classList.add('fade-out');
    setTimeout(()=>{ls.classList.remove('visible','fade-out');ls.style.display='none'},700);
  };
})();

