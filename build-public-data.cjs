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
const policy = read('public-scope');
const rosterIds = new Set(policy.rosterPlaceIds);
const beforePlants = data.plants.length;
data.plants = data.plants.filter(plant => rosterIds.has(plant.id) && !excludedTaxes.has(String(plant.tax || '').replace(/\D/g, '')));
if (data.plants.length !== policy.rosterPlaces) throw Error('Original roster differs from the approved image baseline');
data.meta.penaltyQueryYears = policy.penaltyYears;
data.meta.csvYears = policy.penaltyYears;
data.meta.queryYears = policy.accidentYears;
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
  const companies = findMatches('', '');
  let penaltyDispositions = 0, fireAccidentCompanies = 0;
  for (const company of companies) {
    const rows = bucketsFor(company, {});
    for (const row of rows.firePen) penalties.add(row.id);
    for (const row of rows.fireAcc) accidents.add(row.id);
    penaltyDispositions += dispositionCount(rows.firePen);
    if (rows.fireAcc.length) fireAccidentCompanies++;
  }
  return {penalties: [...penalties], accidents: [...accidents], candidates: companies.length,
    taxIds: companies.map(company => company.tax).sort(), penaltyDispositions, fireAccidentCompanies};
})()`, context);
if (scope.candidates !== policy.expectedCompanies ||
    JSON.stringify(scope.taxIds) !== JSON.stringify([...policy.companyTaxIds].sort()) ||
    scope.penaltyDispositions !== policy.expectedPenaltyDispositions ||
    scope.fireAccidentCompanies !== policy.expectedFireAccidentCompanies) {
  throw Error('Public companies or record totals differ from the approved image baseline');
}
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
  firePenaltyDispositions: scope.penaltyDispositions,
  fireAccidentCompanies: scope.fireAccidentCompanies,
  publicScopeReference: policy.referenceCommit,
  penaltyPeriod: '裁罰處分年度 106–115年（實際收錄至115/10/02）',
  rollupPenalties: data['tax-rollup'].penalties.length, rollupAccidents: data['tax-rollup'].accidents.length,
  scope: '公開查詢名單共137家公司，與圖表採相同原973個廠場清冊、有效統編及106–115年火災爆炸相關裁罰口徑，合計207件裁罰；其中9家公司另有111–115年火災爆炸職災處分。按統一編號合計，不標示個別廠址。處分件數不等於事故場次或傷亡人數，兩類紀錄可能涉及同一處分，請勿相加。',
});
write('meta', data.meta);
console.log(JSON.stringify({before: {plants: beforePlants, ...before}, after: {plants: data.plants.length, penalties: data.penalties.length, accidents: data.accidents.length,
  rollupPenalties: data['tax-rollup'].penalties.length, rollupAccidents: data['tax-rollup'].accidents.length},
  candidateCompanies: scope.candidates}, null, 2));
write('plants', data.plants);
