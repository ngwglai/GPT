extends Control

const Run = preload("res://src/run.gd")
const Content = preload("res://src/content.gd")
const Unit = preload("res://src/unit.gd")
const MINT = Color("72e9bf")
const INK = Color("09121e")
const MUTED = Color("94acbd")
const WHITE = Color("e8f2f1")
const CORAL = Color("ff987b")
const GOLD = Color("f4ce83")
const SAVE_PATH = "user://roguelab-run.json"
const PROFILE_PATH = "user://roguelab-profile.json"
var game = Run.new()
var layer: Control
var selected_class := "warden"
var selected_target := 0
var difficulty := 0
var seed_text := ""
var screen := "home"
var overlay := ""
var page := 0
var muted := false
var t := 0.0
var flash := 0.0
var notice := ""
var seed_input: LineEdit
var profile := {"runs":0,"wins":0,"best":0,"recorded":""}
var audio_player: AudioStreamPlayer
var summary_recorded := false

func _ready() -> void:
	if "--smoke" in OS.get_cmdline_user_args():
		game.start("warden",741)
		if not game.travel(0,1) or game.s.hand.size() != 5:
			get_tree().quit(1)
		else:
			print("ROGUELAB_EXPORT_SMOKE_PASS")
			get_tree().quit(0)
		return
	load_profile()
	load_run()
	audio_player = AudioStreamPlayer.new()
	add_child(audio_player)
	redraw()

func _process(delta: float) -> void:
	t += delta
	flash = maxf(0,flash-delta*2)
	queue_redraw()

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO,size),INK)
	for x in range(0,int(size.x),40):
		draw_line(Vector2(x,0),Vector2(x,size.y),Color(0.4,0.8,0.8,0.025))
	for y in range(0,int(size.y),40):
		draw_line(Vector2(0,y),Vector2(size.x,y),Color(0.4,0.8,0.8,0.025))
	draw_circle(Vector2(1000,240),240,Color(0.1,0.6,0.55,0.025))
	draw_arc(Vector2(1000,240),220,t*0.02,t*0.02+5.3,100,Color(MINT,0.07),1,true)
	if flash > 0:
		draw_rect(Rect2(Vector2.ZERO,size),Color(MINT,flash*0.025))
	if screen == "run" and not game.s.is_empty() and game.s.phase == "map":
		for row in range(6):
			for lane in range(3):
				for next in range(3):
					if absi(lane-next) <= 1:
						var active: bool = row < game.s.path.size()-1 and game.s.path[row] == lane and game.s.path[row+1] == next
						draw_line(Vector2(395+row*112,240+lane*145),Vector2(395+(row+1)*112,240+next*145),Color(MINT,0.65 if active else 0.10),2,true)

func box_style(bg: Color, border: Color, width: int = 1) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(10)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	return style

func label_at(text: String, rect: Rect2, font_size: int = 18, color: Color = WHITE, parent: Control = null) -> Label:
	var node := Label.new()
	node.text = text
	node.position = rect.position
	node.size = rect.size
	node.add_theme_font_size_override("font_size",font_size)
	node.add_theme_color_override("font_color",color)
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	(parent if parent != null else layer).add_child(node)
	return node

func button(text: String, rect: Rect2, callback: Callable, enabled: bool = true, accent: Color = MINT, parent: Control = null) -> Button:
	var node := Button.new()
	node.text = text
	node.position = rect.position
	node.size = rect.size
	node.disabled = not enabled
	node.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	node.add_theme_font_size_override("font_size",16)
	node.add_theme_color_override("font_color",WHITE)
	node.add_theme_color_override("font_hover_color",accent)
	node.add_theme_color_override("font_disabled_color",Color("566773"))
	node.add_theme_stylebox_override("normal",box_style(Color("122330"),Color(accent,0.40)))
	node.add_theme_stylebox_override("hover",box_style(Color("1c3540"),accent,2))
	node.add_theme_stylebox_override("focus",box_style(Color(0,0,0,0),WHITE,2))
	node.add_theme_stylebox_override("pressed",box_style(Color("25464b"),accent,2))
	node.add_theme_stylebox_override("disabled",box_style(Color("0d1925"),Color("20333f")))
	node.pressed.connect(callback)
	(parent if parent != null else layer).add_child(node)
	return node

