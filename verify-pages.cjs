const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=__dirname;
const data=Object.fromEntries(['meta','gap-penalty','gap-accident','law-profiles'].map(n=>[n,JSON.parse(fs.readFileSync(root+'/data/'+n+'.json','utf8'))]));
function page(name){
  const elements=new Map();
  const get=id=>{
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,addEventListener(){},setAttribute(){},querySelectorAll(){return []},replaceChildren(){},insertAdjacentHTML(_,html){this.innerHTML+=html;}});
    return elements.get(id);
  };
  const context=vm.createContext({data,console,location:{hash:''},history:{replaceState(){}},
    document:{getElementById:get,querySelector:get,querySelectorAll:()=>[]}});
  const html=fs.readFileSync(root+'/'+name,'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    boot\(\);|\nboot\(\);/,'');
  vm.runInContext(script,context);
  return {context,get,html};
}
const stats=page('gaps.html');
vm.runInContext("applyGapData(data['gap-penalty'],data['gap-accident'],data['law-profiles'])",stats.context);
assert(stats.get('acc-scope').textContent.includes('全臺'));
assert(stats.get('acc-scope').textContent.includes('部分年度'));
for(const kind of data['gap-accident'].kinds){
  const total=kind.n+(kind.pacs113||0)+(kind.pacs114||0)+(kind.pacs115||0);
  assert(stats.get('acc-bars').innerHTML.includes(`${total}件`));
}
const explosion=data['gap-accident'].focus.find(x=>x.kind==='爆炸');
assert(stats.get('acc-focus').innerHTML.includes(`爆炸（${explosion.n+(explosion.pacsN||0)}件）`));
assert(stats.get('acc-focus').innerHTML.includes('處分公告常見缺失'));
assert(stats.get('acc-focus').innerHTML.includes('容器或管線動火前未清除殘留危險物'));
assert(!stats.get('acc-focus').innerHTML.includes('不足以單獨證明'));
assert(stats.get('pen-scope').textContent.includes('全臺'));
assert(stats.get('bars').innerHTML.includes('件'));
const method=page('index.html');
vm.runInContext('initializeOverview([],data.meta)',method.context);
assert(method.get('data-periods').innerHTML.includes('115/09/18'));
assert(method.get('data-periods').innerHTML.includes('111–115年'));
vm.runInContext("renderFireRules(data['gap-penalty'].fireCriteria)",method.context);
for(const [short,law] of [['設規','職業安全衛生設施規則'],['高壓則','高壓氣體勞工安全規則']]){
  const count=new Set(data['gap-penalty'].fireCriteria.groups.filter(g=>g.short===short).flatMap(g=>g.articles)).size;
  assert(method.get('m-fire-rules').innerHTML.includes(`${law}：採用${count}條`));
}
assert(method.get('m-fire-rules').innerHTML.includes('第186條（歷史條文）'));
assert(method.get('m-fire-rules').innerHTML.includes('115年7月1日刪除'));
assert(!method.html.includes('高風險清冊'));
const query=page('query.html');
const full=Object.fromEntries(['meta','plants','penalties','accidents','gap-penalty'].map(n=>[n,JSON.parse(fs.readFileSync(root+'/data/'+n+'.json','utf8'))]));
query.context.fixture=full;
vm.runInContext("initializeQuery(fixture.meta,fixture.plants,fixture.penalties,fixture.accidents,fixture['gap-penalty'])",query.context);
const focus=full.accidents.find(x=>x.link==='plant'&&['火災','爆炸'].includes(x.kind)&&x.plantId);
assert(focus,'expected a linked fire or explosion disposition for detail summary test');
query.context.testPlantId=focus.plantId;
const summaries=vm.runInContext(`(()=>{const company=COMPANIES.find(c=>c.plants.some(p=>p.id===testPlantId));return [fireSummaryHtml({},bucketsFor(company,{})),fireSummaryHtml({art:'設規|173'},bucketsFor(company,{art:'設規|173'}))];})()`,query.context);
assert(summaries[0].includes('民國111–115年'));
assert(summaries[0].includes('火災爆炸職災'));
assert(summaries[0].includes('不按個別場所拆開'));
assert(summaries[1].includes('條文篩選只作用在裁罰'));
assert(query.html.includes('id="dossier-fire-summary"'));
for(const name of ['index.html','gaps.html','query.html','method.html','demo.html']){
  const html=fs.readFileSync(root+'/'+name,'utf8');
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
}
console.log('PASS: statistics output, methodology dates, nationwide scope, all page script syntax.');
