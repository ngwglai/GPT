extends RefCounted

const Content = preload("res://src/content.gd")
const SAVE_VERSION = 1
var rng := RandomNumberGenerator.new()
var s: Dictionary = {}
var log_lines: Array = []

func start(class_id: String, seed_value: int, difficulty: int = 0) -> void:
	var job: Dictionary = Content.CLASSES[class_id]
	rng.seed = seed_value
	s = {"version":SAVE_VERSION,"seed":seed_value,"class":class_id,"difficulty":clampi(difficulty,0,4),
		"hp":job.hp,"max_hp":job.hp,"gold":80,"serum":2,"deck":[],"relics":[job.relic],
		"act":1,"row":-1,"lane":1,"phase":"map","map":[],"path":[],"enemies":[],
		"draw":[],"hand":[],"discard":[],"exhaust":[],"turn":0,"energy":0,"block":0,
		"strength":0,"weak":0,"poison":0,"charge":0,"armor":0,"incubate":0,"reactor":0,"retain":0,
		"reward":[],"shop":[],"event":0,"node":"","kills":0,"damage_taken":0,"cards_played":0,
		"bosses":0,"reward_relic":"","shop_relic":"","removed":false,"message":"Choose your first descent."}
	for id in job.cards:
		s.deck.append({"id":id,"upgraded":false})
	generate_map()
	log_lines.clear()

func note(message: String) -> void:
	s.message = message
	log_lines.append(message)
	if log_lines.size() > 6:
		log_lines.pop_front()

func shuffle(items: Array) -> void:
	for i in range(items.size()-1,0,-1):
		var j := rng.randi_range(0,i)
		var item = items[i]
		items[i] = items[j]
		items[j] = item

func generate_map() -> void:
	s.map = []
	for row in range(7):
		var cells: Array = []
		for lane in range(3):
			var kind := "battle"
			if row == 6:
				kind = "boss"
			elif row == 5:
				kind = ["rest","shop","rest"][lane]
			elif row in [2,4]:
				kind = "elite" if lane == row%3 else "battle"
			elif row > 0:
				var roll := rng.randi_range(0,99)
				kind = "battle" if roll < 38 else ("event" if roll < 62 else ("elite" if roll < 78 else ("rest" if roll < 90 else "shop")))
			cells.append(kind)
		# Every layer offers two different risk profiles after the opening.
		if row > 0 and row < 5:
			cells[row % 3] = "battle" if row % 2 == 0 else "event"
			cells[(row + 1) % 3] = "elite" if row % 2 == 0 else "rest"
		s.map.append(cells)
	s.row = -1
	s.lane = 1
	s.path = []

func reachable(row: int, lane: int) -> bool:
	return s.phase == "map" and row == int(s.row)+1 and lane >= 0 and lane < 3 and (int(s.row) == -1 or absi(lane-int(s.lane)) <= 1)

func travel(row: int, lane: int) -> bool:
	if not reachable(row,lane):
		return false
	s.row = row
	s.lane = lane
	s.path.append(lane)
	s.node = s.map[row][lane]
	s.phase = s.node
	match s.node:
		"battle","elite","boss":
			begin_combat()
		"event":
			s.event = rng.randi_range(0, Content.EVENTS.size()-1)
		"shop":
			s.shop = roll_cards(4)
			s.shop_relic = roll_relic()
			s.removed = false
	note("Entered %s." % str(s.node).to_upper())
	return true

