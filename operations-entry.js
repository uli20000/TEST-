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
    try{const [rows,stores]=await Promise.all([R.readRows('t995_line_signature_records','*',q=>q.eq('record_date',opsToday())),R.directory()]);if(request!==state.lineRequest)return;state.line=rows;state.stores=stores;renderLine();}catch(e){if(request===state.lineRequest){state.line=[];E('opsLineList').textContent='讀取失敗：'+e.message;}}
  }
  function renderLine(){
    const catalog=new Map(state.stores.map(x=>[x.store_code,x]));for(const row of state.line)if(!catalog.has(row.store_code))catalog.set(row.store_code,{store_code:row.store_code,restaurant_name:row.restaurant_name});
    const rows=[...catalog.values()].map(store=>({store,row:state.line.find(x=>x.store_code===store.store_code)||null}));
    rows.sort((a,b)=>{const level=x=>!x.row?0:(!x.row.line_completed||!x.row.signature_completed?1:2);return level(a)-level(b)||a.store.store_code.localeCompare(b.store.store_code);});
    E('opsLineList').innerHTML=rows.length?'<table class="ops-table ops-records-table ops-line-records"><thead><tr><th>日期</th><th>店號／餐廳</th><th>劃線</th><th>簽名</th><th>操作</th></tr></thead><tbody>'+rows.map(({store,row})=>'<tr><td data-label="日期">'+(row?row.record_date:'未紀錄')+'</td><td data-label="店號／餐廳">'+escape(store.store_code)+'／'+escape(store.restaurant_name)+'</td><td data-label="劃線">'+(row?.line_completed?'完成':'未完成')+'</td><td data-label="簽名">'+(row?.signature_completed?'完成':'未完成')+'</td><td data-label="操作">'+(row?'<button type="button" class="ops-delete-btn" data-delete-line="'+row.id+'" aria-label="刪除 '+escape(store.restaurant_name)+' 劃線簽名紀錄">刪除</button>':'—')+'</td></tr>').join('')+'</tbody></table>':'<div class="ops-empty">沒有餐廳資料</div>';
    const pending=rows.filter(({row})=>!row?.line_completed||!row?.signature_completed);
    E('opsLineIncomplete').innerHTML=pending.length?'<table class="ops-table"><thead><tr><th>店號／餐廳</th><th>劃線</th><th>簽名</th></tr></thead><tbody>'+pending.map(({store,row})=>'<tr><td>'+escape(store.store_code)+'／'+escape(store.restaurant_name)+'</td><td>'+(row?.line_completed?'完成':'未完成')+'</td><td>'+(row?.signature_completed?'完成':'未完成')+'</td></tr>').join('')+'</tbody></table>':'<div class="ops-empty">當日全部完成</div>';
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
    try{const restaurant=await window.opsFindRestaurant('opsLineStore');if(!restaurant)throw new Error('請選擇正確的店號');const result=await db.from('t995_line_signature_records').upsert({record_date:date,store_code:restaurant.store_code,restaurant_name:restaurant.restaurant_name,status:marked&&signed?'completed':'not_completed',line_completed:marked,signature_completed:signed,updated_at:new Date().toISOString()},{onConflict:'record_date,store_code'});if(result.error)throw result.error;await loadLine();msg.textContent='已新增';}catch(e){msg.textContent='新增失敗：'+e.message;}finally{E('opsLineSave').disabled=false;}
  };
  E('opsMonthFilter').value=opsToday().slice(0,7);rangeOptions();
  E('opsMonthFilter').onchange=()=>{if(!E('opsMonthFilter').value)E('opsMonthFilter').value=opsToday().slice(0,7);rangeOptions('month');loadDelay();};E('opsDelayRange').onchange=loadDelay;E('opsDelaySearch').oninput=renderDelay;
  E('opsLinkCreate').onclick=async()=>{const msg=E('opsLinkMessage');E('opsLinkCreate').disabled=true;try{const r=await db.rpc('t995_issue_shared_reply_link');if(r.error)throw r.error;const url=new URL('reply.html',location.href);url.searchParams.set('token',r.data);E('opsLinkUrl').value=url.href;E('opsLinkResult').hidden=false;msg.textContent='共用連結已產生';}catch(e){msg.textContent='產生失敗：'+e.message;}finally{E('opsLinkCreate').disabled=false;}};
  E('opsLinkCopy').onclick=async()=>{try{await navigator.clipboard.writeText(E('opsLinkUrl').value);E('opsLinkMessage').textContent='已複製連結';}catch{E('opsLinkUrl').select();document.execCommand('copy');E('opsLinkMessage').textContent='已複製連結';}};
  function openTab(name){
    state.active=name;document.querySelectorAll('.ops-tab').forEach(b=>b.classList.toggle('active',b.dataset.opsTab===name));
    for(const [tab,id] of Object.entries({delay:'opsDelayPanel',line:'opsLinePanel',scores:'opsScoresPanel',summary:'opsSummaryPanel',feedback:'opsFeedbackPanel'}))E(id).hidden=tab!==name;
    if(name==='delay')loadDelay();else if(name==='line')loadLine();else R.open(name).catch(()=>{});
  }
  document.querySelectorAll('.ops-tab').forEach(b=>b.onclick=()=>openTab(b.dataset.opsTab));
  const original=showAdminMode;showAdminMode=function(mode){original(mode);E('opsModePage').style.display=mode==='ops'?'block':'none';if(mode==='ops')openTab(state.active);};
  E('opsModeBtn').onclick=()=>showAdminMode('ops');E('opsBackBtn').onclick=()=>showAdminMode('home');
})();
