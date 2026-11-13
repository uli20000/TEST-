// 日間／夜間模式：預設跟隨系統，手動切換後記住（localStorage），後台與儀表板共用
(function(){const k='center-ui-theme',saved=localStorage.getItem(k),sys=matchMedia('(prefers-color-scheme: dark)').matches;
const set=t=>{document.documentElement.dataset.theme=t;document.querySelectorAll('.theme').forEach(b=>b.textContent=t==='dark'?'☀️ 日間':'🌙 夜間');};
set(saved||(sys?'dark':'light'));
addEventListener('DOMContentLoaded',()=>{set(document.documentElement.dataset.theme);document.querySelectorAll('.theme').forEach(b=>b.onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';localStorage.setItem(k,t);set(t);});});})();
