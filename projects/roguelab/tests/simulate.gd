extends SceneTree
const Run = preload("res://src/run.gd")
const Content = preload("res://src/content.gd")
var wins := 0
var losses := 0
var stalled := 0
var class_wins := {}

func _initialize() -> void:
	call_deferred("simulate")

func quality(id: String, job: String) -> float:
	var scores := {"repair":9,"focus":8,"cleave":6,"flurry":5,"scan":4,"pierce":6,"nova":4,"meditate":3,"salvage":1,"charge":3,
		"fortify":10,"aegis":9,"counter":10,"ram":6,"bulwark":6,"bash":6,"taunt":4,
		"spore":9,"catalyst":8,"incubate":10,"plague":8,"miasma":9,"harvest":8,"siphon":7,"evade":6,
		"reactor":10,"overload":10,"discharge":9,"storm":7,"accelerate":8,"cycle":5,"zap":6}
	return float(scores.get(id,2)) + (2 if Content.CARDS[id].pool == job else 0)

func choose_play(r) -> bool:
	var best := -0.01
	var chosen := -1
	var target := 0
	var incoming := 0
	for e in r.s.enemies:
		if e.hp > 0:
			var move: Dictionary=r.intent(e)
			if move.kind in ["attack","multi"]:
				incoming += int(move.amount)*(2 if move.kind=="multi" else 1)
	for i in range(r.s.hand.size()):
		var card: Dictionary=Content.card(r.s.hand[i].id,r.s.hand[i].upgraded)
		if card.cost>r.s.energy:
			continue
		for j in range(r.s.enemies.size()):
			if not r.target_alive(j):
				continue
			var sim=Run.new()
			sim.s=r.s.duplicate(true)
			sim.rng.state=r.rng.state
			if not sim.play(i,j):
				continue
			var score := 0.0
			if sim.s.phase=="lost":
				continue
			for k in range(r.s.enemies.size()):
				score += (r.s.enemies[k].hp-sim.s.enemies[k].hp)*1.1
				score += (sim.s.enemies[k].poison-r.s.enemies[k].poison)*2.3
				score += (sim.s.enemies[k].weak-r.s.enemies[k].weak)*1.7
				score += (sim.s.enemies[k].vulnerable-r.s.enemies[k].vulnerable)*1.1
				if r.s.enemies[k].hp>0 and sim.s.enemies[k].hp<=0:
					score+=12
			score += (mini(sim.s.block,incoming)-mini(r.s.block,incoming))*1.4
			score += (sim.s.block-r.s.block)*(.35 if r.s.retain else .05)
			score += (sim.s.hp-r.s.hp)*2
			score += (sim.s.strength-r.s.strength)*5
			score += (sim.s.charge-r.s.charge)*1.7
			score += (sim.s.armor-r.s.armor)*5
			score += (sim.s.incubate-r.s.incubate)*6
			score += (sim.s.reactor-r.s.reactor)*12
			score += (sim.s.retain-r.s.retain)*10
			score += (sim.s.hand.size()-r.s.hand.size()+1)*2
			score += (sim.s.energy-r.s.energy)*2.4
			if card.id=="static": score=0.1
			if score>best:
				best=score
				chosen=i
				target=j
	return chosen>=0 and r.play(chosen,target)

func simulate() -> void:
	for job in Content.CLASSES:
		class_wins[job]=0
		for seed_value in range(20):
			var r=Run.new()
			r.start(job,seed_value,4 if "--hard" in OS.get_cmdline_user_args() else 0)
			var steps := 0
			while r.s.phase not in ["won","lost"] and steps<2500:
				steps+=1
				match r.s.phase:
					"map":
						var best := -999.0
						var lane := 1
						for j in range(3):
							if r.reachable(r.s.row+1,j):
								var node: String=r.s.map[r.s.row+1][j]
								var score := float({"battle":2,"elite":3 if r.s.hp>r.s.max_hp*.7 else -2,"shop":4 if r.s.gold>=90 else 0,"rest":5 if r.s.hp<r.s.max_hp*.7 else 1,"event":3,"boss":10}[node])
								if score>best:
									best=score
									lane=j
						r.travel(r.s.row+1,lane)
					"combat":
						if r.s.hp<=r.s.max_hp-16 and r.s.serum>0:
							r.serum()
						if not choose_play(r): r.end_turn()
					"reward":
						var best := -1.0
						var index := -1
						for i in range(r.s.reward.size()):
							var score := quality(r.s.reward[i].id,job)
							if score>best and (score>=6 or r.s.deck.size()<12):
								best=score
								index=i
						r.choose_reward(index)
					"rest":
						var upgraded := false
						if r.s.hp>r.s.max_hp*.65:
							var best := -1.0
							var index := -1
							for i in range(r.s.deck.size()):
								if not r.s.deck[i].upgraded and Content.CARDS[r.s.deck[i].id].up>0 and quality(r.s.deck[i].id,job)>best:
									best=quality(r.s.deck[i].id,job)
									index=i
							if index>=0: upgraded=r.rest(index)
						if not upgraded: r.rest()
					"shop":
						for i in range(r.s.shop.size()):
							if r.s.shop[i]!=null and quality(r.s.shop[i].id,job)>=8:
								r.buy(i)
						if r.s.gold>=90 and r.s.shop_relic!="cell": r.buy(-1)
						if r.s.hp<r.s.max_hp*.7: r.buy(-2)
						for i in range(r.s.deck.size()):
							if r.s.deck[i].id=="strike":
								r.remove_card(i)
								break
						r.leave_shop()
					"event":
						r.event_choice(1)
			if r.s.phase=="won":
				wins+=1
				class_wins[job]+=1
			elif r.s.phase=="lost": losses+=1
			else: stalled+=1
	print("BALANCE: 60 seeded expeditions, wins=%d losses=%d stalled=%d classes=%s" % [wins,losses,stalled,JSON.stringify(class_wins)])
	quit(1 if stalled>0 or class_wins.values().has(0) else 0)
