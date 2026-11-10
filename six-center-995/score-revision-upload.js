/* TEST-only two-step revision workflow. All retry state is memory-only; no deletion. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ScoreRevisionUpload=api;})(typeof globalThis==='undefined'?this:globalThis,root=>{
 'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const BASE='https://vsezvxjuwwprvjxoeavl.supabase.co';
 function create({enabled=false,readCurrent,upload,publish,identity,uuid=()=>root.crypto.randomUUID()}={}){
  let attempt=null,busy=false;
  function fail(message){throw Error(message);}
  function view(){if(!attempt)return {status:'idle'};return{status:attempt.status,date:attempt.date,version:attempt.version,expectedRevisionId:attempt.expected,files:attempt.parts.map(p=>({type:p.type,name:p.file.name,rowCount:p.rowCount})),receipt:attempt.receipt||null};}
  return {get state(){return view();},
   async review(pair){
    if(!enabled)fail('版本匯入尚未啟用。');if(busy)fail('操作進行中。');
    if(attempt&&['uncertain','submitting'].includes(attempt.status))fail('前次結果未確認，請先以原請求重試，不可更換來源或版本。');
    if(!pair||pair.dates?.length!==1)fail('版本匯入目前只接受同一天的兩份 .xlsx。');
    const date=pair.dates[0];if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail('報表日期無效。');
    const parts=['ByDate','ByOrder'].map(type=>{const p=pair.byType?.[type];if(!p?.file||!/^.+\.xlsx$/i.test(p.file.name)||p.file.size<1||p.file.size>50*1024*1024||!p.rows?.length||p.rows.some(row=>row.record_date!==date))fail('請選同日、非空且不超過50MB的兩份 .xlsx。');return{type,file:p.file,rowCount:p.rows.length,requestId:uuid(),archived:null};});
    busy=true;try{
     const owner=await identity();if(!UUID.test(owner||''))fail('請先登入測試管理員。');
     const current=await readCurrent(date);const revisions=current.revisions||[];
     if(revisions.length>1||revisions.some(x=>x.reportDate!==date||!UUID.test(x.revisionId||'')||!Number.isSafeInteger(x.version)))fail('目前版本資料不完整。');
     attempt={date,owner,parts,expected:revisions[0]?.revisionId??null,version:revisions[0]?.version??0,status:'reviewed'};return view();
    }finally{busy=false;}
   },
   async submit(){
    if(!enabled||!attempt)fail('請先核對目前版本。');if(busy)fail('匯入進行中，請勿重複送出。');
    if(attempt.status==='completed')return attempt.receipt;
    if(attempt.status==='conflict')fail('版本已變更，請重新核對後再確認，不會自動覆寫。');
    busy=true;try{
     if(await identity()!==attempt.owner)fail('登入帳號已變更，禁止沿用原請求。');
     attempt.status='submitting';
     for(const part of attempt.parts){
      if(part.archived)continue;
      const receipt=await upload({requestId:part.requestId,file:part.file,reportType:part.type,periodStart:attempt.date,periodEnd:attempt.date,rowCount:part.rowCount});
      if(receipt?.requestId!==part.requestId||receipt.status!=='archived'||receipt.verified!==true||!/^[a-f0-9]{64}$/.test(receipt.sha256||''))fail('封存結果未確認，請保留原檔並重試。');
      part.archived=receipt;
     }
     const receipt=await publish({byDateRequestId:attempt.parts[0].requestId,byOrderRequestId:attempt.parts[1].requestId,expectedRevisionId:attempt.expected});
     if(receipt?.status!=='revision_committed'||receipt.reportDate!==attempt.date||receipt.previousRevisionId!==attempt.expected||receipt.version!==attempt.version+1||!UUID.test(receipt.revisionId||'')||!UUID.test(receipt.requestId||''))fail('匯入回應未確認，請以相同來源重試。');
     for(const [i,key] of ['byDate','byOrder'].entries())if(receipt[key]?.eventId!==attempt.parts[i].requestId||receipt[key]?.sha256!==attempt.parts[i].archived.sha256||receipt[key]?.rowCount!==attempt.parts[i].rowCount)fail('來源回應不一致，請以原請求重試。');
     attempt.receipt=receipt;attempt.status='completed';return receipt;
    }catch(error){attempt.status=error.code==='REVISION_CONFLICT'?'conflict':error.definitive===true?'rejected':'uncertain';throw error;}finally{busy=false;}
   },
   cancel(){if(busy||attempt&&['uncertain','submitting'].includes(attempt.status))fail('請先確認前次結果；取消不會刪除已封存檔。');attempt=null;}
  };
 }
 function browser({config,db,fetchImpl=root.fetch}={}){
  const enabled=config?.features?.scoreRevisions===true;
  const guard=()=>{if(!enabled||config.environment!=='test'||config.supabaseUrl!==BASE||config.schema!=='shared_test_995'||config.testDatabaseConfirmed!==true||!config.publishableKey?.startsWith('sb_publishable_'))throw Error('版本匯入只允許獨立 TEST-T995。');};
  async function session(){guard();const r=await db.auth.getSession();if(r.error||!r.data?.session?.access_token||!r.data.session.user?.id)throw Error('請先登入測試管理員。');return r.data.session;}
  async function api(path,options){const s=await session(),r=await fetchImpl(BASE+path,{...options,redirect:'error',cache:'no-store',credentials:'omit',headers:{...options.headers,apikey:config.publishableKey,authorization:'Bearer '+s.access_token}});if(!r.ok){let code='REVISION_REJECTED';try{const x=await r.json();if(x?.code==='REVISION_CONFLICT')code=x.code;}catch{}const e=Error(r.status===409?'目前版本已變動或來源已使用，請核對結果。':'測試服務未完成請求（'+r.status+'），請保留原檔重試。');e.code=r.status===409?'REVISION_CONFLICT':code;e.definitive=[400,401,403,404,413,415,422,503].includes(r.status);throw e;}return r.json();}
  return create({enabled,identity:async()=>(await session()).user.id,readCurrent:date=>root.ScoreReadSource.load(db,date,date),
   upload:async p=>{const {file,...metadata}=p;metadata.filename=file.name;return api('/functions/v1/test995-archive/upload',{method:'POST',headers:{'content-type':'application/octet-stream','x-archive-metadata':JSON.stringify(metadata)},body:await file.arrayBuffer()});},
   publish:input=>api('/functions/v1/test995-score-revisions/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)})});
 }
 return {create,browser};
});
