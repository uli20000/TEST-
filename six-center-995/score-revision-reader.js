/* Offline read-cutover adapter. No production fallback and no API grants.
 * The supplied client must already be bound to the reviewed prototype schema.
 * This does not enable existing pages or expose the private schema online.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ScoreRevisionReader=api;})(typeof globalThis==='undefined'?this:globalThis,()=>{
 'use strict';
 const SCHEMA='shared_test_995_score_revision_offline';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('Invalid report date');return value;}
 function normalize(data,start,end){
  if(!data||!Array.isArray(data.pairs))throw Error('Missing active pair snapshot');
  const batches=[],rows=[],revisions=[],days=new Set(),ids=new Set();
  for(const pair of data.pairs){
   const day=date(pair.reportDate);
   if(day<start||day>end||days.has(day))throw Error('Duplicate or out-of-range active report date');
   if(!UUID.test(pair.revisionId||'')||ids.has(pair.revisionId)||!Number.isSafeInteger(pair.version)||pair.version<1)throw Error('Invalid active revision identity');
   days.add(day);ids.add(pair.revisionId);revisions.push({reportDate:day,revisionId:pair.revisionId,version:pair.version});
   for(const [key,type] of [['byDate','ByDate'],['byOrder','ByOrder']]){
    const part=pair[key],source=part?.source;
    if(!source||!Array.isArray(part.rows)||!part.rows.length||source.rowCount!==part.rows.length)throw Error('Incomplete active report pair');
    if(!UUID.test(source.eventId||'')||!Number.isSafeInteger(source.size)||source.size<1||!/^[a-f0-9]{64}$/.test(source.sha256||''))throw Error('Invalid active source metadata');
    const id=pair.revisionId+':'+type,rowNumbers=new Set();
    batches.push({id,report_date:day,report_type:type,row_count:part.rows.length,revision_id:pair.revisionId,revision_version:pair.version,source_file:source.filename});
    for(const row of part.rows){
     if(row.record_date!==day||!Number.isSafeInteger(row.row_number)||row.row_number<1||rowNumbers.has(row.row_number)||!row.payload||typeof row.payload!=='object'||Array.isArray(row.payload))throw Error('Invalid active report row');
     rowNumbers.add(row.row_number);
     // Deliberate projection: caller cannot replace the revision-bound batch ID.
     rows.push({batch_id:id,row_number:row.row_number,record_date:day,store_code:row.store_code??null,restaurant_name:row.restaurant_name??null,order_number:row.order_number??null,payload:JSON.parse(JSON.stringify(row.payload))});
    }
   }
   if(pair.byDate.source.eventId===pair.byOrder.source.eventId)throw Error('Pair sources must be distinct');
  }
  return {batches,rows,revisions};
 }
 function create({db,enabled=false,boundSchema}={}){
  return Object.freeze({async load(start,end){
   if(!enabled)throw Error('Revision reads are disabled pending reviewed cutover');
   date(start);date(end);if(end<start||(Date.parse(end)-Date.parse(start))/86400000>=366)throw Error('Report range must contain 1–366 days');
   if(boundSchema!==SCHEMA||!db||typeof db.rpc!=='function')throw Error('An explicitly bound isolated revision client is required');
   const result=await db.rpc('read_active_score_pairs',{p_start:start,p_end:end});
   if(result.error)throw result.error;
   return normalize(result.data,start,end);
  }});
 }
 // Existing report/analysis/forecast loaders can consume this one snapshot.
 // Never re-query legacy batch or row tables after choosing the revision path.
 async function loadReportSource(reader,start,end){
  const snapshot=await reader.load(start,end);
  return {...snapshot,forecastBatches:snapshot.batches.filter(x=>x.report_type==='ByOrder').map(x=>({...x}))};
 }
 return {SCHEMA,create,normalize,loadReportSource};
});
