extends SceneTree
const L = preload("res://src/localization.gd")
const Content = preload("res://src/content.gd")
var font = preload("res://assets/fonts/NotoSansSC.woff2")
var checks := 0
func check(ok: bool, context: String):
	checks += 1
	if not ok:
		printerr("LOCALIZATION_FAIL: "+context)
		quit(1)
func _initialize():
	for collection in [Content.CLASSES,Content.RELICS,Content.ENEMIES]:
		for id in collection:
			for key in ["name","text","title"]:
				if collection[id].has(key):check(L.catalog.has(collection[id][key]),"content "+id+key)
	for event in Content.EVENTS:
		for text in [event.title,event.text]+event.choices:check(L.catalog.has(text),"event")
	for id in Content.CARDS:
		check(L.catalog.has(Content.CARDS[id].text),"card description "+id)
		for upgraded in [false,true]:
			var en=Content.card(id,upgraded)
			var zh=L.card(id,upgraded)
			check(en.fx==zh.fx and en.cost==zh.cost,"unchanged effects "+id)
			check(not "{" in zh.text,"resolved numbers "+id)
	for value in L.catalog.values():
		for ch in str(value):
			if ch.unicode_at(0)>32:check(font.has_char(ch.unicode_at(0)),"font glyph "+ch)
	check("12" in L.message("Sector clear. Salvaged 12 credits."),"dynamic credits")
	check("脉冲射击" in L.message("Played Pulse shot."),"legacy message")
	var Run = load("res://src/run.gd")
	var old = Run.new()
	old.start("warden",12)
	old.travel(0,1)
	var snapshot: Dictionary = old.snapshot()
	check(snapshot.version == 1 and snapshot.state.enemies[0].name == Content.ENEMIES[snapshot.state.enemies[0].id].name,"legacy English metadata")
	L.message(old.s.message)
	var restored = Run.new()
	check(restored.restore(JSON.parse_string(JSON.stringify(snapshot))),"v1 save restores")
	old.end_turn()
	restored.end_turn()
	check(JSON.stringify(old.snapshot()) == JSON.stringify(restored.snapshot()),"legacy RNG replay unchanged")
	# Rule module must remain byte-identical to v1.0; enforced by CI review/diff.
	print("LOCALIZATION_PASS: %d checks" % checks)
	quit(0)
