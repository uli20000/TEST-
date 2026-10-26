(function(){
  'use strict';
  const M=window.OpsMetrics,E=id=>document.getElementById(id),escape=opsEscape;
  const labels=new Map(M.AREAS),state={period:'day',month:null,cache:null,monthCache:new Map(),monthLoads:new Map(),view:null,request:0,saveQueue:Promise.resolve(),stores:[],mapping:new Map(),catalog:new Map(),weather:new Map(),weatherLoads:new Map(),weatherError:new Map()};
  const fmt=(v,d=0)=>v===null||v===undefined?'—':Number(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=v=>v===null||v===undefined?'—':fmt(v*100,1)+'%';
  const time=v=>v===null||v===undefined?'—':Math.floor(Math.round(v)/60)+'分'+String(Math.round(v)%60).padStart(2,'0')+'秒';
  const error=e=>{E('opsReportStatus').textContent=e.message||String(e);};
  function notify(message){E('opsReportStatus').textContent=message;}
  async function paged(table,columns,filter,order='record_date'){
    const rows=[];for(let offset=0;;offset+=1000){let q=db.from(table).select(columns);q=filter(q);if(order)q=q.order(order);if(table==='t995_score_import_rows')q=q.order('row_number');else if(table==='staffing_tc_history')q=q.order('restaurant_name');else if(table==='t995_score_import_batches'||table==='t995_delay_orders')q=q.order('id');const r=await q.range(offset,offset+999);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<1000)return rows;}
  }
  async function loadDirectory(){
    if(state.stores.length)return;
    const stores=await db.from('t995_restaurants').select('store_code,restaurant_name').eq('enabled',true).order('store_code');
    if(stores.error)throw stores.error;
    state.stores=stores.data||[];state.catalog=new Map(state.stores.map(s=>[s.store_code,s]));
  }
  async function loadMonth(date,force=false){
    const month=date.slice(0,7);if(state.monthLoads.has(month))return state.monthLoads.get(month);if(!force&&state.monthCache.has(month))return state.monthCache.get(month);
    const work=(async()=>{
    await loadDirectory();const r=M.range(date,'month'),next=M.addDays(r.end,1);
    const [batchRows,reports,reference]=await Promise.all([
      paged('t995_score_import_batches','*',q=>q.gte('report_date',r.start).lt('report_date',next),'report_date'),
      paged('t995_operations_daily_reports','*',q=>q.gte('record_date',r.start).lt('record_date',next)),
      db.rpc('t995_get_operations_reference',{p_month:r.start})
    ]);
    if(reference.error)throw reference.error;
    const batches=M.latestBatches(batchRows),ids=batches.map(b=>b.id);
    const rows=ids.length?await paged('t995_score_import_rows','batch_id,row_number,store_code,restaurant_name,order_number,payload',q=>q.in('batch_id',ids),'batch_id'):[];
    return {rows,batches,reports,history:reference.data?.history||[],mapping:reference.data?.mapping||[]};
    })();state.monthLoads.set(month,work);
    try{const data=await work;state.monthCache.set(month,data);return data;}finally{state.monthLoads.delete(month);}
  }
  function model(date,period){const r=M.range(date,period);return M.build({...state.cache,mapping:state.mapping,catalog:state.catalog,...r});}
  function selectedDate(){return E('opsAnalysisDate').value||opsToday();}
  function metricsRows(s){return [
    ['預估單數',fmt(s.forecast),'單'],['實際總單數',fmt(s.tc),'單'],['去年單數',s.priorN?fmt(s.prior):'—','單'],['FA單數',fmt(s.fa),'單'],
    ['TC預估達成率',pct(s.tcAchievement),''],['預估工時',fmt(s.forecastHours,2),'hrs'],['實際工時',fmt(s.actualHours,2),'hrs'],['TPLH（扣FA）',fmt(s.tplh,2),''],
    ['SSTG%',pct(s.sstg),''],['SSTG%（扣FA）',pct(s.sstgExFA),''],['預估工時達成率',pct(s.hoursAchievement),''],['第三方佔比',pct(s.faShare),''],
    ['QT',fmt(s.qt,1),'分'],['D7達成率',pct(s.d7),''],['平均留店時間',time(s.d7Avg),''],['D25達成率',pct(s.d25),''],['平均送達時間',time(s.d25Avg),'']
  ];}
  function valueInput(area,date,value){return '<input class="ops-area-hour" type="number" min="0" max="9999" step="0.25" inputmode="decimal" data-area="'+area+'" data-date="'+date+'" value="'+(value===null?'':value)+'" aria-label="'+escape(labels.get(area))+'總工時">';}
  function renderWeeks(date){
    E('opsWeekTabs').innerHTML=M.weeks(date).map((w,i)=>'<button type="button" class="ops-week-tab '+(state.period==='week'&&date>=w.start&&date<=w.end?'active':'')+'" data-week-date="'+w.start+'">第'+(i+1)+'週<span>'+w.start.slice(5).replace('-','/')+'–'+w.end.slice(5).replace('-','/')+'</span></button>').join('');
    E('opsWeekTabs').querySelectorAll('[data-week-date]').forEach(b=>b.onclick=()=>{E('opsAnalysisDate').value=b.dataset.weekDate;state.period='week';render();});
  }
  function render(){
    if(!state.cache)return;const date=selectedDate(),r=M.range(date,state.period),v=state.view=model(date,state.period),day=v.days.get(date),isDay=state.period==='day',s=v.summary;
    const reportDays=[...v.days.values()].filter(d=>d.types.has('ByOrder')).length,expectedDays=M.dates(r.start,r.end).filter(d=>d<=opsToday()).length;
    E('opsPeriodExport').textContent=state.period==='week'?'匯出本週成績':'匯出本月成績';
    E('opsPeriodLabel').textContent=isDay?'每日營運總覽　'+date:(state.period==='week'?'週匯總　':'月匯總　')+r.start+' ～ '+r.end+'（'+reportDays+'/'+expectedDays+'日）';
    E('opsPeriodTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.period===state.period));renderWeeks(date);
    const actualLabels=new Set(['實際總單數','FA單數','TC預估達成率','TPLH（扣FA）','SSTG%','SSTG%（扣FA）','第三方佔比','QT','D7達成率','平均留店時間','D25達成率','平均送達時間']);
    const primary=new Set(['去年單數','預估單數','實際總單數','SSTG%','TC預估達成率','實際工時','TPLH（扣FA）','第三方佔比','D7達成率','D25達成率']),order=[...primary];
    E('opsAnalysisSummary').innerHTML='<div class="ops-kpi-cards">'+metricsRows(s).filter(([k])=>primary.has(k)).sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0])).map(([k,value,unit])=>'<article class="ops-kpi-card"><h4>'+k+'</h4><strong>'+(!reportDays&&actualLabels.has(k)?'—':value)+'</strong>'+(unit?'<span>'+unit+'</span>':'')+'</article>').join('')+'</div><details class="ops-secondary"><summary>其他指標</summary><div class="ops-kpi-cards ops-secondary-cards">'+metricsRows(s).filter(([k])=>!primary.has(k)).map(([k,value,unit])=>'<article class="ops-kpi-card"><h4>'+k+'</h4><strong>'+(!reportDays&&actualLabels.has(k)?'—':value)+'</strong><span>'+unit+'</span></article>').join('')+'</div></details>';
    E('opsFileStatus').innerHTML=['ByDate','ByOrder'].map(type=>{const b=state.cache.batches.find(x=>x.report_date===date&&x.report_type===type);return '<div class="ops-file-card '+(b?'ready':'')+'"><b>'+type+'</b><span>'+date+'</span><strong>'+(b?'已匯入 '+fmt(b.row_count)+' 筆':'尚未匯入')+'</strong></div>';}).join('');
    const areaRows=[...M.AREAS,...(v.areas.has('?')?[['?','未分類']]:[])];
    E('opsAnalysisTable').innerHTML='<table class="ops-area-table"><thead><tr><th>區域</th><th>TC</th><th>FA</th><th>第三方佔比</th><th>D7</th><th>D25</th><th>總工時</th></tr></thead><tbody>'+areaRows.map(([a,label])=>{const x=v.areas.get(a),hours=isDay?M.number(day?.report?.area_hours?.[a]):v.hourTotals.get(a)?.count?v.hourTotals.get(a).hours:null;return '<tr><th>'+label+'</th><td data-label="TC">'+(reportDays?fmt(x?.tc??0):'—')+'</td><td data-label="FA">'+(reportDays?fmt(x?.fa??0):'—')+'</td><td data-label="第三方佔比">'+pct(x?.faShare??null)+'</td><td data-label="D7">'+pct(x?.d7??null)+'</td><td data-label="D25">'+pct(x?.d25??null)+'</td><td data-label="總工時">'+(isDay&&a!=='?'?valueInput(a,date,hours):fmt(hours,2))+'</td></tr>';}).join('')+'</tbody><tfoot><tr><th>合計</th><td data-label="TC">'+(reportDays?fmt(s.tc):'—')+'</td><td data-label="FA">'+(reportDays?fmt(s.fa):'—')+'</td><td data-label="第三方佔比">'+pct(s.faShare)+'</td><td data-label="D7">'+pct(s.d7)+'</td><td data-label="D25">'+pct(s.d25)+'</td><td data-label="總工時">'+fmt(s.totalHours,2)+'</td></tr></tfoot></table>';
    const report=day?.report;
    E('opsLaborAdjustments').innerHTML='<div class="ops-labor-grid"><label>合計總工時<output>'+fmt(s.totalHours,2)+'</output></label><label>調出工時'+(isDay?'<input id="opsTransferOut" type="number" min="0" step="0.25" inputmode="decimal" value="'+(report?.transfer_out_hours??0)+'">':'<output>'+fmt(s.transferOut,2)+'</output>')+'</label><label>調入工時'+(isDay?'<input id="opsTransferIn" type="number" min="0" step="0.25" inputmode="decimal" value="'+(report?.transfer_in_hours??0)+'">':'<output>'+fmt(s.transferIn,2)+'</output>')+'</label><label>實際工時<output>'+fmt(s.actualHours,2)+'</output></label></div>';
    const messages=[];if(v.missingPairs.length)messages.push('尚缺另一份成績檔：'+v.missingPairs.map(x=>x.slice(5)).join('、'));
    if(v.missingHourDays.length)messages.push(isDay?'尚有 '+day.missingAreas+' 區未填工時':'尚有 '+v.missingHourDays.length+' 天工時未填完整');
    if(v.hoursWithoutScores.length)messages.push('有工時但尚無成績：'+v.hoursWithoutScores.map(x=>x.slice(5)).join('、'));
    if(v.invalidHourDays.length)messages.push('調出工時超過可用工時：'+v.invalidHourDays.map(x=>x.slice(5)).join('、'));
    if(v.missingBaselineDays.length)messages.push('去年 TC 缺少資料：'+v.missingBaselineDays.map(x=>x.slice(5)).join('、'));
    if(v.areas.has('?'))messages.push('有餐廳尚未設定區域');
    E('opsReportWarnings').textContent=messages.join('；');E('opsReportWarnings').hidden=!messages.length;
    bindHours();renderMonthHours(date);renderDayList(r);renderWeather();
  }
  function renderMonthHours(date){
    const v=model(date,'month'),r=M.range(date,'month'),days=[...v.days.values()];
    E('opsMonthHours').innerHTML='<h3>'+date.slice(0,7)+' 各區工時</h3><div class="ops-table-wrap"><table class="ops-month-hours"><thead><tr><th>日期</th>'+M.AREAS.map(([,n])=>'<th>'+n+'</th>').join('')+'<th>合計</th><th>調出</th><th>調入</th><th>實際</th></tr></thead><tbody>'+days.map(d=>'<tr><th>'+d.date.slice(5).replace('-','/')+'</th>'+M.AREAS.map(([a])=>'<td>'+fmt(M.number(d.report?.area_hours?.[a]),2)+'</td>').join('')+'<td>'+fmt(d.hours,2)+'</td><td>'+fmt(d.report?Number(d.report.transfer_out_hours):null,2)+'</td><td>'+fmt(d.report?Number(d.report.transfer_in_hours):null,2)+'</td><td>'+fmt(d.actualHours,2)+'</td></tr>').join('')+'</tbody><tfoot><tr><th>月合計</th>'+M.AREAS.map(([a])=>'<td>'+fmt(v.hourTotals.get(a).count?v.hourTotals.get(a).hours:null,2)+'</td>').join('')+'<td>'+fmt(v.summary.totalHours,2)+'</td><td>'+fmt(v.summary.transferOut,2)+'</td><td>'+fmt(v.summary.transferIn,2)+'</td><td>'+fmt(v.summary.actualHours,2)+'</td></tr></tfoot></table></div>';
  }
  function bindHours(){
    E('opsAnalysisTable').querySelectorAll('.ops-area-hour').forEach(input=>input.onchange=()=>{
      const hours=M.number(input.value);if(input.value!==''&&(hours===null||hours<0||hours>9999)){notify('工時請填入 0～9999');return;}
      queueSave({p_record_date:input.dataset.date,p_area_code:input.dataset.area,p_area_hours:hours});
    });
    for(const [id,param] of [['opsTransferOut','p_transfer_out'],['opsTransferIn','p_transfer_in']]){
      const input=E(id);if(!input)continue;input.onchange=()=>{const value=M.number(input.value)??0;if(typeof value==='number'&&(value<0||value>9999)){notify('調整工時請填入 0～9999');return;}queueSave({p_record_date:selectedDate(),[param]:value});};
    }
  }
  function queueSave(args){
    notify('儲存中…');state.saveQueue=state.saveQueue.catch(()=>{}).then(async()=>{const r=await db.rpc('t995_save_operations_report',args);if(r.error)throw r.error;const row=r.data;const cache=state.monthCache.get(row.record_date.slice(0,7));if(cache){const i=cache.reports.findIndex(x=>x.record_date===row.record_date);if(i>=0)cache.reports[i]=row;else cache.reports.push(row);}notify('已儲存');const focused=document.activeElement,key=focused?.dataset.area,id=focused?.id,value=focused?.value;render();const next=key?E('opsAnalysisTable').querySelector('[data-area="'+key+'"]'):(['opsTransferOut','opsTransferIn'].includes(id)?E(id):null);if(next){next.value=value;next.focus();}}).catch(error);return state.saveQueue;
  }
  async function refresh(force=false){
    const id=++state.request,date=selectedDate();notify('讀取中…');try{const data=await loadMonth(date,force);if(id!==state.request)return;state.month=date.slice(0,7);state.cache=data;state.mapping=new Map(data.mapping.map(x=>[M.clean(x.restaurant_name),x.area_code]));notify('');render();loadWeather(date,force).catch(()=>{});}catch(e){if(id===state.request)error(e);throw e;}
  }
  window.opsLoadDailyAnalytics=()=>refresh(true);
  function applySheetFormat(ws,widths){ws['!cols']=widths.map(w=>({wch:w}));return ws;}
  function monthHourRows(date){
    const v=model(date,'month'),rows=[['日期',...M.AREAS.map(([,n])=>n+'工時'),'合計總工時','調出工時','調入工時','實際工時']];
    for(const d of v.days.values())rows.push([d.date,...M.AREAS.map(([a])=>M.number(d.report?.area_hours?.[a])),d.hours,d.report?Number(d.report.transfer_out_hours):null,d.report?Number(d.report.transfer_in_hours):null,d.actualHours]);
    rows.push(['月合計',...M.AREAS.map(([a])=>v.hourTotals.get(a).count?v.hourTotals.get(a).hours:null),v.summary.totalHours,v.summary.transferOut,v.summary.transferIn,v.summary.actualHours]);return rows;
  }
  async function exportDaily(){
    await state.saveQueue;await refresh();const date=selectedDate(),v=model(date,'day'),d=v.days.get(date),s=v.summary;
    if(d.types.size<2){notify('請先匯入當日的 ByDate 與 ByOrder 兩個檔案。');return;}
    await loadWeather(date);
    const [delay,line]=await Promise.all([paged('t995_delay_orders','*',q=>q.eq('record_date',date),'store_code'),paged('t995_line_signature_records','*',q=>q.eq('record_date',date),'store_code')]);
    const numericMetrics=[['預估單數',s.forecast,'單'],['實際總單數',s.tc,'單'],['去年單數',s.priorN?s.prior:null,'單'],['FA單數',s.fa,'單'],['TC預估達成率',s.tcAchievement,'%'],['預估工時',s.forecastHours,'hrs'],['實際工時',s.actualHours,'hrs'],['TPLH（扣FA）',s.tplh,''],['SSTG%',s.sstg,'%'],['SSTG%（扣FA）',s.sstgExFA,'%'],['預估工時達成率',s.hoursAchievement,'%'],['第三方佔比',s.faShare,'%'],['QT',s.qt,'分'],['D7達成率',s.d7,'%'],['平均留店時間',s.d7Avg,'秒'],['D25達成率',s.d25,'%'],['平均送達時間',s.d25Avg,'秒'],['天氣',d.report?.weather||'','']];
    const aoa=[['23:00回饋',date,'','區域','TC','FA','第三方佔比','D7達成率','D25達成率','總工時']];
    numericMetrics.forEach((x,i)=>{const area=M.AREAS[i],a=area?v.areas.get(area[0]):null;aoa.push([...x,...(area?[area[1],a.tc,a.fa,a.faShare,a.d7,a.d25,M.number(d.report?.area_hours?.[area[0]])]:[])]);});
    aoa.push([],['合計總工時',s.totalHours,'hrs'],['調出工時',s.transferOut,'hrs'],['調入工時',s.transferIn,'hrs'],['實際工時',s.actualHours,'hrs'],[],['報表類型','日期','區域代碼','區域','店號','餐廳','訂單編號','第三方','D7','D25','QT','留店秒','送達秒']);
    for(const row of d.raw){const p=row.payload;aoa.push([row.report_type,date,row.area_code,labels.get(row.area_code)||'未分類',row.store_code,row.restaurant_name,row.order_number,p['自動/手動']==='第三方'?'是':'否',p.D7||'',p.D25||'',M.number(p.QT??p['Quote Time']),M.duration(p['留店時間']),M.duration(p['外送達成時間（D30)'])]);}
    const wb=XLSX.utils.book_new(),score=applySheetFormat(XLSX.utils.aoa_to_sheet(aoa),[22,20,12,16,12,18,30,15,15,15,12,12,12]);
    numericMetrics.forEach((x,i)=>{if(x[2]==='%'&&score['B'+(i+2)])score['B'+(i+2)].z='0.0%';});for(let row=2;row<=12;row++)for(const col of ['G','H','I'])if(score[col+row]?.t==='n')score[col+row].z='0.0%';
    XLSX.utils.book_append_sheet(wb,score,'當日成績');
    const lineRows=state.stores.map(store=>{const row=line.find(x=>x.store_code===store.store_code);return {日期:date,店號:store.store_code,餐廳:store.restaurant_name,劃線:row?.line_completed?'完成':'未完成',簽名:row?.signature_completed?'完成':'未完成'};});
    const delayRows=delay.map(row=>({日期:row.record_date,店號:row.store_code,餐廳:row.restaurant_name,訂單編號:row.order_number,狀態:row.status==='completed'?'已回覆':'待回覆',等餐原因:row.reason||'',回覆時間:row.responded_at||''}));
    XLSX.utils.book_append_sheet(wb,applySheetFormat(XLSX.utils.json_to_sheet(lineRows),[14,10,22,12,12]),'當日劃線紀錄');
    XLSX.utils.book_append_sheet(wb,applySheetFormat(XLSX.utils.aoa_to_sheet([['日期','店號','餐廳','訂單編號','狀態','等餐原因','回覆時間'],...delayRows.map(x=>Object.values(x))]),[14,10,22,14,12,50,24]),'當日等餐紀錄');
    appendAnalysisSheets(wb,{start:date,end:date});
    XLSX.writeFile(wb,'營運日報_'+date+'.xlsx');notify('已匯出');
  }
  async function exportMonth(){await state.saveQueue;await refresh();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,applySheetFormat(XLSX.utils.aoa_to_sheet(monthHourRows(selectedDate())),[16,...Array(15).fill(13)]),'各區月工時');XLSX.writeFile(wb,'各區工時_'+selectedDate().slice(0,7)+'.xlsx');}
  function renderDayList(range){
    const rows=M.dates(range.start,range.end).filter(date=>date<=opsToday()).map(date=>{const v=model(date,'day'),d=v.days.get(date),s=v.summary,active=d.types.has('ByOrder');return '<tr><th><button type="button" data-report-date="'+date+'">'+date.slice(5).replace('-','/')+'</button></th><td>'+(active?fmt(s.tc):'—')+'</td><td>'+(active?pct(s.sstg):'—')+'</td><td>'+(active?pct(s.tcAchievement):'—')+'</td><td>'+fmt(s.actualHours,2)+'</td><td>'+(active?fmt(s.tplh,2):'—')+'</td><td>'+(active?pct(s.faShare):'—')+'</td><td>'+(active?pct(s.d7):'—')+'</td><td>'+(active?pct(s.d25):'—')+'</td><td>'+(d.types.size===2?'齊全':d.types.size?'缺一檔':'待匯入')+'</td></tr>';});
    E('opsDayList').innerHTML='<table class="ops-daily-table"><thead><tr><th>日期</th><th>TC</th><th>SSTG</th><th>預估達成率</th><th>實際工時</th><th>TPLH</th><th>FA佔比</th><th>D7</th><th>D25</th><th>成績檔</th></tr></thead><tbody>'+rows.join('')+'</tbody></table>';
    E('opsDayList').querySelectorAll('[data-report-date]').forEach(b=>b.onclick=()=>{E('opsAnalysisDate').value=b.dataset.reportDate;state.period='day';render();});
  }
  async function loadWeather(date,force=false){
    const month=date.slice(0,7);if(state.weatherLoads.has(month)){await state.weatherLoads.get(month).catch(()=>{});return;}
    if(!force&&state.weather.has(month)){renderWeather();return;}
    const work=(async()=>{const result=await db.functions.invoke('t995-operations-weather',{body:{month:month+'-01'}});if(result.error||result.data?.error)throw new Error(result.data?.error||'天氣暫時無法讀取，請重新整理');state.weather.set(month,result.data);state.weatherError.delete(month);})();
    state.weatherLoads.set(month,work);renderWeather();
    try{await work;}catch(e){state.weatherError.set(month,e.message);}finally{state.weatherLoads.delete(month);if(selectedDate().slice(0,7)===month)renderWeather();}
  }
  const weatherStatus={pending:'尚未公布',missing:'無觀測資料',unavailable:'連線暫時無法使用',partial:'觀測資料不完整'};
  function weatherText(row){if(!row)return '讀取中…';if(row.status==='pending'||row.status==='missing'||row.status==='unavailable')return weatherStatus[row.status];return (row.trace?'微量降雨':row.precipitation===null?'雨量缺值':row.precipitation>0?'有降雨':'未測得降雨');}
  function weatherValue(row){return row&&(row.status==='observed'||row.status==='partial')?fmt(row.temperature,1)+' °C ／ '+(row.trace?'微量':fmt(row.precipitation,1)+' mm'):'';}
  function renderWeather(){
    const date=selectedDate(),month=date.slice(0,7),data=state.weather.get(month),r=M.range(date,state.period),rows=data?.rows?.filter(x=>x.date>=r.start&&x.date<=r.end)||[];
    if(!data){E('opsWeather').textContent=state.weatherError.get(month)||'讀取中央氣象署觀測資料中…';return;}
    if(state.period==='day')E('opsWeather').innerHTML='<div class="ops-weather-cards">'+['新竹','桃園'].map(city=>{const row=rows.find(x=>x.city===city);return '<article class="ops-weather-card"><h4>'+city+'　'+date+'</h4><strong>'+weatherText(row)+'</strong><div>'+weatherValue(row)+'</div><span>'+(row?escape(row.station_name)+'站 '+row.station_id:'')+'</span></article>';}).join('')+'</div>';
    else E('opsWeather').innerHTML='<div class="ops-table-wrap"><table class="ops-weather-table"><thead><tr><th>日期</th><th>新竹</th><th>桃園</th></tr></thead><tbody>'+M.dates(r.start,r.end).filter(d=>d<=opsToday()).map(d=>'<tr><th>'+d.slice(5)+'</th>'+['新竹','桃園'].map(city=>{const row=rows.find(x=>x.date===d&&x.city===city);return '<td>'+weatherText(row)+'<br>'+weatherValue(row)+(row?'<br>'+escape(row.station_name)+'站':'')+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div>';
    E('opsWeather').insertAdjacentHTML('beforeend','<div class="ops-weather-source"><a href="https://codis.cwa.gov.tw/StationData" target="_blank" rel="noopener">中央氣象署 CODiS</a> · 日觀測於隔日中午前更新'+(state.weatherError.has(month)?' · 更新失敗，顯示上次資料':'')+'</div>');
  }
  function appendAnalysisSheets(wb,r){
    const daily=[],areas=[];
    for(const date of M.dates(r.start,r.end)){
      const v=model(date,'day'),d=v.days.get(date),s=v.summary;if(!d.types.size&&!d.report)continue;
      const actual=d.types.has('ByOrder');
      daily.push({日期:date,去年單:s.forecast===null?null:s.prior,預估單:s.forecast,實際單:actual?s.tc:null,FA:actual?s.fa:null,SSTG:actual?s.sstg:null,預估達成率:actual?s.tcAchievement:null,合計工時:s.totalHours,調出工時:s.transferOut,調入工時:s.transferIn,實際工時:s.actualHours,TPLH:actual?s.tplh:null,第三方佔比:actual?s.faShare:null,D7:actual?s.d7:null,D25:actual?s.d25:null,D7達成單:s.d7Y,D7有效單:s.d7Y+s.d7N,D25達成單:s.d25Y,D25有效單:s.d25Y+s.d25N,ByDate已匯入:d.types.has('ByDate')?'是':'否',ByOrder已匯入:actual?'是':'否',工時完整:d.actualHours!==null?'是':'否',去年單完整:d.baselineComplete?'是':'否'});
      for(const [a,label] of [...M.AREAS,...(v.areas.has('?')?[['?','未分類']]:[])]){const x=v.areas.get(a);areas.push({日期:date,區域代碼:a,區域:label,TC:actual?x.tc:null,FA:actual?x.fa:null,FA佔比:actual?x.faShare:null,D7:actual?x.d7:null,D25:actual?x.d25:null,區域工時:M.number(d.report?.area_hours?.[a]),D7達成單:x.d7Y,D7有效單:x.d7Y+x.d7N,D25達成單:x.d25Y,D25有效單:x.d25Y+x.d25N});}
    }
    for(const [name,rows,headers,percent] of [['每日彙總',daily,['日期','去年單','預估單','實際單','FA','SSTG','預估達成率','合計工時','調出工時','調入工時','實際工時','TPLH','第三方佔比','D7','D25','D7達成單','D7有效單','D25達成單','D25有效單','ByDate已匯入','ByOrder已匯入','工時完整','去年單完整'],['SSTG','預估達成率','第三方佔比','D7','D25']],['區域每日明細',areas,['日期','區域代碼','區域','TC','FA','FA佔比','D7','D25','區域工時','D7達成單','D7有效單','D25達成單','D25有效單'],['FA佔比','D7','D25']]]){
      const sheet=XLSX.utils.json_to_sheet(rows,{header:headers});for(let i=0;i<rows.length;i++)for(const key of percent){const address=XLSX.utils.encode_cell({r:i+1,c:headers.indexOf(key)});if(sheet[address]?.t==='n')sheet[address].z='0.0%';}XLSX.utils.book_append_sheet(wb,applySheetFormat(sheet,headers.map(()=>16)),name);
    }
    const weather=state.weather.get(selectedDate().slice(0,7)),weatherRows=M.dates(r.start,r.end).filter(date=>date<=opsToday()).flatMap(date=>['新竹','桃園'].map(city=>{const x=weather?.rows?.find(x=>x.date===date&&x.city===city);return {日期:date,城市:city,測站:x?.station_name||'',測站代碼:x?.station_id||'',平均氣溫:x?.temperature??null,降雨毫米:x?.precipitation??null,微量降雨:x?.trace?'是':'否',觀測狀態:x?.status||'unavailable',來源:x?.source_url||'https://codis.cwa.gov.tw/StationData',查詢時間:weather?.fetched_at||''};}));
    XLSX.utils.book_append_sheet(wb,applySheetFormat(XLSX.utils.json_to_sheet(weatherRows),[16,12,12,16,14,14,14,18,50,26]),'天氣觀測');
  }
  async function exportPeriod(){await state.saveQueue;await refresh();await loadWeather(selectedDate());const wb=XLSX.utils.book_new(),period=state.period==='day'?'month':state.period,r=M.range(selectedDate(),period);appendAnalysisSheets(wb,r);XLSX.utils.book_append_sheet(wb,applySheetFormat(XLSX.utils.aoa_to_sheet(monthHourRows(selectedDate())),[16,...Array(15).fill(13)]),'各區月工時');XLSX.writeFile(wb,'營運'+(period==='week'?'週報':'月報')+'_'+r.start+'_'+r.end+'.xlsx');notify('已匯出');}
  // A partial store code presents choices. A unique prefix can be completed without guessing among stores.
  async function findRestaurant(inputId,chooseUnique=true){
    await loadDirectory();const input=E(inputId),code=input.value.trim().replace(/\D/g,'').slice(0,3),list=E(inputId+'Choices'),name=E(inputId+'Name');input.value=code;
    if(!code){name.textContent='';list.replaceChildren();return null;}
    const matches=state.stores.filter(s=>s.store_code.startsWith(code));const exact=matches.find(s=>s.store_code===code);let selected=exact||(chooseUnique&&matches.length===1?matches[0]:null);
    if(selected){input.value=selected.store_code;name.textContent=selected.restaurant_name;list.replaceChildren();return selected;}
    name.textContent=matches.length?'請選擇餐廳':'查無此店號';list.innerHTML=matches.map(s=>'<button type="button" data-store-code="'+s.store_code+'">'+s.store_code+'　'+escape(s.restaurant_name)+'</button>').join('');
    list.querySelectorAll('button').forEach(b=>b.onclick=async()=>{input.value=b.dataset.storeCode;await findRestaurant(inputId);if(inputId==='opsLineStore')await fillLineState(input.value);});return null;
  }
  async function fillLineState(code){
    const current=E('opsLineStore').value;const r=await db.from('t995_line_signature_records').select('line_completed,signature_completed').eq('record_date',opsToday()).eq('store_code',code).maybeSingle();
    if(E('opsLineStore').value!==current)return;if(r.error){E('opsLineMessage').textContent=r.error.message;return;}opsSetToggle('opsLineMark',!!r.data?.line_completed);opsSetToggle('opsSignMark',!!r.data?.signature_completed);
  }
  window.opsFindRestaurant=findRestaurant;
  for(const id of ['opsDelayStore','opsLineStore']){
    const input=E(id);input.oninput=async()=>{if(id==='opsLineStore'){opsSetToggle('opsLineMark',false);opsSetToggle('opsSignMark',false);}try{const store=await findRestaurant(id);if(store&&id==='opsLineStore')await fillLineState(store.store_code);}catch(e){E(id+'Name').textContent=e.message;}};
  }
  E('opsAnalysisDate').value=opsToday();E('opsAnalysisDate').onchange=()=>refresh().catch(()=>{});
  E('opsAnalysisRefresh').onclick=()=>refresh(true).catch(()=>{});
  E('opsPeriodTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.period=b.dataset.period;refresh().catch(()=>{});});
  E('opsPeriodExport').onclick=()=>exportPeriod().catch(error);E('opsExport').onclick=()=>exportDaily().catch(error);E('opsMonthExport').onclick=()=>exportMonth().catch(error);
  document.querySelectorAll('.ops-tab').forEach(b=>{const previous=b.onclick;b.onclick=()=>{if(previous)previous();if(b.dataset.opsTab==='scores')refresh().catch(()=>{});};});
})();

