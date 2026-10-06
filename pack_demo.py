# -*- coding: utf-8 -*-
"""Pack all three public pages and their source-backed data for offline use."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def load(name):
    return json.loads((ROOT/'data'/f'{name}.json').read_text(encoding='utf-8'))

def extract(name):
    html=(ROOT/name).read_text(encoding='utf-8')
    style=re.search(r'<style>(.*?)</style>',html,re.S)[1]
    body=re.search(r'<body[^>]*>(.*?)<script>',html,re.S)[1]
    script=re.search(r'<script>(.*?)</script>',html,re.S)[1]
    for old,new in [('index.html','#query'),('gaps.html','#pen'),('method.html','#method')]:
        pattern=r'href="'+re.escape(old)+r'(?:\?[^"#]*)?(?:#([^" ]*))?"'
        replace=lambda m: 'href="'+('#'+m[1] if m[1] else new)+'"'
        body=re.sub(pattern,replace,body)
        script=re.sub(pattern,replace,script)
    return style,body,script

def main():
    payload={name:load(name) for name in ['plants','meta','penalties','accidents','gap-penalty','gap-accident','law-profiles']}
    styles=[];bodies=[];scripts=[]
    boots={
      'query':"initializeQuery(DEMO.meta,DEMO.plants,DEMO.penalties,DEMO.accidents,DEMO['gap-penalty']);document.getElementById('foot').insertAdjacentHTML('afterbegin','離線資料快照：'+esc(DEMO.meta.builtAt)+'。 ');",
      'gaps':"applyGapData(DEMO['gap-penalty'],DEMO['gap-accident'],DEMO['law-profiles']);window.gapsShowTab=showTab;",
      'method':"initializeOverview(DEMO.plants,DEMO.meta,DEMO.penalties,DEMO.accidents,DEMO['gap-penalty']);renderFireRules(DEMO['gap-penalty'].fireCriteria);",
    }
    for name,file in [('query','index.html'),('gaps','gaps.html'),('method','method.html')]:
        style,body,script=extract(file)
        if name=='gaps':
            script=re.sub(r'    const startTab = .*?\n    showTab\(.*?\);\n','',script,count=1)
        script,n=re.subn(r'async function boot\(\)\s*\{.*?\n\s*boot\(\);',lambda m:boots[name],script,count=1,flags=re.S)
        if n!=1:raise RuntimeError('boot replacement '+name)
        styles.append(style)
        cls='page overview' if name=='method' else 'page'
        hidden='' if name=='query' else ' hidden'
        bodies.append(f'<div id="page-{name}" class="{cls}"{hidden}>{body}</div>')
        scripts.append('(function(){\n'+script+'\n})();')
    raw=json.dumps(payload,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    router="""
    function applyHash(){
      const h=(location.hash||'#query').slice(1);
      const page=h==='query'?'query':['method','penalty-method','category-laws'].includes(h)?'method':'gaps';
      for(const name of ['query','gaps','method'])document.getElementById('page-'+name).hidden=page!==name;
      if(page==='gaps'){
        window.gapsShowTab(['acc','guide'].includes(h)?h:'pen');
        if(/^r(?:hp-)?\\d/.test(h))requestAnimationFrame(()=>document.getElementById(h)?.scrollIntoView({block:'start'}));
      }
      if(page==='method'&&h!=='method')requestAnimationFrame(()=>document.getElementById(h)?.scrollIntoView({block:'start'}));
    }
    window.addEventListener('hashchange',applyHash);applyHash();
    """
    html='''<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>事業單位職災與違規紀錄查詢（離線版）</title><style>'''+ '\n'.join(styles)+'''\n.page[hidden]{display:none!important}#page-query .wrap{max-width:1240px}#page-gaps .wrap{max-width:1100px}</style></head><body>'''+ '\n'.join(bodies)+'<script>\nconst DEMO='+raw+';\n'+'\n'.join(scripts)+'\n'+router+'\n</script></body></html>'
    (ROOT/'demo.html').write_text(html,encoding='utf-8')
    print('Packed offline pages:',len(payload['plants']),'places;',len(html.encode('utf-8')),'bytes')

if __name__=='__main__':main()
