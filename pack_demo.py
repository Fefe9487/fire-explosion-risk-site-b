# -*- coding: utf-8 -*-
"""Pack all three public pages and their source-backed data for offline use."""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def load(name):
    return json.loads((ROOT/'data'/f'{name}.json').read_text(encoding='utf-8'))

def extract(name):
    html=(ROOT/name).read_text(encoding='utf-8')
    style=re.search(r'<style>(.*?)</style>',html,re.S)[1]
    body=re.search(r'<body[^>]*>(.*?)</body>',html,re.S)[1].split('<script>')[0]
    for image_path in set(re.findall(r'src="(assets/images/[^"]+)"', body)):
        image_file=ROOT/image_path
        encoded=base64.b64encode(image_file.read_bytes()).decode('ascii')
        mime='image/svg+xml' if image_file.suffix=='.svg' else 'image/webp'
        body=body.replace(f'src="{image_path}"', f'src="data:{mime};base64,{encoded}"')
    match=re.search(r'<script>(.*?)</script>',html,re.S)
    script=match[1] if match else ''
    for old,new in [('query.html','#query'),('index.html','#home'),('gaps.html','#guide'),('method.html','#home')]:
        pattern=r'href="'+re.escape(old)+r'(?:\?[^"#]*)?(?:#([^" ]*))?"'
        replace=lambda m: 'href="'+('#'+m[1] if m[1] else new)+'"'
        body=re.sub(pattern,replace,body)
        script=re.sub(pattern,replace,script)
    return style,body,script

def main():
    payload={name:load(name) for name in ['plants','meta','penalties','accidents','query-rules','pacs','tax-rollup']}
    styles=[];bodies=[];scripts=[]
    boots={
      'query':"initializeQuery(DEMO.meta,DEMO.plants,DEMO.penalties,DEMO.accidents,DEMO['query-rules'],DEMO.pacs,DEMO['tax-rollup']);document.getElementById('foot').insertAdjacentHTML('afterbegin','離線資料快照：'+esc(DEMO.meta.builtAt)+'。 ');",
      'home':"initializeOverview([],DEMO.meta);renderFireRules(DEMO['query-rules'].fireCriteria);",
    }
    for name,file in [('home','index.html'),('gaps','gaps.html'),('query','query.html')]:
        style,body,script=extract(file)
        if script:
            script,n=re.subn(r'async function boot\(\)\s*\{.*?\n\s*boot\(\);',lambda m:boots[name],script,count=1,flags=re.S)
            if n!=1:raise RuntimeError('boot replacement '+name)
        styles.append(style)
        body=body.replace('id="main-content"',f'id="main-{name}"').replace('href="#main-content"',f'href="#main-{name}"')
        cls='page overview' if name=='home' else 'page'
        hidden='' if name=='home' else ' hidden'
        bodies.append(f'<div id="page-{name}" class="{cls}"{hidden}>{body}</div>')
        scripts.append('(function(){\n'+script+'\n})();')
    raw=json.dumps(payload,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    router="""
    function applyHash(){
      let h=(location.hash||'#home').slice(1);
      const aliases={'statistics-details':'source-details','penalty-method':'fire-relevant-laws','counting-basics':'reading-records'};
      h=aliases[h]||h;
      const homeAnchors=['home','method','high-risk-definition','quick-guide','source-details','category-laws','fire-relevant-laws','data-sources','data-period','reading-records','friendly-sites','main-home'];
      const page=['query','main-query'].includes(h)||h.startsWith('sec-')||h==='dossier-fire-summary'?'query':homeAnchors.includes(h)?'home':'gaps';
      for(const name of ['query','gaps','home'])document.getElementById('page-'+name).hidden=page!==name;
      const target=document.getElementById(h);
      if(target){
        for(let detail=target.closest('details');detail;detail=detail.parentElement?.closest('details'))detail.open=true;
        requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));
      }
      if(['home','method','query','pen','acc','guide'].includes(h))requestAnimationFrame(()=>document.getElementById('page-'+page)?.scrollIntoView({block:'start'}));
    }
    window.addEventListener('hashchange',applyHash);applyHash();
    """
    styles.append((ROOT/'assets/site.css').read_text(encoding='utf-8'))
    html='''<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>高風險廠場事業單位職災及違規紀錄查詢系統（離線版）</title><style>'''+ '\n'.join(styles)+'''\n.page[hidden]{display:none!important}</style></head><body>'''+ '\n'.join(bodies)+'<script>\nconst DEMO='+raw+';\n'+'\n'.join(scripts)+'\n'+router+'\n</script></body></html>'
    html='\n'.join(line.rstrip() for line in html.splitlines())+'\n'
    (ROOT/'demo.html').write_text(html,encoding='utf-8')
    print('Packed offline pages:',len(payload['plants']),'places;',len(html.encode('utf-8')),'bytes')

if __name__=='__main__':main()