func panel(rect: Rect2, color: Color = MINT, parent: Control = null) -> Panel:
	var node := Panel.new()
	node.position = rect.position
	node.size = rect.size
	node.add_theme_stylebox_override("panel",box_style(Color("0e1d29"),Color(color,0.22)))
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	(parent if parent != null else layer).add_child(node)
	return node

func unit_at(rect: Rect2, shape: int, color: Color, is_hero: bool = false) -> void:
	var node := Control.new()
	node.set_script(Unit)
	node.position = rect.position
	node.size = rect.size
	node.variant_id = shape
	node.tint = color
	node.hero = is_hero
	layer.add_child(node)

func redraw() -> void:
	if layer != null:
		remove_child(layer)
		layer.queue_free()
	layer = Control.new()
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(layer)
	label_at("R / L",Rect2(34,18,80,40),24,MINT)
	label_at("ROGUELAB",Rect2(115,20,170,36),20)
	label_at("DEEPWELL PROTOCOL",Rect2(286,22,220,32),13,MUTED)
	button("SOUND " + ("OFF" if muted else "ON"),Rect2(1035,22,110,34),func(): muted = not muted; redraw())
	button("?  GUIDE",Rect2(1155,22,95,34),func(): overlay = "help"; redraw())
	if screen == "home":
		draw_home()
	else:
		draw_header()
		match str(game.s.phase):
			"map": draw_map()
			"combat": draw_combat()
			"reward": draw_reward()
			"rest": draw_rest()
			"shop": draw_shop()
			"event": draw_event()
			"won","lost": draw_summary()
	label_at("GODOT 4  /  LOCAL SAVE  /  NO ACCOUNT REQUIRED",Rect2(34,764,750,24),12,MUTED)
	label_at(notice,Rect2(34,731,1170,28),14,CORAL)
	if overlay != "":
		draw_overlay()

func draw_home() -> void:
	label_at("TACTICAL DECKBUILDING ROGUELIKE",Rect2(56,104,700,26),14,MINT)
	label_at("THE LAB WENT DARK.\nBRING BACK THE DAWN.",Rect2(52,141,900,136),46)
	label_at("Build a protocol. Read the enemy. Descend into the unknown.\nThree sectors. One life. Every decision carries forward.",Rect2(56,287,780,60),19,MUTED)
	unit_at(Rect2(970,138,200,200),0,MINT,true)
	label_at("01   SELECT AN OPERATOR",Rect2(56,380,500,26),14,MINT)
	var ids := ["warden","venom","spark"]
	for i in range(3):
		var id: String = ids[i]
		var job: Dictionary = Content.CLASSES[id]
		var active := id == selected_class
		button(("[x] " if active else "[ ] ")+job.name+"\n"+job.title+"\n%d HP  /  %s" % [job.hp,Content.RELICS[job.relic].name],Rect2(56+i*390,422,370,124),func(): capture_seed(); selected_class=id; tone(330+i*110); redraw(),true,MINT if active else MUTED)
	label_at("02   SEED / OPTIONAL",Rect2(56,570,260,24),13,MUTED)
	seed_input = LineEdit.new()
	seed_input.position = Vector2(56,604)
	seed_input.size = Vector2(250,46)
	seed_input.placeholder_text = "Random expedition"
	seed_input.max_length = 24
	seed_input.text = seed_text
	seed_input.add_theme_stylebox_override("normal",box_style(Color("122330"),Color(MINT,0.4)))
	layer.add_child(seed_input)
	button("THREAT %d  +" % difficulty,Rect2(322,604,160,46),func(): capture_seed(); difficulty=(difficulty+1)%5; redraw())
	button("DAILY SEED",Rect2(498,604,152,46),func(): seed_text=Time.get_date_string_from_system(true); redraw())
	button("BEGIN DESCENT  >",Rect2(672,594,280,62),begin_requested)
	button("CONTINUE  >",Rect2(974,594,250,62),func(): screen="run"; redraw(),not game.s.is_empty() and game.s.phase not in ["won","lost"])
	label_at("%d EXPEDITIONS   /   %d CLEARS   /   BEST SCORE %d" % [profile.runs,profile.wins,profile.best],Rect2(56,681,1000,32),14,MUTED)

func capture_seed() -> void:
	if is_instance_valid(seed_input):
		seed_text = seed_input.text

