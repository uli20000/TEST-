/* GES 意見（OSAT 整體滿意度評論）：解析每週匯出檔、關鍵字分類。純函式，不碰資料庫。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GesComments=api;})(globalThis,function(){
  'use strict';
  const SOURCE_TYPE='GES_COMMENT';
  const clean=v=>String(v??'').normalize('NFKC').replace(/\s+/g,' ').trim();
  const HEAD={restaurant:'餐廳_名稱',source:'來源',time:/^日期範圍/,rating:/^綜合評級/,comment:'OSAT整體滿意度評論'};
  const headerMatch=(cell,want)=>want instanceof RegExp?want.test(clean(cell)):clean(cell)===want;
  function isCommentHeader(row){return (row||[]).some(x=>headerMatch(x,HEAD.restaurant))&&(row||[]).some(x=>headerMatch(x,HEAD.comment));}
  // 匯出檔時間欄標示 +09:00；台灣是 +08:00，所以先減 1 小時再取日期
  function offsetHours(header){const m=clean(header).match(/([+-])(\d{1,2}):?(\d{2})?\s*GMT/i)||clean(header).match(/GMT\s*([+-])(\d{1,2}):?(\d{2})?/i);if(!m)return 8;return (m[1]==='-'?-1:1)*(Number(m[2])+Number(m[3]||0)/60);}
  const pad=n=>String(n).padStart(2,'0');
  function taipeiTime(value,offset){
    let ms;
    if(value instanceof Date&&!Number.isNaN(value.getTime()))ms=Date.UTC(value.getFullYear(),value.getMonth(),value.getDate(),value.getHours(),value.getMinutes(),value.getSeconds());
    else if(typeof value==='number'&&Number.isFinite(value))ms=Math.round((value-25569)*86400000);
    else{const m=clean(value).match(/^(20\d{2})[./-](\d{1,2})[./-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);if(!m)return null;ms=Date.UTC(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));}
    const d=new Date(ms-(offset-8)*3600000);
    return {date:`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`,time:`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`};
  }
  function weekOf(date){const d=new Date(date+'T12:00:00Z'),day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {start,end:d.toISOString().slice(0,10)};}
  function isoWeek(date){const d=new Date(date+'T12:00:00Z'),day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day+3);const first=new Date(Date.UTC(d.getUTCFullYear(),0,4));return 1+Math.round(((d-first)/86400000-3+((first.getUTCDay()+6)%7))/7);}
  function rating(value){const n=Number(clean(value).replace(/[^\d.]/g,''));return Number.isFinite(n)&&clean(value)!==''?n:null;}
  // matrix：SheetJS header:1 的列陣列。stores：{byName:Map}。回傳要寫進 feedback_import_rows 的列（不含 source_key 雜湊，由呼叫端補）
  function parse(matrix,stores){
    const headerRow=(matrix||[]).findIndex(isCommentHeader);
    if(headerRow<0)throw new Error('找不到 GES 意見欄位（餐廳_名稱／OSAT整體滿意度評論）。');
    const headers=matrix[headerRow].map(x=>String(x??'').trim()),find=want=>headers.findIndex(h=>headerMatch(h,want));
    const ix={restaurant:find(HEAD.restaurant),source:find(HEAD.source),time:find(HEAD.time),rating:find(HEAD.rating),comment:find(HEAD.comment)};
    if(ix.time<0)throw new Error('GES 意見檔缺少日期欄。');
    const offset=offsetHours(headers[ix.time]),out=[];
    for(const cells of matrix.slice(headerRow+1)){
      const restaurant=clean(cells[ix.restaurant]),content=String(cells[ix.comment]??'').replace(/\r\n?/g,'\n').trim();
      if(!restaurant&&!content)continue;
      const when=taipeiTime(cells[ix.time],offset);if(!when)continue;
      const week=weekOf(when.date),store=stores?.byName?.get(restaurant),score=rating(cells[ix.rating]);
      out.push({record_date:when.date,period_start:week.start,period_end:week.end,restaurant_name:restaurant,store_code:store?.store_code||'',
        source_channel:ix.source>=0?clean(cells[ix.source]):'',feedback_kind:score===null?'':score+' 星',content,
        raw_fields:{餐廳_名稱:restaurant,來源:ix.source>=0?clean(cells[ix.source]):'',時間:when.date+' '+when.time,原始時間欄:headers[ix.time],評級:score,意見:content}});
    }
    if(!out.length)throw new Error('GES 意見檔沒有可辨識日期的意見。');
    return out;
  }
  // 分類：同一則可有多個分類。錯餐、漏給、遲到、提早送達、無法配送各自獨立判斷，不互相歸併。
  const CATEGORIES=[
    {key:'wrong',label:'錯餐',re:/錯餐|送錯(?!地|門牌|棟|樓|大樓|社區|戶|樓層)|拿錯|誤送|餐點都?錯|別人的餐|送來的是|送成|品項錯|做錯/},
    {key:'missing',label:'漏給',re:/漏送|漏給|漏掉|漏餐|少送|少給|少了|少[一二兩三四幾]?(包|個|杯|份|塊|支|樣|盒|罐)|(?<![錢款]都?還?)沒給|沒有給|未給|沒附|沒有附|缺少|缺了/},
    {key:'late',label:'遲到',re:/遲到|延遲|延誤|延後|晚到|晚了|晚\s*\d|晚[一二三四五六七八九十半幾快]|[比較超].{0,12}晚|(?<!流程|下單|結帳|點餐)太久|過久|過長|時間長|等了|等很久|等太久|還沒到|才到|才送到|才拿到|才收到|超時|不準時|無法準時|沒有準時/},
    {key:'early',label:'提早送達',re:/太早(送|到)|(提早|提前)(?!下樓|出門|下單|訂餐|點餐|預訂).{0,8}(送|到)|早到|過早(送|到)/},
    {key:'undeliverable',label:'無法配送／送錯地點',re:/無法配送|無法外送|不能送|拒送|送錯(地|門牌|棟|樓|大樓|社區|戶|樓層)|送到(別|隔壁|對面|錯)|地址錯|門牌錯/},
    {key:'quality',label:'餐點品質',re:/冷掉|冷了|都冷|涼的|涼了|不熱|很乾|太乾|乾硬|很鹹|太鹹|難吃|不好吃|濕軟|軟了|泡濕|口感|生的|沒熟|異物|頭髮/},
    {key:'package',label:'包裝灑漏',re:/漏出|打翻|翻倒|灑|潑|破損|破掉|掉出|東倒西歪|翻過來|壓扁|壓壞|沒蓋好|沒折好|沒封|封口/},
    {key:'attitude',label:'服務態度',re:/態度(?!很?(好|佳|親切|不錯|良好))|臉色|不耐煩|掛斷|掛電話|一字不說|吵架|口氣|很兇|兇|不禮貌|沒禮貌|連道歉|沒有道歉|沒道歉/},
    {key:'contact',label:'未通知聯繫',re:/沒人接|沒接|未接|沒有?.{0,6}(致電|通知|電話|聯繫|聯絡)|未.{0,4}(通知|致電)|外送員.{0,4}不見|找不到外送員/},
    {key:'system',label:'APP／優惠／發票',re:/APP|App|app|系統|優惠|折扣|兌換|發票|載具|點不到|無法點|訂單狀態|餐點狀態/},
  ];
  const OTHER={key:'other',label:'其他',re:null};
  // 否定句（沒遲到、未漏給…）先拿掉，不算命中
  const NEGATED=/(並沒有?|沒有?|並未|未|不算)(遲到|延遲|延誤|晚到|超時|漏給|漏送|少送|少給|錯餐|送錯)(?!才怪)/g;
  function classify(text){const s=clean(text).replace(NEGATED,'');const hits=CATEGORIES.filter(c=>c.re.test(s)).map(c=>c.label);return hits.length?hits:[OTHER.label];}
  // 依分類計數（一則多類時每類各算一次）；順序固定
  function summarize(rows){const counts=new Map([...CATEGORIES,OTHER].map(c=>[c.label,0]));for(const r of rows)for(const tag of classify(r.content))counts.set(tag,counts.get(tag)+1);return [...counts].map(([label,count])=>({label,count}));}
  return {SOURCE_TYPE,CATEGORIES:[...CATEGORIES,OTHER].map(c=>c.label),isCommentHeader,parse,classify,summarize,taipeiTime,weekOf,isoWeek,offsetHours};
});
