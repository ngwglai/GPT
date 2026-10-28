"""Exercise the shipped Web export through real inputs and its IndexedDB autosave."""
import argparse
import functools
import http.server
from pathlib import Path
import threading
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
READ_SAVE = """async () => {
 const databases=await indexedDB.databases();
 for (const {name} of databases) {
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  for(const store of db.objectStoreNames){
   const records=await new Promise((resolve,reject)=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   for(const record of records){
    if(record.contents){try {const data=JSON.parse(new TextDecoder().decode(record.contents));if(data.state&&data.rng){db.close();return data;}}catch{}}
   }
  }
  db.close();
 }
 return null;
}"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url")
    parser.add_argument("--executable")
    args = parser.parse_args()
    server = None
    if not args.url:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT / "build/web")))
        threading.Thread(target=server.serve_forever, daemon=True).start()
    url = args.url or f"http://127.0.0.1:{server.server_port}"
    screenshots = ROOT / "test-results"
    screenshots.mkdir(exist_ok=True)
    checks = 0
    with sync_playwright() as p:
        options = {"headless": True, "args": ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
        if args.executable:
            options["executable_path"] = args.executable
        browser = p.chromium.launch(**options)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)

        def ready():
            page.wait_for_selector("#status", state="detached", timeout=120000)
            page.wait_for_timeout(500)

        def saved(predicate=lambda data: True):
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                data = page.evaluate(READ_SAVE)
                if data and predicate(data["state"]):
                    return data
                page.wait_for_timeout(120)
            raise AssertionError("Expected autosave was not persisted")

        def click(x, y):
            page.mouse.click(x, y)
            page.wait_for_timeout(120)

        page.goto(url)
        ready()
        assert page.locator("canvas").bounding_box()["width"] == 1280
        checks += 1
        page.screenshot(path=str(screenshots / "home.png"))
        click(1190, 40)
        page.screenshot(path=str(screenshots / "guide.png"))
        page.keyboard.press("Escape")
        click(170, 626)
        page.keyboard.type("12")
        click(800, 620)
        first = saved(lambda state: state["phase"] == "map")
        assert first["state"]["seed"] == 12
        checks += 1
        page.screenshot(path=str(screenshots / "map.png"))
        click(392, 385)
        state = saved(lambda state: state["phase"] == "combat")["state"]
        assert len(state["hand"]) == 5 and state["turn"] == 1
        checks += 1
        page.screenshot(path=str(screenshots / "combat.png"))
        # Play a whole first battle without modifying the game or its save.
        costs = {"strike": 1, "guard": 1, "bash": 2, "bulwark": 2, "counter": 1, "charge": 0}
        for _ in range(100):
            if state["phase"] != "combat":
                break
            target = next(i for i, enemy in enumerate(state["enemies"]) if enemy["hp"] > 0)
            click(600 + target * 235, 350)
            choices = [(i, item) for i, item in enumerate(state["hand"]) if costs.get(item["id"], 99) <= state["energy"]]
            if choices:
                # Defense first enables the Warden's Repulsor synergy.
                priority = {"charge": 0, "bulwark": 1, "guard": 2, "counter": 3, "bash": 4, "strike": 5}
                index, _ = min(choices, key=lambda item: priority.get(item[1]["id"], 9))
                old_count = state["cards_played"]
                page.keyboard.press(str((index + 1) % 10))
                state = saved(lambda s: s["cards_played"] > old_count)["state"]
            else:
                old_turn = state["turn"]
                page.keyboard.press("Space")
                state = saved(lambda s: s["turn"] > old_turn or s["phase"] != "combat")["state"]
        assert state["phase"] == "reward", "First battle did not reach reward"
        checks += 1
        page.screenshot(path=str(screenshots / "reward.png"))
        old_size = len(state["deck"])
        click(300, 420)
        after = saved(lambda s: s["phase"] == "map" and len(s["deck"]) == old_size + 1)
        checks += 1
        page.reload()
        ready()
        click(1090, 620)
        page.wait_for_timeout(300)
        assert page.evaluate(READ_SAVE) == after, "Reload changed the run or RNG"
        checks += 1
        click(960, 110)
        page.screenshot(path=str(screenshots / "deck.png"))
        page.keyboard.press("Escape")
        click(1190, 110)
        click(800, 620)
        click(850, 490)  # Cancel replacing a live save.
        assert page.evaluate(READ_SAVE) == after
        checks += 1
        page.set_viewport_size({"width": 960, "height": 600})
        page.wait_for_timeout(300)
        box = page.locator("canvas").bounding_box()
        assert box["width"] == 960 and box["height"] == 600
        page.screenshot(path=str(screenshots / "scaled.png"))
        checks += 1
        assert not errors, "Browser errors: " + repr(errors)
        checks += 1
        browser.close()
    if server:
        server.shutdown()
    print(f"WEB_SMOKE_PASS: {checks} checks; real battle, reward, reload, cancel, scaling; zero browser errors")


if __name__ == "__main__":
    main()
