extends RefCounted
# English source strings are stable lookup keys. Rules and serialized IDs stay unchanged.
const Content = preload("res://src/content.gd")
static var catalog: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://i18n/zh_CN.json"))
static var ordered_keys: Array = []

static func t(source: String) -> String:
	if catalog.has(source):
		return str(catalog[source])
	if ordered_keys.is_empty():
		ordered_keys = catalog.keys()
		ordered_keys.sort_custom(func(a,b): return a.length() > b.length())
	var result := source
	for key in ordered_keys:
		if not "%" in key and not "{" in key and key.strip_edges() != "":
			result = result.replace(key,str(catalog[key]))
	return result

static func kind(id: String) -> String:
	return str(catalog["kind."+id])

static func overlay(id: String) -> String:
	return str(catalog["overlay."+id])

static func card(id: String, upgraded: bool = false) -> Dictionary:
	var c: Dictionary = Content.card(id,upgraded)
	c.name = t(Content.CARDS[id].name) + (" ＋" if upgraded else "")
	var description := t(Content.CARDS[id].text)
	var bonus := int(c.up) if upgraded else 0
	var regex := RegEx.new()
	regex.compile("\\{(\\d+)\\}")
	for matched in regex.search_all(description):
		description = description.replace(matched.get_string(),str(int(matched.get_string(1))+bonus))
	c.text = description
	return c

static func message(source: String) -> String:
	if source.begins_with("Entered "):
		return t("message.entered") % t("node."+source.trim_prefix("Entered ").trim_suffix("."))
	if source.begins_with("Played "):
		return t("message.played") % t(source.trim_prefix("Played ").trim_suffix("."))
	if source.begins_with("Turn "):
		return t("message.turn") % source.split(" ")[1].trim_suffix(".")
	if source.begins_with("Sector clear. Salvaged "):
		return t("message.clear") % source.split(" ")[3]
	return t(source)
