extends SceneTree
const Main = preload("res://src/main.gd")
var failures := 0

func _initialize() -> void:
	call_deferred("test_ui")

func test_ui() -> void:
	var ui := Control.new()
	ui.set_script(Main)
	ui.size=Vector2(1280,800)
	root.add_child(ui)
	ui.game.start("warden",12)
	ui.screen="run"
	for phase in ["map","combat","reward","rest","shop","event","won","lost"]:
		ui.game.start("warden",12)
		ui.game.travel(0,1)
		ui.game.s.phase=phase
		ui.game.s.reward=ui.game.roll_cards(3)
		ui.game.s.shop=ui.game.roll_cards(4)
		ui.game.s.shop_relic="heart"
		ui.redraw()
		if ui.layer.get_child_count()<5:
			failures+=1
		await process_frame
		if phase == "combat":
			check_layout(ui.layer)
	for overlay in ["help","confirm","deck","relics","piles","upgrade","remove"]:
		ui.overlay=overlay
		ui.redraw()
		await process_frame
	ui.screen="home"
	ui.overlay=""
	ui.redraw()
	await process_frame
	ui.queue_free()
	await process_frame
	print("UI_CHECKS_PASS" if failures==0 else "UI_CHECKS_FAILED")
	quit(0 if failures==0 else 1)

func check_layout(node: Node) -> void:
	if node is ProgressBar and node.size.y > 12:
		failures += 1
	if node is Label and node.autowrap_mode != TextServer.AUTOWRAP_OFF and node.get_parent() is Button:
		if node.position.x + node.size.x > node.get_parent().size.x:
			failures += 1
	for child in node.get_children():
		check_layout(child)
