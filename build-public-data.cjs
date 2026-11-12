// Apply the query page's actual company matching and fire/explosion rules to
// refreshed source files before publishing. Original snapshots live upstream.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = __dirname;
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8'));
const write = (name, data) => fs.writeFileSync(path.join(root, 'data', name + '.json'), JSON.stringify(data, null, 2) + '\n');
const names = ['meta', 'plants', 'penalties', 'accidents', 'query-rules', 'tax-rollup'];
const builtAt = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Taipei'}).format(new Date());
const data = Object.fromEntries(names.map(name => [name, read(name)]));
const exclusions = read('company-exclusions');
const excludedTaxes = new Set(exclusions.companies.map(company => company.tax));
const beforePlants = data.plants.length;
data.plants = data.plants.filter(plant => !excludedTaxes.has(String(plant.tax || '').replace(/\D/g, '')));
const html = fs.readFileSync(path.join(root, 'query.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\n\s*boot\(\);\s*$/, '');
const context = vm.createContext({data, document: {
  getElementById() { return {addEventListener() {}, replaceChildren() {}}; },
  querySelectorAll() { return []; },
}});
vm.runInContext(script, context);
vm.runInContext("initializeQuery(data.meta,data.plants,data.penalties,data.accidents,data['query-rules'],data['tax-rollup'])", context);
const scope = vm.runInContext(`(() => {
  const penalties = new Set(), accidents = new Set();
  for (const company of COMPANIES) {
    const rows = bucketsFor(company, {});
    for (const row of rows.firePen) penalties.add(row.id);
    for (const row of rows.fireAcc) accidents.add(row.id);
  }
  return {penalties: [...penalties], accidents: [...accidents], candidates: findMatches('', '').length};
})()`, context);
const keepPen = new Set(scope.penalties), keepAcc = new Set(scope.accidents);
const before = {penalties: data.penalties.length, accidents: data.accidents.length,
  rollupPenalties: data['tax-rollup'].penalties.length, rollupAccidents: data['tax-rollup'].accidents.length};
data.penalties = data.penalties.filter(row => keepPen.has(row.id));
data.accidents = data.accidents.filter(row => keepAcc.has(row.id));
data['tax-rollup'].penalties = data['tax-rollup'].penalties.filter(row => keepPen.has(row.id));
data['tax-rollup'].accidents = data['tax-rollup'].accidents.filter(row => keepAcc.has(row.id));
for (const name of ['penalties', 'accidents', 'tax-rollup']) write(name, data[name]);
Object.assign(data.meta, {
  builtAt, methodUpdatedAt: builtAt,
  plants: data.plants.length, penalties: data.penalties.length, accidents: data.accidents.length,
  rosterPlaces: data.plants.length,
  rosterCompanies: new Set(data.plants.map(plant => String(plant.tax || '').replace(/\D/g, '')).filter(tax => tax.length === 8)).size,
  rosterEntities: new Set(data.plants.map(plant => String(plant.tax || '').replace(/\D/g, '') || 'id:' + plant.id)).size,
  excludedCompanyCount: excludedTaxes.size,
  hostInferred: data.accidents.filter(row => row.link === 'host-inferred').length,
  candidateCompanies: scope.candidates,
  rollupPenalties: data['tax-rollup'].penalties.length, rollupAccidents: data['tax-rollup'].accidents.length,
  scope: '僅查詢本網站使用大量危險物廠場名單所屬事業單位的火災爆炸相關紀錄。候選名單須至少有一筆可查的相關裁罰或職災處分。按統一編號合計，不標示個別廠址。處分件數不等於事故場次或傷亡人數，兩類紀錄可能涉及同一處分，請勿相加。',
});
write('meta', data.meta);
console.log(JSON.stringify({before: {plants: beforePlants, ...before}, after: {plants: data.plants.length, penalties: data.penalties.length, accidents: data.accidents.length,
  rollupPenalties: data['tax-rollup'].penalties.length, rollupAccidents: data['tax-rollup'].accidents.length},
  candidateCompanies: scope.candidates}, null, 2));
write('plants', data.plants);