func begin_requested() -> void:
	capture_seed()
	if not game.s.is_empty() and game.s.phase not in ["won","lost"]:
		overlay = "confirm"
		redraw()
	else:
		new_run()

func new_run() -> void:
	var run_seed := int(Time.get_unix_time_from_system()) % 1000000000 if seed_text.strip_edges().is_empty() else (posmod(int(seed_text),1000000000) if seed_text.is_valid_int() else int(seed_text.sha256_text().left(7).hex_to_int()))
	game.start(selected_class,run_seed,difficulty)
	summary_recorded = false
	profile.runs += 1
	save_profile()
	screen = "run"
	overlay = ""
	selected_target = 0
	notice = ""
	save_run()
	tone(440)
	redraw()

func draw_header() -> void:
	panel(Rect2(32,77,1216,64))
	label_at(Content.CLASSES[game.s["class"]].name,Rect2(52,89,200,36),18,MINT)
	label_at("HP  %d / %d" % [game.s.hp,game.s.max_hp],Rect2(250,89,185,36),19,CORAL)
	label_at("CR  %d" % game.s.gold,Rect2(445,89,105,36),19,GOLD)
	label_at("SECTOR %d / 3  /  THREAT %d" % [game.s.act,game.s.difficulty],Rect2(575,89,360,36),16,MUTED)
	button("DECK %d" % game.s.deck.size(),Rect2(908,91,116,36),func(): overlay="deck"; page=0; redraw())
	button("RELICS %d" % game.s.relics.size(),Rect2(1034,91,105,36),func(): overlay="relics"; page=0; redraw())
	button("MENU",Rect2(1149,91,80,36),func(): screen="home"; redraw())

func draw_map() -> void:
	label_at(["THE OUTER SHELL","THE LIVING ARCHIVE","THE REACTOR HEART"][int(game.s.act)-1],Rect2(44,177,1000,45),30)
	label_at("CHART YOUR DESCENT",Rect2(44,248,290,30),14,MINT)
	label_at("Follow adjacent routes.\nYour next step is highlighted.\n\nFIGHT  /  cards + credits\nELITE  /  higher risk + relic\nSIGNAL  /  risk or opportunity\nREST  /  heal or upgrade\nSHOP  /  buy or remove cards\nCORE  /  sector boss",Rect2(44,296,300,300),17,MUTED)
	var names := {"battle":"FIGHT","elite":"ELITE","rest":"REST","shop":"SHOP","event":"SIGNAL","boss":"CORE"}
	for row in range(7):
		label_at("%02d" % (row+1),Rect2(361+row*112,630,80,28),14,MUTED)
		for lane in range(3):
			var kind: String = game.s.map[row][lane]
			var visited: bool = row < game.s.path.size() and game.s.path[row] == lane
			var color := CORAL if kind in ["elite","boss"] else (GOLD if kind == "shop" else MINT)
			button(("+ " if visited else "")+names[kind],Rect2(351+row*112,208+lane*145,90,64),func(): act(game.travel(row,lane)); selected_target=0,game.reachable(row,lane),color)
	label_at("SEED %s   /   Reach the core. Survive. Adapt." % game.s.seed,Rect2(351,680,850,30),14,MUTED)

