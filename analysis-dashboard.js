(function(){
  'use strict';
  const M=window.OpsMetrics,S=window.OpsSummary,$=id=>document.getElementById(id);
  const db=window.supabase.createClient('https://nurnboqwhctyswcufkyk.supabase.co','sb_publishable_YieSqh1zXq8wIvQiO9B_wg_ZbDkne7G');window.t995SupabaseClient=db;
  const labels={sstg:'SSTG',d7:'D7',d25:'D25',fa:'第三方佔比',waiting:'等餐',feedback:'080'};
  const independentStoreCodes=new Set(['066','062','227','190','248']);
  const state={period:'day',date:null,month:null,metric:'sstg',stores:[],catalog:new Map(),cache:new Map(),weather:new Map(),data:null,previous:null,comparisonRange:null,request:0};
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>M.number(v);
  const fmt=(v,d=0)=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':fmt(v*100,1)+'%';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const monthStart=d=>d.slice(0,7)+'-01';
  const addMonths=(d,n)=>{const x=new Date(monthStart(d)+'T12:00:00Z');x.setUTCMonth(x.getUTCMonth()+n);return x.toISOString().slice(0,10);};
  const selected=()=>state.period==='month'?state.month+'-01':state.date;
  const shiftDate=(d,n)=>M.addDays(d,n);
  const dateLabel=d=>{const weekday=['日','一','二','三','四','五','六'][new Date(d+'T12:00:00Z').getUTCDay()];return d.slice(5).replace('-','/')+'（'+weekday+'）';};
  const monthLabel=d=>new Intl.DateTimeFormat('zh-TW',{timeZone:'UTC',year:'numeric',month:'long'}).format(new Date(d+'T12:00:00Z'));
  const shiftMonth=(d,n)=>addMonths(d,n);
  const fullWeek=d=>{const monday=M.addDays(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7));return {start:monday,end:M.addDays(monday,6)};};
  const range=()=>state.period==='week'?fullWeek(state.date):M.range(selected(),state.period);
  const dates=(r)=>S.dates(r.start,r.end);
  function monthWeeks(d){const month=M.range(d,'month'),first=fullWeek(month.start).start,rows=[];for(let start=first;start<=month.end;start=M.addDays(start,7))rows.push(fullWeek(start));return rows;}
  function quarterMonths(d){const m=Number(d.slice(5,7)),q=Math.floor((m-1)/3)*3+1,y=d.slice(0,4);return [0,1,2].map(i=>y+'-'+String(q+i).padStart(2,'0'));}
  function weekIndex(d){const weeks=monthWeeks(d),r=fullWeek(d);return Math.max(0,weeks.findIndex(w=>w.start===r.start));}
  function periodLabel(r){return state.period==='day'?r.start:state.period==='week'?S.weekLabel(r.start)+'　'+r.start+' ～ '+r.end:state.month;}
  function status(message,error=false){$('status').textContent=message;$('status').className='period-status'+(error?' error':'');}
  async function paged(table,columns,filter,order='record_date'){
    const rows=[];for(let offset=0;;offset+=1000){let q=filter(db.from(table).select(columns));if(order)q=q.order(order);if(table==='t995_score_import_rows')q=q.order('row_number');const result=await q.range(offset,offset+999);if(result.error)throw result.error;rows.push(...(result.data||[]));if(!result.data||result.data.length<1000)return rows;}
  }
  async function loadDirectory(){if(state.stores.length)return;const result=await db.from('t995_restaurants').select('store_code,restaurant_name').eq('enabled',true).order('store_code');if(result.error)throw result.error;state.stores=result.data||[];state.catalog=new Map(state.stores.map(x=>[x.store_code,x]));}
  async function fetchRows(batches){const rows=[];for(let i=0;i<batches.length;i+=10){const ids=batches.slice(i,i+10).map(x=>x.id);rows.push(...await paged('t995_score_import_rows','batch_id,row_number,store_code,restaurant_name,order_number,payload',q=>q.in('batch_id',ids),'batch_id'));}return rows;}
  async function loadRange(r,force=false){
    const key=r.start+'|'+r.end;if(!force&&state.cache.has(key))return state.cache.get(key);await loadDirectory();
    const monthRange=M.range(r.star