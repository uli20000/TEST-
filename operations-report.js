(function(){
  'use strict';
  const M=window.OpsMetrics,S=window.OpsSummary,E=id=>document.getElementById(id),escape=opsEscape,labels=new Map(M.AREAS);
  const state={context:'scores',period:'day',summaryPeriod:'day',cache:null,monthCache:new Map(),monthLoads:new Map(),request:0,saveQueue:Promise.resolve(),saveError:null,stores:[],catalog:new Map(),weather:new Map(),weatherLoads:new Map(),weatherError:new Map(),records:{delay:[],line:[]}};
  const fmt=(v,d=0)=>v===null||v===undefined?'—':Number(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=v=>v===null||v===undefined?'—':fmt(v*100,1)+'%';
  const time=v=>v===null||v===undefined?'—':Math.floor(Math.round(v)/60)+'分'+String(Math.round(v)%60).padStart(2,'0')+'秒';
  const selectedDate=()=>E(state.context==='summary'?'opsSummaryDate':'opsAnalysisDate').value||opsToday();
  const period=()=>state.context==='summary'?state.summaryPeriod:state.period;
  const notify=(message,context=state.context)=>{E(context==='summary'?'opsSummaryStatus':'opsReportStatus').textContent=message;};
  const error=e=>notify(e.message||String(e));
  async function paged(table,columns,filter,order='record_date'){
    const rows=[];for(let offset=0;;offset+=1000){let q=filter(db.from(table).select(columns));if(order)q=q.order(order);q=table==='t995_score_import_rows'?q.order('row_number'):q.order('id');const r=await q.range(offset,offset+999);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<1000)return rows;}
  }
  async function loadDirectory(){
    if(state.stores.length)return state.stores;
    const result=await db.from('t995_restaurants').select('store_code,restaurant_name').eq('enabled',true).order('store_code');if(result.error)throw result.error;
    state.stores=result.data||[];state.catalog=new Map(state.stores.map(s=>[s.store_code,s]));return state.stores;
  }
  async function loadMonth(date,force=false){
    const month=date.slice(0,7);if(state.monthLoads.has(month))return state.monthLoads.get(month);if(!force&&state.monthCache.has(month))return state.monthCache.get(month);
    const work=(async()=>{
      await loadDirectory();const r=S.range(date,'month');
      const [batchRows,reportResult,reference]=await Promise.all([
        paged('t995_score_import_batches','*',q=>q.gte('report_date',r.start).lte('report_date',r.end),'report_date'),
        db.from('t995_operations_daily_reports').select('*').gte('record_date',r.start).lte('record_date',r.end).order('record_date'),
        db.rpc('t995_get_operations_reference',{p_month:r.start})
      ]);
      if(reportResult.error)throw reportResult.error;if(reference.error)throw reference.error;
      const batches=M.latestBatches(batchRows),ids=batches.map(b=>b.id),rows=ids.length?await paged('t995_score_import_rows','batch_id,row_number,store_code,restaurant_name,order_number,payload',q=>q.in('batch_id',ids),'batch_id'):[];
      return {rows,batches,reports:reportResult.data||[],history:reference.data?.history||[],mapping:reference.data?.mapping||[]};
    })();state.monthLoads.set(month,work);
    try{const data=await work;state.monthCache.set(month,data);return data;}finally{state.monthLoads.delete(month);}
  }
  async function loadRange(r,force=false){
    const parts=await Promise.all(S.months(r.start,r.end).map(d=>loadMonth(d,force))),data={};
    for(const key of ['rows','batches','reports','history','mapping'])data[key]=parts.flatMap(p=>p[key]);return data;
  }
  function model(date,p,data=state.cache){return M.build({...data,mapping:new Map(data.mapping.map(x=>[M.clean(x.restaurant_name),x.area_code])),catalog:state.catalog,...S.range(date,p)});}
  function metricsRows(s){return [
    ['去年單數',s.forecast===null?null:s.prior,'單'],['預估單數',s.forecast,'單'],['實際總單數',s.tc,'單'],['SSTG%',s.sstg,'%'],['TC預估達成率',s.tcAchievement,'%'],['實際工時',s.actualHours,'hrs'],['TPLH（扣FA）',s.tplh,''],['第三方佔比',s.faShare,'%'],['D7達成率',s.d7,'%'],['D25達成率',s.d25,'%'],
    ['FA單數',s.fa,'單'],['預估工時',s.forecastHours,'hrs'],['SSTG%（扣FA）',s.sstgExFA,'%'],['預估工時達成率',s.hoursAchievement,'%'],['QT',s.qt,'分'],['平均留店時間',s.d7Avg,'秒'],['平均送達時間',s.d25Avg,'秒']
  ];}
  function formattedMetric(key,value,unit){return unit==='%'?pct(value):unit==='秒'?time(value):fmt(value,['hrs','分',''].includes(unit)?2:0);}
  function renderMetrics(v){
    const hasScores=[...v.days.values()].some(d=>d.types.has('ByOrder')),actual=new Set(['實際總單數','SSTG%','TC預估達成率','TPLH（扣FA）','第三方佔比','D7達成率','D25達成率','FA單數','SSTG%（扣FA）','QT','平均留店時間','平均送達時間']);
    const cards=metricsRows(v.summary).map(([k,value,unit])=>'<article class="ops-kpi-card"><h4>'+k+'</h4><strong>'+(!hasScores&&actual.has(k)?'—':formattedMetric(k,value,unit))+'</strong>'+(['單','hrs','分'].includes(unit)?'<span>'+unit+'</span>':'')+'</article>');
    E('opsSummaryMetrics').innerHTML='<div class="ops-kpi-cards">'+cards.slice(0,10).join('')+'</div><details class="ops-secondary"><summary>其他指標</summary><div class="ops-kpi-cards ops-secondary-cards">'+cards.slice(10).join('')+'</div></details>';
  }
  function warnings(v,isDay,date){
    const messages=[];if(v.missingPairs.length)messages.push('尚缺另一份成績檔：'+v.missingPairs.map(x=>x.slice(5)).join('、'));
    if(v.missingHourDays.length)messages.push(isDay?'尚有 '+v.days.get(date).missingAreas+' 區未填工時':'尚有 '+v.missingHourDays.length+' 天工時未填完整');
    if(v.hoursWithoutScores.length)messages.push('有工時但尚無成績：'+v.hoursWithoutScores.map(x=>x.slice(5)).join('、'));
    if(v.invalidHourDays.length)messages.push('調出工時超過可用工時：'+v.invalidHourDays.map(x=>x.slice(5)).join('、'));
    if(v.missingBaselineDays.length)messages.push('去年 TC 缺少資料：'+v.missingBaselineDays.map(x=>x.slice(5)).join('、'));
    if(v.areas.has('?'))messages.push('有餐廳尚未設定區域');return messages;
  }
  function periodTitle(date,p){const r=S.range(date,p);return p==='day'?date:(p==='week'?S.weekLabel(date)+'　':'')+r.start+' ～ '+r.end;}
  function renderWeeks(date){
    const selected=S.range(date,'week');E('opsWeekTabs').innerHTML=S.monthWeeks(date).map(w=>'<button type="button" class="ops-week-tab '+(state.period==='week'&&w.start===selected.start?'active':'')+'" data-week-date="'+w.anchor+'">'+w.label+'<span>'+w.start.slice(5).replace('-','/')+'–'+w.end.slice(5).replace('-','/')+'</span></button>').join('');
    E('opsWeekTabs').querySelectorAll('[data-week-date]').forEach(b=>b.onclick=()=>{E('opsAnalysisDate').value=b.dataset.weekDate;state.period='week';refresh().catch(error);});
  }
  function valueInput(area,date,value){return '<input class="ops-area-hour" type="number" min="0" max="9999" step="0.25" inputmode="decimal" data-area="'+area+'" data-date="'+date+'" value="'+(value===null?'':value)+'" aria-label="'+escape(labels.get(area))+'總工時">';}
  function renderScores(date,v){
    const day=v.days.get(date),isDay=state.period==='day',s=v.summary,hasScores=[...v.days.values()].some(d=>d.types.has('ByOrder'));
    E('opsPeriodLabel').textContent='區域成績　'+periodTitle(date,state.period);
    E('opsPeriodTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.period===state.period));renderWeeks(date);
    E('opsFileStatus').innerHTML=['ByDate','ByOrder'].map(type=>{const b=state.cache.batches.find(x=>x.report_date===date&&x.report_type===type);return '<div class="ops-file-card '+(b?'ready':'')+'"><b>'+type+'</b><span>'+date+'</span><strong>'+(b?'已匯入 '+fmt(b.row_count)+' 筆':'尚未匯入')+'</strong></div>';}).join('');
    const areaRows=[...M.AREAS,...(v.areas.has('?')?[['?','未分類']]:[])];
    const cells=x=>'<td data-label="TC">'+(hasScores?fmt(x.tc):'—')+'</td><td data-label="FA">'+(hasScores?fmt(x.fa):'—')+'</td><td data-label="第三方佔比">'+pct(x.faShare)+'</td><td data-label="D7">'+pct(x.d7)+'</td><td data-label="D25">'+pct(x.d25)+'</td>';
    E('opsAnalysisTable').innerHTML='<table class="ops-area-table"><thead><tr><th>區域</th><th>TC</th><th>FA</th><th>第三方佔比</th><th>D7</th><th>D25</th><th>總工時</th></tr></thead><tbody>'+areaRows.map(([a,label])=>{const hours=isDay?M.number(day?.report?.area_hours?.[a]):v.hourTotals.get(a)?.count?v.hourTotals.get(a).hours:null;return '<tr><th>'+label+'</th>'+cells(v.areas.get(a))+'<td data-label="總工時">'+(isDay&&a!=='?'?valueInput(a,date,hours):fmt(hours,2))+'</td></tr>';}).join('')+'</tbody><tfoot><tr><th>合計</th>'+cells(s)+'<td data-label="總工時">'+fmt(s.totalHours,2)+'</td></tr></tfoot></table>';
    const report=day?.report;
    E('opsLaborAdjustments').innerHTML='<div class="ops-labor-grid"><label>合計總工時<output>'+fmt(s.totalHours,2)+'</output></label><label>調出工時'+(isDay?'<input id="opsTransferOut" type="number" min="0" max="9999" step="0.25" inputmode="decimal" value="'+(report?.transfer_out_hours??0)+'">':'<output>'+fmt(s.transferOut,2)+'</output>')+'</label><label>調入工時'+(isDay?'<input id="opsTransferIn" type="number" min="0" max="9999" step="0.25" inputmode="decimal" value="'+(report?.transfer_in_hours??0)+'">':'<output>'+fmt(s.transferIn,2)+'</output>')+'</label><label>實際工時<output>'+fmt(s.actualHours,2)+'</output></label></div>';
    bindHours();renderMonthHours(date);renderDayList(S.range(date,state.period));
  }
  function renderRank(target,result,key,details,empty){
    E(target).innerHTML=result.top.length?'<ol class="ops-rank-list">'+result.top.map(x=>'<li><span class="ops-rank-number">'+x.rank+'</span><div><strong>'+escape(x.store_code)+' '+escape(x.restaurant_name)+'</strong><span>'+details(x)+'</span></div><b>'+x[key]+(key==='count'?' 筆':' 項')+'</b></li>').join('')+'</ol>'+(result.tiedOthers?'<p class="ops-tie-note">同分另 '+result.tiedOthers+' 間；同分依店號排列</p>':''):'<div class="ops-empty">'+empty+'</div>';
  }
  function renderSummaryWeeks(date){
    let container=E('opsSummaryWeekTabs');
    if(!container){container=document.createElement('div');container.id='opsSummaryWeekTabs';container.className='ops-week-tabs';E('opsSummaryPeriodTabs').parentElement.after(container);}
    const selected=S.range(date,'week');
    container.innerHTML=S.monthWeeks(date).map(w=>'<button type="button" class="ops-week-tab '+(state.summaryPeriod==='week'&&w.start===selected.start?'active':'')+'" data-summary-week-date="'+w.anchor+'">'+w.label+'<span>'+w.start.slice(5).replace('-','/')+'–'+w.end.slice(5).replace('-','/')+'</span></button>').join('');
    container.querySelectorAll('[data-summary-week-date]').forEach(b=>b.onclick=()=>{E('opsSummaryDate').value=b.dataset.summaryWeekDate;state.summaryPeriod='week';refresh().catch(error);});
  }
  function renderSummary(date,v){
    const p=state.summaryPeriod,r=S.range(date,p),prefix=p==='day'?'本日':p==='week'?'本週':'本月',n=[...v.days.values()].filter(d=>d.types.has('ByOrder')).length,total=S.dates(r.start,r.end<opsToday()?r.end:opsToday()).length;
    E('opsSummaryTitle').textContent='營運總覽　'+periodTitle(date,p)+(p!=='day'?'（成績 '+n+'/'+total+' 日）':'');
    E('opsSummaryPeriodTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.period===p));renderSummaryWeeks(date);renderMetrics(v);
    E('opsDelayRankTitle').textContent=prefix+'等餐最多餐廳｜前三名';E('opsLineRankTitle').textContent=prefix+'劃線簽名未完成最多｜前三名';
    renderRank('opsDelayRank',S.delayRanking(state.records.delay,r.start,r.end),'count',x=>'待回覆 '+x.pending+' 筆','本期沒有等餐紀錄');
    renderRank('opsLineRank',S.lineRanking(state.stores,state.records.line,r.start,r.end,opsToday()),'missing',x=>'劃線缺 '+x.missingLine+'／簽名缺 '+x.missingSignature,'本期沒有未完成項目');
    E('opsLineRank').insertAdjacentHTML('beforeend','<p class="ops-ranking-basis">每日劃線、簽名各計 1 項；排除桃園新屋</p>');
  }
  function render(){
    if(!state.cache)return;const d=selectedDate(),p=period(),v=model(d,p),messages=warnings(v,p==='day',d),target=E(state.context==='summary'?'opsSummaryWarnings':'opsReportWarnings');target.textContent=messages.join('；');target.hidden=!messages.length;
    if(state.context==='summary')renderSummary(d,v);else renderScores(d,v);renderWeather();
  }
  function monthHourRows(date,data=state.cache){
    const v=model(date,'month',data),rows=[['日期',...M.AREAS.map(([,n])=>n+'工時'),'合計總工時','調出工時','調入工時','實際工時']];
    for(const d of v.days.values())rows.push([d.date,...M.AREAS.map(([a])=>M.number(d.report?.area_hours?.[a])),d.hours,d.report?Number(d.report.transfer_out_hours):null,d.report?Number(d.report.transfer_in_hours):null,d.actualHours]);
    rows.push(['月合計',...M.AREAS.map(([a])=>v.hourTotals.get(a).count?v.hourTotals.get(a).hours:null),v.summary.totalHours,v.summary.transferOut,v.summary.transferIn,v.summary.actualHours]);return rows;
  }
  function renderMonthHours(date){const rows=monthHourRows(date);E('opsMonthHours').innerHTML='<h3>'+date.slice(0,7)+' 各區工時</h3><div class="ops-table-wrap"><table class="ops-month-hours"><thead><tr>'+rows[0].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(1).map(row=>'<tr><th>'+row[0]+'</th>'+row.slice(1).map(x=>'<td>'+fmt(x,2)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
  function renderDayList(r){
    const rows=S.dates(r.start,r.end).filter(date=>date<=opsToday()).map(date=>{const v=model(date,'day'),d=v.days.get(date),s=v.summary,active=d.types.has('ByOrder');return '<tr><th><button type="button" data-report-date="'+date+'">'+date.slice(5).replace('-','/')+'</button></th><td>'+(active?fmt(s.tc):'—')+'</td><td>'+(active?pct(s.sstg):'—')+'</td><td>'+(active?pct(s.tcAchievement):'—')+'</td><td>'+fmt(s.actualHours,2)+'</td><td>'+(active?fmt(s.tplh,2):'—')+'</td><td>'+(active?pct(s.faShare):'—')+'</td><td>'+(active?pct(s.d7):'—')+'</td><td>'+(active?pct(s.d25):'—')+'</td><td>'+(d.types.size===2?'齊全':d.types.size?'缺一檔':'待匯入')+'</td></tr>';});
    E('opsDayList').innerHTML='<table class="ops-daily-table"><thead><tr><th>日期</th><th>TC</th><th>SSTG</th><th>預估達成率</th><th>實際工時</th><th>TPLH</th><th>FA佔比</th><th>D7</th><th>D25</th><th>成績檔</th></tr></thead><tbody>'+rows.join('')+'</tbody></table>';
    E('opsDayList').querySelectorAll('[data-report-date]').forEach(b=>b.onclick=()=>{E('opsAnalysisDate').value=b.dataset.reportDate;state.period='day';refresh().catch(error);});
  }
  function bindHours(){
    E('opsAnalysisTable').querySelectorAll('.ops-area-hour').forEach(input=>input.onchange=()=>{const hours=M.number(input.value);if(input.value!==''&&(hours===null||hours<0||hours>9999)){notify('工時請填入 0～9999');return;}queueSave({p_record_date:input.dataset.date,p_area_code:input.dataset.area,p_area_hours:hours});});
    for(const [id,param] of [['opsTransferOut','p_transfer_out'],['opsTransferIn','p_transfer_in']]){const input=E(id);if(input)input.onchange=()=>{const value=M.number(input.value)??0;if(value<0||value>9999){notify('調整工時請填入 0～9999');return;}queueSave({p_record_date:selectedDate(),[param]:value});};}
  }
  function queueSave(args){
    notify('儲存中…','scores');state.saveQueue=state.saveQueue.catch(()=>{}).then(async()=>{
      const r=await db.rpc('t995_save_operations_report',args);if(r.error)throw r.error;state.saveError=null;const row=r.data;
      for(const cache of [state.cache,state.monthCache.get(row.record_date.slice(0,7))]){if(!cache)continue;const i=cache.reports.findIndex(x=>x.record_date===row.record_date);if(i>=0)cache.reports[i]=row;else cache.reports.push(row);}
      notify('已儲存','scores');const focused=document.activeElement,key=focused?.dataset.area,id=focused?.id,value=focused?.value;render();const next=key?E('opsAnalysisTable').querySelector('[data-area="'+key+'"]'):(['opsTransferOut','opsTransferIn'].includes(id)?E(id):null);if(next&&state.context==='scores'){next.value=value;next.focus();}
    }).catch(e=>{state.saveError=e;notify('儲存失敗：'+e.message,'scores');});return state.saveQueue;
  }
  async function loadRecords(r){const [delay,line]=await Promise.all([paged('t995_delay_orders','*',q=>q.gte('record_date',r.start).lte('record_date',r.end)),paged('t995_line_signature_records','*',q=>q.gte('record_date',r.start).lte('record_date',r.end))]);return {delay,line};}
  async function refresh(force=false){
    const id=++state.request,d=selectedDate(),r=S.range(d,period()),context=state.context;notify('讀取中…',context);
    try{const [data,records]=await Promise.all([loadRange(r,force),context==='summary'?loadRecords(r):Promise.resolve(state.records)]);if(id!==state.request)return;state.cache=data;state.records=records;notify('',context);render();loadWeatherRange(r,force).then(()=>{if(id===state.request)renderWeather();});}catch(e){if(id===state.request)notify(e.message,context);throw e;}
  }
  async function loadWeather(month,force=false){
    month=month.slice(0,7);if(state.weatherLoads.has(month))return state.weatherLoads.get(month);if(!force&&state.weather.has(month))return;
    const work=(async()=>{try{const result=await db.functions.invoke('t995-operations-weather',{body:{month:month+'-01'}});if(result.error||result.data?.error)throw new Error(result.data?.error||'天氣暫時無法讀取');state.weather.set(month,result.data);state.weatherError.delete(month);}catch(e){state.weatherError.set(month,e.message);}})();state.weatherLoads.set(month,work);try{await work;}finally{state.weatherLoads.delete(month);}
  }
  async function loadWeatherRange(r,force=false){await Promise.all(S.months(r.start,r.end).map(d=>loadWeather(d,force)));}
  function weatherRow(date,city){return state.weather.get(date.slice(0,7))?.rows?.find(x=>x.date===date&&x.city===city);}
  function weatherText(row){if(!row)return '尚無天氣資料';if(['pending','missing','unavailable'].includes(row.status))return {pending:'尚未公布',missing:'無觀測資料',unavailable:'連線暫時無法使用'}[row.status];return row.trace?'微量降雨':row.precipitation===null?'雨量缺值':row.precipitation>0?'有降雨':'未測得降雨';}
  const weatherValue=row=>row&&['observed','partial'].includes(row.status)?fmt(row.temperature,1)+' °C ／ '+(row.trace?'微量':fmt(row.precipitation,1)+' mm'):'';
  function renderWeather(){
    const d=selectedDate(),p=period(),r=S.range(d,p),target=E(state.context==='summary'?'opsSummaryWeather':'opsWeather'),months=S.months(r.start,r.end),hasData=months.some(m=>state.weather.has(m.slice(0,7)));
    if(!hasData){target.textContent=months.map(m=>state.weatherError.get(m.slice(0,7))).find(Boolean)||'讀取中央氣象署觀測資料中…';return;}
    if(p==='day')target.innerHTML='<div class="ops-weather-cards">'+['新竹','桃園'].map(city=>{const row=weatherRow(d,city);return '<article class="ops-weather-card"><h4>'+city+'　'+d+'</h4><strong>'+weatherText(row)+'</strong><div>'+weatherValue(row)+'</div><span>'+(row?escape(row.station_name)+'站 '+row.station_id:'')+'</span></article>';}).join('')+'</div>';
    else target.innerHTML='<div class="ops-table-wrap"><table class="ops-weather-table"><thead><tr><th>日期</th><th>新竹</th><th>桃園</th></tr></thead><tbody>'+S.dates(r.start,r.end).filter(date=>date<=opsToday()).map(date=>'<tr><th>'+date.slice(5)+'</th>'+['新竹','桃園'].map(city=>{const row=weatherRow(date,city);return '<td>'+weatherText(row)+'<br>'+weatherValue(row)+(row?'<br>'+escape(row.station_name)+'站':'')+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div>';
    target.insertAdjacentHTML('beforeend','<div class="ops-weather-source"><a href="https://codis.cwa.gov.tw/StationData" target="_blank" rel="noopener">中央氣象署 CODiS</a> · 日觀測於隔日中午前更新</div>');
  }
  function appendTable(wb,name,rows,headers,percent=[]){
    const ws=XLSX.utils.json_to_sheet(rows,{header:headers});ws['!cols']=headers.map(h=>({wch:Math.max(14,h.length*2+2)}));
    for(let i=0;i<rows.length;i++)for(const key of percent){const address=XLSX.utils.encode_cell({r:i+1,c:headers.indexOf(key)});if(ws[address]?.t==='n')ws[address].z='0.0%';}XLSX.utils.book_append_sheet(wb,ws,name);
  }
  function appendScores(wb,data,r){
    const daily=[],areas=[];
    for(const date of S.dates(r.start,r.end)){
      const v=model(date,'day',data),d=v.days.get(date),s=v.summary,active=d.types.has('ByOrder');
      daily.push({日期:date,週次:S.week(date).year+'-'+S.weekLabel(date),去年單:s.forecast===null?null:s.prior,預估單:s.forecast,實際單:active?s.tc:null,FA:active?s.fa:null,SSTG:active?s.sstg:null,預估達成率:active?s.tcAchievement:null,合計工時:s.totalHours,調出工時:s.transferOut,調入工時:s.transferIn,實際工時:s.actualHours,TPLH:active?s.tplh:null,第三方佔比:active?s.faShare:null,D7:active?s.d7:null,D25:active?s.d25:null,D7達成單:active?s.d7Y:null,D7有效單:active?s.d7Y+s.d7N:null,D25達成單:active?s.d25Y:null,D25有效單:active?s.d25Y+s.d25N:null,ByDate已匯入:d.types.has('ByDate')?'是':'否',ByOrder已匯入:active?'是':'否',工時完整:d.actualHours!==null?'是':'否',去年單完整:d.baselineComplete?'是':'否'});
      for(const [a,label] of [...M.AREAS,...(v.areas.has('?')?[['?','未分類']]:[])]){const x=v.areas.get(a);areas.push({日期:date,區域代碼:a,區域:label,TC:active?x.tc:null,FA:active?x.fa:null,FA佔比:active?x.faShare:null,D7:active?x.d7:null,D25:active?x.d25:null,區域工時:M.number(d.report?.area_hours?.[a]),D7達成單:active?x.d7Y:null,D7有效單:active?x.d7Y+x.d7N:null,D25達成單:active?x.d25Y:null,D25有效單:active?x.d25Y+x.d25N:null});}
    }
    appendTable(wb,'每日成績',daily,['日期','週次','去年單','預估單','實際單','FA','SSTG','預估達成率','合計工時','調出工時','調入工時','實際工時','TPLH','第三方佔比','D7','D25','D7達成單','D7有效單','D25達成單','D25有效單','ByDate已匯入','ByOrder已匯入','工時完整','去年單完整'],['SSTG','預估達成率','第三方佔比','D7','D25']);
    appendTable(wb,'區域每日成績',areas,['日期','區域代碼','區域','TC','FA','FA佔比','D7','D25','區域工時','D7達成單','D7有效單','D25達成單','D25有效單'],['FA佔比','D7','D25']);
  }
  async function exportCombined(p){
    const buttons=[...E('opsSummaryPanel').querySelectorAll('.ops-export-bottom button')];buttons.forEach(b=>b.disabled=true);
    try{
      await state.saveQueue;if(state.saveError)throw new Error('工時尚未儲存成功，請先重新儲存');
      const d=E('opsSummaryDate').value||opsToday(),r=S.range(d,p);if(r.start>opsToday())throw new Error('所選日期尚未到');if(r.end>opsToday())r.end=opsToday();notify('匯出中…','summary');
      const [data,records]=await Promise.all([loadRange(r,true),loadRecords(r),loadWeatherRange(r)]);const v=M.build({...data,mapping:new Map(data.mapping.map(x=>[M.clean(x.restaurant_name),x.area_code])),catalog:state.catalog,...r}),wb=XLSX.utils.book_new(),hasScores=[...v.days.values()].some(x=>x.types.has('ByOrder'));
      const summary=[['起始日期',r.start],['結束日期',r.end],['成績已匯入日數',[...v.days.values()].filter(x=>x.types.size===2).length],...metricsRows(v.summary).map(([k,value,unit])=>[k,!hasScores&&!['去年單數','預估單數','預估工時','實際工時'].includes(k)?null:value,unit])];
      const ws=XLSX.utils.aoa_to_sheet([['營運總覽','數值','單位'],...summary]);ws['!cols']=[{wch:24},{wch:22},{wch:12}];summary.forEach((r,i)=>{if(r[2]==='%'&&ws['B'+(i+2)])ws['B'+(i+2)].z='0.0%';});XLSX.utils.book_append_sheet(wb,ws,'營運總覽');appendScores(wb,data,r);
      appendTable(wb,'劃線簽名',S.lineExport(state.stores,records.line,r.start,r.end,opsToday()),['日期','店號','餐廳','是否登記','劃線','簽名','登記時間','更新時間']);
      appendTable(wb,'等餐紀錄',records.delay.map(x=>({日期:x.record_date,店號:x.store_code,餐廳:x.restaurant_name,訂單編號:x.order_number,狀態:x.status==='completed'?'已回覆':'待回覆',等餐原因:x.reason||'',登記時間:x.created_at,回覆時間:x.responded_at||''})),['日期','店號','餐廳','訂單編號','狀態','等餐原因','登記時間','回覆時間']);
      const weather=S.dates(r.start,r.end).flatMap(date=>['新竹','桃園'].map(city=>{const x=weatherRow(date,city);return {日期:date,城市:city,測站:x?.station_name||'',測站代碼:x?.station_id||'',平均氣溫:x?.temperature??null,降雨毫米:x?.precipitation??null,微量降雨:x?.trace?'是':'否',觀測狀態:x?.status||'unavailable',來源:'https://codis.cwa.gov.tw/StationData',查詢時間:state.weather.get(date.slice(0,7))?.fetched_at||''};}));
      appendTable(wb,'天氣觀測',weather,['日期','城市','測站','測站代碼','平均氣溫','降雨毫米','微量降雨','觀測狀態','來源','查詢時間']);
      XLSX.writeFile(wb,'營運'+({day:'日報',week:'週報',month:'月報'}[p])+'_'+r.start+(r.end===r.start?'':'_'+r.end)+'.xlsx');notify('已匯出成績、劃線簽名與等餐紀錄','summary');
    }catch(e){notify('匯出失敗：'+e.message,'summary');}finally{buttons.forEach(b=>b.disabled=false);}
  }
  async function findRestaurant(inputId,chooseUnique=true){
    await loadDirectory();const input=E(inputId),code=input.value.trim().replace(/\D/g,'').slice(0,3),list=E(inputId+'Choices'),name=E(inputId+'Name');input.value=code;
    if(!code){name.textContent='';list.replaceChildren();return null;}
    const matches=state.stores.filter(s=>s.store_code.startsWith(code)),selected=matches.find(s=>s.store_code===code)||(chooseUnique&&matches.length===1?matches[0]:null);
    if(selected){input.value=selected.store_code;name.textContent=selected.restaurant_name;list.replaceChildren();return selected;}
    name.textContent=matches.length?'請選擇餐廳':'查無此店號';list.innerHTML=matches.map(s=>'<button type="button" data-store-code="'+s.store_code+'">'+s.store_code+'　'+escape(s.restaurant_name)+'</button>').join('');
    list.querySelectorAll('button').forEach(b=>b.onclick=async()=>{input.value=b.dataset.storeCode;await findRestaurant(inputId);if(inputId==='opsLineStore')await fillLineState(input.value);});return null;
  }
  async function fillLineState(code){
    const r=await db.from('t995_line_signature_records').select('line_completed,signature_completed').eq('record_date',opsToday()).eq('store_code',code).maybeSingle();if(E('opsLineStore').value!==code)return;if(r.error){E('opsLineMessage').textContent=r.error.message;return;}opsSetToggle('opsLineMark',!!r.data?.line_completed);opsSetToggle('opsSignMark',!!r.data?.signature_completed);
  }
  window.opsFindRestaurant=findRestaurant;
  for(const id of ['opsDelayStore','opsLineStore'])E(id).oninput=async()=>{if(id==='opsLineStore'){opsSetToggle('opsLineMark',false);opsSetToggle('opsSignMark',false);}try{const store=await findRestaurant(id);if(store&&id==='opsLineStore')await fillLineState(store.store_code);}catch(e){E(id+'Name').textContent=e.message;}};
  E('opsAnalysisDate').value=opsToday();E('opsSummaryDate').value=opsToday();
  E('opsAnalysisDate').onchange=()=>{state.period='day';refresh().catch(error);};E('opsSummaryDate').onchange=()=>refresh().catch(error);
  E('opsAnalysisRefresh').onclick=()=>refresh(true).catch(error);E('opsSummaryRefresh').onclick=()=>refresh(true).catch(error);
  E('opsPeriodTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.period=b.dataset.period;refresh().catch(error);});
  E('opsSummaryPeriodTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.summaryPeriod=b.dataset.period;refresh().catch(error);});
  for(const [id,p] of [['opsExportDay','day'],['opsExportWeek','week'],['opsExportMonth','month']])E(id).onclick=()=>exportCombined(p);
  window.opsLoadDailyAnalytics=()=>{state.context='scores';state.period='day';return refresh(true);};
  window.OpsReport={readRows:paged,directory:loadDirectory,fillLineState,open:context=>{state.context=context;return refresh(true);}};
})();