func draw_combat() -> void:
	label_at("ENGAGEMENT  /  TURN %02d" % game.s.turn,Rect2(44,159,650,34),17,MINT)
	label_at("Click an enemy to target it, then play a card.",Rect2(44,197,660,28),15,MUTED)
	unit_at(Rect2(100,242,220,190),0,MINT,true)
	label_at("YOUR OPERATOR",Rect2(112,445,230,25),16,MINT)
	label_at("BLOCK %d   /   CHARGE %d\nSTRENGTH %d   WEAK %d   POISON %d" % [game.s.block,game.s.charge,game.s.strength,game.s.weak,game.s.poison],Rect2(64,478,440,55),16,WHITE)
	if not game.target_alive(selected_target):
		for i in range(game.s.enemies.size()):
			if game.target_alive(i):
				selected_target = i
				break
	for i in range(game.s.enemies.size()):
		var e: Dictionary = game.s.enemies[i]
		var x := 515+i*235
		var alive := int(e.hp) > 0
		var color := CORAL if alive else MUTED
		var intent: Dictionary = game.intent(e)
		var desc: String = {"attack":"ATTACK %d","multi":"ATTACK %d x 2","block":"SHIELD %d","buff":"STRENGTH +%d","weak":"WEAK %d","poison":"POISON %d","jam":"ADD %d STATIC"}[intent.kind] % intent.amount
		var target_button := button(("* TARGET  /  " if selected_target == i and alive else "")+(desc if alive else "NEUTRALIZED"),Rect2(x-20,235,222,294),func(): selected_target=i; tone(280); redraw(),alive,color)
		target_button.alignment = HORIZONTAL_ALIGNMENT_CENTER
		target_button.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
		target_button.text = ""
		label_at(("* " if selected_target == i and alive else "")+(desc if alive else "NEUTRALIZED"),Rect2(x-7,245,220,30),15,color)
		if alive:
			unit_at(Rect2(x,290,180,143),int(e.shape),color)
		label_at(e.name,Rect2(x-7,444,220,25),17,color)
		var health := ProgressBar.new()
		health.position = Vector2(x-7,475)
		health.size = Vector2(204,10)
		health.max_value = e.max_hp
		health.value = e.hp
		health.show_percentage = false
		var health_bg := box_style(Color("22303a"),Color.TRANSPARENT,0)
		var health_fill := box_style(color,Color.TRANSPARENT,0)
		for style in [health_bg,health_fill]:
			style.set_content_margin_all(0)
			style.set_corner_radius_all(3)
		health.add_theme_stylebox_override("background",health_bg)
		health.add_theme_stylebox_override("fill",health_fill)
		layer.add_child(health)
		health.set_deferred("size",Vector2(204,10))
		label_at("HP %d/%d   BLOCK %d\nPOISON %d  WEAK %d  VULN %d" % [e.hp,e.max_hp,e.block,e.poison,e.weak,e.vulnerable],Rect2(x-7,490,226,44),13,MUTED)
	label_at("%d" % game.s.energy,Rect2(42,558,55,64),40,MINT)
	label_at("ENERGY",Rect2(40,626,70,24),12,MUTED)
	var scroll := ScrollContainer.new()
	scroll.position = Vector2(122,550)
	scroll.size = Vector2(910,174)
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	layer.add_child(scroll)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation",10)
	scroll.add_child(row)
	for i in range(game.s.hand.size()):
		var item: Dictionary = game.s.hand[i]
		var card: Dictionary = Content.card(item.id,item.upgraded)
		var holder := Control.new()
		holder.custom_minimum_size = Vector2(170,158)
		row.add_child(holder)
		card_widget(item,Rect2(0,0,170,158),func(): act(game.play(i,selected_target)),int(card.cost)<=int(game.s.energy),holder,str(i+1) if i < 9 else "0")
	button("END TURN  >\n[ Space ]",Rect2(1055,557,187,62),func(): act(game.end_turn()),true,CORAL)
	button("SERUM %d  /  +16 HP" % game.s.serum,Rect2(1055,633,187,42),func(): act(game.serum()),int(game.s.serum)>0 and int(game.s.hp)<int(game.s.max_hp),GOLD)
	button("PILES  %d / %d / %d" % [game.s.draw.size(),game.s.discard.size(),game.s.exhaust.size()],Rect2(1055,686,187,34),func(): overlay="piles"; page=0; redraw(),true,MUTED)
	label_at(str(game.s.message),Rect2(42,727,1200,26),13,MUTED)

func card_widget(item: Dictionary, rect: Rect2, callback: Callable, enabled: bool = true, parent: Control = null, shortcut: String = "") -> void:
	var c: Dictionary = Content.card(item.id,item.upgraded)
	var color: Color = CORAL if c.kind == "attack" else (GOLD if c.kind == "power" else MINT)
	var card_button := button("",rect,callback,enabled,color,parent)
	card_button.tooltip_text = c.name+"\n"+c.text+"\nCost: "+str(c.cost)+( " | Exhausts for this combat." if c.get("exhaust",false) else "")
	label_at(str(c.cost)+"  /  "+str(c.kind).to_upper()+"   "+shortcut,Rect2(12,9,rect.size.x-20,24),12,color,card_button)
	label_at(c.name,Rect2(12,36,rect.size.x-22,30),17,WHITE if enabled else MUTED,card_button)
	var desc := label_at(c.text,Rect2(12,73,rect.size.x-24,rect.size.y-80),14,MUTED,card_button)
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.set_deferred("size",Vector2(rect.size.x-24,rect.size.y-80))

