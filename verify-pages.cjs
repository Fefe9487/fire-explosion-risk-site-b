const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path'),root=__dirname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const data=Object.fromEntries(['meta','plants','penalties','accidents','query-rules','pacs','tax-rollup'].map(n=>[n,JSON.parse(read('data/'+n+'.json'))]));
function page(name){
  const elements=new Map();
  const get=id=>{
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,addEventListener(){},setAttribute(){},querySelectorAll(){return []},replaceChildren(){},insertAdjacentHTML(_,html){this.innerHTML+=html;}});
    return elements.get(id);
  };
  const context=vm.createContext({data,console,location:{hash:''},window:{addEventListener(){}},
    document:{getElementById:get,querySelector:get,querySelectorAll:()=>[]}});
  const html=read(name),match=html.match(/<script>([\s\S]*?)<\/script>/);
  if(match)vm.runInContext(match[1].replace(/    boot\(\);|\nboot\(\);/,''),context);
  return {context,get,html};
}
const home=page('index.html');
vm.runInContext('initializeOverview([],data.meta);renderFireRules(data["query-rules"].fireCriteria)',home.context);
assert(home.get('data-periods').innerHTML.includes(data.meta.accidentSourceThrough));
assert(home.get('data-periods').innerHTML.includes('105/09/12'));
assert(home.get('data-periods').innerHTML.includes('113/01/02'));
assert(!home.get('data-periods').innerHTML.includes('統計'));
assert(home.get('m-fire-rules').innerHTML.includes('第186條（歷史條文）'));
assert(home.get('m-fire-rules').innerHTML.includes('115年7月1日刪除'));
assert.equal(read('method.html'),home.html);
assert(home.html.indexOf('id="high-risk-definition"')<home.html.indexOf('id="quick-guide"'));
assert(home.html.includes('<details class="source-details" id="source-details">'));
const guide=read('gaps.html');
assert(guide.includes('<h1>相關規定及指引</h1>'));
assert(guide.includes('id="regulations"')&&guide.includes('id="technical-guides"'));
assert(!guide.includes('role="tab"')&&!guide.includes(' hidden')&&!guide.includes('fetch('));
assert.equal((guide.match(/<li>/g)||[]).length,12);
const officialLinks=[...guide.matchAll(/<a href="(https:[^"]+)"/g)].map(m=>new URL(m[1]));
assert.equal(officialLinks.length,12);
assert(officialLinks.every(url=>/\.(osha|mol|moj)\.gov\.tw$/.test(url.hostname)));
for(const name of ['index.html','method.html','query.html','gaps.html']){
  const html=read(name);
  assert(!/統計資訊|裁罰統計|職災類型統計|查看統計分析|公開資料查詢與統計/.test(html),name);
  assert(html.includes('href="gaps.html"')&&html.includes('相關規定及指引'),name);
  const markup=html.replace(/<script>[\s\S]*?<\/script>/g,'');
  for(const match of markup.matchAll(/(?:href|src)="([^"#:?]+)(?:[?#][^"]*)?"/g)){
    if(!/^[a-z]+:/.test(match[1]))assert(fs.existsSync(path.join(root,match[1])),name+': '+match[1]);
  }
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
}
assert.deepEqual(Object.keys(data['query-rules']).sort(),['articles','fireCriteria','lawGroups']);
assert(data['query-rules'].articles.every(a=>Object.keys(a).sort().join(',')==='key,label,lawShort'));
assert(data['query-rules'].lawGroups.every(g=>Object.keys(g).sort().join(',')==='law,short'));
assert(!fs.existsSync(path.join(root,'data/gap-penalty.json')));
assert(!fs.existsSync(path.join(root,'data/gap-accident.json')));
const query=page('query.html');
vm.runInContext('initializeQuery(data.meta,data.plants,data.penalties,data.accidents,data["query-rules"],data.pacs,data["tax-rollup"])',query.context);
const summaries=vm.runInContext(`(()=>{
 const company=COMPANIES.find(c=>rowsFor(c).acc.some(a=>['火災','爆炸'].includes(a.kind)));
 return [fireSummaryHtml({},bucketsFor(company,{})),fireSummaryHtml({art:'設規|173'},bucketsFor(company,{art:'設規|173'}))];
})()`,query.context);
assert(!summaries[0].includes('本頁資料期間'));
assert(home.get('query-counting-note').textContent.includes('105/09/12')&&home.get('query-counting-note').textContent.includes('113/01/02'));
assert(summaries[0].includes('火災爆炸職災')&&summaries[1].includes('條文篩選只作用在裁罰'));
const demo=read('demo.html');
new vm.Script(demo.match(/<script>([\s\S]*?)<\/script>/)[1]);
assert(!/tab-pen|panel-pen|tab-acc|panel-acc|applyGapData|gapsShowTab|"gap-penalty"|"gap-accident"/.test(demo));
assert(demo.includes('href="#guide"')&&demo.includes('id="page-gaps"'));
assert(demo.includes('id="regulations"')&&demo.includes('id="technical-guides"'));
assert(demo.includes('id="page-query"')&&demo.includes('id="page-home"'));
console.log('PASS: guidance replaces statistics; 12 official resources; source dates, article rules, individual records, local links and offline scripts.');
