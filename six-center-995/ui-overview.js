/* 總覽頁（UI 改版第 2 步）。數字一律取自 OpsReport.overview（與匯總資料同一套計算），
 * 待處理清單只讀資料表，不寫入。缺資料顯示「資料不足」，不顯示 0。 */
(function(){
  'use strict';
  const E=id=>document.getElementById(id);
  const content=document.querySelector('#adminApp .ui-content');
  if(!content||!window.OpsReport?.overview)return;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=(v,d=0)=>v===null||v===undefined||Number.isNaN(v)?null:Number(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=v=>v===null||v===undefined?null:num(v*100,1)+'%';
  // 目標與分析儀表板一致（analysis-dashboard.js）
  const KPI=[
    {key:'tc',label:'TC',fmt:v=>num(v),target:s=>s.forecast,targetText:s=>s.forecast==null?'預估資料不足':'預估 '+num(s.forecast),ok:(v,s)=>s.forecast==null?null:v>=s.forecast},
    {key:'sstg',label:'SSTG',fmt:pct,targetText:()=>'目標 +4.2%',ok:v=>v>=0.042},
    {key:'d7',label:'D7',fmt:pct,targetText:()=>'目標 25%',ok:v=>v>=0.25},
    {key:'d25',label:'D25',fmt:pct,targetText:()=>'目標 70%',ok:v=>v>=0.70},
    {key:'faShare',label:'FA 佔比',fmt:pct,targetText:()=>'目標 ≤25%',ok:v=>v<=0.25},
    {key:'tplh',label:'TPLH',fmt:v=>num(v,2),targetText:()=>'目標 2.0',ok:v=>v>=2.0}
  ];
  const yesterday=()=>{const d=new Date(opsToday()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
  const shift=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
  let date=yesterday(),req=0;

  const page=document.createElement('section');page.id='uiOverviewPage';page.className='ui-overview';
  page.innerHTML='<div class="uo-head"><h1>今天有什麼要處理</h1><div class="uo-date"><button type="button" data-d="-1" aria-label="前一天">‹</button><b id="uoDate"></b><button type="button" data-d="1" aria-label="後一天">›</button><button type="button" data-d="0">昨天</button></div></div>'+
    '<div id="uoKpis" class="uo-kpis"></div>'+
    '<div class="uo-grid2"><article class="uo-card"><h2>等餐（依 AC）</h2><div id="uoWait"></div></article><article class="uo-card"><h2>劃線簽名（依 AC）</h2><div id="uoLine"></div></article></div>'+
    '<div class="uo-grid3"><article class="uo-card"><h2>待處理：未結案巡檢</h2><div id="uoInspect"></div></article><article class="uo-card"><h2>待處理：設備異常</h2><div id="uoDevice"></div></article><article class="uo-card"><h2>作業進度</h2><div id="uoProgress"></div></article></div>'+
    '<article class="uo-card uo-weather"><h2>天氣</h2><div id="uoWeather"></div></article><p id="uoStatus" class="uo-status" role="status"></p>';
  content.prepend(page);
  page.querySelector('.uo-date').addEventListener('click',e=>{const b=e.target.closest('[data-d]');if(!b)return;const d=+b.dataset.d;date=d===0?yesterday():shift(date,d);if(date>opsToday())date=opsToday();load();});

  const bar=(label,value,max,text,cls='')=>'<div class="uo-bar-row"><span>'+esc(label)+'</span><div class="uo-bar"><div class="'+cls+'" style="width:'+(max?Math.max(2,Math.round(value/max*100)):0)+'%"></div></div><b>'+esc(text)+'</b></div>';
  const empty=t=>'<p class="uo-empty">'+esc(t)+'</p>';
  const top3=(rows,metric,sub)=>rows.length?'<ol class="uo-top">'+rows.map(x=>'<li><b>'+esc(x.store_code+' '+(x.restaurant_name||''))+'</b><small>'+esc(sub(x))+'</small><em>'+esc(metric(x))+'</em></li>').join('')+'</ol>':'';

  function renderKpis(o){
    E('uoKpis').innerHTML=KPI.map(k=>{
      const v=o.hasScores||k.key==='tc'&&o.summary.tc?o.summary[k.key]:null,shown=v==null?null:k.fmt(v),ok=shown==null?null:k.ok(v,o.summary);
      const cls=shown==null?'na':ok===null?'':ok?'ok':'bad';
      return '<button type="button" class="uo-kpi '+cls+'" data-go="analysis"><span>'+k.label+'</span><b>'+(shown??'資料不足')+'</b><em>'+esc(k.targetText(o.summary))+'</em></button>';
    }).join('');
  }
  function waitHtml(o){
    const max=Math.max(0,...o.acWait.map(x=>x.count));
    return (o.acWait.length?o.acWait.map(x=>bar(x.name,x.count,max,x.count+' 筆'+(x.pending?'（待回覆 '+x.pending+'）':''),'red')).join(''):empty('沒有 AC 設定'))+
      '<h3>等餐最多的餐廳</h3>'+(top3(o.delayTop,x=>x.count+' 筆',x=>(x.ac?x.ac+'｜':'')+'待回覆 '+x.pending)||empty('這天沒有等餐紀錄'))+(o.delayTiedOthers?'<p class="uo-note">另有 '+o.delayTiedOthers+' 家同筆數並列</p>':'');
  }
  function renderWait(o){E('uoWait').innerHTML=waitHtml(o);}
  function lineHtml(o){
    const lineEmpty=o.lineRegistered===0?'尚無餐廳登記劃線簽名':'已登記的餐廳都完成';
    return (o.acLine.length?o.acLine.map(x=>bar(x.name,x.rate??0,1,x.rate===null?'尚未登記':(x.rate*100).toFixed(1)+'%'+(x.missing?'（待檢查 '+x.missing+'）':''),x.rate===null?'na':x.rate>=1?'ok':'warn')).join(''):empty('沒有 AC 設定'))+
      '<h3>缺漏最多的餐廳</h3>'+(top3(o.lineWorst,x=>(x.rate*100).toFixed(1)+'%',x=>(x.ac?x.ac+'｜':'')+'已登記 '+x.count+' 次')||empty(lineEmpty));
  }
  function renderLine(o){E('uoLine').innerHTML=lineHtml(o);}
  window.UiOverview={waitHtml,lineHtml};
  async function renderPending(){
    const [ins,insN,bat,rec]=await Promise.all([
      db.from('inspection_reports').select('id,reported_at,reporter_name,abnormal_items,vehicle_id,vehicles(plate4)').eq('resolution_status','pending').order('reported_at',{ascending:false}).limit(5),
      db.from('inspection_reports').select('id',{count:'exact',head:true}).eq('resolution_status','pending'),
      db.from('battery_issue_reports').select('id,battery_number,issue_description,reported_at').neq('resolution_status','resolved').order('reported_at',{ascending:false}).limit(5),
      db.from('recorder_issue_reports').select('id,recorder_number,issue_description,reported_at').neq('resolution_status','resolved').order('reported_at',{ascending:false}).limit(5)
    ]);
    const list=(rows,fn)=>'<ul class="uo-list">'+rows.map(fn).join('')+'</ul>';
    if(ins.error)E('uoInspect').innerHTML=empty('讀取失敗：'+ins.error.message);
    else E('uoInspect').innerHTML='<div class="uo-count"><b>'+(insN.count??ins.data.length)+'</b> 筆</div>'+(ins.data.length?list(ins.data,x=>'<li><b>'+esc(x.vehicles?.plate4||'車輛')+'</b> '+esc((x.abnormal_items||[]).join('、'))+'<small>'+esc(x.reporter_name||'')+'｜'+esc(fmt(x.reported_at))+'</small></li>'):empty('沒有未結案巡檢'))+'<button type="button" class="uo-more" data-go="vehicle">到車輛／巡檢 ›</button>';
    const dev=[...(bat.data||[]).map(x=>({n:'電池 '+x.battery_number,d:x.issue_description,t:x.reported_at})),...(rec.data||[]).map(x=>({n:'紀錄器 '+x.recorder_number,d:x.issue_description,t:x.reported_at}))].sort((a,b)=>String(b.t).localeCompare(String(a.t)));
    E('uoDevice').innerHTML=(bat.error||rec.error)?empty('讀取失敗：'+(bat.error||rec.error).message):'<div class="uo-count"><b>'+dev.length+(dev.length>=5?'+':'')+'</b> 件</div>'+(dev.length?list(dev.slice(0,5),x=>'<li><b>'+esc(x.n)+'</b> '+esc(x.d||'')+'<small>'+esc(fmt(x.t))+'</small></li>'):empty('沒有待處理設備異常'))+'<button type="button" class="uo-more" data-go="battery">到電池／紀錄器 ›</button>';
  }
  async function renderProgress(o){
    const monday=(()=>{const d=new Date(opsToday()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);})();
    const shiftN=await db.from('weekly_shift_availability').select('id',{count:'exact',head:true}).eq('week_start',monday).not('is_test','is',true);
    const item=(label,done,text)=>'<li><span>'+esc(label)+'</span><i class="'+(done?'done':'todo')+'">'+esc(text)+'</i></li>';
    E('uoProgress').innerHTML='<ul class="uo-progress">'+
      item('成績 BY ORDER',o.types.ByOrder,o.types.ByOrder?'已匯入':'未匯入')+item('成績 BY DATE',o.types.ByDate,o.types.ByDate?'已匯入':'未匯入')+
      item('劃線簽名登記',o.lineRegistered>=o.lineExpected,o.lineRegistered+' ／ '+o.lineExpected+' 店')+
      item('指休本週提交',(shiftN.count||0)>0,shiftN.error?'讀取失敗':(shiftN.count??0)+' 人')+'</ul>';
  }
  async function load(){
    const id=++req;E('uoDate').textContent=date;E('uoStatus').textContent='讀取中…';
    try{
      const o=await window.OpsReport.overview(date,'day');if(id!==req)return;
      renderKpis(o);renderWait(o);renderLine(o);
      E('uoWeather').innerHTML='<div class="uo-weather-row">'+o.weather.map(w=>'<div><b>'+esc(w.city)+'</b><span>'+esc(w.text)+'</span><small>'+esc(w.value)+'</small></div>').join('')+'</div>';
      await Promise.all([renderPending(),renderProgress(o)]);if(id===req)E('uoStatus').textContent='';
    }catch(e){if(id===req)E('uoStatus').textContent='讀取失敗：'+(e.message||e);}
  }
  page.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(!b)return;if(b.dataset.go==='analysis')location.href='analysis.html';else window.UiShell?.go(b.dataset.go);});

  // 只在總覽模式顯示；第一次顯示時載入
  let loaded=false;
  const original=window.showAdminMode;
  window.showAdminMode=showAdminMode=function(mode){original(mode);page.style.display=mode==='home'?'block':'none';if(mode==='home'&&!loaded&&E('adminApp').style.display==='block'){loaded=true;load();}};
  page.style.display='block';
  new MutationObserver(()=>{if(!loaded&&E('adminApp').style.display==='block'&&page.style.display!=='none'){loaded=true;load();}}).observe(E('adminApp'),{attributes:true,attributeFilter:['style']});
  if(E('adminApp').style.display==='block'){loaded=true;load();}
})();
