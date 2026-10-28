extends Control
var variant_id := 0
var tint := Color("ff906d")
var hero := false
var t := 0.0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _process(delta: float) -> void:
	t += delta
	queue_redraw()

func _draw() -> void:
	var center := size*Vector2(0.5,0.5)+Vector2(0,sin(t*1.8)*4)
	var dark := Color("102d38")
	draw_arc(center+Vector2(0,65),59,0,TAU,64,Color(tint,0.12),2,true)
	if hero:
		draw_colored_polygon(PackedVector2Array([center+Vector2(-23,-20),center+Vector2(23,-20),center+Vector2(37,40),center+Vector2(-37,40)]),dark)
		draw_line(center+Vector2(-18,38),center+Vector2(-26,65),tint,8,true)
		draw_line(center+Vector2(18,38),center+Vector2(26,65),tint,8,true)
		draw_line(center+Vector2(-24,-8),center+Vector2(-42,28),tint,7,true)
		draw_line(center+Vector2(24,-8),center+Vector2(45,15),tint,7,true)
		draw_rect(Rect2(center+Vector2(-23,-56),Vector2(46,36)),dark)
		draw_rect(Rect2(center+Vector2(-23,-56),Vector2(46,36)),tint,false,2)
		draw_line(center+Vector2(-15,-40),center+Vector2(15,-40),tint,5,true)
		draw_circle(center,9,tint)
		draw_line(center+Vector2(45,15),center+Vector2(65,6),tint,5,true)
	elif variant_id == 0:
		var points := PackedVector2Array()
		for i in range(6):
			points.append(center+Vector2.from_angle(TAU*i/6.0+PI/6.0)*47)
		draw_colored_polygon(points,dark)
		points.append(points[0])
		draw_polyline(points,tint,3,true)
		draw_circle(center,23,Color(tint,0.18))
		draw_circle(center,11,tint)
		for side in [-1,1]:
			draw_line(center+Vector2(side*45,0),center+Vector2(side*64,24),tint,5,true)
			draw_line(center+Vector2(side*64,24),center+Vector2(side*70,44),tint,3,true)
	elif variant_id == 1:
		for i in range(6):
			var angle := TAU*i/6.0+t*0.12
			var endpoint := center+Vector2.from_angle(angle)*58
			draw_line(center,endpoint,tint,2,true)
			draw_circle(endpoint,9,dark)
			draw_arc(endpoint,9,0,TAU,24,tint,2,true)
		draw_circle(center,35,dark)
		draw_arc(center,35,0,TAU,48,tint,3,true)
		for offset in [Vector2(-12,-7),Vector2(12,-7),Vector2(0,12)]:
			draw_circle(center+offset,5,tint)
	else:
		for i in range(3):
			var radius := 23.0+i*17
			draw_arc(center,radius,t*(0.5+i*0.2)+i,t*(0.5+i*0.2)+i+4.5,48,tint,2,true)
		draw_colored_polygon(PackedVector2Array([center+Vector2(0,-29),center+Vector2(21,0),center+Vector2(0,29),center+Vector2(-21,0)]),Color(tint,0.5))
		draw_circle(center,7,Color.WHITE)