func draw_reward() -> void:
	label_at("PROTOCOL RECOVERED",Rect2(60,177,1100,50),34,MINT)
	label_at("Choose one card, or keep your deck lean.  /  "+str(game.s.message),Rect2(60,238,1100,34),18,MUTED)
	for i in range(game.s.reward.size()):
		card_widget(game.s.reward[i],Rect2(180+i*310,310,280,240),func(): act(game.choose_reward(i)))
	if game.s.reward_relic != "":
		var relic: Dictionary = Content.RELICS[game.s.reward_relic]
		label_at("RELIC SECURED  /  "+relic.name+"\n"+relic.text,Rect2(180,577,1000,64),18,GOLD)
	button("SKIP CARD  >",Rect2(480,658,320,54),func(): act(game.choose_reward(-1)))

func draw_rest() -> void:
	label_at("A POCKET OF QUIET",Rect2(60,180,1000,50),36,MINT)
	label_at("Spend this moment carefully. You may take one action.",Rect2(60,248,1100,34),20,MUTED)
	unit_at(Rect2(535,309,200,180),2,MINT)
	button("REST\nRestore %d HP" % (int(game.s.max_hp)*30/100),Rect2(230,554,370,98),func(): act(game.rest()))
	button("REFINE\nPermanently upgrade a card",Rect2(680,554,370,98),func(): overlay="upgrade"; page=0; redraw(),can_upgrade(),GOLD)

func can_upgrade() -> bool:
	for item in game.s.deck:
		if not item.upgraded and int(Content.CARDS[item.id].up) > 0:
			return true
	return false

func draw_shop() -> void:
	label_at("THE SALVAGE EXCHANGE",Rect2(60,174,1100,48),34,GOLD)
	label_at("A good protocol needs fewer flaws, not just more cards.",Rect2(60,230,1100,30),18,MUTED)
	for i in range(game.s.shop.size()):
		if game.s.shop[i] != null:
			card_widget(game.s.shop[i],Rect2(60+i*240,288,220,222),func(): act(game.buy(i)),int(game.s.gold)>=45)
			label_at("45 CREDITS",Rect2(70+i*240,519,210,30),15,GOLD)
	if game.s.shop_relic != "":
		var r: Dictionary = Content.RELICS[game.s.shop_relic]
		var b := button(r.name+"\n90 CREDITS",Rect2(1030,288,210,120),func(): act(game.buy(-1)),int(game.s.gold)>=90,GOLD)
		b.tooltip_text = r.text
		var desc := label_at(r.text,Rect2(1035,429,200,110),16,MUTED)
		desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button("SERUM +1  /  30 CR",Rect2(60,604,285,60),func(): act(game.buy(-2)),int(game.s.gold)>=30 and int(game.s.serum)<5)
	button("REMOVE CARD  /  50 CR",Rect2(365,604,285,60),func(): overlay="remove"; page=0; redraw(),int(game.s.gold)>=50 and not game.s.removed and game.s.deck.size()>5)
	button("CONTINUE  >",Rect2(955,604,285,60),func(): act(game.leave_shop()))

func draw_event() -> void:
	var event: Dictionary = Content.EVENTS[int(game.s.event)]
	label_at("UNKNOWN SIGNAL",Rect2(60,180,1000,30),14,MINT)
	label_at(event.title,Rect2(60,229,1100,60),36)
	label_at(event.text,Rect2(60,316,1100,100),22,MUTED)
	for i in range(3):
		button(event.choices[i],Rect2(100,458+i*78,1080,58),func(): act(game.event_choice(i)),true,CORAL if i == 0 else MINT)

