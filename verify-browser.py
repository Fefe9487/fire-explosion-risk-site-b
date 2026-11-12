"""Browser smoke checks for served pages and the self-contained offline file."""
import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'docs' / 'verification-20261112'
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8876'
OUT.mkdir(parents=True, exist_ok=True)
results = []


def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'page overflows viewport'


def query_checks(page, offline):
    stage = page.locator('#stage')
    assert stage.inner_text() == ''
    excluded = json.loads((ROOT / 'data' / 'company-exclusions.json').read_text(encoding='utf-8'))['companies']
    for company in excluded:
        page.locator('#q-tax').fill(company['tax'])
        page.locator('#form .go').click()
        assert page.locator('.candidate').count() == 0, company['tax']
        assert '查無符合的火災爆炸職災或裁罰紀錄' in stage.inner_text()
    selection = page.evaluate('''() => {
      const visible = findMatches('', '');
      const company = visible.filter(c => rowsFor(c).acc.length)
        .sort((a,b)=>rowsFor(b).pen.length-rowsFor(a).pen.length)[0];
      const empty = COMPANIES.find(c=>c.tax && !visible.includes(c));
      return {tax:company.tax, emptyTax:empty.tax, candidates:visible.length,
        kinds:[...new Set(rowsFor(company).acc.map(r=>r.kind))]};
    }''') if not offline else None
    # Offline page scripts are intentionally scoped. Use the same real company
    # selected in the served page, without reading its private runtime state.
    if offline:
        selection = results[0]['selection']
    page.locator('#q-tax').fill(selection['emptyTax'])
    page.locator('#form .go').click()
    assert page.locator('.candidate').count() == 0
    assert '查無符合的火災爆炸職災或裁罰紀錄' in stage.inner_text()
    page.locator('#q-tax').fill(selection['tax'])
    page.locator('#form .go').click()
    assert page.locator('.candidate').count() == 1
    page.locator('.candidate').click()
    assert page.locator('#q-kinds [data-kind]').count() == 2
    assert page.locator('#sec-other-acc, #sec-other-pen').count() == 0
    assert page.locator('#sec-fire-pen .block-title').inner_text() == '未落實火災爆炸預防裁罰'
    assert page.locator('#sec-fire-acc .block-title').inner_text() == '發生火災爆炸職災'
    penalties = page.locator('#sec-fire-pen tbody tr').count()
    for kind in ['火災', '爆炸']:
        page.locator('#q-kinds [data-kind="'+kind+'"]').click()
        assert page.locator('#sec-fire-pen tbody tr').count() == penalties
        kinds = page.locator('#sec-fire-acc tbody tr td:nth-child(3)').all_inner_texts()
        assert all(text.strip() == kind for text in kinds)
        assert bool(kinds) == (kind in selection['kinds'])
        page.locator('#q-kinds [data-all]').click()
    page.locator('#q-year').select_option('105')
    dates = page.locator('#sec-fire-pen tbody tr td:first-child').all_inner_texts()
    assert all(date.startswith('105/') for date in dates)
    assert page.locator('#sec-fire-acc tbody tr').count() == 0
    page.locator('#reset-filters').click()
    assert page.locator('#q-year').input_value() == ''
    page.locator('#q-sort').select_option('oldest')
    dates = page.locator('#sec-fire-pen tbody tr td:first-child').all_inner_texts()
    numeric_dates = [tuple(map(int, date.split('/'))) for date in dates]
    assert numeric_dates == sorted(numeric_dates)
    page.locator('#reset-filters').click()
    more = page.locator('#sec-fire-pen .case-more')
    if more.count():
        more.first.click()
        assert more.first.get_attribute('aria-expanded') == 'true'
        more.first.click()
        assert more.first.get_attribute('aria-expanded') == 'false'
    page.locator('#dossier-fire-summary').scroll_into_view_if_needed()
    no_overflow(page)
    page.screenshot(path=str(OUT / ('offline-detail.png' if offline else 'desktop-detail.png')))
    for width in [390, 320]:
        page.set_viewport_size({'width':width, 'height':844})
        no_overflow(page)
        page.locator('#dossier-fire-summary').scroll_into_view_if_needed()
        if width == 390:
            page.screenshot(path=str(OUT / ('offline-mobile.png' if offline else 'mobile-detail.png')))
    page.locator('#back-candidates').click()
    assert page.locator('.candidate').count() == 1
    assert page.locator('#q-sort').count() == 0
    return selection


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1440, 'height':1000})
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    # External embeds and fonts are outside these local functionality checks.
    page.route('https://**/*', lambda route: route.abort())
    page.goto(BASE + '/query.html', wait_until='networkidle')
    selection = query_checks(page, False)
    results.append({'mode':'served', 'selection':selection})
    assert not any('/pacs' in url for url in requests)
    for name in ['index.html', 'method.html', 'gaps.html']:
        page.set_viewport_size({'width':1440,'height':1000})
        page.goto(BASE + '/' + name, wait_until='networkidle')
        assert '使用大量危險物廠場' in page.title()
        assert '高風險廠場' not in page.locator('body').inner_text()
        assert '重大職災公開網' not in page.locator('body').inner_text()
        no_overflow(page)
        if name == 'index.html':
            page.screenshot(path=str(OUT / 'desktop-home.png'))
            page.locator('#source-details > summary').click()
            assert page.locator('.source-card').count() == 2
        for width in [390, 320]:
            page.set_viewport_size({'width':width,'height':844})
            no_overflow(page)
            if width == 390 and name == 'index.html':
                page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
                page.screenshot(path=str(OUT / 'mobile-home.png'))
    page.set_viewport_size({'width':1440,'height':1000})
    # Disable network entirely after loading a file:// document.
    page.route('http://**/*', lambda route: route.abort())
    page.goto((ROOT / 'demo.html').as_uri() + '#query', wait_until='load')
    query_checks(page, True)
    page.locator('#page-query .site-nav a[href="#guide"]').click()
    expect(page.locator('#page-gaps')).to_be_visible()
    page.locator('#page-gaps .site-nav a[href="#home"]').click()
    expect(page.locator('#page-home')).to_be_visible()
    results.append({'mode':'offline', 'network':'disabled', 'navigation':'passed'})
    assert not errors, errors
    browser.close()

(OUT / 'browser-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('PASS: served and offline queries; candidate exclusions; two categories; fire/explosion and year filters; sorting; expansion; navigation; 1440/390/320px layouts; no page errors.')
