function frame(t){const dt=Math.min((t-lastFrame)/1000||0,.1);lastFrame=t;const w=canvas.clientWidth,h=canvas.clientHeight;ctx.clearRect(0,0,w,h);const everyoneHome=state?.world?.phase==='home'&&Object.values(agents).every(a=>['home','home_remote'].includes(a.presence));neighborhood=cameraMode==='home'||(cameraMode==='auto'&&everyoneHome);document.querySelector('#homeSwitcher').classList.toggle('visible',neighborhood);if(currentRoom==='office'&&!editMode)document.querySelector('#sceneTip').textContent=neighborhood?'切换住宅查看员工，下方可直接私聊':'点击员工聊天，点工位看他忙啥';// Room navigation
  if(currentRoom==='game'){drawGameRoom(w,h,t);ctx.textAlign='center';ctx.fillStyle='#8a9a9a';ctx.font='12px Microsoft YaHei';ctx.fillText('左上角返回办公室 · 右上角回消息首页',w/2,h*.68);ctx.textAlign='left'}
  else if(currentRoom==='boss'){drawBossOffice(w,h,t);ctx.textAlign='center';ctx.fillStyle='#8a9a9a';ctx.font='12px Microsoft YaHei';ctx.fillText('左上角返回办公室 · 右上角回消息首页',w/2,h*.68);ctx.textAlign='left'}
  else{if(neighborhood)drawHomeInterior(w,h,t);else room(w,h,t)}if(editMode)drawSelectionBox(w,h,t);if(t>nextFeed&&feedQueue.length){const item=feedQueue.shift(),speaker=agents[item.agent];if(speaker)speaker.speech={text:item.text,until:t+6500};nextFeed=t+5200}Object.values(agents).forEach((a,i)=>{initNeeds(a,i);updateNeeds(a,dt);const p=target(a,w,h,t),dx=p[0]-a.x,dy=p[1]-a.y,d=Math.hypot(dx,dy);a.moving=d>3;if(a.moving&&!neighborhood){const speed=.55;a.x+=dx/d*speed;a.y+=dy/d*speed}if(!a.hidden&&!neighborhood)drawAgent(a,t)});if(!neighborhood){drawAtmosphere(w,h,t);Object.values(agents).forEach(a=>{if(!a.hidden)drawSpeech(a,t,w)})}if(t-lastSave>10000){const out={};Object.values(agents).forEach(a=>out[a.id]=a.needs);localStorage.setItem('hermes-villa-needs',JSON.stringify(out));lastSave=t}if(chatMode==='private'&&selected&&t-lastPanel>1000){updatePanel(agents[selected]);lastPanel=t}// Fun Mode effects
if(funMode&&currentRoom==='office'&&!neighborhood){if(t-funLastDialogue>4000){funLastDialogue=t;const d=getFunnyDialogue();if(funDialogueEl){funDialogueEl.innerHTML=`<span class="fun-speaker">${d.speaker}</span>${d.text}`;funDialogueEl.classList.add('visible');clearTimeout(funDialogueTimeout);funDialogueTimeout=setTimeout(()=>{funDialogueEl.classList.remove('visible')},4500)}}// Shake random scene objects
const shakeEls=document.querySelectorAll('.scene-object');shakeEls.forEach(el=>{if(Math.random()<0.03){el.style.transform=`rotate(${Math.sin(t*0.01)*15}deg)`;setTimeout(()=>{el.style.transform=''},200)}})};if(currentRoom==='office'&&!neighborhood)reportWorldObjects(t,w,h);requestAnimationFrame(frame)}requestAnimationFrame(frame);
function activityText(a){if(a.presence==='home'||a.presence==='home_remote')return activityLabel(homeActivity(a));if(a.presence==='overtime')return'申请加班中';if(a.presence==='lunch')return'午休';return({working:'专注办公',deskIdle:'工位待命',blocked:'遇到阻塞',meeting:'正在讨论',phone:'看手机放松',orderFood:'正在点外卖',pickupFood:'去取外卖',eat:'正在用餐',water:'去喝水',tea:'去拿奶茶',pickupTea:'取奶茶',rest:'休息恢复',restroom:'去洗手间',walk:'返回工位'})[a.mode]||'工位待命'}
function updatePanel(a){if(!a)return;document.querySelector('#agentStatus').textContent=activityText(a);document.querySelector('#agentSocial').textContent=a.social_summary||'暂无';document.querySelector('#agentRelationship').textContent=a.relationship_summary?`关系网 · ${a.relationship_summary}`:'';const vals=[a.needs?.fatigue,a.needs?.hunger,a.needs?.thirst,a.needs?.mood],nodes=document.querySelectorAll('.need');nodes.forEach((node,i)=>{const val=Math.round(vals[i]??0),risk=i===3?val<35:val>70;node.classList.toggle('bad',risk);node.querySelector('i').style.width=val+'%';node.querySelector('b').textContent=val})}
function select(id,openSheet=true){selected=id;const a=agents[id];if(!a)return;if(chatMode==='private'){document.querySelector('#agentName').textContent=a.name;document.querySelector('#agentRole').textContent=a.role;document.querySelector('#agentTask').textContent=a.task;updatePanel(a)}document.querySelector('#message').disabled=false;document.querySelector('#send').disabled=false;if(openSheet&&innerWidth<=700)document.querySelector('aside').classList.remove('collapsed');renderChat()}
function setChatMode(mode){chatMode=mode;const panel=document.querySelector('aside');panel.classList.toggle('group-mode',mode==='group');document.querySelectorAll('.chat-modes button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));const input=document.querySelector('#message');if(mode==='group'){document.querySelector('#agentName').textContent='全员群聊';document.querySelector('#agentRole').textContent='阿默 · 小韩 · 小研 · 小文';document.querySelector('#agentStatus').textContent='团队频道';document.querySelector('#agentTask').textContent=state?.board?.name||'当前项目';input.placeholder='向全组发起讨论...';input.disabled=false;document.querySelector('#send').disabled=false}else{input.placeholder='给这位员工留言...';closeMentionMenu('desktop');if(selected)select(selected,false)}renderChat()}
canvas.addEventListener('click',e=>{if(editMode){e.preventDefault();return}const p=canvasPointFromClient(e.clientX,e.clientY),x=p.x,y=p.y;let hit=null,best=65;Object.values(agents).forEach(a=>{const d=Math.hypot(x-a.x,y-a.y);if(d<best){best=d;hit=a.id}});if(hit){if(isMobileView()&&document.body.classList.contains('show-office')){setChatMode('private');select(hit,false);const a=agents[hit];document.querySelector('#sceneTip').textContent=`${a.name.split(' ').slice(-1)[0]} · ${activityText(a)} · ${a.task||'暂无任务'}`;return}setChatMode('private');select(hit)}
  // Room navigation clicks (when in game/boss mode, or in office at restroom)
  if(currentRoom!=='office'){
    // In game room
    if(y>h*.28&&y<h*.66){
      if(x>w*.54){leaveRoom('canvas')}
      else{currentRoom='boss';updateRoomUI()}
    }
  }});

// Click on restroom door to enter game room
canvas.addEventListener('click',function(e2){
  if(currentRoom!=='office'||editMode)return;
  const p2=canvasPointFromClient(e2.clientX,e2.clientY),x2=p2.x,y2=p2.y;
  const w2=canvas.clientWidth,h2=canvas.clientHeight,glassY2=Math.max(132,h2*.22);
  const restroomX=w2*.79,restroomW=w2*.18,restroomY=12,restroomH=glassY2-24;
  if(x2>=restroomX&&x2<=restroomX+restroomW&&y2>=restroomY&&y2<=restroomY+restroomH){
    currentRoom='game';
    updateRoomUI();
    return;
  }

  // Microwave click detection (water bar area)
  const wbX=w2*.785,wbY=h2*.495;
  const mwX=wbX+152,mwY=wbY+20,mwW=32,mwH=36;
  if(x2>=mwX&&x2<=mwX+mwW&&y2>=mwY&&y2<=mwY+mwH){
    // Trigger microwave beep via audio context
    try{
      const ac=new(AudioContext||webkitAudioContext),o=ac.createOscillator(),g=ac.createGain();
      o.connect(g);g.connect(ac.destination);o.frequency.value=880;o.type='square';g.gain.setValueAtTime(.08,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.08);o.start();o.stop(ac.currentTime+.08);
      setTimeout(()=>{const o2=ac.createOscillator(),g2=ac.createGain();o2.connect(g2);g2.connect(ac.destination);o2.frequency.value=1200;o2.type='square';g2.gain.setValueAtTime(.12,ac.currentTime);g2.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.15);o2.start();o2.stop(ac.currentTime+.15)},80);
    }catch(e){}
    // Show popup feedback
    const popup=document.createElement('div');popup.className='microwave-popup';
    popup.innerHTML='<div class="mw-popup-bubble">微波炉呲了一声，弹出一片面包🍞</div>';
    popup.style.cssText=`position:fixed;left:${mwX+mwW/2}px;top:${mwY}px;transform:translate(-50%,-100%);pointer-events:none;font-size:13px;white-space:nowrap;z-index:999;transition:all 1.5s ease;z-index:999;opacity:1`;
    document.body.appendChild(popup);
    requestAnimationFrame(()=>{popup.style.opacity='0';popup.style.top=(Number(popup.style.top.replace('px',''))-60)+'px'});
    setTimeout(()=>popup.remove(),1600);
    return;
  }
  // Boss office entrance (desk area in center-right)
  const bossDeskX=w2*.75,bossDeskW=w2*.22;
  if(x2>=bossDeskX&&x2<=bossDeskX+bossDeskW&&y2>=h2*.72){
    currentRoom='boss';
    updateRoomUI();
    return;
  }
});
document.querySelectorAll('.chat-modes button').forEach(button=>button.addEventListener('click',()=>setChatMode(button.dataset.mode)));
document.querySelectorAll('.camera button').forEach(button=>button.addEventListener('click',()=>{
  cameraMode=button.dataset.camera;
  currentRoom=cameraMode==='boss'?'boss':'office';
  document.querySelectorAll('.camera button').forEach(b=>b.classList.toggle('active',b===button));
  updateRoomUI()
}));
document.querySelectorAll('.camera button').forEach(button=>button.classList.toggle('active',button.dataset.camera===cameraMode));
document.querySelectorAll('[data-home]').forEach(button=>button.addEventListener('click',()=>{homeView=button.dataset.home;selected=homeView;chatMode='private';if(agents[homeView])setChatMode('private');if(innerWidth<=700)document.querySelector('aside').classList.add('collapsed');document.querySelectorAll('[data-home]').forEach(b=>b.classList.toggle('active',b===button))}));
document.querySelectorAll('[data-home]').forEach(button=>button.classList.toggle('active',button.dataset.home===homeView));
document.querySelector('#sheetToggle').addEventListener('click',()=>{const panel=document.querySelector('aside'),closed=panel.classList.toggle('collapsed');document.querySelector('#sheetToggle').textContent=closed?'⌃':'⌄'});