func draw_summary() -> void:
	var won: bool = game.s.phase == "won"
	label_at("DAWN, RESTORED." if won else "SIGNAL LOST.",Rect2(60,186,1100,76),56,MINT if won else CORAL)
	label_at("You silenced the Deepwell. Another protocol is waiting." if won else "The expedition ends here. What will you build differently?",Rect2(60,283,1100,55),22,MUTED)
	var score := int(game.s.kills)*100+int(game.s.bosses)*500+(1000+int(game.s.hp)*10 if won else 0)+int(game.s.difficulty)*250
	label_at("%d\nEXPEDITION SCORE" % score,Rect2(60,395,500,112),32,GOLD)
	label_at("SECTOR %d   /   %d ENEMIES   /   %d CARDS PLAYED\nSEED %s   /   THREAT %d\n%s  /  %d CARDS  /  %d RELICS" % [game.s.act,game.s.kills,game.s.cards_played,game.s.seed,game.s.difficulty,Content.CLASSES[game.s["class"]].name,game.s.deck.size(),game.s.relics.size()],Rect2(590,394,640,140),19,MUTED)
	button("NEW EXPEDITION  >",Rect2(60,610,400,70),func(): screen="home"; redraw())
	button("INSPECT FINAL DECK",Rect2(490,610,300,70),func(): overlay="deck"; page=0; redraw())

func draw_overlay() -> void:
	var shade := ColorRect.new()
	shade.color = Color(0.01,0.025,0.04,0.95)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(shade)
	button("CLOSE  x",Rect2(1125,35,120,44),func(): overlay=""; redraw())
	label_at(str(overlay).to_upper(),Rect2(45,35,1030,55),30,MINT)
	if overlay == "help":
		label_at("YOUR FIRST DESCENT",Rect2(55,124,1100,45),28)
		label_at("1. Choose a highlighted map node. Routes connect to adjacent lanes.\n2. Click an enemy to target it. Its intent shows exactly what comes next.\n3. Spend energy on cards. Unplayed cards are discarded at end of turn.\n4. Block absorbs attacks and clears at your next turn. Poison bypasses it.\n5. Defeat enemies for cards and credits. Elites and bosses also give relics.\n6. Rest to heal OR upgrade. Shops can remove a card to tighten your deck.\n7. Clear three sector bosses to win. Death ends the run, not your learning.",Rect2(55,186,1170,280),21,WHITE)
		label_at("MECHANICS",Rect2(55,486,550,32),18,GOLD)
		label_at("Weak: attacks deal 25% less. Vulnerable: target takes 50% more attack damage.\nPoison: damage before the owner's actions, then decreases by 1.\nCharge: feeds Overload / Static shield. Strength: adds damage to each hit.\nExhaust: removed for this combat. Powers last until combat ends.\nSerum: heal 16 at no energy cost. Progress saves after every action.",Rect2(55,529,1170,150),18,MUTED)
		label_at("KEYS  1-9 / 0: play cards  /  < >: target  /  Space: end turn  /  H: serum  /  Esc: close/menu\nDaily seed uses UTC. Threat 0-4 increases enemy HP and strength. No paid unlocks.",Rect2(55,704,1170,62),16,MINT)
	elif overlay == "confirm":
		label_at("Abandon the current expedition?",Rect2(120,240,1050,70),36)
		label_at("Starting a new expedition replaces the current autosave.",Rect2(120,335,1050,50),22,MUTED)
		button("ABANDON & BEGIN",Rect2(120,460,450,70),new_run,true,CORAL)
		button("KEEP CURRENT RUN",Rect2(650,460,450,70),func(): overlay=""; redraw())
	elif overlay == "relics":
		for i in range(game.s.relics.size()):
			var relic: Dictionary = Content.RELICS[game.s.relics[i]]
			var col := i % 2
			var row := i / 2
			label_at(relic.name+"\n"+relic.text,Rect2(55+col*605,120+row*84,575,77),17,GOLD)
	else:
		var items: Array = game.s.deck
		if overlay == "piles":
			var hidden_draw: Array = game.s.draw.duplicate(true)
			hidden_draw.sort_custom(func(a,b): return a.id < b.id)
			items = hidden_draw+game.s.discard+game.s.exhaust
			label_at("Draw %d / discard %d / exhaust %d. Listed in that order; draw order is hidden." % [game.s.draw.size(),game.s.discard.size(),game.s.exhaust.size()],Rect2(50,96,1170,30),17,MUTED)
		var start := page*10
		for i in range(start,mini(start+10,items.size())):
			var item: Dictionary = items[i]
			var callback := func(): pass
			var enabled := true
			if overlay == "upgrade":
				enabled = not item.upgraded and int(Content.CARDS[item.id].up)>0
				callback = func(): overlay=""; act(game.rest(i))
			elif overlay == "remove":
				callback = func(): overlay=""; act(game.remove_card(i))
			var j := i-start
			card_widget(item,Rect2(50+(j%5)*240,150+(j/5)*240,220,215),callback,enabled)
		button("< PREVIOUS",Rect2(50,680,230,50),func(): page-=1; redraw(),page>0)
		label_at("PAGE %d / %d" % [page+1,maxi(1,ceili(items.size()/10.0))],Rect2(535,683,300,42),18,MUTED)
		button("NEXT >",Rect2(990,680,230,50),func(): page+=1; redraw(),start+10<items.size())

