const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=__dirname;
const data=Object.fromEntries(['meta','gap-penalty','gap-accident','law-profiles'].map(n=>[n,JSON.parse(fs.readFileSync(root+'/data/'+n+'.json','utf8'))]));
function page(name){
  const elements=new Map();
  const get=id=>{
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,addEventListener(){},setAttribute(){},querySelectorAll(){return []},replaceChildren(){},insertAdjacentHTML(_,html){this.innerHTML+=html;}});
    return elements.get(id);
  };
  const context=vm.createContext({data,console,location:{hash:''},history:{replaceState(){}},window:{addEventListener(){}},
    document:{getElementById:get,querySelector:get,querySelectorAll:()=>[]}});
  const html=fs.readFileSync(root+'/'+name,'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/    boot\(\);|\nboot\(\);/,'');
  vm.runInContext(script,context);
  return {context,get,html};
}
const stats=page('gaps.html');
vm.runInContext("applyGapData(data['gap-penalty'],data['gap-accident'],data['law-profiles'])",stats.context);
assert(stats.get('acc-scope').textContent.includes('高風險廠場名單'));
assert(stats.get('acc-scope').textContent.includes('當年度資料尚未收齊'));
for(const kind of data['gap-accident'].kinds){
  assert(stats.get('acc-bars').innerHTML.includes(`${kind.n}件`));
}
const explosion=data['gap-accident'].focus.find(x=>x.kind==='爆炸');
assert(stats.get('acc-focus').innerHTML.includes(`勞動檢查 ${explosion.n} 件`));
assert(stats.get('acc-focus').innerHTML.includes('要特別注意'));
assert(stats.get('acc-focus').innerHTML.includes('容器或管線動火前未清除殘留危險物'));
assert(!stats.get('acc-focus').innerHTML.includes('不足以單獨證明'));
assert(stats.get('pen-scope').textContent.includes('高風險廠場名單'));
assert(stats.get('statistics-coverage').textContent.includes('當年度資料尚未收齊'));
assert(stats.get('stat-years').innerHTML.includes('115年'));
assert(stats.html.includes('AI 整理：常見原因與缺失線索'));
assert(stats.html.includes('可作為公眾監督的關注點'));
assert(!stats.get('stats-period').textContent.includes('資料至'));
assert(!stats.html.includes('statistics-roster'));
assert(stats.get('s-total').innerHTML.startsWith('79'));
assert(stats.get('s-y113').innerHTML.startsWith('33'));
assert(stats.get('s-y114').innerHTML.startsWith('32'));
assert(stats.get('s-y115').innerHTML.startsWith('14'));
assert(stats.get('bars').innerHTML.includes('設規第177條'));
assert(!stats.get('bars').innerHTML.includes('職安法第6條'));
assert(!stats.html.includes('全部裁罰'));
assert(!stats.html.includes('penalty-overview'));
assert(!stats.html.includes('pen-monthly'));
vm.runInContext("selectedLaw='高壓則';render()",stats.context);
assert(stats.get('s-y115').innerHTML.startsWith('2'));
const method=page('index.html');
vm.runInContext('initializeOverview([],data.meta)',method.context);
assert(method.get('data-periods').innerHTML.includes(data.meta.accidentSourceThrough));
assert(method.get('data-periods').innerHTML.includes('105/09/12'));
assert(method.get('data-periods').innerHTML.includes('113/01/02'));
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
assert(summaries[0].includes('105/09/12'));
assert(summaries[0].includes('113/01/02'));
assert(summaries[0].includes('火災爆炸職災'));
assert(summaries[0].includes('不按個別場所拆開'));
assert(summaries[1].includes('條文篩選只作用在裁罰'));
assert(query.html.includes('id="dossier-fire-summary"'));
for(const name of ['index.html','gaps.html','query.html','method.html','demo.html']){
  const html=fs.readFileSync(root+'/'+name,'utf8');
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
}
const position=id=>method.html.indexOf('id="'+id+'"');
assert(position('home-title')<position('high-risk-definition'));
assert(position('high-risk-definition')<position('category-laws'));
assert(position('category-laws')<position('quick-guide'));
assert(position('friendly-sites')<position('statistics-details'));
assert(method.html.indexOf('class="next-page"')<position('statistics-details'));
assert(position('statistics-details')<method.html.indexOf('<footer'));
assert.equal((method.html.match(/id="category-laws"/g)||[]).length,1);
assert.equal(fs.readFileSync(root+'/method.html','utf8'),method.html);
assert(method.get('data-periods').innerHTML.includes('不代表此前已完整收錄'));
assert(stats.html.indexOf('id="laws"')<stats.html.indexOf('id="pen-scope"'));
assert(stats.html.indexOf('id="acc-focus"')<stats.html.indexOf('id="acc-scope"'));
assert(method.html.includes('<details class="statistics-details" id="statistics-details">'));
assert(method.html.includes('assets/images/public-records-guide.webp'));
assert(!method.html.includes('.svg'));
assert(!method.html.includes('explainer-grid'));
assert(!method.html.includes('roster-summary'));
assert(method.html.includes('作為公共監督與安全管理之參考'));
const reviewed=JSON.parse(fs.readFileSync(root+'/reviewed_accident_interpretation.json','utf8'));
for(const focus of data['gap-accident'].focus){
  assert.equal(focus.summary,reviewed.summaries[focus.kind].summary);
  assert.deepEqual(focus.bullets,reviewed.summaries[focus.kind].bullets);
  for(const bullet of focus.bullets)assert(stats.get('acc-focus').innerHTML.includes(bullet));
}
assert(!query.html.includes('清冊場所 " + company.placeCount'));
const invalid=page('gaps.html');
invalid.context.badPenalty={...data['gap-penalty'],scope:'national'};
assert.throws(()=>vm.runInContext("applyGapData(badPenalty,data['gap-accident'],data['law-profiles'])",invalid.context),/範圍不符/);
console.log('PASS: roster statistics output, methodology dates, collapsed explanations, infographics, scope validation, all page script syntax.');

// A new data year must appear in both filters and table columns without editing HTML.
const future=page('gaps.html');
future.context.nextPen=JSON.parse(JSON.stringify(data['gap-penalty']));
future.context.nextAcc=JSON.parse(JSON.stringify(data['gap-accident']));
vm.runInContext("nextPen.statisticsYears=[114,116];nextAcc.statisticsYears=[114,116];applyGapData(nextPen,nextAcc,data['law-profiles'])",future.context);
assert(future.get('years').innerHTML.includes('116年'));
assert(future.get('acc-years').innerHTML.includes('116年'));
assert(future.get('tbl').innerHTML.includes('data-k="116"'));
assert(!future.get('years').innerHTML.includes('113年'));
assert(!future.get('statistics-coverage').textContent.match(/11[3-6]/));
console.log('PASS: year-independent descriptions and data-driven future-year controls.');