func begin_combat() -> void:
	s.phase = "combat"
	s.enemies = []
	var ids: Array = []
	if s.node == "boss":
		ids = [["warden"],["hive"],["core"]][int(s.act)-1]
	elif s.node == "elite":
		ids = ["guardian"] if rng.randi_range(0,1) == 0 else ["hunter"]
		if int(s.act) == 3:
			ids.append("glitch")
	else:
		var groups := [["drone","crawler"],["leech"],["crawler","crawler"],["turret"],["fungus","crawler"],["glitch","drone"]]
		ids = groups[rng.randi_range(0,2 if int(s.act) == 1 else 5)]
	for id in ids:
		var e: Dictionary = Content.ENEMIES[id].duplicate(true)
		var scale := 1.0 + 0.12*int(s.difficulty)
		if s.node != "boss":
			scale += 0.23*(int(s.act)-1)
		e.hp = int(e.hp*scale)
		e["max_hp"] = e.hp
		e["id"] = id
		e["block"] = 0
		e["poison"] = 0
		e["weak"] = 0
		e["vulnerable"] = 0
		e["strength"] = int(s.difficulty) + (int(s.act)-1 if s.node != "boss" else 0)
		e["step"] = 0
		s.enemies.append(e)
	for field in ["turn","block","strength","weak","poison","charge","armor","incubate","reactor","retain"]:
		s[field] = 0
	s.draw = s.deck.duplicate(true)
	shuffle(s.draw)
	s.hand = []
	s.discard = []
	s.exhaust = []
	if has_relic("lens"):
		s.strength = 1
	if has_relic("battery"):
		s.charge = 2
	if has_relic("vial"):
		s.serum = mini(5,int(s.serum)+2)
	start_turn()
	if has_relic("capacitor"):
		s.block += 8

func has_relic(id: String) -> bool:
	return id in s.relics

func draw_cards(count: int) -> void:
	for i in range(count):
		if s.hand.size() >= 10:
			break
		if s.draw.is_empty():
			s.draw = s.discard.duplicate(true)
			s.discard.clear()
			shuffle(s.draw)
		if s.draw.is_empty():
			break
		s.hand.append(s.draw.pop_back())

func start_turn() -> void:
	s.turn += 1
	if int(s.retain) == 0:
		s.block = 0
	s.block += int(s.armor) + (3 if has_relic("plating") else 0)
	s.energy = 3 + int(s.reactor) + (1 if has_relic("cell") else 0) + (1 if int(s.turn) == 1 and has_relic("anchor") else 0)
	if has_relic("coil"):
		s.charge += 1
	if int(s.incubate) > 0:
		for e in s.enemies:
			if int(e.hp) > 0:
				e.poison += int(s.incubate)
	if has_relic("cell"):
		lose_hp(2)
	if s.phase == "combat":
		draw_cards(5 + (1 if has_relic("compass") else 0))

func target_alive(index: int) -> bool:
	return index >= 0 and index < s.enemies.size() and int(s.enemies[index].hp) > 0

func play(index: int, target: int) -> bool:
	if s.phase != "combat" or index < 0 or index >= s.hand.size():
		return false
	var item: Dictionary = s.hand[index]
	var card: Dictionary = Content.card(item.id, item.upgraded)
	if int(card.cost) > int(s.energy):
		return false
	var needs_target := false
	for effect in card.fx:
		if effect[0] in ["hit","poison","weak","vulnerable","catalyst","shield_hit","overload","harvest"]:
			needs_target = true
	if needs_target and not target_alive(target):
		return false
	s.energy -= int(card.cost)
	s.hand.remove_at(index)
	s.cards_played += 1
	for effect in card.fx:
		apply_effect(effect[0],int(effect[1]),target)
		if s.phase == "lost":
			break
	if card.get("exhaust",false):
		s.exhaust.append(item)
	else:
		s.discard.append(item)
	note("Played %s." % card.name)
	check_combat_end()
	return true

func apply_effect(kind: String, amount: int, target: int) -> void:
	match kind:
		"hit": damage_enemy(target,amount)
		"all_hit":
			for i in range(s.enemies.size()):
				damage_enemy(i,amount)
		"block": s.block += amount
		"draw": draw_cards(amount)
		"energy","strength","charge","armor","incubate","reactor","retain": s[kind] += amount
		"heal": heal(amount)
		"hurt": lose_hp(amount)
		"weak","vulnerable":
			if target_alive(target):
				s.enemies[target][kind] += amount
		"poison":
			if target_alive(target):
				s.enemies[target].poison += amount + (1 if has_relic("culture") else 0)
		"all_poison":
			for e in s.enemies:
				if int(e.hp) > 0:
					e.poison += amount + (1 if has_relic("culture") else 0)
		"catalyst":
			if target_alive(target):
				s.enemies[target].poison *= amount
		"shield_hit": damage_enemy(target,int(s.block))
		"harvest":
			if target_alive(target):
				damage_enemy(target,amount+int(s.enemies[target].poison))
		"overload":
			damage_enemy(target,amount+3*int(s.charge))
			s.charge = 0
		"charge_block": s.block += amount+2*int(s.charge)

