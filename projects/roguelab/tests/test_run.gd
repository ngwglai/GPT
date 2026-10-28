extends SceneTree
const Run = preload("res://src/run.gd")
const Content = preload("res://src/content.gd")
var checks := 0
var failures := 0

func expect(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		printerr("FAIL: "+message)

func fresh(id: String = "warden", seed_value: int = 123):
	var r = Run.new()
	r.start(id,seed_value)
	r.travel(0,1)
	return r

func hand(r, ids: Array) -> void:
	r.s.hand = []
	for id in ids:
		r.s.hand.append({"id":id,"upgraded":false})
	r.s.energy = 30

func _initialize() -> void:
	call_deferred("run_tests")

func run_tests() -> void:
	for id in Content.CLASSES:
		var r = fresh(id)
		expect(r.s.deck.size()==10,"ten-card starting deck "+id)
		expect(r.s.hand.size()==5,"opening hand "+id)
		expect(r.s.energy==3,"opening energy "+id)
		for card in r.s.deck:
			expect(Content.CARDS.has(card.id),"valid starting card")
	expect("Heal 5" in Content.card("siphon",true).text,"upgraded secondary heal is shown")
	expect("Apply 5 poison" in Content.card("miasma",true).text,"upgraded secondary poison is shown")
	var a = fresh()
	var b = fresh()
	expect(a.snapshot()==b.snapshot(),"same seed produces identical map and hand")
	expect(a.s.map!=fresh("warden",987).s.map,"different seed changes route")
	var r = fresh()
	var before: Dictionary = r.snapshot()
	expect(not r.travel(1,2) and r.snapshot()==before,"cannot travel during combat")
	expect(not r.play(-1,0) and not r.play(99,0),"invalid hand indices rejected")
	hand(r,["strike"])
	r.s.energy=0
	before=r.snapshot()
	expect(not r.play(0,0) and r.snapshot()==before,"unaffordable card is atomic")
	r.s.energy=3
	before=r.snapshot()
	expect(not r.play(0,99) and r.snapshot()==before,"invalid target is atomic")
	r.s.enemies[0].block=4
	var hp: int = r.s.enemies[0].hp
	expect(r.play(0,0),"strike playable")
	expect(r.s.enemies[0].hp==hp-2 and r.s.enemies[0].block==0,"block absorbs attack")
	expect(r.s.energy==2 and r.s.hand.is_empty() and r.s.discard.size()==1,"card pays energy and discards")
	r=fresh()
	hand(r,["spore","catalyst"])
	r.play(0,0)
	expect(r.s.enemies[0].poison==5,"poison base amount")
	r.play(0,0)
	expect(r.s.enemies[0].poison==10 and r.s.exhaust.size()==1,"catalyst doubles and exhausts")
	r.s.enemies[0].block=100
	hp=r.s.enemies[0].hp
	r.end_turn()
	expect(r.s.enemies[0].hp==hp-10 and r.s.enemies[0].poison==9,"poison bypasses armor and decays")
	r=fresh("venom")
	hand(r,["spore"])
	r.play(0,0)
	expect(r.s.enemies[0].poison==6,"culture adds poison")
	r=fresh("spark")
	expect(r.s.charge==2,"battery starting charge")
	hand(r,["charge","discharge","overload"])
	r.play(0,0)
	expect(r.s.charge==4,"charge stacks")
	r.play(0,0)
	expect(r.s.block==14 and r.s.charge==4,"static shield retains charge")
	r.s.enemies[0].hp=100
	r.play(0,0)
	expect(r.s.enemies[0].hp==83 and r.s.charge==0,"overload scales and consumes")
	r=fresh()
	expect(r.s.block==8,"capacitor opening block")
	hand(r,["counter"])
	r.play(0,0)
	expect(r.s.block==12,"repulsor grants block before damage")
	expect(r.attack_amount(10,1,1)==11,"weak and vulnerable multiply before rounding")
	r.s.block=100
	r.end_turn()
	expect(r.s.block==0,"block clears between player turns")
	r=fresh()
	r.s.retain=1
	r.s.block=100
	r.end_turn()
	expect(r.s.block>0,"aegis retains block")
	r=fresh()
	r.s.hp=30
	var serum_count: int = r.s.serum
	expect(r.serum() and r.s.hp==46 and r.s.serum==serum_count-1,"serum heals and consumes")
	r.s.hp=r.s.max_hp
	expect(not r.serum(),"full-health serum not wasted")
	r.s.serum=0
	expect(not r.serum(),"empty serum rejected")
	r=fresh()
	r.s.draw=[]
	r.s.discard=[{"id":"guard","upgraded":false}]
	r.s.hand=[]
	r.draw_cards(3)
	expect(r.s.hand.size()==1 and r.s.discard.is_empty(),"reshuffle handles small decks")
	hand(r,["guard","guard","guard","guard","guard","guard","guard","guard","guard","guard"])
	r.draw_cards(4)
	expect(r.s.hand.size()==10,"hand limit")
	r=fresh()
	r.s.hp=1
	r.s.block=0
	r.end_turn()
	expect(r.s.phase=="lost" and r.s.hp==0,"death is terminal")
	expect(not r.end_turn() and not r.play(0,0),"terminal run rejects combat actions")
	r=fresh()
	for e in r.s.enemies: e.hp=0
	r.check_combat_end()
	expect(r.s.phase=="reward" and r.s.reward.size()==3,"combat victory offers three cards")
	var deck_size: int = r.s.deck.size()
	before=r.snapshot()
	expect(not r.choose_reward(9) and r.snapshot()==before,"invalid reward rejected")
	expect(r.choose_reward(-1) and r.s.deck.size()==deck_size and r.s.phase=="map","skip reward keeps deck lean")
	expect(not r.travel(1,-1) and not r.travel(2,1),"invalid map destinations rejected")
	r.s.lane=0
	expect(not r.travel(1,2),"nonadjacent route rejected")
	r.s.phase="rest"
	r.s.hp=10
	expect(r.rest() and r.s.hp==34 and r.s.phase=="map","rest heals 30 percent")
	r.s.phase="rest"
	expect(r.rest(0) and r.s.deck[0].upgraded,"refine permanently upgrades")
	r.s.phase="rest"
	expect(not r.rest(0) and r.s.phase=="rest","cannot upgrade twice")
	expect(Content.card("strike",true).fx[0][1]==9,"upgrade changes effect")
	expect("9" in Content.card("strike",true).text,"upgrade changes visible description")
	r.s.phase="shop"
	r.s.shop=r.roll_cards(4)
	r.s.gold=45
	expect(r.buy(0) and r.s.gold==0 and r.s.shop[0]==null,"shop purchase pays once")
	expect(not r.buy(0),"sold item cannot be purchased again")
	r.s.gold=100
	expect(r.remove_card(0) and r.s.gold==50,"card removal costs credits")
	expect(not r.remove_card(0),"only one removal per shop")
	expect(r.leave_shop() and r.s.phase=="map","leave shop")
	r.s.phase="event"
	r.s.event=2
	r.s.hp=5
	r.event_choice(0)
	expect(r.s.phase=="lost","event damage can kill")
	r=fresh()
	var maximum: int=r.s.max_hp
	r.add_relic("heart")
	r.add_relic("heart")
	expect(r.s.max_hp==maximum+14,"relics cannot stack duplicates")
	for act_num in range(1,4):
		r=fresh()
		r.s.act=act_num
		r.s.node="boss"
		r.begin_combat()
		for e in r.s.enemies: e.hp=0
		r.check_combat_end()
		if act_num<3:
			expect(r.s.phase=="reward" and r.s.reward_relic!="","boss grants relic")
			r.choose_reward(0)
			expect(r.s.act==act_num+1 and r.s.row==-1 and r.s.phase=="map","next act regenerates route")
		else:
			expect(r.s.phase=="won","final boss completes run")
	r=fresh()
	r.play(0,0)
	var json_roundtrip = JSON.parse_string(JSON.stringify(r.snapshot()))
	var restored=Run.new()
	expect(restored.restore(json_roundtrip),"JSON save restores")
	r.end_turn()
	restored.end_turn()
	expect(JSON.stringify(r.snapshot())==JSON.stringify(restored.snapshot()),"restored RNG and combat replay exactly")
	for corrupt in [null,{},[],{"version":99}, {"version":1,"rng":"x","state":{}}]:
		before=restored.snapshot()
		expect(not restored.restore(corrupt) and restored.snapshot()==before,"corrupt save rejected atomically")
	for key in ["hp","map","deck","enemies","relics","act","path","event","energy","class"]:
		var corrupt: Dictionary=r.snapshot()
		corrupt.state[key]="invalid"
		expect(not restored.restore(corrupt),"invalid state field "+key)
	var corrupt: Dictionary=r.snapshot()
	corrupt.state.enemies[0].moves=[["attack",999]]
	expect(not restored.restore(corrupt),"enemy move tampering rejected")
	# All cards resolve without script failures, and all generated paths remain valid.
	for id in Content.CARDS:
		r=fresh()
		hand(r,[id])
		expect(r.play(0,0),"card resolves: "+id)
	for seed_value in range(100):
		r=Run.new()
		r.start("warden",seed_value)
		expect(r.s.map.size()==7 and r.s.map[6]==["boss","boss","boss"],"map has complete boss layer")
		expect(r.reachable(0,0) and r.reachable(0,1) and r.reachable(0,2),"opening routes reachable")
		expect(r.valid_state(r.s),"generated state validates")
		var cards: Array=r.roll_cards(3)
		expect(cards[0].id!=cards[1].id and cards[1].id!=cards[2].id and cards[0].id!=cards[2].id,"reward choices unique")
	print("RogueLab tests: %d checks, %d failures" % [checks,failures])
	quit(1 if failures else 0)
