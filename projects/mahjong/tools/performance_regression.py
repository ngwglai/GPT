"""Repeatable real-HTTP UI benchmark. Never represents physical-device testing.

python tools/performance_regression.py --output validation/v1.0.0/chromium.json
python tools/performance_regression.py --base-url http://127.0.0.1:8766 --baseline --output baseline.json
Use identical options, host and browser for both versions; run them sequentially.
"""
import argparse
import json
import os
import platform
import socket
import statistics
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VIEWPORTS = {"desktop": (1440, 900, 1), "phone-landscape": (844, 390, 3),
             "phone-portrait": (390, 844, 3), "tablet": (1180, 820, 2)}


def percentile(values, quantile):
    return sorted(values)[min(len(values)-1, int((len(values)-1)*quantile))]


def frame(page):
    page.wait_for_function("()=>[...document.querySelectorAll('img.cuboid-sprite,img.cuboid-felt-image')].every(i=>i.complete&&i.naturalWidth>0)")
    page.evaluate("() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")


def browser_memory(browser):
    """Sample only this Chromium's processes; PSS avoids summing shared pages twice."""
    if platform.system() != 'Linux':
        return {'available': False, 'reason': 'PSS sampling requires Linux procfs'}
    session = browser.new_browser_cdp_session()
    try:
        processes = session.send('SystemInfo.getProcessInfo')['processInfo']
    finally:
        session.detach()
    totals={'available':True,'pss_bytes':0,'rss_bytes_sum':0,'processes_read':0,'processes_unreadable':0}
    for process in processes:
        try:
            fields={line.split(':',1)[0]:int(line.split()[1])*1024
                    for line in Path('/proc',str(int(process['id'])),'smaps_rollup').read_text().splitlines()
                    if line.startswith(('Pss:','Rss:'))}
            totals['pss_bytes']+=fields['Pss'];totals['rss_bytes_sum']+=fields['Rss'];totals['processes_read']+=1
        except (OSError,KeyError,ValueError):
            totals['processes_unreadable']+=1
    return totals