func damage_enemy(index: int, base: int) -> void:
	if not target_alive(index):
		return
	var e: Dictionary = s.enemies[index]
	var amount := attack_amount(base+int(s.strength),int(s.weak),int(e.vulnerable))
	var absorbed := mini(int(e.block),amount)
	e.block -= absorbed
	e.hp = maxi(0,int(e.hp)-amount+absorbed)

func attack_amount(base: int, weak: int, vulnerable: int) -> int:
	return maxi(0,int(float(base)*(0.75 if weak > 0 else 1.0)*(1.5 if vulnerable > 0 else 1.0)))

func intent(e: Dictionary) -> Dictionary:
	var move: Array = e.moves[int(e.step)%e.moves.size()]
	var amount := int(move[1])
	if move[0] in ["attack","multi"]:
		amount = attack_amount(amount+int(e.strength),int(e.weak),0)
	return {"kind":move[0],"amount":amount}

func end_turn() -> bool:
	if s.phase != "combat":
		return false
	s.discard.append_array(s.hand)
	s.hand.clear()
	if int(s.poison) > 0:
		lose_hp(int(s.poison))
		s.poison -= 1
	if s.phase == "lost":
		return true
	# Vulnerable lasts through player turns; weak lasts through enemy turns.
	s.weak = maxi(0,int(s.weak)-1)
	for e in s.enemies:
		if int(e.hp) <= 0:
			continue
		e.block = 0
		e.hp = maxi(0,int(e.hp)-int(e.poison))
		e.poison = maxi(0,int(e.poison)-1)
		if int(e.hp) <= 0:
			continue
		var move := intent(e)
		match move.kind:
			"attack","multi":
				for i in range(2 if move.kind == "multi" else 1):
					if int(e.hp) <= 0 or s.phase == "lost":
						break
					var blocked := mini(int(s.block),int(move.amount))
					s.block -= blocked
					lose_hp(int(move.amount)-blocked)
					if has_relic("thorn"):
						e.hp = maxi(0,int(e.hp)-3)
			"block": e.block += int(move.amount)
			"buff": e.strength += int(move.amount)
			"weak": s.weak += int(move.amount)
			"poison": s.poison += int(move.amount)
			"jam":
				for i in range(int(move.amount)):
					s.discard.append({"id":"static","upgraded":false})
		e.weak = maxi(0,int(e.weak)-1)
		e.vulnerable = maxi(0,int(e.vulnerable)-1)
		e.step += 1
		if s.phase == "lost":
			return true
	check_combat_end()
	if s.phase == "combat":
		start_turn()
		note("Turn %d. Read intents before committing." % int(s.turn))
	return true

func lose_hp(amount: int) -> void:
	s.hp = maxi(0,int(s.hp)-amount)
	s.damage_taken += amount
	if int(s.hp) == 0:
		s.phase = "lost"
		note("Expedition lost. A new route awaits.")

func heal(amount: int) -> void:
	s.hp = mini(int(s.max_hp),int(s.hp)+amount)

func serum() -> bool:
	if s.phase != "combat" or int(s.serum) <= 0 or int(s.hp) == int(s.max_hp):
		return false
	s.serum -= 1
	heal(16)
	note("Serum restored 16 HP. No energy used.")
	return true

func check_combat_end() -> void:
	if s.phase != "combat":
		return
	for e in s.enemies:
		if int(e.hp) > 0:
			return
	s.kills += s.enemies.size()
	if has_relic("moss"):
		heal(4)
	var credits := rng.randi_range(20,32) + (12 if has_relic("coin") else 0)
	if s.node == "elite":
		credits += 20
	s.gold += credits
	s.reward = roll_cards(3)
	s.reward_relic = roll_relic() if s.node in ["elite","boss"] else ""
	if s.node == "boss":
		s.bosses += 1
		if int(s.act) == 3:
			s.phase = "won"
			note("The Deepwell is silent. You brought the dawn back.")
			return
	s.phase = "reward"
	note("Sector clear. Salvaged %d credits." % credits)

