const fs = require('fs'), vm = require('vm'), assert = require('assert');
const root = __dirname;
const html = fs.readFileSync(root + '/index.html', 'utf8');
const elements = new Map();
const el = id => {
  if (!elements.has(id)) elements.set(id, {value:'', checked:false, innerHTML:'', addEventListener(){}, replaceChildren(){this.innerHTML='';}});
  return elements.get(id);
};
const document = {getElementById:el, querySelectorAll:()=>[]};
const context = vm.createContext({document, console});
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    boot\(\);/, '');
vm.runInContext(script, context);
const data = Object.fromEntries(['meta','plants','penalties','accidents','gap-penalty','gap-accident'].map(n=>[n,JSON.parse(fs.readFileSync(root+'/data/'+n+'.json','utf8'))]));
context.data = data;
vm.runInContext("initializeQuery(data.meta,data.plants,data.penalties,data.accidents,data['gap-penalty'])",context);
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
        for(const art of ["",...(RANKING.topArts||[]).map(a=>a.key)]){
          const records=penBundle(p,{year,viol,art}).plant;
          for(const r of records){
            if(r.plantId!==p.id||!queryDateHit(r.date,year))throw Error("pen scope/year");
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
  selectedId=PLANTS[0].id;
  renderDetail();
  return checked;
})()`,context);
for(const id of ['q-sort','q-acc','q-viol','q-year','q-art','q-kinds','q-host'])assert(el('stage').innerHTML.includes('id="'+id+'"'));
assert(!el('stage').innerHTML.includes('id="q-city"'));
assert(!el('stage').innerHTML.includes('本資料未查得'));
assert.equal(data['gap-penalty'].scope,'national');
assert.equal(data['gap-accident'].scopeKey,'national');
assert(!html.includes('高風險清冊') && !html.includes('非屬'));
vm.runInContext('renderCandidates()',context);
assert(!el('stage').innerHTML.includes('q-sort'));
el('q-sort').value='oldest';
assert.equal(vm.runInContext('recentFirst([{date:"115/01/01"},{date:"113/01/01"}],"date")[0].date',context),'113/01/01');
el('q-sort').value='';
assert.equal(vm.runInContext('recentFirst([{date:"115/01/01"},{date:"113/01/01"}],"date")[0].date',context),'115/01/01');
const demo=fs.readFileSync(root+'/demo.html','utf8');
new vm.Script(demo.match(/<script>([\s\S]*?)<\/script>/)[1]);
assert(demo.includes('id="q-sort"'));
console.log('PASS:',result,'real-data filter combinations; selection gate, return, sorting, offline syntax.');