def run(args, url):
    results = {"schema": 1, "engine": args.engine, "cpu_rate": args.cpu_rate, "scenario": args.scenario,
               "physical_device": False, "platform": platform.system(), "samples": [],
               "failures": []}
    with sync_playwright() as pw:
        options = {"headless": True}
        if args.engine == "chromium":
            options.update(executable_path=args.chromium, args=["--no-sandbox"])
        if args.engine == 'webkit' and args.webkit_executable:
            options['executable_path'] = args.webkit_executable
        for viewport in args.viewports.split(','):
            w, h, dpr = VIEWPORTS[viewport]
            for sample in range(args.samples):
                # Isolate native resources across viewport/sample combinations.
                browser = getattr(pw, args.engine).launch(**options)
                results["browser_version"] = browser.version
                context = browser.new_context(viewport={"width": w, "height": h},
                                              device_scale_factor=dpr, has_touch=dpr > 1,
                                              reduced_motion="reduce")
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.on("crash", lambda _: errors.append("PAGE_CRASH"))
                page.add_init_script("""window._tasks=[];
                  if(PerformanceObserver.supportedEntryTypes.includes('longtask'))
                    new PerformanceObserver(l=>_tasks.push(...l.getEntries().map(e=>e.duration)))
                      .observe({type:'longtask',buffered:true});""")
                cdp = None
                if args.engine == "chromium":
                    cdp = context.new_cdp_session(page)
                    cdp.send("Performance.enable")
                    cdp.send("Emulation.setCPUThrottlingRate", {"rate": args.cpu_rate})
                page.request.post(url+"/api/new-round", data={"seed": 42, "dealer": 0})
                t = time.perf_counter()
                page.goto(url+"/local.html", wait_until="domcontentloaded")
                page.wait_for_selector(".cuboid-sprite")
                page.wait_for_function("()=>[...document.images].filter(i=>i.classList.contains('cuboid-felt-image')).every(i=>i.complete&&i.naturalWidth>0)")
                frame(page)
                boot = (time.perf_counter()-t)*1000
                page.evaluate("""() => {window._renders=[];window._accept=acceptTable;
                  window.acceptTable=(...a)=>{const t=performance.now();
                    const r=_accept(...a);_renders.push(performance.now()-t);return r;};
                  window._initial=structuredClone(table);}""")
                assert page.locator('.cuboid-sprite').count() == 136
                t = time.perf_counter()
                page.locator('.dock-seat [data-action-key^="ROLL_DICE"]').click()
                page.wait_for_function("()=>table.phase!=='ROLLING_DICE'")
                frame(page)
                roll = (time.perf_counter()-t)*1000
                page.evaluate("window._dealt=structuredClone(table)")
                page.locator('.dock-seat button[data-tile].clickable').first.click()
                assert page.locator('.dock-seat button.selected').count() == 1
                page.locator('.dock-seat [data-action-key^="DISCARD:"]').first.click()
                page.wait_for_function('()=>table.discards.length===1')
                frame(page)
                gameplay = page.evaluate('_renders.slice()')
                page.evaluate('window._renders=[]')
                frames = []
                requests = []
                for i in range(args.iterations):
                    if args.scenario == 'legal':
                        state = page.evaluate('table')
                        if state['phase'] == 'ROUND_END':
                            response = page.request.post(url+'/api/next-round', data={})
                        else:
                            moves=[(int(seat),action) for seat,actions in state['legal_actions'].items() for action in actions]
                            seat,action=min(moves,key=lambda move: {'HU':0,'PASS':1,'DISCARD':2,'ROLL_DICE':3}.get(move[1]['type'],4))
                            request_start=time.perf_counter()
                            response=page.request.post(url+'/api/action', data={
                                'seat':seat,'round_id':state['round_id'],'revision':state['revision'],
                                'type':action['type'],'tile_ids':action['tile_ids']})
                            requests.append((time.perf_counter()-request_start)*1000)
                        assert response.ok, response.text()
                        legal_state=response.json()['table']
                    t = time.perf_counter()
                    if args.scenario == 'stress':
                        # Deliberately impossible extra tiles/type churn: diagnostic pressure, not legal play.
                        page.evaluate("""i=>{const t=structuredClone(_dealt);
                          t.discards=Array.from({length:32+i%12},(_,j)=>({seat:j%4,type:(j+i)%34,claimed:false}));
                          t.presentation_events=[];acceptTable(t,{initial:true});}""", i)
                    else:
                        page.evaluate('t=>acceptTable(t)',legal_state)
                    frame(page)
                    frames.append((time.perf_counter()-t)*1000)
                    if args.scenario == 'legal':
                        page.wait_for_timeout(240)
                updates = page.evaluate('_renders.slice()')
                diag = page.evaluate('MahjongCuboid.diagnostics()')
                counts = page.evaluate("""()=>({nodes:document.querySelectorAll('*').length,
                  tiles:document.querySelectorAll('.cuboid-sprite').length,
                  canvases:document.querySelectorAll('canvas').length})""")
                # An unchanged state must not rebuild the scene or tile pixels.
                raster_before = diag.get('rasterized')
                page.evaluate('acceptTable(structuredClone(table),{initial:true})')
                unchanged = page.evaluate('MahjongCuboid.diagnostics()')
                if raster_before is not None:
                    assert unchanged['rasterized'] == raster_before
                    assert diag['cacheBytes'] <= diag['staticLimit']
                    assert diag['bodyBytes'] <= diag['bodyLimit']
                    assert diag['liveBytes'] < 16*1024*1024
                    assert diag.get('backgroundBytes',0) <= 17*1024*1024
                    assert diag.get('artBytes',0) <= 8*1024*1024
                assert counts['tiles'] < 260 and counts['nodes'] < 3500
                page.locator('[data-view-toggle]').click()
                assert page.locator('.overhead-view').count() == 1
                page.locator('[data-view-toggle]').click()
                frame(page)
                # Page freeze is a controlled suspension experiment, not real mobile backgrounding.
                if cdp:
                    cdp.send('Page.setWebLifecycleState', {'state': 'frozen'})
                    cdp.send('Page.setWebLifecycleState', {'state': 'active'})
                    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
                    page.evaluate('()=>loadTable(true)')
                    frame(page)
                item = {"viewport": viewport, "sample": sample, "boot_ms": boot, "roll_ms": roll,
                        "gameplay_render_ms": gameplay, "request_ms": requests, "update_ms": updates, "paint_ms": frames,
                        "update_median_ms": statistics.median(updates),
                        "update_p95_ms": percentile(updates, .95), "paint_p95_ms": percentile(frames, .95), "diagnostics": diag,
                        "counts": counts, "longtasks_ms": page.evaluate('_tasks'), "errors": errors}
                if cdp:
                    cdp.send('HeapProfiler.collectGarbage')
                    item['browser_memory'] = browser_memory(browser)
                    item['metrics'] = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']
                                       if m['name'] in ('JSHeapUsedSize', 'Nodes', 'LayoutDuration', 'TaskDuration')}
                if args.screenshots and sample == 0:
                    page.evaluate('()=>loadTable(true)')
                    frame(page)
                    target = args.output.parent/(args.engine+'-'+viewport+'.png')
                    page.screenshot(path=str(target))
                if errors:
                    results['failures'].append({"viewport": viewport, "errors": errors})
                if not args.baseline and item['paint_p95_ms'] > args.max_paint_ms:
                    results['failures'].append({"viewport": viewport, "paint_p95_ms": item['paint_p95_ms'],
                                                "limit_ms": args.max_paint_ms})
                if not args.baseline and item['update_p95_ms'] > args.max_update_ms:
                    results['failures'].append({"viewport": viewport, "p95_ms": item['update_p95_ms'],
                                                "limit_ms": args.max_update_ms})
                results['samples'].append(item)
                args.output.write_text(json.dumps(results, indent=2), encoding='utf-8')
                print(args.engine, viewport, sample, 'p95', round(item['update_p95_ms'], 1), flush=True)
                context.close()
                browser.close()
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url')
    parser.add_argument('--engine', choices=['chromium', 'firefox', 'webkit'], default='chromium')
    parser.add_argument('--webkit-executable', help='Optional local WebKit launcher for extracted system libraries')
    parser.add_argument('--chromium', default=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'))
    parser.add_argument('--cpu-rate', type=float, default=1)
    parser.add_argument('--scenario', choices=['legal','stress'], default='legal', help='Legal HTTP actions or intentionally impossible raster pressure fixture')
    parser.add_argument('--samples', type=int, default=3)
    parser.add_argument('--iterations', type=int, default=36)
    parser.add_argument('--viewports', default=','.join(VIEWPORTS))
    parser.add_argument('--max-update-ms', type=float, default=180)
    parser.add_argument('--max-paint-ms', type=float, default=350, help='Two-rAF wall time proxy, not physical display latency')
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--screenshots', action='store_true')
    parser.add_argument('--output', type=Path, default=ROOT/'validation/v1.0.0/performance.json')
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    server = None
    try:
        url = args.base_url
        if not url:
            with socket.socket() as s:
                s.bind(('127.0.0.1', 0))
                port = s.getsockname()[1]
            server = subprocess.Popen([sys.executable, 'web_server.py', '--no-browser', '--port', str(port)],
                                      cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            url = f'http://127.0.0.1:{port}'
            for _ in range(100):
                try:
                    urllib.request.urlopen(url+'/api/health', timeout=1).close()
                    break
                except OSError:
                    if server.poll() is not None:
                        raise RuntimeError('Test server failed to start')
                    time.sleep(.1)
        result = run(args, url.rstrip('/'))
        if result['failures']:
            raise SystemExit('Performance regression or browser error; inspect JSON')
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == '__main__':
    main()
