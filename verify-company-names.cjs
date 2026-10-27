const fs = require("fs"), vm = require("vm"), assert = require("assert");
const path = require("path"), root = __dirname;
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const data = Object.fromEntries(["meta", "plants", "penalties", "accidents", "query-rules", "pacs", "tax-rollup"].map((name) => [name, JSON.parse(read("data/" + name + ".json"))]));
const html = read("query.html");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\n\s*boot\(\);\s*$/, "");
const context = vm.createContext({
  console,
  document: { getElementById() { return { addEventListener() {}, replaceChildren() {}, insertAdjacentHTML() {} }; }, querySelector() { return null; }, querySelectorAll() { return []; } },
});
vm.runInContext(script, context);
context.data = data;
vm.runInContext("initializeQuery(data.meta,data.plants,data.penalties,data.accidents,data['query-rules'],data.pacs,data['tax-rollup'])", context);
const report = vm.runInContext(`(() => {
  const byName = new Map();
  for (const company of COMPANIES) {
    const key = nameKey(company.name);
    const list = byName.get(key) || [];
    list.push(company);
    byName.set(key, list);
  }
  const duplicates = [...byName.entries()].filter(([, list]) => list.length > 2 || (list.length > 1)).map(([key, list]) => ({
    key,
    rows: list.map((company) => ({ tax: company.tax || company.id, name: company.name, places: company.placeCount })),
  }));
  const renamed = COMPANIES.filter((company) => company.name !== parentName(company.plants)).map((company) => ({
    tax: company.tax,
    name: company.name,
    base: parentName(company.plants),
    places: company.placeCount,
  })).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  const named = (tax) => COMPANIES.find((company) => company.tax === tax);
  return {
    companies: COMPANIES.length,
    taxes: new Set(COMPANIES.map((company) => company.tax || company.id)).size,
    duplicates,
    renamed,
    cpc: named("03707901") && named("03707901").name,
    refinery: named("83018701") && named("83018701").name,
  };
})()`, context);

assert.equal(report.companies, report.taxes, "同一統編被拆成多家，或不同統編被合成一家");
assert.equal(report.duplicates.length, 0, "不同統編的顯示名稱仍然相同：\n" + JSON.stringify(report.duplicates, null, 2));
assert.equal(report.cpc, "台灣中油股份有限公司");
assert.equal(report.refinery, "台灣中油股份有限公司高雄煉油廠");
console.log("PASS: " + report.companies + " 家公司，顯示名稱沒有衝突。同名統編已加上場所 " + report.renamed.length + " 家。");
for (const row of report.renamed) console.log(row.tax + "\t" + row.name);
