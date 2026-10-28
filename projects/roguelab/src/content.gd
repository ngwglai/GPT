extends RefCounted

# All artwork, names and mechanics are original; no network or runtime assets.
const CLASSES = {
	"warden": {"name":"WARDEN", "title":"Turn defense into force", "hp":82, "relic":"capacitor", "cards":["strike","strike","strike","guard","guard","guard","bash","bulwark","counter","charge"]},
	"venom": {"name":"MYCOLOGIST", "title":"Let the infection do the work", "hp":70, "relic":"culture", "cards":["strike","strike","guard","guard","guard","spore","spore","catalyst","siphon","evade"]},
	"spark": {"name":"ENGINEER", "title":"Chain draws, charge, and overload", "hp":74, "relic":"battery", "cards":["strike","strike","guard","guard","guard","zap","zap","cycle","charge","overload"]}
}
# Effects resolve in listed order. Upgrades add power only to scalable effects.
const CARDS = {
	"strike":{"name":"Pulse shot","cost":1,"kind":"attack","text":"Deal {6} damage.","fx":[["hit",6]],"up":3,"pool":"all"},
	"guard":{"name":"Barrier","cost":1,"kind":"skill","text":"Gain {6} block.","fx":[["block",6]],"up":3,"pool":"all"},
	"bash":{"name":"Breach","cost":2,"kind":"attack","text":"Deal {10} damage.\nApply 2 vulnerable.","fx":[["hit",10],["vulnerable",2]],"up":4,"pool":"warden"},
	"bulwark":{"name":"Bulwark","cost":2,"kind":"skill","text":"Gain {16} block.","fx":[["block",16]],"up":6,"pool":"warden"},
	"counter":{"name":"Repulsor","cost":1,"kind":"attack","text":"Deal damage equal to block.\nGain {4} block first.","fx":[["block",4],["shield_hit",0]],"up":3,"pool":"warden"},
	"charge":{"name":"Capacitate","cost":0,"kind":"skill","text":"Gain 2 charge.\nDraw 1. Exhaust.","fx":[["charge",2],["draw",1]],"up":0,"exhaust":true,"pool":"all"},
	"spore":{"name":"Spore cloud","cost":1,"kind":"skill","text":"Apply {5} poison.\nPoison bypasses block.","fx":[["poison",5]],"up":3,"pool":"venom"},
	"catalyst":{"name":"Catalyst","cost":1,"kind":"skill","text":"Double target's poison.\nExhaust.","fx":[["catalyst",2]],"up":0,"exhaust":true,"pool":"venom"},
	"siphon":{"name":"Siphon","cost":1,"kind":"attack","text":"Deal {7} damage.\nHeal {2}. Exhaust.","fx":[["hit",7],["heal",2]],"up":3,"exhaust":true,"pool":"venom"},
	"evade":{"name":"Vapor veil","cost":1,"kind":"skill","text":"Gain {7} block.\nApply 2 weak.","fx":[["block",7],["weak",2]],"up":3,"pool":"venom"},
	"zap":{"name":"Arc bolt","cost":1,"kind":"attack","text":"Deal {5} damage.\nGain 1 charge.","fx":[["hit",5],["charge",1]],"up":3,"pool":"spark"},
	"cycle":{"name":"Recompile","cost":0,"kind":"skill","text":"Draw 2. Exhaust.","fx":[["draw",2]],"up":0,"exhaust":true,"pool":"spark"},
	"overload":{"name":"Overload","cost":1,"kind":"attack","text":"Deal {5} damage + 3 per charge.\nConsume all charge.","fx":[["overload",5]],"up":5,"pool":"spark"},
	"flurry":{"name":"Twin pulse","cost":1,"kind":"attack","text":"Deal {4} damage twice.","fx":[["hit",4],["hit",4]],"up":2,"pool":"all"},
	"cleave":{"name":"Shockwave","cost":2,"kind":"attack","text":"Deal {13} damage to ALL.","fx":[["all_hit",13]],"up":4,"pool":"all"},
	"scan":{"name":"Deep scan","cost":1,"kind":"skill","text":"Draw 3.\nGain {4} block.","fx":[["draw",3],["block",4]],"up":3,"pool":"all"},
	"focus":{"name":"Battle rhythm","cost":1,"kind":"power","text":"Gain {2} strength this combat.\nExhaust.","fx":[["strength",2]],"up":1,"exhaust":true,"pool":"all"},
	"repair":{"name":"Field repair","cost":1,"kind":"skill","text":"Heal {7}. Exhaust.","fx":[["heal",7]],"up":3,"exhaust":true,"pool":"all"},
	"salvage":{"name":"Salvage","cost":0,"kind":"skill","text":"Gain 1 energy.\nLose 3 HP. Exhaust.","fx":[["energy",1],["hurt",3]],"up":0,"exhaust":true,"pool":"all"},
	"pierce":{"name":"Rail spike","cost":2,"kind":"attack","text":"Deal {18} damage.\nApply 1 weak.","fx":[["hit",18],["weak",1]],"up":6,"pool":"all"},
	"fortify":{"name":"Fortify","cost":1,"kind":"power","text":"Gain {3} block at turn start.\nExhaust.","fx":[["armor",3]],"up":2,"exhaust":true,"pool":"warden"},
	"ram":{"name":"Shield ram","cost":1,"kind":"attack","text":"Gain {5} block.\nDeal {5} damage.","fx":[["block",5],["hit",5]],"up":3,"pool":"warden"},
	"aegis":{"name":"Aegis engine","cost":2,"kind":"power","text":"Retain block between turns.\nExhaust.","fx":[["retain",1]],"up":0,"exhaust":true,"pool":"warden"},
	"taunt":{"name":"Disruptor","cost":0,"kind":"skill","text":"Apply 2 weak. Exhaust.","fx":[["weak",2]],"up":0,"exhaust":true,"pool":"warden"},
	"plague":{"name":"Bloom","cost":2,"kind":"skill","text":"Apply {6} poison to ALL.","fx":[["all_poison",6]],"up":3,"pool":"venom"},
	"harvest":{"name":"Harvest","cost":1,"kind":"attack","text":"Deal {6} damage + target poison.","fx":[["harvest",6]],"up":4,"pool":"venom"},
	"incubate":{"name":"Incubate","cost":1,"kind":"power","text":"Apply {2} poison to ALL each turn.\nExhaust.","fx":[["incubate",2]],"up":1,"exhaust":true,"pool":"venom"},
	"miasma":{"name":"Miasma","cost":1,"kind":"skill","text":"Gain {8} block.\nApply {2} poison to ALL.","fx":[["block",8],["all_poison",2]],"up":3,"pool":"venom"},
	"storm":{"name":"Arc storm","cost":2,"kind":"attack","text":"Deal {8} damage to ALL.\nGain 2 charge.","fx":[["all_hit",8],["charge",2]],"up":4,"pool":"spark"},
	"reactor":{"name":"Micro reactor","cost":1,"kind":"power","text":"Gain 1 energy each turn.\nExhaust.","fx":[["reactor",1]],"up":0,"exhaust":true,"pool":"spark"},
	"discharge":{"name":"Static shield","cost":1,"kind":"skill","text":"Gain {6} block + 2 per charge.\nKeep charge.","fx":[["charge_block",6]],"up":4,"pool":"spark"},
	"accelerate":{"name":"Accelerate","cost":1,"kind":"skill","text":"Gain 2 charge.\nDraw 2.","fx":[["charge",2],["draw",2]],"up":0,"pool":"spark"},
	"nova":{"name":"Nova lance","cost":3,"kind":"attack","text":"Deal {30} damage.","fx":[["hit",30]],"up":10,"pool":"all"},
	"meditate":{"name":"Stillness","cost":0,"kind":"skill","text":"Gain {3} block. Exhaust.","fx":[["block",3]],"up":4,"exhaust":true,"pool":"all"},
	"static":{"name":"Static residue","cost":1,"kind":"status","text":"Clutters your deck.\nPlay to exhaust.","fx":[],"up":0,"exhaust":true,"pool":"none"}
}
const RELICS = {
	"capacitor":{"name":"Capacitor shell","text":"Start every combat with 8 block."},
	"culture":{"name":"Living culture","text":"Poison cards apply 1 extra poison."},
	"battery":{"name":"Auxiliary battery","text":"Start every combat with 2 charge."},
	"lens":{"name":"Prism lens","text":"Start every combat with 1 strength."},
	"moss":{"name":"Medic moss","text":"Heal 4 after every combat."},
	"coin":{"name":"Salvager's seal","text":"Combat rewards grant 12 extra credits."},
	"coil":{"name":"Induction coil","text":"Gain 1 charge each turn."},
	"plating":{"name":"Reactive plating","text":"Gain 3 block each turn."},
	"compass":{"name":"Neural compass","text":"Draw 1 extra card each turn."},
	"heart":{"name":"Synthetic heart","text":"Immediately gain 14 max HP and heal 14."},
	"thorn":{"name":"Thorn mesh","text":"Deal 3 damage back per enemy attack."},
	"cell":{"name":"Unstable cell","text":"+1 energy each turn; lose 2 HP each turn."},
	"vial":{"name":"Stasis vial","text":"Start every combat with 2 more serum charges (max 5)."},
	"anchor":{"name":"Grounding anchor","text":"First turn has 1 extra energy."}
}
const ENEMIES = {
	"drone":{"name":"SENTRY","hp":30,"shape":0,"moves":[["attack",8],["block",8],["attack",12]]},
	"crawler":{"name":"CRAWLER","hp":24,"shape":1,"moves":[["attack",5],["weak",2],["attack",10]]},
	"leech":{"name":"LEECH","hp":34,"shape":2,"moves":[["attack",7],["buff",2],["attack",10]]},
	"turret":{"name":"RAIL TURRET","hp":42,"shape":0,"moves":[["block",12],["attack",18],["attack",9]]},
	"fungus":{"name":"SPORE HOST","hp":38,"shape":1,"moves":[["poison",3],["attack",9],["block",10]]},
	"glitch":{"name":"ECHO","hp":32,"shape":2,"moves":[["jam",1],["attack",12],["weak",2]]},
	"guardian":{"name":"VAULT GUARD","hp":76,"shape":0,"moves":[["attack",13],["block",16],["buff",3],["attack",18]]},
	"hunter":{"name":"RED HUNTER","hp":68,"shape":2,"moves":[["multi",6],["weak",2],["attack",20]]},
	"warden":{"name":"THE GATEKEEPER","hp":155,"shape":0,"moves":[["attack",12],["block",18],["multi",7],["buff",3]]},
	"hive":{"name":"THE HIVE MIND","hp":215,"shape":1,"moves":[["poison",4],["multi",8],["jam",2],["attack",22]]},
	"core":{"name":"THE DEEPWELL","hp":285,"shape":2,"moves":[["attack",18],["jam",2],["multi",9],["buff",4],["attack",28]]}
}
const EVENTS = [
	{"title":"THE GLASS GARDEN","text":"A sealed greenhouse breathes in the dark.\nThe roots hold a living artifact; the fruit might keep you alive.","choices":["Take the artifact / lose 10 HP", "Eat the fruit / heal 16", "Leave the garden"]},
	{"title":"A SIGNAL FROM BELOW","text":"An obsolete terminal offers to rewrite one of your protocols.\nIts price: a permanent fragment of your life support.","choices":["Accept / +1 random relic, -7 max HP", "Optimize / upgrade a random card", "Disconnect"]},
	{"title":"THE ABANDONED CACHE","text":"You find a courier's capsule behind a fractured door.\nThe lock is live, and your scanner cannot identify the contents.","choices":["Force it / gain 65 credits, lose 8 HP", "Recycle it / gain 25 credits", "Leave it untouched"]},
	{"title":"QUIET OBSERVATORY","text":"For a moment, there are stars overhead.\nA broken telescope reminds you why this expedition matters.","choices":["Remember / remove a basic card", "Rest / heal 12", "Prepare / gain 1 serum"]}
]

static func card(id: String, upgraded: bool = false) -> Dictionary:
	var c: Dictionary = CARDS[id].duplicate(true)
	c["id"] = id
	c["upgraded"] = upgraded
	var bonus: int = int(c.up) if upgraded else 0
	for effect in c.fx:
		if effect[0] in ["hit","block","poison","all_hit","all_poison","heal","strength","armor","incubate","overload","harvest","charge_block"]:
			effect[1] += bonus
	var description: String = c.text
	var regex := RegEx.new()
	regex.compile("\\{(\\d+)\\}")
	for matched in regex.search_all(description):
		description = description.replace(matched.get_string(), str(int(matched.get_string(1)) + bonus))
	c.text = description
	if upgraded:
		c.name += " +"
	return c
