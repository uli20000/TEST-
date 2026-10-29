import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { monthDates, fetchMonth } from './weather.mjs';
const origins=new Set(['https://uli20000.github.io','http://127.0.0.1:8765','http://localhost:8765']);
Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://uli20000.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
  const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  if(origin&&!origins.has(origin))return reply({error:'Origin not allowed'},403);
  try{
    const authorization=req.headers.get('authorization')||'';
    if(!authorization.startsWith('Bearer '))return reply({error:'請先登入'},401);
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
    const user=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:auth,error:authError}=await user.auth.getUser(authorization.slice(7));
    if(authError||!auth.user)return reply({error:'登入已過期'},401);
    const {data:admin,error:adminError}=await user.rpc('is_admin');
    if(adminError||admin!==true)return reply({error:'限管理員查詢'},403);
    const {month}=await req.json();monthDates(month);
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(month<'2013-07-01'||month>today.slice(0,7)+'-01')return reply({error:'可查詢 2013/07 起至本月的觀測資料'},400);
    const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:cached}=await service.from('t995_operations_weather_months').select('payload,fetched_at').eq('month',month).maybeSingle();
    const recent=month>=today.slice(0,7)+'-01',ttl=recent?2*3600000:7*86400000;
    const hasFailure=cached?.payload?.some((r:{status:string})=>r.status==='unavailable');
    const yesterdayDate=new Date(today+'T00:00:00Z');yesterdayDate.setUTCDate(yesterdayDate.getUTCDate()-1);const yesterday=yesterdayDate.toISOString().slice(0,10);
    const needsRecentRecheck=recent&&cached?.payload?.some((r:{date:string;status:string})=>r.date===yesterday&&['missing','partial'].includes(r.status));
    if(cached&&Date.now()-Date.parse(cached.fetched_at)<(hasFailure?5*60000:needsRecentRecheck?15*60000:ttl))return reply({rows:cached.payload,fetched_at:cached.fetched_at,source:'中央氣象署 CODiS'});
    let rows=await fetchMonth(month,today);const fetched_at=new Date().toISOString();
    // An upstream outage must not overwrite previously observed weather.
    if(cached)rows=rows.map(row=>row.status==='unavailable'?(cached.payload.find((old:any)=>old.date===row.date&&old.city===row.city&&['observed','partial'].includes(old.status))||row):row);
    if(!rows.every(r=>r.status==='unavailable'||r.status==='pending'))await service.from('t995_operations_weather_months').upsert({month,payload:rows,fetched_at});
    return reply({rows,fetched_at,source:'中央氣象署 CODiS'});
  }catch(e){return reply({error:e instanceof Error?e.message:'天氣查詢失敗'},400);}
});
