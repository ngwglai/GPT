#!/usr/bin/env python3
"""青雀麻将混合透视实验：全桌60°，南家手牌区域30°，其余区域60°。"""
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib import font_manager

OUTPUT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
ANGLE_GLOBAL = 60.0
ANGLE_SOUTH_HAND = 30.0
DISTANCE, FOCAL = 100.0, 25.0
TABLE_HALF = 12.5
W, H, D = 1.0, 1.36, 0.45
RIVER_ROWS, RIVER_COLS = 3, 7
RIVER_X0, RIVER_Y0, RIVER_XP, RIVER_YP = -2.5, -3.7, 1.02, 1.38
WALL_Y, WALL_OFFSET, WALL_PITCH = -9.2, 0.70, 1.02
HAND_Y, HAND_PITCH = -11.7, 1.02
MELD_XS = [7.5, 8.52, 9.54]
LABELS = ["一萬", "二筒", "三索", "東", "白", "六萬", "九筒"]

def project(points, angle):
    p = np.asarray(points, float); x,y,z = p.T
    a = np.deg2rad(angle); q = DISTANCE + y*np.cos(a) - z*np.sin(a)
    if np.any(q <= 1e-8): raise ValueError("投影分母接近零")
    return np.column_stack((FOCAL*x/q, FOCAL*(y*np.sin(a)+z*np.cos(a))/q))

def rotate(p, seat):
    x,y,z = p
    return np.asarray([(x,y,z),(-y,x,z),(-x,-y,z),(y,-x,z)][seat], float)

# One camera for the entire south hand, anchored at the common floor center.
pivot=np.array([[0,HAND_Y,0.]])
OFFSET=project(pivot,ANGLE_GLOBAL)[0]-project(pivot,ANGLE_SOUTH_HAND)[0]
def camera(angle):
    a=np.deg2rad(angle)
    return np.array([0,-DISTANCE*np.cos(a),DISTANCE*np.sin(a)])
CAM=camera(ANGLE_GLOBAL)

def tile_faces(cx,cy,seat,standing=False,back=False,z0=0,label="",south_hand=False):
    hx,hy,height=(W/2,D/2,H) if standing else (W/2,H/2,D)
    center=np.array([cx,cy,z0])
    v=np.array([rotate((sx*hx,sy*hy,zz*height),seat)+center
                for zz in (0,1) for sy in (-1,1) for sx in (-1,1)])
    faces=[([0,1,3,2],(0,0,-1)),([4,6,7,5],(0,0,1)),
           ([0,4,5,1],(0,-1,0)),([2,3,7,6],(0,1,0)),
           ([0,2,6,4],(-1,0,0)),([1,5,7,3],(1,0,0))]
    angle=ANGLE_SOUTH_HAND if south_hand else ANGLE_GLOBAL
    cam=camera(angle)
    offset=OFFSET if south_hand else np.zeros(2)
    out=[]
    for ids,n in faces:
        p3=v[ids]; fc=p3.mean(axis=0)
        nw=rotate(n,seat)
        if np.dot(nw,cam-fc)<=0: continue
        front=(n==(0,-1,0)) if standing else (n==(0,0,1))
        rear=back and ((n==(0,1,0)) if standing else (n==(0,0,1)))
        color="#72b8a0" if rear else "#fff8e5" if front else "#c5d2c7"
        p2=project(p3,angle)+offset; lp=project(fc.reshape(1,3),angle)[0]+offset
        out.append((( -1 if south_hand else np.linalg.norm(CAM-fc)),p2,color,label if front and not back else "",lp))
    return out

def draw(ax,mixed):
    ax.set_aspect("equal"); ax.axis("off")
    table=np.array([[-TABLE_HALF,-TABLE_HALF,0],[TABLE_HALF,-TABLE_HALF,0],
                    [TABLE_HALF,TABLE_HALF,0],[-TABLE_HALF,TABLE_HALF,0]])
    ax.add_patch(Polygon(project(table,ANGLE_GLOBAL),closed=True,
                         facecolor="#407f70",edgecolor="#254c42",lw=1.5))
    center=np.array([[-3,-3,.01],[3,-3,.01],[3,3,.01],[-3,3,.01]])
    ax.add_patch(Polygon(project(center,ANGLE_GLOBAL),closed=True,
                         facecolor="#294d49",edgecolor="#e3c78c",lw=1.2))
    cp=project([[0,0,.02]],ANGLE_GLOBAL)[0]
    ax.text(*cp,"東一局\n骰子 3・5\n余牌 83",ha="center",va="center",color="white",fontsize=7)
    faces=[]
    for seat in range(4):
        for i in range(RIVER_ROWS*RIVER_COLS):
            c,r=i%RIVER_COLS,i//RIVER_COLS
            x,y,_=rotate((RIVER_X0+c*RIVER_XP,RIVER_Y0-r*RIVER_YP,0),seat)
            faces+=tile_faces(x,y,seat,label=LABELS[c])
        for i in range(17):
            x,y,_=rotate(((i-8)*WALL_PITCH+WALL_OFFSET,WALL_Y,0),seat)
            for z in (0,D): faces+=tile_faces(x,y,seat,back=True,z0=z)
        for i in range(13):
            x,y,_=rotate(((i-6)*HAND_PITCH,HAND_Y,0),seat)
            faces+=tile_faces(x,y,seat,standing=True,back=seat!=0,
                              label=LABELS[i%len(LABELS)],
                              south_hand=mixed and seat==0)
        for i,lx in enumerate(MELD_XS):
            x,y,_=rotate((lx,HAND_Y,0),seat)
            faces+=tile_faces(x,y,seat,label=["碰","二筒","三索"][i])
    for depth,p,c,label,lp in sorted(faces,key=lambda x:-x[0]):
        ax.add_patch(Polygon(p,closed=True,facecolor=c,edgecolor="#53685e",lw=.32,zorder=2))
        if label: ax.text(*lp,label,ha="center",va="center",fontsize=5,color="#263c35",clip_on=True,zorder=3)
    xy=np.vstack([project(table,ANGLE_GLOBAL)]+[f[1] for f in faces])
    lo=xy.min(axis=0); hi=xy.max(axis=0)
    assert np.isfinite(xy).all() and np.abs(xy).max()<4
    ax.set_xlim(-3.65,3.65); ax.set_ylim(-3.25,3.15)
    ax.set_title("全桌60° + 南家手牌区域30°" if mixed else "全桌统一60°",fontsize=12)

if __name__=="__main__":
    candidates=["Microsoft YaHei","SimHei","Noto Sans CJK SC","Noto Sans CJK JP","PingFang SC","WenQuanYi Zen Hei"]
    installed={f.name for f in font_manager.fontManager.ttflist}
    font=next((n for n in candidates if n in installed),None)
    if font: plt.rcParams["font.family"]=font
    plt.rcParams["axes.unicode_minus"]=False
    fig,axs=plt.subplots(1,2,figsize=(16,9),facecolor="#f4f5f0")
    draw(axs[0],False); draw(axs[1],True)
    fig.suptitle("青雀麻将：全桌60°，南家手牌30°，副露60°",fontsize=18)
    fig.tight_layout()
    out=OUTPUT_DIR/"mahjong_mixed_verified.png"
    fig.savefig(out,dpi=180)
    print(out)
    plt.close(fig)
