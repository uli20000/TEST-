(function(root){
 'use strict';
 function showStatus(){
  const c=root.CENTER_CONFIG;if(!c||c.environment==='production')return;
  const banner=document.createElement('div');banner.id='centerEnvironment';banner.setAttribute('role','status');
  banner.textContent='T'+c.center+' 共用程式測試版｜'+(c.environment==='preview'?'未連接資料庫，僅供檢視版面':'獨立測試資料，非正式紀錄');
  document.body.prepend(banner);
 }
 if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',showStatus);
 function previewClient(){
  const blocked=()=>({data:null,error:{message:'預覽未連接測試資料庫，沒有送出或儲存任何資料。'}});
  const query=()=>{let mutation=false,single=false;const q=new Proxy({}, {get(_,key){
   if(key==='then')return (resolve,reject)=>Promise.resolve(mutation?blocked():{data:single?null:[],error:null,count:0}).then(resolve,reject);
   return (...args)=>{if(['insert','update','upsert','delete'].includes(key))mutation=true;if(['single','maybeSingle'].includes(key))single=true;return q;};
  }});return q;};
  return {from:query,rpc:async()=>blocked(),auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>blocked(),signOut:async()=>({error:null})},storage:{from:()=>({upload:async()=>blocked(),download:async()=>blocked(),createSignedUrl:async()=>blocked(),remove:async()=>blocked()})}};
 }
 root.CenterRuntime={createClient(url,key){
  const c=root.CENTER_CONFIG;
  if(!c)throw new Error('缺少中心設定');
  if(c.environment==='preview')return previewClient();
  if(c.environment==='production'){
   if(url!==c.supabaseUrl||key!==c.publishableKey||c.productionConfirmed!==true||c.schema!=='public')throw new Error('正式設定不一致，已停止連線。');
   return root.supabase.createClient(url,key);
  }
  if(url!==c.supabaseUrl||key!==c.publishableKey||!c.testDatabaseConfirmed)throw new Error('中心設定不一致，已停止連線。');
  if(!/^shared_test_[a-z0-9_]+$/.test(c.schema||''))throw new Error('禁止連接非隔離測試schema');
  if(new URL(url).hostname.split('.')[0]==='nurnboqwhctyswcufkyk'&&!c.sharedProjectIsolationVerified)throw new Error('995共用專案隔離尚未驗證');
  if(new URL(url).hostname==='qhztjliketfujfiwemxh.supabase.co')throw new Error('997包含共用正式資料，禁止測試連線');
  const client=root.supabase.createClient(url,key,{db:{schema:c.schema},auth:{storageKey:'center-'+c.center+'-'+c.environment+'-'+c.schema, persistSession:true}});
  const allowTestScoreStorage=c.environment==='test'&&c.center==='995'&&c.schema==='shared_test_995'
   &&url==='https://vsezvxjuwwprvjxoeavl.supabase.co';
  const denied=async()=>({data:null,error:{message:'測試版禁止使用正式Storage、Edge Functions或跨schema操作。'}});
  const safeAuth=new Proxy(client.auth,{get(target,prop){if(prop==='signOut')return ()=>target.signOut({scope:'local'});const value=Reflect.get(target,prop);return typeof value==='function'?value.bind(target):value;}});
  return new Proxy(client,{get(target,prop){
   if(prop==='auth')return safeAuth;
   if(prop==='storage')return {from(bucket){
    if(allowTestScoreStorage&&bucket==='t995-score-source-archive'){
     return target.storage.from('shared-test-995-legacy-score-archive');
    }
    return new Proxy({},{get:()=>denied});
   }};
   if(prop==='functions')return {invoke:denied};
   if(prop==='schema'||prop==='channel')return ()=>{throw new Error('測試版禁止切換schema或訂閱正式Realtime');};
   const value=Reflect.get(target,prop);return typeof value==='function'?value.bind(target):value;
  }});
 }};
})(typeof window==='undefined'?globalThis:window);
