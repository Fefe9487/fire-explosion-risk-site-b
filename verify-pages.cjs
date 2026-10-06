const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=__dirname;
const data=Object.fromEntries(['meta','gap-penalty','gap-accident','law-profiles'].map(n=>[n,JSON.parse(fs.readFileSync(root+'/data/'+n+'.json','utf8'))]));
function page(name){
  const elements=new Map();
  const get=id=>{
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,addEventListener(){},setAttribute(){},querySelectorAll(){return []}});
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
assert(stats.get('acc-bars').innerHTML.includes('44件'));
assert(stats.get('acc-focus').innerHTML.includes('爆炸（35件）'));
assert(stats.get('pen-scope').textContent.includes('全臺'));
assert(stats.get('bars').innerHTML.includes('件'));
const method=page('method.html');
vm.runInContext('initializeOverview([],data.meta)',method.context);
assert(method.get('data-periods').innerHTML.includes('115/09/18'));
assert(method.get('data-periods').innerHTML.includes('111–115年'));
assert(!method.html.includes('高風險清冊'));
for(const name of ['index.html','gaps.html','method.html','demo.html']){
  const html=fs.readFileSync(root+'/'+name,'utf8');
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
}
console.log('PASS: statistics output, methodology dates, nationwide scope, all page script syntax.');