func roll_cards(count: int) -> Array:
	var pool: Array = []
	for id in Content.CARDS:
		var c: Dictionary = Content.CARDS[id]
		if c.pool in ["all",s["class"]] and id not in ["strike","guard"]:
			pool.append(id)
	shuffle(pool)
	var result: Array = []
	for i in range(mini(count,pool.size())):
		result.append({"id":pool[i],"upgraded":rng.randf() < (0.12 if int(s.act) > 1 else 0.0)})
	return result

func roll_relic() -> String:
	var pool: Array = []
	for id in Content.RELICS:
		if id not in s.relics and id not in ["capacitor","culture","battery"]:
			pool.append(id)
	return "" if pool.is_empty() else str(pool[rng.randi_range(0,pool.size()-1)])

func add_relic(id: String) -> void:
	if id.is_empty() or id in s.relics:
		return
	s.relics.append(id)
	if id == "heart":
		s.max_hp += 14
		heal(14)

func choose_reward(index: int) -> bool:
	if s.phase != "reward" or index < -1 or index >= s.reward.size():
		return false
	if index >= 0:
		s.deck.append(s.reward[index].duplicate(true))
	add_relic(s.reward_relic)
	s.reward = []
	s.reward_relic = ""
	if s.node == "boss":
		s.act += 1
		heal(int(s.max_hp)*35/100)
		generate_map()
	s.phase = "map"
	return true

func rest(upgrade_index: int = -1) -> bool:
	if s.phase != "rest":
		return false
	if upgrade_index == -1:
		heal(int(s.max_hp)*30/100)
	elif not upgrade(upgrade_index):
		return false
	s.phase = "map"
	return true

func upgrade(index: int) -> bool:
	if index < 0 or index >= s.deck.size() or s.deck[index].upgraded or int(Content.CARDS[s.deck[index].id].up) <= 0:
		return false
	s.deck[index].upgraded = true
	return true

func buy(index: int) -> bool:
	if s.phase != "shop":
		return false
	if index >= 0 and index < s.shop.size():
		if s.shop[index] == null or int(s.gold) < 45:
			return false
		s.gold -= 45
		s.deck.append(s.shop[index].duplicate(true))
		s.shop[index] = null
		return true
	if index == -1 and int(s.gold) >= 90 and s.shop_relic != "":
		s.gold -= 90
		add_relic(s.shop_relic)
		s.shop_relic = ""
		return true
	if index == -2 and int(s.gold) >= 30 and int(s.serum) < 5:
		s.gold -= 30
		s.serum += 1
		return true
	return false

func remove_card(index: int) -> bool:
	if s.phase != "shop" or s.removed or int(s.gold) < 50 or index < 0 or index >= s.deck.size() or s.deck.size() <= 5:
		return false
	s.deck.remove_at(index)
	s.gold -= 50
	s.removed = true
	return true

func leave_shop() -> bool:
	if s.phase != "shop":
		return false
	s.phase = "map"
	return true

func event_choice(choice: int) -> bool:
	if s.phase != "event" or choice < 0 or choice > 2:
		return false
	s.phase = "map"
	match int(s.event):
		0:
			if choice == 0:
				lose_hp(10)
				add_relic(roll_relic())
			elif choice == 1: heal(16)
		1:
			if choice == 0:
				s.max_hp = maxi(1,int(s.max_hp)-7)
				s.hp = mini(int(s.hp),int(s.max_hp))
				add_relic(roll_relic())
			elif choice == 1:
				var candidates: Array = []
				for i in range(s.deck.size()):
					if not s.deck[i].upgraded and int(Content.CARDS[s.deck[i].id].up) > 0:
						candidates.append(i)
				if not candidates.is_empty():
					upgrade(candidates[rng.randi_range(0,candidates.size()-1)])
		2:
			if choice == 0:
				s.gold += 65
				lose_hp(8)
			elif choice == 1: s.gold += 25
		3:
			if choice == 0:
				for i in range(s.deck.size()):
					if s.deck[i].id in ["strike","guard"] and s.deck.size() > 5:
						s.deck.remove_at(i)
						break
			elif choice == 1: heal(12)
			else: s.serum = mini(5,int(s.serum)+1)
	return true

func snapshot() -> Dictionary:
	return {"version":SAVE_VERSION,"state":s.duplicate(true),"rng":str(rng.state)}

