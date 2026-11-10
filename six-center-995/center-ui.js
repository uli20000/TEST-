/* 依中心設定產生前台／後台的餐廳、店號、區域、領車點選單。
 * 995 設定沒有 restaurants 清單，維持 HTML 內原本已驗收的選項，不做任何變更。
 * 其他中心一律由 config/<中心>-business.js 產生，避免出現 995 的餐廳。
 * 必須在使用這些選單的程式之前載入（放在第一個 body script 前）。 */
(function(){
  'use strict';
  const B=window.CenterBusinessConfig;
  if(!B||!Array.isArray(B.restaurants))return;
  const active=B.restaurants.filter(r=>r.enabled!==false).slice().sort((a,b)=>String(a.store_code).localeCompare(String(b.store_code)));
  const opt=(value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;};
  function fill(id,placeholder,items){const el=document.getElementById(id);if(el)el.replaceChildren(opt('',placeholder),...items);}
  const named=()=>active.map(r=>opt(r.store_code,r.restaurant_name+'（'+r.store_code+'）'));
  fill('batteryRestaurant','請選擇餐廳名稱',named());
  fill('deviceRegisterRestaurant','請選擇電池所在餐廳',named());
  fill('batteryRegisterRestaurant','請選擇店號',active.map(r=>opt(r.store_code,r.store_code)));
  fill('employeeAreaInput','選擇區域',(B.areas||[]).map(([code,label])=>opt(code,label)));
  // 領車點：優先用設定的 pickupPoints（使用者提供的名稱），否則用 pickup_point:true 的餐廳；沒有資料時不猜測
  const pickup=Array.isArray(B.pickupPoints)?B.pickupPoints:active.filter(r=>r.pickup_point===true).map(r=>r.restaurant_name);
  fill('claimPoint',pickup.length?'請選擇領車點':'領車點尚未設定，請洽管理員',pickup.map(name=>opt(name,name)));
})();
