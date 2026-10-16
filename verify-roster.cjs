// Reconcile generated aggregates against the actual company-search API, independently
// of the Python builder. Also verifies roster-only membership and event de-duplication.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const read=n=>JSON.parse(fs.readFileSync(__dirname+'/data/'+n+'.json','utf8'));
const names=['meta','plants','penalties','accidents','pacs','tax-rollup','gap-penalty','gap-accident'];
const data=Object.fromEntries(names.map(n=>[n,read(n)]));
const script=fs.readFileSync(__dirname+'/query.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\n\s*boot\(\);/,'');
const element={addEventListener(){},replaceChildren(){},value:'',innerHTML:'',textContent:'',setAttribute(){}};
const c=vm.createContext({data,document:{getElementById(){return element;},querySelectorAll(){return [];}}});
vm.runInContext(script,c);
const result=vm.runInContext(`(()=>{
 initializeQuery(data.meta,data.plants,data.penalties,data.accidents,data['gap-penalty'],data.pacs,data['tax-rollup']);
 return {companies:COMPANIES.length, rows:COMPANIES.map(company=>({id:company.id,tax:company.tax,...rowsFor(company)}))};
})()`,c);
assert.equal(data.meta.rosterPlaces,data.plants.length);
assert.equal(data.meta.rosterCompanies,result.companies);
const selected=result.rows;
const pen=data['gap-penalty'],acc=data['gap-accident'];
assert.equal(pen.rosterCompanies,result.companies);assert.equal(acc.rosterPlaces,data.plants.length);
const refs=new Set(pen.fireCriteria.groups.flatMap(g=>g.articles.map(ref=>g.short+'|'+ref)));
const no=r=>String(r.no||r.id).trim();
const y=r=>Number(String(r).split('/')[0]);
const allPen=selected.flatMap(c=>c.pen),allAcc=selected.flatMap(c=>c.acc);
const dispositionIdentity=(company,row)=>[company.id,String(row.no||row.id).replace(/\s/g,''),String(row.date).split('/').map(Number).join('/')].join('|');
for(const period of [113,114,115]){
 const identities=new Set();
 for(const company of selected)for(const row of company.pen)if(y(row.date)===period)identities.add(dispositionIdentity(company,row));
 assert.equal(pen.allPenalties.yearTotals[period],identities.size,'All penalties '+period);
 for(const month of pen.allPenalties.monthly.filter(m=>m.year===period)){
  const all=new Set(),fire=new Set();
  for(const company of selected)for(const row of company.pen)if(y(row.date)===period&&Number(row.date.split('/')[1])===month.month){
   const key=dispositionIdentity(company,row);all.add(key);
   if(row.arts.some(a=>refs.has(a.law+'|'+a.n+(a.sub==null?'':'-'+a.sub))))fire.add(key);
  }
  assert.equal(month.total,all.size,'All penalties '+period+'/'+month.month);
  assert.equal(month.fireRelated,fire.size,'Related penalties '+period+'/'+month.month);
 }
}
// The official export reuses this number for different employers/dates.
const collision=selected.filter(company=>company.pen.some(row=>row.no==='職授字第1150250396號'));
assert.equal(collision.length,2,'Different employers sharing a document number must remain separate');
assert.equal(pen.allPenalties.yearTotals['115'],171);
assert.deepEqual(pen.allPenalties.monthly.filter(r=>r.year===115).map(r=>r.total),[12,14,27,26,22,20,17,26,6,1]);
for(const short of ['設規','高壓則'])for(const period of ['all',113,114,115]){
 const matched=allPen.filter(r=>y(r.date)>=113&&y(r.date)<=115&&(period==='all'||y(r.date)===period)&&r.arts.some(a=>a.law===short&&refs.has(a.law+'|'+a.n+(a.sub==null?'':'-'+a.sub))));
 assert.equal(pen.lawTotals[short][period],new Set(matched.map(no)).size,short+'/'+period);
}
for(const a of pen.arts)for(const period of ['all',113,114,115]){
 const matched=allPen.filter(r=>y(r.date)>=113&&y(r.date)<=115&&(period==='all'||y(r.date)===period)&&r.arts.some(ref=>ref.law===a.lawShort&&ref.n===a.art&&(ref.sub??null)===a.sub));
 assert.equal(a.y[period],new Set(matched.map(no)).size,a.key+'/'+period);
}
const normalizeDate=d=>String(d||'').split('/').map(Number).join('/');
const event=(tax,r)=>[tax,r.kind,normalizeDate(r.eventDate)].join('|');
let totalPacs=0;
for(const kind of acc.kinds)for(const period of [113,114,115]){
 const matched=allAcc.filter(r=>r.kind===kind.kind&&y(r.dispDate)===period);
 assert.equal(kind['y'+period],new Set(matched.map(no)).size,kind.kind+'/'+period);
 const events=new Set();
 for(const company of selected){
  const known=new Set(company.acc.map(r=>event(company.tax,r)));
  for(const r of company.pacs)if(r.kind===kind.kind&&y(r.eventDate)===period&&!known.has(event(company.tax,r)))events.add(event(company.tax,r));
 }
 assert.equal(kind['pacs'+period],events.size,'public events '+kind.kind+'/'+period);
 totalPacs+=events.size;
}
assert.equal(totalPacs,acc.pacsAdded);
assert.equal(acc.distinctDispositions,new Set(allAcc.filter(r=>y(r.dispDate)>=113&&y(r.dispDate)<=115&&acc.kinds.some(k=>k.kind===r.kind)).map(no)).size);
for(const focus of acc.focus){assert.equal(focus.n,acc.kinds.find(k=>k.kind===focus.kind).n);for(const ref of focus.topArts)assert(ref.n<=focus.n);}
// A record without a roster plant ID or a roster tax must never appear in search.
c.outside={id:'outside-test',no:'outside-disposition',tax:'99999999',date:'114/01/01',plantId:'outside-plant',arts:[{law:'設規',n:173}]};
assert.equal(vm.runInContext("PEN.push(outside);COMPANIES.flatMap(company=>rowsFor(company).pen).filter(r=>r.id==='outside-test').length",c),0);
assert.equal(pen.sourceUpdatedAt,data.meta.sourceUpdatedAt);
assert.equal(acc.sourceThrough,data.meta.accidentSourceThrough);
assert.equal(acc.sourceUpdatedAt,data.meta.sourceUpdatedAt);
for(const month of ['01','02','03','04','05','06','07','08']){
 assert(allPen.some(r=>String(r.date).startsWith('115/'+month+'/')),'Missing 115/'+month+' penalty records');
}
for(const snapshot of Object.values(data.meta.sourceSnapshots)){
 assert.match(snapshot.sha256,/^[a-f0-9]{64}$/);
 assert.equal(snapshot.downloadedAt,data.meta.sourceUpdatedAt);
}
console.log(`PASS: ${result.companies} company searches reconcile every law/year, article/year, disaster/year and public event total; outside-roster exclusion; 115 January–August penalties and fresh source provenance.`);
