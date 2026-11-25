"""Real HTTP AI soak and suspended-browser recovery. No physical device claim."""
import argparse
import asyncio
import json
from pathlib import Path

from aiohttp import web
from playwright.async_api import async_playwright

from lan_server import LOCAL_AI, create_app


async def main(args):
    app = create_app(42)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, '127.0.0.1', 0).start()
    url = 'http://127.0.0.1:'+str(runner.addresses[0][1])
    # Fast pacing deliberately accelerates soak; policies and rules are unchanged.
    app[LOCAL_AI].delay = args.delay
    evidence = {'server_delay_s': args.delay, 'physical_device': False, 'foreground':args.foreground, 'rounds': []}
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
            context = await browser.new_context(viewport={'width': 844, 'height': 390},
                                                device_scale_factor=3, has_touch=True)
            pages = [await context.new_page() for _ in range(4)]
            errors = []
            for page in pages:
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('crash', lambda _: errors.append('PAGE_CRASH'))
                await page.goto(url+'/local.html')
                await page.wait_for_selector('.cuboid-sprite')
                await page.evaluate("""()=>{window._visibleRenders=[];const original=render;
                  window.render=(...args)=>{const result=original(...args);
                    if(!document.hidden)_visibleRenders.push(table.revision);return result;};}""")
            sessions = [await context.new_cdp_session(p) for p in pages]
            for cdp in sessions:
                await cdp.send('Performance.enable')
            for number in range(args.rounds):
                response = await context.request.post(url+'/api/new-round', data={'seed': 42+number, 'dealer': number%4})
                initial = (await response.json())['table']
                for page in pages:
                    await page.evaluate('t=>{acceptTable(t,{initial:true});_visibleRenders=[];}', initial)
                before = initial['revision']
                # All browser execution stops. The server must complete the game without polling clients.
                if not args.foreground:
                    for cdp in sessions:
                        await cdp.send('Page.setWebLifecycleState', {'state': 'frozen'})
                if args.foreground:
                    # One tab enables AI. The other human-idle tabs need to
                    # discover the change without a focus/visibility event.
                    await pages[0].evaluate("()=>changeController(null,'easy')")
                    await asyncio.gather(*(page.wait_for_function(
                        "()=>Object.values(table.players).every(p=>p.controller==='easy')",
                        timeout=10_000) for page in pages))
                else:
                    response = await context.request.post(url+'/api/control', data={
                        'seat': None, 'round_id': initial['round_id'], 'mode': 'easy'})
                    assert response.ok, await response.text()
                for _ in range(1200):
                    await asyncio.sleep(.05)
                    response = await context.request.get(url+'/api/table')
                    final = (await response.json())['table']
                    if final['phase'] == 'ROUND_END':
                        break
                assert final['phase'] == 'ROUND_END', final['revision']
                assert final['revision'] > before
                views = []
                for page, cdp in zip(pages, sessions):
                    if not args.foreground:
                        await cdp.send('Page.setWebLifecycleState', {'state': 'active'})
                    await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
                    await page.wait_for_function('(r)=>table.revision===r', arg=final['revision'])
                    await cdp.send('HeapProfiler.collectGarbage')
                    metrics = {m['name']:m['value'] for m in (await cdp.send('Performance.getMetrics'))['metrics']}
                    diag = await page.evaluate('MahjongCuboid.diagnostics()')
                    assert diag['cacheBytes'] <= diag['staticLimit']
                    assert diag['bodyBytes'] <= diag['bodyLimit']
                    assert diag['liveBytes'] < 16*1024*1024
                    observed=await page.evaluate('[...new Set(_visibleRenders)]')
                    if args.foreground:
                        assert len(observed)>=3, observed
                    views.append({'visible_revisions':observed, 'revision': await page.evaluate('table.revision'), 'diagnostics': diag,
                                  'heap_bytes': metrics['JSHeapUsedSize'],
                                  'nodes': await page.locator('*').count()})
                evidence['rounds'].append({'seed': 42+number, 'revision': final['revision'],
                                           'result': final['result'], 'windows': views})
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
                print('round', number+1, 'revision', final['revision'], flush=True)
            evidence['errors'] = errors
            assert not errors, errors
            # After warm-up, retained heap cannot grow by more than 8 MiB per window.
            for i in range(4):
                heaps = [r['windows'][i]['heap_bytes'] for r in evidence['rounds']]
                assert max(heaps[2:] or heaps)-heaps[min(2,len(heaps)-1)] < 8*1024*1024, heaps
            args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
            await browser.close()
    finally:
        await runner.cleanup()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    parser.add_argument('--foreground', action='store_true', help='Keep all four clients executing/rendering throughout each round')
    parser.add_argument('--delay', type=float, default=.01, help='Use .24 for normal production pacing')
    parser.add_argument('--rounds', type=int, default=8)
    parser.add_argument('--output', type=Path, default=Path('validation/v0.10.1/soak.json'))
    asyncio.run(main(parser.parse_args()))
