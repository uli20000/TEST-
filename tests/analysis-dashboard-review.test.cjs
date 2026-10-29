const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'analysis-dashboard.js'), 'utf8');
const instrumented = page.replace(/\}\)\(\);\s*$/, "window.__T995_TEST_HOOKS__={analysisOrders,factorComparisonPanels,waitRankRows,complaintCodeCounts,restaurantComplaintCodes,compareDelta,feedbackPage,state};\n})();");
assert.notEqual(instrumented, page, 'test hooks inserted before dashboard initialization');
const elements = new Map();
const element = () => ({
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  setAttribute(){}, querySelectorAll(){ return []; }, addEventListener(){},
  dataset: {}, style: {}, innerHTML: '', textContent: '', onclick: null
});
const metrics = {
  clean: value => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase(),
  areaFor: () => 'B',
  number: value => Number(value),
  AREAS: []
};
const window = {
  OpsMetrics: metrics,
  OpsSummary: { dates: () => [], months: () => [], weekLabel: () => 'W1' },
  supabase: { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }
};
const document = {
  querySelectorAll: () => [],
  getElementById(id){ if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }
};
vm.runInNewContext(instrumented, { window, document, console, Intl, Date, Map, Set, Number, String, Math, Promise });
const hooks = window.__T995_TEST_HOOKS__;

const day = '2026-10-28';
const batches = [{ id: 'by-order', report_type: 'ByOrder', report_date: day }, { id: 'by-date', report_type: 'ByDate', report_date: day }];
const rows = [];
for (let i = 0; i < 7; i++) {
  const order = `order-${1000 + i}`;
  const minute = String(i * 2).padStart(2, '0');
  rows.push({ batch_id: 'by-order', row_number: i + 1, store_code: '133', restaurant_name: '新竹店', order_number: order, payload: {
    '自動/手動': '手動', '落單時間': `${day} 11:${minute}:00`, '預計送達時間': `${day} 11:30:00`,
    '到達時間': `${day} 11:30:00`, '指派時間': i === 0 ? `${day} 11:20:00` : `${day} 10:30:00`,
    '外送出發': i < 3 ? `${day} 11:10:00` : i < 5 ? `${day} 11:20:00` : '',
    _courier_day_id: i < 5 ? 'rider-a' : '', D7: i < 5 ? 'Y' : 'N', D25: i < 4 ? 'Y' : 'N'
  }});
  rows.push({ batch_id: 'by-date', row_number: i + 1, store_code: '133', restaurant_name: '新竹店', order_number: order, payload: { 距離: i === 0 ? '2 公里' : i === 1 ? '2.4 公里' : '1.2 公里' } });
}
const data = { rows, batches, reports: [], delays: [{ record_date: day, store_code: '133', order_number: 'order-1000' }], mapping: [] };
const orders = hooks.analysisOrders(data, { start: day, end: day });
assert.equal(orders.length, 7);
assert.equal(orders[0].wait, true);
assert.equal(orders[0].late, true);
assert.equal(orders[1].late, false);
assert.equal(orders[0].cluster, true);
assert.equal(orders[0].distanceKm, 2);
assert.equal(orders[0].departureGroupSize, 3);
assert.equal(orders[3].departureGroupSize, 2);
assert.equal(orders[5].departureGroupSize, null);

const panels = hooks.factorComparisonPanels(data, { start: day, end: day }, 'D7');
const weeklyPanels = hooks.factorComparisonPanels(data, { start: '2026-10-26', end: '2026-11-01' }, 'D25');
const monthlyPanels = hooks.factorComparisonPanels(data, { start: '2026-10-01', end: '2026-10-31' }, 'D25');
assert.equal((weeklyPanels.match(/class=\"analysis-panel\"/g) || []).length, 6);
assert.equal((monthlyPanels.match(/class=\"analysis-panel\"/g) || []).length, 6);
assert.equal((panels.match(/class="analysis-panel"/g) || []).length, 6);
for (const label of ['等餐分析', '晚派分析', '集中單分析', '餐期單分析', '距離分析', '併單分析']) assert.ok(panels.includes(label));
assert.ok(panels.includes('2 公里內'));
assert.ok(panels.includes('超過 2 公里'));
assert.ok(panels.includes('1–2 單'));
assert.ok(panels.includes('3 單以上'));

const rank = hooks.waitRankRows([
  { moment: 1, code: '111', name: '甲店', cluster: true, wait: true },
  { moment: 2, code: '111', name: '甲店', cluster: true, wait: false },
  { moment: 3, code: '222', name: '乙店', cluster: true, wait: true }
], 'cluster');
assert.equal(rank.rows[0][1], '222', 'restaurant ranking sorts by wait rate, not raw wait count');
assert.deepEqual(Array.from(hooks.complaintCodeCounts([{ main_topic: 'A 產品正確' }, { main_topic: 'P 產品品質' }, { main_topic: 'P 產品品質' }]), x => [x.name, x.count]), [['A', 1], ['P', 2]]);
assert.equal(hooks.restaurantComplaintCodes([{ main_topic: 'H 親切服務' }, { main_topic: 'A 產品正確' }, { main_topic: 'H 親切服務' }]), 'H×2、A×1');
assert.equal(hooks.compareDelta(0.5, 0.4, 'rate'), '10.0%');
assert.ok(!hooks.compareDelta(0.5, 0.4, 'rate').includes('個百分點'));
const feedbackHtml = hooks.feedbackPage({ feedback: [
  { source_type: '0800', store_code: '133', restaurant_name: '新竹店', main_topic: 'A 產品正確' },
  { source_type: '0800', store_code: '133', restaurant_name: '新竹店', main_topic: 'P 產品品質' },
  { source_type: '0800', store_code: '066', restaurant_name: '新竹外送中心', main_topic: 'H 親切服務' }
] }, { feedback: [] }, { start: day, end: day });
assert.ok(feedbackHtml.includes('A×1、P×1'));
assert.ok(feedbackHtml.includes('抱怨代碼'));
assert.ok(!feedbackHtml.includes('A 產品正確'));
assert.ok(!feedbackHtml.includes('H 親切服務'));
assert.ok(!feedbackHtml.includes('0800 抱怨項目'), 'duplicate item card removed');
assert.ok(!feedbackHtml.includes('新竹外送中心'), '0800 restaurant ranking excludes delivery centers');
console.log('Dashboard factor groupings, departure counts, wait rankings, complaint codes, and percent deltas passed.');
