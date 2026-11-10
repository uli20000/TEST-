/* Feature-gated TEST-only revision reader. No production fallback on failure. */
(function(root,factory){const api=factory(root,typeof module==='object'&&module.exports?require('./score-revision-reader.js'):root.ScoreRevisionReader);if(typeof module==='object'&&module.exports)module.exports=api;else root.ScoreReadSource=api;})(typeof globalThis==='undefined'?this:globalThis,(root,R)=>{
 'use strict';
 const URL='https://vsezvxjuwwprvjxoeavl.supabase.co';
 function enabled(config=root.CENTER_CONFIG){return config?.features?.scoreRevisions===true;}
 function create({config,db,fetchImpl=root.fetch}={}){
  return {async load(start,end){
   if(!enabled(config))return null;
   if(config.environment!=='test'||config.supabaseUrl!==URL||config.schema!=='shared_test_995'||config.testDatabaseConfirmed!==true||!config.publishableKey?.startsWith('sb_publishable_'))throw Error('Revision reader requires the isolated TEST-T995 configuration');
   if(typeof start!=='string'||typeof end!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||new Date(start).toISOString().slice(0,10)!==start||new Date(end).toISOString().slice(0,10)!==end||end<start||(Date.parse(end)-Date.parse(start))/86400000>=366)throw Error('Invalid revision report range');
   if(!R||typeof fetchImpl!=='function')throw Error('Revision reader unavailable');
   const auth=await db.auth.getSession();if(auth.error||!auth.data?.session?.access_token)throw Error('Administrator session required');
   const response=await fetchImpl(URL+'/functions/v1/test995-score-revisions/range',{method:'POST',redirect:'error',cache:'no-store',headers:{'content-type':'application/json',apikey:config.publishableKey,authorization:'Bearer '+auth.data.session.access_token},body:JSON.stringify({start,end})});
   if(!response.ok)throw Error('Revision read failed ('+response.status+'); legacy data was not substituted');
   return R.normalize(await response.json(),start,end);
  }};
 }
 async function load(db,start,end){return create({config:root.CENTER_CONFIG,db}).load(start,end);}
 function within(snapshot,start,end){const batches=snapshot.batches.filter(x=>x.report_date>=start&&x.report_date<=end),ids=new Set(batches.map(x=>x.id));return{batches,rows:snapshot.rows.filter(x=>ids.has(x.batch_id)),revisions:snapshot.revisions.filter(x=>x.reportDate>=start&&x.reportDate<=end)};}
 return {enabled,create,load,within};
});
