(function(){
  'use strict';
  const M=window.OpsMetrics,E=id=>document.getElementById(id),escape=opsEscape;
  const labels=new Map(M.AREAS),state={period:'day',month:null,cache:null,monthCache:new Map(),monthLoads:new Map(),view:null,request:0,saveQueue:Promise.resolve(),stores:[],mapping:new Map(),catalog:new Map()};
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
    E('opsPeriodLabel').textContent=isDay?'23:00 回饋　'+date:(state.period==='week'?'週匯總　':'月匯總　')+r.start+' ～ '+r.end+'（'+reportDays+'/'+expectedDays+'日）';
    E('opsPeriodTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.period===state.period));renderWeeks(date);
    const actualLabels=new Set(['實際總單數','FA單數','TC預估達成率','TPLH（扣FA）','SSTG%','SSTG%（扣FA）','第三方佔比','QT','D7達成率','平均留店時間','D25達成率','平均送達時間']);
    E('opsAnalysisSummary').innerHTML='<table class="ops-kpi-table"><tbody>'+metricsRows(s).map(([k,value,unit])=>'<tr><th>'+k+'</th><td>'+(!reportDays&&actualLabels.has(k)?'—':value)+'</td><td>'+unit+'</td></tr>').join('')+'</tbody></table>';
    const areaRows=[...M.AREAS,...(v.areas.has('?')?[['?','未分類']]:[])];
    E('opsAnalysisTable').innerHTML='<table class="ops-area-table"><thead><tr><th>區域</th><th>TC</th><th>FA</th><th>第三方佔比</th><th>D7</th><th>D25</th><th>總工時</th></tr></thead><tbody>'+areaRows.map(([a,label])=>{const x=v.areas.get(a),hours=isDay?M.number(day?.report?.area_hours?.[a]):v.hourTotals.get(a)?.count?v.hourTotals.get(a).hours:null;return '<tr><th>'+label+'</th><td>'+fmt(x?.tc??0)+'</td><td>'+fmt(x?.fa??0)+'</td><td>'+pct(x?.faShare??null)+'</td><td>'+pct(x?.d7??null)+'</td><td>'+pct(x?.d25??null)+'</td><td>'+(isDay&&a!=='?'?valueInput(a,date,hours):fmt(hours,2))+'</td></tr>';}).join('')+'</tbody><tfoot><tr><th>合計</th><td>'+fmt(s.tc)+'</td><td>'+fmt(s.fa)+'</td><td>'+pct(s.faShare)+'</td><td>'+pct(s.d7)+'</td><td>'+pct(s.d25)+'</td><td>'+fmt(s.totalHours,2)+'</td></tr></tfoot></table>';
    const report=day?.report;
    E('opsLaborAdjustments').innerHTML='<div class="ops-labor-grid"><label>合計總工時<output>'+fmt(s.totalHours,2)+'</output></label><label>調出工時'+(isDay?'<input id="opsTransferOut" type="number" min="0" step="0.25" inputmode="decimal" value="'+(report?.transfer_out_hours??0)+'">':'<output>'+fmt(s.transferOut,2)+'</output>')+'</label><label>調入工時'+(isDay?'<input id="opsTransferIn" type="number" min="0" step="0.25" inputmode="decimal" value="'+(report?.transfer_in_hours??0)+'">':'<output>'+fmt(s.transferIn,2)+'</output>')+'</label><label>實際工時<output>'+fmt(s.actualHours,2)+'</output></label><label>天氣'+(isDay?'<input id="opsReportWeather" type="text" maxlength="30" value="'+escape(report?.weather||'')+'">':'<output>—</output>')+'</label></div>';
    const messages=[];if(v.missingPairs.length)messages.push('尚缺另一份成績檔：'+v.missingPairs.map(x=>x.slice(5)).join('、'));
    if(v.missingHourDays.length)messages.push(isDay?'尚有 '+day.missingAreas+' 區未填工時':'尚有 '+v.missingHourDays.length+' 天工時未填完整');
    if(v.missingBaselineDays.length)messages.push('去年 TC 缺少資料：'+v.missingBaselineDays.map(x=>x.slice(5)).join('、'));
    if(v.areas.has('?'))messages.push('有餐廳尚未設定區域');
    E('opsReportWarnings').textContent=messages.join('；');E('opsReportWarnings').hidden=!messages.length;
    bindHours();renderMonthHours(date);
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
    for(const [id,param] of [['opsTransferOut','p_transfer_out'],['opsTransferIn','p_transfer_in'],['opsReportWeather','p_weather']]){
      const input=E(id);if(!input)continue;input.onchange=()=>{const value=param==='p_weather'?input.value.trim():(M.number(input.value)??0);if(typeof value==='number'&&(value<0||value>9999)){notify('調整工時請填入 0～9999');return;}queueSave({p_record_date:selectedDate(),[param]:value});};
    }
  }
  function queueSave(args){
    notify('儲存中…');state.saveQueue=state.saveQueue.catch(()=>{}).then(async()=>{const r=await db.rpc('t995_save_operations_report',args);if(r.error)throw r.error;const row=r.data;const i=state.cache.reports.findIndex(x=>x.record_date===row.record_date);if(i>=0)state.cache.reports[i]=row;else state.cache.reports.push(row);notify('已儲存');const focused=document.activeElement;const key=focused?.dataset.area;render();if(key)E('opsAnalysisTable').querySelector('[data-area="'+key+'"]')?.focus();}).catch(error);return state.saveQueue;
  }
  async function refresh(force=false){
    const id=++state.request,date=selectedDate();notify('讀取中…');try{const data=await loadMonth(date,force);if(id!==state.request)return;state.month=date.slice(0,7);state.cache=data;state.mapping=new Map(data.mapping.map(x=>[M.clean(x.restaurant_name),x.area_code]));notify('');render();}catch(e){if(id===state.request)error(e);throw e;}
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
    XLSX.writeFile(wb,'營運日報_'+date+'.xlsx');notify('已匯出');
  }
  async function exportMonth(){await state.saveQueue;await refresh();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,applySheetFormat(XLSX.utils.aoa_to_sheet(monthHourRows(selectedDate())),[16,...Array(15).fill(13)]),'各區月工時');XLSX.writeFile(wb,'各區工時_'+selectedDate().slice(0,7)+'.xlsx');}
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
  E('opsExport').onclick=()=>exportDaily().catch(error);E('opsMonthExport').onclick=()=>exportMonth().catch(error);
  document.querySelectorAll('.ops-tab').forEach(b=>{const previous=b.onclick;b.onclick=()=>{if(previous)previous();if(b.dataset.opsTab==='scores')refresh().catch(()=>{});};});
})();