func restore(data: Variant) -> bool:
	# Validate before mutation. Never deserialize scripts, objects or external paths.
	if not data is Dictionary or data.get("version") != SAVE_VERSION or not data.get("state") is Dictionary or not data.get("rng") is String:
		return false
	if not data.rng.is_valid_int():
		return false
	var candidate: Dictionary = normalize_numbers(data.state)
	if not valid_state(candidate):
		return false
	s = candidate.duplicate(true)
	rng.state = int(data.rng)
	log_lines.clear()
	return true

func normalize_numbers(value: Variant, depth: int = 0) -> Variant:
	if depth > 20:
		return null
	if value is float and is_finite(value) and value == floor(value) and absf(value) <= 1000000000:
		return int(value)
	if value is Dictionary:
		var result := {}
		for key in value:
			result[key] = normalize_numbers(value[key],depth+1)
		return result
	if value is Array:
		var result: Array = []
		for item in value:
			result.append(normalize_numbers(item,depth+1))
		return result
	return value

func valid_state(c: Dictionary) -> bool:
	# A fresh reference provides required keys/types without mutating this run.
	var reference = get_script().new()
	reference.start("warden",1)
	for key in reference.s:
		if not c.has(key):
			return false
		var expected: int = typeof(reference.s[key])
		var actual: int = typeof(c[key])
		if expected in [TYPE_INT,TYPE_FLOAT]:
			if actual not in [TYPE_INT,TYPE_FLOAT] or not is_finite(float(c[key])) or float(c[key]) != floor(float(c[key])) or absf(float(c[key])) > 1000000000:
				return false
		elif actual != expected:
			return false
	if not Content.CLASSES.has(c["class"]) or c.phase not in ["map","combat","rest","shop","event","reward","won","lost"]:
		return false
	if int(c.act) < 1 or int(c.act) > 3 or int(c.row) < -1 or int(c.row) > 6 or int(c.lane) < 0 or int(c.lane) > 2 or int(c.hp) < 0 or int(c.hp) > int(c.max_hp) or int(c.max_hp) < 1 or int(c.max_hp) > 1000:
		return false
	if int(c.difficulty) < 0 or int(c.difficulty) > 4 or int(c.event) < 0 or int(c.event) >= Content.EVENTS.size() or int(c.serum) < 0 or int(c.serum) > 5:
		return false
	for key in ["gold","energy","block","strength","weak","poison","charge","armor","incubate","reactor","retain","turn"]:
		if int(c[key]) < 0 or int(c[key]) > 100000:
			return false
	if c.deck.size() < 5 or c.deck.size() > 200 or c.hand.size() > 10 or c.enemies.size() > 3:
		return false
	for key in ["deck","hand","draw","discard","exhaust","reward","shop"]:
		if c[key].size() > 300:
			return false
		for item in c[key]:
			if key == "shop" and item == null:
				continue
			if not item is Dictionary or not item.get("id") is String or not Content.CARDS.has(item.id) or not item.get("upgraded") is bool:
				return false
	for id in c.relics:
		if not id is String or not Content.RELICS.has(id):
			return false
	for key in ["reward_relic","shop_relic"]:
		if c[key] != "" and not Content.RELICS.has(c[key]):
			return false
	if c.map.size() != 7 or c.path.size() != int(c.row)+1:
		return false
	for row in c.map:
		if not row is Array or row.size() != 3:
			return false
		for cell in row:
			if cell not in ["battle","elite","boss","rest","shop","event"]:
				return false
	for lane in c.path:
		if typeof(lane) not in [TYPE_INT,TYPE_FLOAT] or lane not in [0,1,2]:
			return false
	for e in c.enemies:
		if not e is Dictionary or not Content.ENEMIES.has(e.get("id","")):
			return false
		for key in ["hp","max_hp","block","poison","weak","vulnerable","strength","step","shape"]:
			if not e.has(key) or typeof(e[key]) not in [TYPE_INT,TYPE_FLOAT] or float(e[key]) != floor(float(e[key])) or int(e[key]) < 0 or int(e[key]) > 100000:
				return false
		if e.get("moves") != Content.ENEMIES[e.id].moves or e.get("name") != Content.ENEMIES[e.id].name:
			return false
	if c.phase == "combat" and (c.enemies.is_empty() or int(c.hp) <= 0):
		return false
	return true
