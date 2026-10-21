const fs = require('fs'), vm = require('vm'), assert = require('assert');
const root = __dirname;
const html = fs.readFileSync(root + '/query.html', 'utf8');
const elements = new Map();
const el = id => {
  if (!elements.has(id)) elements.set(id, {value:'', checked:false, innerHTML:'', addEventListener(){}, replaceChildren(){this.innerHTML='';}});
  return elements.get(id);
};
const document = {getElementById:el, querySelectorAll:()=>[]};
const context = vm.createContext({document, console});
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    boot\(\);/, '');
vm.runInContext(script, context);
const data = Object.fromEntries(['meta','plants','penalties','accidents','query-rules','pacs','tax-rollup'].map(n=>[n,JSON.parse(fs.readFileSync(root+'/data/'+n+'.json','utf8'))]));
context.data = data;
vm.runInContext("initializeQuery(data.meta,data.plants,data.penalties,data.accidents,data['query-rules'],data.pacs,data['tax-rollup'])",context);
assert.equal(el('stage').innerHTML,'');
vm.runInContext("runQuery()",context);
assert(!el('stage').innerHTML.includes('q-sort'));
el('q-name').value = data.plants[0].name;
vm.runInContext('runQuery()', context);
assert(el('stage').innerHTML.includes('candidate'));
assert(!el('stage').innerHTML.includes('q-sort'));
const result=vm.runInContext(`(()=>{
  let checked=0;
  for(const p of PLANTS){
    for(const year of ["","113","114","115"]){
      for(const acc of ["","fire","boom","other","none"]){
        const view={year,acc,host:true,kinds:[]};
        const a=accBundle(p,view).shown;
        for(const r of a){
          if(r.plantId!==p.id||!queryDateHit(r.dispDate,year))throw Error("scope/year");
          if(acc==="none")throw Error("none");
          if(acc==="fire"&&r.kind!=="火災")throw Error("fire");
          if(acc==="boom"&&r.kind!=="爆炸")throw Error("boom");
          if(acc==="other"&&["火災","爆炸"].includes(r.kind))throw Error("other");
        }
        checked++;
      }
      for(const viol of ["","direct","other","none"]){
        for(const art of ["",...(QUERY_RULES.articles||[]).map(a=>a.key)]){
          const records=penBundle(p,{year,viol,art}).plant;
          for(const r of records){
            if(r.plantId!==p.id||!penaltyDateHit(r.date,year))throw Error("pen scope/year");
            if(viol==="none")throw Error("pen none");
            const fire=["direct","broad"].includes(r.tagFire);
            if(viol==="direct"&&!fire||viol==="other"&&fire)throw Error("violation");
            if(art&&!hasArt(r,art))throw Error("article");
          }
          checked++;
        }
      }
    }
    const kinds=accBundle(p,{year:"",host:true,kinds:["火災","爆炸"]}).shown;
    if(kinds.some(r=>!["火災","爆炸"].includes(r.kind)))throw Error("kinds");
  }
  selectedId=COMPANIES[0].id;
  renderDetail();
  return checked;
})()`,context);
for(const id of ['q-sort','q-year','q-kinds'])assert(el('stage').innerHTML.includes('id="'+id+'"'));
assert(!el('stage').innerHTML.includes('id="q-acc"'));
assert(!el('stage').innerHTML.includes('id="q-art"'));
assert(el('stage').innerHTML.includes('<option value="105">105年</option>'));
assert(el('stage').innerHTML.includes('職災快速查詢'));
assert.equal((el('stage').innerHTML.match(/data-kind=/g)||[]).length,17);
const quickFilter=vm.runInContext(`(()=>{
  const company=COMPANIES.find(c=>{
    const rows=rowsFor(c);
    return rows.acc.some(a=>a.kind==='火災')&&rows.acc.some(a=>a.kind!=='火災');
  });
  if(!company)throw Error('no company with mixed accident kinds');
  const all=bucketsFor(company,{year:'',acc:'',kinds:[]});
  const fire=bucketsFor(company,{year:'',acc:'fire',kinds:['火災']});
  if(!fire.fireAcc.length||fire.fireAcc.some(a=>a.kind!=='火災')||fire.otherAcc.length)throw Error('accident quick filter');
  if(fire.firePacs.some(a=>a.kind!=='火災')||fire.otherPacs.length)throw Error('public accident quick filter');
  if(fire.firePen.length!==all.firePen.length||fire.otherPen.length!==all.otherPen.length)throw Error('penalties changed by accident filter');
  const fall=bucketsFor(company,{year:'',acc:'other',kinds:[]});
  if(fall.fireAcc.length||fall.firePacs.length||!fall.otherAcc.length)throw Error('other accident filter');
  const publicCompany=COMPANIES.find(c=>rowsFor(c).pacs.length>1);
  if(!publicCompany)throw Error('no company with public accident cases');
  const publicRows=rowsFor(publicCompany).pacs;
  const publicKind=publicRows[0].kind;
  const publicView=bucketsFor(publicCompany,{year:'',acc:'',kinds:[publicKind]});
  const shownPublic=publicView.firePacs.concat(publicView.otherPacs);
  if(!shownPublic.length||shownPublic.some(a=>a.kind!==publicKind)||shownPublic.length>=publicRows.length)throw Error('public accident kind filter');
  return company.id;
})()`,context);
const olderPenalty=vm.runInContext(`(()=>{
  const company=COMPANIES.find(c=>rowsFor(c).pen.some(p=>(p.date||'').startsWith('105/')));
  if(!company)throw Error('no first-year company penalty');
  const older=rowsFor(company).pen.find(p=>(p.date||'').startsWith('105/'));
  const year=older.date.split('/')[0];
  const all=bucketsFor(company,{year:'',acc:'',kinds:[]});
  const selected=bucketsFor(company,{year,acc:'',kinds:[]});
  if(!all.firePen.concat(all.otherPen).some(p=>p.id===older.id))throw Error('older penalty missing from default');
  if(!selected.firePen.concat(selected.otherPen).some(p=>p.id===older.id))throw Error('older penalty missing from selected year');
  return year;
})()`,context);
assert(!el('stage').innerHTML.includes('id="q-city"'));
assert(!el('stage').innerHTML.includes('本資料未查得'));
assert(data['query-rules'].fireCriteria.groups.length);
assert(data['query-rules'].articles.every(a => !('y' in a) && !('n' in a)));
assert(!html.includes('高風險清冊'));
assert(html.includes('非屬本網站所稱之高風險廠場'));
vm.runInContext('renderCandidates()',context);
assert(!el('stage').innerHTML.includes('q-sort'));
el('q-sort').value='oldest';
assert.equal(vm.runInContext('recentFirst([{date:"115/01/01"},{date:"113/01/01"}],"date")[0].date',context),'113/01/01');
el('q-sort').value='';
assert.equal(vm.runInContext('recentFirst([{date:"115/01/01"},{date:"113/01/01"}],"date")[0].date',context),'115/01/01');
const demo=fs.readFileSync(root+'/demo.html','utf8');
new vm.Script(demo.match(/<script>([\s\S]*?)<\/script>/)[1]);
assert(demo.includes('id="q-sort"'));
assert(demo.includes('職災快速查詢'));
console.log('PASS:',result,'real-data filter combinations; company quick filter',quickFilter,'older penalty year',olderPenalty,'selection gate, return, sorting, offline syntax.');
