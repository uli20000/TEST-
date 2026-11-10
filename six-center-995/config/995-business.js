// Verified from T995 89b697196e9faad3821f1cca5303b0fef5872991. Not a default for other centers.
(function(root){
  'use strict';
  const config={
    center:'995',verified:true,centerName:'桃園外送中心',regionLabel:'桃園',
    // 原本寫死在共用程式的995規則，2026-11-10 移到設定（行為不變）
    independentStores:['066','062','137','190','227','248'],
    feedback0800AreaNames:['中一區'],
    lineRankingExcluded:{stores:['227'],names:['桃園新屋']},
    areas:[['A','新竹'],['B','竹北'],['C','竹東'],['D','中壢'],['E','桃園'],['F','楊梅'],['G','大園'],['H','大溪'],['I','林口'],['J','大竹'],['K','苗栗']],
    acAssignments:[
      {name:'Abby',stores:['133','144','203','562']},
      {name:'Avery',stores:['025','173','066','214','587','594','235']},
      {name:'Chance',stores:['095','209','099','018','093','137','062','154','201']},
      {name:'Jewel',stores:['098','179','165','182','183','142','190','167','013']},
      {name:'Renee',stores:['041','161','227','516','544','084','242','248','580']}
    ],
    nonDeliveryStores:['201','203'],scopeEffectiveDate:'2026-11-01',
    removedStores:['025','173','580'],removedNames:['苗栗中正','苗栗竹南','苗栗頭份'],removedAreas:['K'],
    scopeNote:'11/1起排除苗栗三店；歷史保留',
    weatherCities:['新竹市','新竹縣','桃園'],
    // 天氣依餐廳所在縣市（使用者 2026-11-10 決定）：新竹市、新竹縣分開；林口（新北）歸桃園；
    // 苗栗三店（11/1前歷史）995沒有苗栗測站，顯示無天氣資料（null）
    weatherCityByStore:{
      '013':'新竹市','154':'新竹市','214':'新竹市','587':'新竹市','594':'新竹市',
      '066':'新竹縣','133':'新竹縣','144':'新竹縣','203':'新竹縣','235':'新竹縣','562':'新竹縣',
      '041':'桃園','062':'桃園','084':'桃園','095':'桃園','098':'桃園','099':'桃園','137':'桃園','142':'桃園','161':'桃園','165':'桃園','167':'桃園',
      '179':'桃園','182':'桃園','183':'桃園','190':'桃園','201':'桃園','209':'桃園','227':'桃園','242':'桃園','248':'桃園','516':'桃園','544':'桃園',
      '018':'桃園','093':'桃園',
      '025':null,'173':null,'580':null
    },weatherCityByArea:{A:'新竹市',B:'新竹縣',C:'新竹縣',D:'桃園',E:'桃園',F:'桃園',G:'桃園',H:'桃園',I:'桃園',J:'桃園',K:null},
    forecast:{weeks:8,growth:0.06,switchThreshold:null,tplh:2.5,thirdParty:0.20},
    forecastFormula:'Power BI預估｜去年對應週同星期（前52週）TC×1.06，各區進位；需求工時÷2.5；2026/11/1起排除苗栗三店；缺去年資料留空',
    weeklySalesNotes:{'2026-10-19':' 10/23、10/24 停班停課，營業額為 0，採 BI 原週成績。','2026-10-26':' 跨 11/1 苗栗範圍異動，採 BI 原週餐廳範圍。'},
    weeklySalesLimitation:'週資料採 BI SSSG%_wk。W43 的 10/23、10/24 營業額為 0。W44 採原週餐廳範圍。'
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=config;else root.CenterBusinessConfig=config;
})(typeof window!=='undefined'?window:globalThis);
