(function(){
  'use strict';
  const E=id=>document.getElementById(id),S=window.OpsSummary,R=window.OpsReport,escape=opsEscape;
  const state={delay:[],line:[],stores:[],delayRequest:0,lineRequest:0,active:'delay'};
  function rangeOptions(value='today'){
    const month=E('opsMonthFilter').value||opsToday().slice(0,7),today=month===opsToday().slice(0,7);
    E('opsDelayRange').innerHTML=(today?'<option value="today">當日</option>':'')+'<option value="month">整月</option>'+S.monthWeeks(month+'-01').map(w=>'<option value="'+w.start+'">'+w.label+' '+w.start.slice(5).replace('-','/')+'–'+w.end.slice(5).replace('-','/')+'</option>').join('');
    E('opsDelayRange').value=value==='today'&&!today?'month':value;if(!E('opsDelayRange').value)E('opsDelayRange').value='month';
  }
  function delayRange(){const selected=E('opsDelayRange').value;return selected==='today'?S.range(opsToday(),'day'):selected==='month'?S.range(E('opsMonthFilter').value+'-01','month'):S.range(selected,'week');}
  async function loadDelay(){
    const request=++state.delayRequest,r=delayRange();E('opsDelayList').innerHTML='<div class="ops-empty">讀取中…</div>';
    try{const rows=await R.readRows('t995_delay_orders','*',q=>q.gte('record_date',r.start).lte('record_date',r.end));if(request!==state.delayRequest)return;state.delay=rows.sort((a,b)=>b.record_date.localeCompare(a.record_date)||b.created_at.localeCompare(a.created_at));renderDelay();}catch(e){if(request===state.delayRequest){state.delay=[];E('opsDelayList').textContent='讀取失敗：'+e.message;}}
  }
  function renderDelay(){
    const r=delayRange(),search=E('opsDelaySearch').value.trim().toLowerCase(),rows=state.delay.filter(x=>!search||[x.store_code,x.restaurant_name].some(v=>String(v).toLowerCase().includes(search)));
    E('opsDelayListTitle').textContent=E('opsDelayRange').value==='today'?'當日紀錄　'+opsToday():(E('opsDelayRange').value==='month'?'整月紀錄　':S.weekLabel(r.start)+'　')+r.start+' ～ '+r.end;
    E('opsDelayList').innerHTML=rows.length?'<table class="ops-table ops-records-table"><thead><tr><th>日期</th><th>店號／餐廳</th><th>編號</th><th>狀態</th><th>等餐原因</th><th>操作</th></tr></thead><tbody>'+rows.map(x=>'<tr><td data-label="日期">'+x.record_date+'</td><td data-label="店號／餐廳">'+escape(x.store_code)+'／'+escape(x.restaurant_name)+'</td><td data-label="編號">'+escape(x.order_number)+'</td><td data-label="狀態">'+(x.status==='completed'?'已回覆':'待回覆')+'</td><td data-label="等餐原因">'+escape(x.reason||'—')+'</td><td data-label="操作"><button type="button" class="ops-delete-btn" data-delete-delay="'+x.id+'" aria-label="刪除 '+escape(x.restaurant_name)+' 訂單 '+escape(x.order_number)+'">刪除</button></td></tr>').join('')+'</tbody></table>':'<div class="ops-empty">沒有符合條件的紀錄</div>';
  }
  async function loadLine(){
    const request=++state.lineRequest;E('opsLineList').innerHTML='<div class="ops-empty">讀取中…</div>';
    const date=E('opsLineDate').value||opsToday();
    try{const [rows,stores]=await Promise.all([R.readRows('t995_line_signature_records','id,record_date,store_code,restaurant_name,line_completed,signature_completed',q=>q.eq('record_date',date)),R.directory()]);if(request!==state.lineRequest)return;state.line=rows;state.stores=stores;renderLine();}catch(e){if(request===state.lineRequest){state.line=[];E('opsLineList').textContent='讀取失敗：'+e.message;}}
  }
  function renderLine(){
    const selectedDate=E('opsLineDate').value||opsToday(),search=E('opsLineSearch').value.trim().toLocaleLowerCase('zh-Hant'),nonDelivery=window.OpsMetrics.NON_DELIVERY_STORES,acAssignments=window.OpsMetrics.AC_ASSIGNMENTS;
    const catalog=new Map(state.stores.filter(x=>!nonDelivery.has(String(x.store_code))).map(x=>[String(x.store_code),x]));for(const row of state.line)if(!catalog.has(String(row.store_code))&&!nonDelivery.has(String(row.store_code)))catalog.set(String(row.store_code),{store_code:String(row.store_code),restaurant_name:row.restaurant_name});
    const recordByStore=new Map(state.line.map(x=>[String(x.store_code),x]));
    const rows=[...catalog.values()].map(store=>({store,row:recordByStore.get(String(store.store_code))||null}));
    rows.sort((a,b)=>{const level=x=>!x.row?0:(!x.row.line_completed||!x.row.signature_completed?1:2);return level(a)-level(b)||a.store.store_code.localeCompare(b.store.store_code);});
    const inspected=rows.filter(x=>x.row).length,pending=rows.length-inspected;
    E('opsLineStats').innerHTML='<div class="ops-line-stat"><span>需檢查</span><strong>'+rows.length+'</strong></div><div class="ops-line-stat"><span>已檢查</span><strong>'+inspected+'</strong></div><div class="ops-line-stat"><span>待檢查</span><strong>'+pending+'</strong></div>';
    const registered=new Map(rows.filter(x=>x.row).map(x=>[String(x.store.store_code),x]));
    const acRows=acAssignments.map(ac=>{const stores=ac.stores.filter(code=>!nonDelivery.has(code)&&registered.has(code)).map(code=>registered.get(code)),checks=stores.reduce((sum,x)=>sum+Number(!!x.row.line_completed)+Number(!!x.row.signature_completed),0),rate=stores.length?checks/(stores.length*2):null;return {name:ac.name,stores,checked:stores.length,checks,rate};}).sort((a,b)=>(a.rate??Infinity)-(b.rate??Infinity)||a.name.localeCompare(b.name));
    E('opsLineAcAnalysis').innerHTML='<h3>AC 達成率｜低至高</h3><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>排名</th><th>AC</th><th>已登記餐廳</th><th>達成率</th></tr></thead><tbody>'+acRows.map((x,i)=>'<tr><td>'+(x.rate===null?'—':i+1)+'</td><td>'+x.name+'</td><td>'+x.checked+'</td><td>'+(x.rate===null?'—':(x.rate*100).toFixed(1)+'%')+'</td></tr>').join('')+'</tbody></table></div>';
    const worst=rows.filter(x=>x.row).map(x=>({store:x.store,score:(Number(!!x.row.line_completed)+Number(!!x.row.signature_completed))/2,line:!!x.row.line_completed,signature:!!x.row.signature_completed})).sort((a,b)=>a.score-b.score||String(a.store.store_code).localeCompare(String(b.store.store_code))).slice(0,3);
    E('opsLineWorstStores').innerHTML='<h3>前三差餐廳</h3>'+(worst.length?'<ol class="ops-line-worst-list">'+worst.map(x=>'<li><strong>'+escape(x.store.store_code)+'／'+escape(x.store.restaurant_name)+'</strong><span>'+(x.line?'劃線完成':'劃線未完成')+' · '+(x.signature?'簽名完成':'簽名未完成')+' · '+(x.score*100).toFixed(0)+'%</span></li>').join('')+'</ol>':'<div class="ops-empty">本日尚無已登記餐廳</div>');
    const visible=rows.filter(({store})=>!search||[store.store_code,store.restaurant_name].some(v=>String(v).toLocaleLowerCase('zh-Hant').includes(search)));
    E('opsLineListTitle').textContent='餐廳狀態　'+selectedDate;
    E('opsLineList').innerHTML=visible.length?'<table class="ops-table ops-records-table ops-line-records"><thead><tr><th>店號／餐廳</th><th>檢查狀態</th><th>劃線</th><th>簽名</th><th>操作</th></tr></thead><tbody>'+visible.map(({store,row})=>'<tr><td data-label="店號／餐廳">'+escape(store.store_code)+'／'+escape(store.restaurant_name)+'</td><td data-label="檢查狀態">'+(row?'已檢查':'待檢查')+'</td><td data-label="劃線">'+(row?.line_completed?'完成':'未完成')+'</td><td data-label="簽名">'+(row?.signature_completed?'完成':'未完成')+'</td><td data-label="操作">'+(row?'<button type="button" class="ops-delete-btn" data-delete-line="'+row.id+'" aria-label="刪除 '+escape(store.restaurant_name)+' 劃線簽名紀錄">刪除</button>':'—')+'</td></tr>').join('')+'</tbody></table>':'<div class="ops-empty">沒有符合餐廳的資料</div>';
  }
  async function removeRecord(kind,id,button){
    const row=state[kind].find(x=>x.id===id);if(!row)return;
    const description=kind==='delay'?row.restaurant_name+' 訂單 '+row.order_number:row.restaurant_name+' 劃線簽名紀錄';
    if(!confirm('確定刪除 '+row.record_date+' '+description+'？'))return;
    const message=E(kind==='delay'?'opsDelayMessage':'opsLineMessage');button.disabled=true;
    try{
      const table=kind==='delay'?'t995_delay_orders':'t995_line_signature_records',result=await db.from(table).delete().eq('id',id).eq('record_date',row.record_date).select('id');if(result.error)throw result.error;if(!result.data?.length)throw new Error('紀錄已不存在或沒有刪除權限');
      message.textContent='已刪除';if(kind==='delay')await loadDelay();else{await loadLine();if(E('opsLineStore').value===row.store_code)await R.fillLineState(row.store_code);}
    }catch(e){message.textContent='刪除失敗：'+e.message;button.disabled=false;}
  }
  E('opsDelayList').onclick=e=>{const b=e.target.closest('[data-delete-delay]');if(b)removeRecord('delay',b.dataset.deleteDelay,b);};
  E('opsLineList').onclick=e=>{const b=e.target.closest('[data-delete-line]');if(b)removeRecord('line',b.dataset.deleteLine,b);};
  E('opsDelaySave').onclick=async()=>{
    const date=opsToday(),order=E('opsDelayOrder').value.trim(),msg=E('opsDelayMessage');if(!/^[0-9]{4}$/.test(order)){msg.textContent='請輸入 4 碼訂單編號';return;}
    E('opsDelaySave').disabled=true;msg.textContent='儲存中…';
    try{const restaurant=await window.opsFindRestaurant('opsDelayStore');if(!restaurant)throw new Error('請選擇正確的店號');const result=await db.from('t995_delay_orders').insert({record_date:date,store_code:restaurant.store_code,restaurant_name:restaurant.restaurant_name,order_number:order,status:'pending'});if(result.error)throw result.error;
      E('opsDelayOrder').value='';E('opsMonthFilter').value=date.slice(0,7);E('opsDelaySearch').value='';rangeOptions('today');await loadDelay();msg.textContent='已新增';E('opsDelayOrder').focus();
    }catch(e){msg.textContent=e.code==='23505'?'同日、同餐廳的訂單編號已存在':'新增失敗：'+e.message;}finally{E('opsDelaySave').disabled=false;}
  };
  for(const id of ['opsLineMark','opsSignMark'])E(id).onclick=()=>opsSetToggle(id,E(id).getAttribute('aria-pressed')!=='true');
  E('opsLineSave').onclick=async()=>{
    const date=opsToday(),msg=E('opsLineMessage'),marked=E('opsLineMark').getAttribute('aria-pressed')==='true',signed=E('opsSignMark').getAttribute('aria-pressed')==='true';
    if(!marked&&!signed){msg.textContent='請選擇劃線或簽名';return;}E('opsLineSave').disabled=true;msg.textContent='儲存中…';
    try{const restaurant=await window.opsFindRestaurant('opsLineStore');if(!restaurant)throw new Error('請選擇正確的店號');const result=await db.from('t995_line_signature_records').upsert({record_date:date,store_code:restaurant.store_code,restaurant_name:restaurant.restaurant_name,status:marked&&signed?'completed':'not_completed',line_completed:marked,signature_completed:signed,updated_at:new Date().toISOString()},{onConflict:'record_date,store_code'});if(result.error)throw result.error;E('opsLineDate').value=date;await loadLine();msg.textContent='已新增';}catch(e){msg.textContent='新增失敗：'+e.message;}finally{E('opsLineSave').disabled=false;}
  };
  E('opsLineDate').value=opsToday();E('opsMonthFilter').value=opsToday().slice(0,7);rangeOptions();
  E('opsMonthFilter').onchange=()=>{if(!E('opsMonthFilter').value)E('opsMonthFilter').value=opsToday().slice(0,7);rangeOptions('month');loadDelay();};E('opsDelayRange').onchange=loadDelay;E('opsDelaySearch').oninput=renderDelay;
  E('opsLineDate').onchange=()=>loadLine();E('opsLineSearch').oninput=renderLine;
  E('opsLinkCreate').onclick=async()=>{const msg=E('opsLinkMessage');E('opsLinkCreate').disabled=true;try{const r=await db.rpc('t995_issue_shared_reply_link');if(r.error)throw r.error;const url=new URL('reply.html',location.href);url.searchParams.set('token',r.data);E('opsLinkUrl').value=url.href;E('opsLinkResult').hidden=false;msg.textContent='共用連結已產生';}catch(e){msg.textContent='產生失敗：'+e.message;}finally{E('opsLinkCreate').disabled=false;}};
  E('opsLinkCopy').onclick=async()=>{try{await navigator.clipboard.writeText(E('opsLinkUrl').value);E('opsLinkMessage').textContent='已複製連結';}catch{E('opsLinkUrl').select();document.execCommand('copy');E('opsLinkMessage').textContent='已複製連結';}};
  function openTab(name){
    state.active=name;document.querySelectorAll('.ops-tab').forEach(b=>b.classList.toggle('active',b.dataset.opsTab===name));
    for(const [tab,id] of Object.entries({delay:'opsDelayPanel',line:'opsLinePanel',scores:'opsScoresPanel',summary:'opsSummaryPanel'}))E(id).hidden=tab!==name;
    if(name==='delay')loadDelay();else if(name==='line')loadLine();else R.open(name).catch(()=>{});
  }
  document.querySelectorAll('.ops-tab').forEach(b=>b.onclick=()=>openTab(b.dataset.opsTab));
  const original=showAdminMode;showAdminMode=function(mode){original(mode);E('opsModePage').style.display=mode==='ops'?'block':'none';if(mode==='ops')openTab(state.active);};
  E('opsModeBtn').onclick=()=>showAdminMode('ops');E('opsBackBtn').onclick=()=>showAdminMode('home');
})();