func act(success: bool) -> void:
	if not success:
		return
	flash = 1
	tone(400 if game.s.phase == "combat" else 620)
	if game.s.phase in ["won","lost"] and not summary_recorded:
		summary_recorded = true
		var key: String = str(game.s.seed)+":"+str(profile.runs)
		if profile.recorded != key:
			profile.recorded = key
			if game.s.phase == "won":
				profile.wins += 1
			var score := int(game.s.kills)*100+int(game.s.bosses)*500+(1000+int(game.s.hp)*10 if game.s.phase == "won" else 0)+int(game.s.difficulty)*250
			profile.best = maxi(int(profile.best),score)
			save_profile()
	save_run()
	redraw()

func save_json(path: String, data: Dictionary) -> bool:
	var file := FileAccess.open(path+".tmp",FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(data))
	file.close()
	return DirAccess.rename_absolute(path+".tmp",path) == OK

func save_run() -> void:
	if not save_json(SAVE_PATH,game.snapshot()):
		notice = "Storage unavailable. This run can continue, but may not survive a reload."

func load_run() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var file := FileAccess.open(SAVE_PATH,FileAccess.READ)
	if file == null or file.get_length() > 1048576:
		notice = "Autosave could not be read. Start a new expedition."
		return
	if not game.restore(JSON.parse_string(file.get_as_text())):
		notice = "Autosave is invalid or from another version. Start a new expedition."
	summary_recorded = not game.s.is_empty() and game.s.phase in ["won","lost"]

func load_profile() -> void:
	if not FileAccess.file_exists(PROFILE_PATH):
		return
	var f := FileAccess.open(PROFILE_PATH,FileAccess.READ)
	if f == null or f.get_length()>4096:
		return
	var data = JSON.parse_string(f.get_as_text())
	if data is Dictionary and data.get("recorded") is String:
		for key in ["runs","wins","best"]:
			if typeof(data.get(key)) not in [TYPE_INT,TYPE_FLOAT] or float(data[key])<0 or float(data[key])>100000000:
				return
		profile = data

func save_profile() -> void:
	save_json(PROFILE_PATH,profile)

func tone(frequency: float) -> void:
	if muted or audio_player == null:
		return
	var wave := AudioStreamWAV.new()
	wave.format = AudioStreamWAV.FORMAT_16_BITS
	wave.mix_rate = 22050
	var samples := PackedByteArray()
	samples.resize(2646*2)
	for i in range(2646):
		var value := int(sin(TAU*frequency*i/22050.0)*2000.0*pow(1.0-i/2646.0,2))
		samples.encode_s16(i*2,value)
	wave.data = samples
	audio_player.stream = wave
	audio_player.play()

func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	if event.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		if overlay != "":
			overlay = ""
		elif screen == "run":
			screen = "home"
		redraw()
		return
	if overlay != "" or screen != "run" or game.s.phase != "combat":
		return
	if event.keycode in [KEY_SPACE,KEY_H,KEY_LEFT,KEY_RIGHT,KEY_0,KEY_1,KEY_2,KEY_3,KEY_4,KEY_5,KEY_6,KEY_7,KEY_8,KEY_9]:
		get_viewport().set_input_as_handled()
	if event.keycode == KEY_SPACE:
		act(game.end_turn())
	elif event.keycode == KEY_H:
		act(game.serum())
	elif event.keycode == KEY_LEFT or event.keycode == KEY_RIGHT:
		var direction := 1 if event.keycode == KEY_RIGHT else -1
		for i in range(game.s.enemies.size()):
			selected_target = posmod(selected_target+direction,game.s.enemies.size())
			if game.target_alive(selected_target):
				break
		redraw()
	elif event.keycode >= KEY_1 and event.keycode <= KEY_9:
		act(game.play(event.keycode-KEY_1,selected_target))
	elif event.keycode == KEY_0:
		act(game.play(9,selected_target))
