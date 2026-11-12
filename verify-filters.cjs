const fs = require('fs'), vm = require('vm'), assert = require('assert');
const root = __dirname;
const html = fs.readFileSync(root + '/query.html', 'utf8');
const elements = new Map();
const el = id => {
  if (!elements.has(id)) elements.set(id, {value:'', checked:false, innerHTML:'', addEventListener(){}, replaceChildren(){this.innerHTML='';}});
  return elements.get(id);
};
const context = vm.createContext({document: {getElementById:el, querySelectorAll:()=>[]}, console});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\n\s*boot\(\);\s*$/, ''), context);
const data = Object.fromEntries(['meta','plants','penalties','accidents','query-rules','tax-rollup'].map(n=>[n,JSON.parse(fs.readFileSync(root+'/data/'+n+'.json','utf8'))]));
context.data = data;
const initialize = "initializeQuery(data.meta,data.plants,data.penalties,data.accidents,data['query-rules'],data['tax-rollup'])";
vm.runInContext(initialize, context);
const excluded = JSON.parse(fs.readFileSync(root+'/data/company-exclusions.json','utf8')).companies;
assert.equal(excluded.length, 28);
assert.equal(data.meta.candidateCompanies, 141);
for (const company of excluded) {
  assert(!data.plants.some(plant => plant.tax === company.tax), 'excluded company still in roster: '+company.tax);
  assert.equal(vm.runInContext('findMatches("",'+JSON.stringify(company.tax)+').length',context), 0);
}
assert.deepEqual(data.meta.penaltyQueryYears, [105,115]);
assert(vm.runInContext('findMatches("","11332202").length>0 && findMatches("","94654805").length>0 && findMatches("","58650902").length>0 && findMatches("國防部軍備局","").length>0',context), 'unrequested scope changes');
assert.equal(el('stage').innerHTML, '');
vm.runInContext('runQuery()', context);
assert(!el('stage').innerHTML.includes('candidate'));
const result = vm.runInContext(`(() => {
  const candidates = findMatches('', '');
  if(candidates.length !== META.candidateCompanies) throw Error('candidate metadata');
  let combinations = 0;
  for(const company of COMPANIES) {
    const all = bucketsFor(company, {});
    const visible = all.firePen.length + all.fireAcc.length > 0;
    if(candidates.includes(company) !== visible) throw Error('empty company in candidates');
    if(company.tax && findMatches('', company.tax).includes(company) !== visible) throw Error('tax lookup');
    const same = (row) => row.plantId && company.plants.some(p => p.id === row.plantId) || company.tax && row.tax === company.tax;
    for(const year of ['', '105', '111', '113', '114', '115']) {
      for(const kinds of [[], ['火災'], ['爆炸'], ['火災','爆炸'], ['墜落、滾落']]) {
        const rows = bucketsFor(company, {year, kinds});
        for(const row of rows.fireAcc) {
          if(!same(row) || !queryDateHit(row.dispDate, year) || !FIRE_KINDS.includes(row.kind)) throw Error('accident scope');
          if(kinds.length && !kinds.includes(row.kind)) throw Error('accident kind');
        }
        for(const row of rows.firePen) {
          if(!same(row) || !penaltyDateHit(row.date, year)) throw Error('penalty scope');
        }
        const base = bucketsFor(company, {year});
        if(rows.firePen.map(r=>r.id).join() !== base.firePen.map(r=>r.id).join()) throw Error('kind filter changed penalties');
        combinations++;
      }
    }
  }
  const company = candidates.find(c => rowsFor(c).pen.some(p => p.date.startsWith('105/')));
  if(!company || !bucketsFor(company, {year:'105'}).firePen.length) throw Error('older fire penalty missing');
  selectedId = candidates[0].id;
  renderDetail();
  return {candidates: candidates.length, combinations};
})()`, context);
for(const id of ['q-sort', 'q-year', 'q-kinds', 'sec-fire-pen', 'sec-fire-acc']) assert(el('stage').innerHTML.includes('id="'+id+'"'));
assert.equal((el('stage').innerHTML.match(/data-kind=/g)||[]).length, 2);
assert(el('stage').innerHTML.includes('未落實火災爆炸預防裁罰'));
assert(el('stage').innerHTML.includes('發生火災爆炸職災'));
assert(el('stage').innerHTML.includes('<option value="105">105年</option>'));
assert(!/sec-other|otherPacs|firePacs|PACS|重大職災公開網|高風險廠場/.test(html));
// Fresh imports must also reject unrelated records before a data rebuild.
vm.runInContext(`(() => {
  const plants = ['11111111','22222222','33333333','44444444','55555555','66666666','77777777','88888888']
    .map((tax,i)=>({id:'p'+i,tax,name:'測試'+i+'股份有限公司'}));
  const pen = (id,plantId,props={})=>({id,no:id,plantId,date:'115/01/02',arts:[],tagFire:'other',...props});
  const acc = (id,plantId,props={})=>({id,no:id,plantId,dispDate:'115/01/02',kind:'火災',...props});
  const penalties = [pen('fall','p1'), pen('law','p2',{arts:[{law:'設規',n:173}]}),
    pen('same-no','p3'), pen('unrelated-company','p1',{no:'same-no'}),
    pen('excluded','p5',{no:'勞職授字第1130205857號',tagFire:'broad'}),
    pen('old','p6',{date:'104/01/01',tagFire:'broad'})];
  const accidents = [acc('fall-acc','p1',{kind:'墜落、滾落'}),acc('same-no','p3'),acc('only-acc','p4')];
  const rollup = {penalties:[pen('roll',null,{tax:'88888888',article6Fire:true})],accidents:[]};
  initializeQuery(data.meta,plants,penalties,accidents,data['query-rules'],rollup);
  const taxes = findMatches('', '').map(c=>c.tax).sort().join();
  if(taxes !== ['33333333','44444444','55555555','88888888'].join()) throw Error('fixture candidates: '+taxes);
  if(rowsFor(COMPANIES.find(c=>c.tax==='22222222')).pen.length) throw Error('same number leaked across companies');
  if(dispositionCount([{no:'a'},{no:'a'},{no:'b'}])!==2) throw Error('disposition dedupe');
})()`, context);
el('q-tax').value = '11111111';
vm.runInContext('runQuery()', context);
assert(!el('stage').innerHTML.includes('class="candidate"'));
assert(el('stage').innerHTML.includes('查無符合的火災爆炸職災或裁罰紀錄'));
assert(!el('stage').innerHTML.includes('非屬'));
vm.runInContext(initialize, context);
const tax = vm.runInContext("findMatches('','')[0].tax", context);
el('q-tax').value = tax;
vm.runInContext('runQuery()', context);
assert(el('stage').innerHTML.includes('class="candidate"'));
assert(!el('stage').innerHTML.includes('q-sort'));
el('q-sort').value = 'oldest';
assert.equal(vm.runInContext('recentFirst([{date:"115/01/01"},{date:"113/01/01"}],"date")[0].date',context),'113/01/01');
el('q-sort').value = '';
assert.equal(vm.runInContext('recentFirst([{date:"115/01/01"},{date:"113/01/01"}],"date")[0].date',context),'115/01/01');
assert(!fs.existsSync(root+'/data/pacs.json'));
for(const row of [...data.accidents,...data['tax-rollup'].accidents]) assert(['火災','爆炸'].includes(row.kind));
const demo = fs.readFileSync(root+'/demo.html','utf8');
new vm.Script(demo.match(/<script>([\s\S]*?)<\/script>/)[1]);
assert(!/"pacs"|DEMO\.pacs|重大職災公開網|高風險廠場|sec-other/.test(demo));
console.log('PASS:', result.candidates, 'candidate companies;', result.combinations, 'real-data filter combinations; empty/unrelated/excluded/year/tax-rollup fixtures; sort and offline scope.');
