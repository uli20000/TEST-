// Central Weather Administration CODiS daily observations, Taiwan local calendar dates.
export const SOURCE='https://codis.cwa.gov.tw/StationData';
export function monthDates(month){
  if(!/^\d{4}-\d{2}-01$/.test(month)||!Number.isFinite(Date.parse(month+'T00:00:00Z'))||new Date(month+'T00:00:00Z').toISOString().slice(0,10)!==month)throw new Error('月份格式錯誤');
  const next=new Date(month+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
  const last=new Date(next.getTime()-86400000).toISOString().slice(0,10),days=[];
  for(let i=1;i<=Number(last.slice(-2));i++)days.push(month.slice(0,8)+String(i).padStart(2,'0'));
  return days;
}
export function stationsFor(month){
  const h={city:'新竹',id:'467571',name:'新竹',type:'cwb'};
  const t=month<'2026-01-01'?{city:'桃園',id:'C0C480',name:'桃園',type:'auto'}:month<'2026-03-01'?{city:'桃園',id:'467050',name:'新屋',type:'cwb'}:{city:'桃園',id:'C2C480',name:'桃園',type:'agr'};
  return month>='2026-03-01'?[h,t,{city:'桃園',id:'467050',name:'新屋',type:'cwb'}]:[h,t];
}
function validNumber(value,flag,min,max){
  if(value===null||value===undefined||String(value).trim()===''||(flag!==undefined&&flag!==null&&String(flag).trim()!=='0'))return null;
  const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
export function observation(row,station){
  const rain=row?.Precipitation,temperature=row?.AirTemperature;
  const trace=Number(rain?.Accumulation)===-9.8&&(rain?.Accumulationf==null||String(rain.Accumulationf).trim()==='0');
  const amount=validNumber(rain?.Accumulation,rain?.Accumulationf,0,3000);
  const mean=validNumber(temperature?.Mean,temperature?.Meanf,-50,60);
  return {date:String(row?.DataDate||'').slice(0,10),city:station.city,station_id:station.id,station_name:station.name,temperature:mean,precipitation:trace?null:amount,trace,status:mean!==null&&(amount!==null||trace)?'observed':'partial',source_url:SOURCE};
}
export async function fetchMonth(month,today,fetcher=fetch){
  const dates=monthDates(month),stations=stationsFor(month),results=await Promise.all(stations.map(async station=>{
    try{
      const body=new URLSearchParams({type:'chart_month',stn_type:station.type,stn_ID:station.id,start:month+'T00:00:00',end:dates.at(-1)+'T23:59:59',more:''});
      const response=await fetcher('https://codis.cwa.gov.tw/api/station',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('CWA HTTP '+response.status);
      const json=await response.json();if(json.code!==200)throw new Error('CWA response '+json.code);
      const rows=json.data?.find(s=>s.StationID===station.id)?.dts;if(!Array.isArray(rows))throw new Error('CWA missing station');
      return {station,rows:rows.filter(r=>dates.includes(String(r.DataDate).slice(0,10))).map(r=>observation(r,station)),failed:false};
    }catch{return {station,rows:[],failed:true};}
  }));
  return dates.flatMap(date=>['新竹','桃園'].map(city=>{
    const id=city==='新竹'?'467571':date>='2026-03-16'?'C2C480':date>='2026-01-01'?'467050':'C0C480';
    const result=results.find(r=>r.station.city===city&&r.station.id===id),station=result?.station;
    // A calendar day's observation is complete only after that day ends in Taiwan.
    const alternatives=results.filter(r=>r.station.city===city&&r.station.id!==id),primaryRow=result?.rows.find(r=>r.date===date),backupRows=alternatives.map(r=>r.rows.find(x=>x.date===date)).filter(Boolean),completeBackup=backupRows.find(r=>r.status==='observed');
    if(date<today){if(primaryRow?.status==='observed')return primaryRow;if(completeBackup)return completeBackup;if(primaryRow)return primaryRow;const partialBackup=backupRows[0];if(partialBackup)return partialBackup;}
    const unavailable=Boolean(result?.failed)&&alternatives.every(x=>x.failed);
    return {date,city,station_id:station?.id||id,station_name:station?.name||(city==='新竹'?'新竹':'桃園'),temperature:null,precipitation:null,trace:false,status:date>=today?'pending':unavailable?'unavailable':'missing',source_url:SOURCE};
  }));
}
