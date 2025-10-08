import React, { useEffect, useRef, useState } from "react";
import { OuterPanel } from "components/ui/Panel";
import { Button } from "components/ui/Button";
import { Label } from "components/ui/Label";
import { SUNNYSIDE } from "assets/sunnyside";

/** ---------------- Misiones / Dificultad ---------------- */
type Mission = {
  name: string;
  marks: number;
  rows: number;
  cols: number;
  time: number;
  target: number;
  rockDensity: number;
  decoyDensity: number;
  zigzag: number;
  detour: number;
};

const MISSIONS: Mission[] = [
  { name: "Level 1",  marks: 20, rows: 12, cols: 12, time: 35, target: 3, rockDensity: 0.06, decoyDensity: 0.12, zigzag: 0.20, detour: 0.10 },
  { name: "Level 2",  marks: 20, rows: 12, cols: 13, time: 40, target: 4, rockDensity: 0.08, decoyDensity: 0.14, zigzag: 0.25, detour: 0.12 },
  { name: "Level 3",  marks: 25, rows: 13, cols: 13, time: 45, target: 4, rockDensity: 0.10, decoyDensity: 0.16, zigzag: 0.30, detour: 0.14 },
  { name: "Level 4",  marks: 30, rows: 13, cols: 14, time: 50, target: 5, rockDensity: 0.22, decoyDensity: 0.18, zigzag: 0.35, detour: 0.16 },
  { name: "Level 5",  marks: 35, rows: 14, cols: 14, time: 55, target: 5, rockDensity: 0.22, decoyDensity: 0.20, zigzag: 0.40, detour: 0.18 },
  { name: "Level 6",  marks: 40, rows: 14, cols: 14, time: 60, target: 5, rockDensity: 0.22, decoyDensity: 0.22, zigzag: 0.45, detour: 0.22 },
  { name: "Level 7",  marks: 45, rows: 15, cols: 14, time: 65, target: 5, rockDensity: 0.24, decoyDensity: 0.24, zigzag: 0.50, detour: 0.25 },
  { name: "Level 8",  marks: 50, rows: 15, cols: 14, time: 70, target: 5, rockDensity: 0.20, decoyDensity: 0.26, zigzag: 0.55, detour: 0.28 },
  { name: "Level 9",  marks: 55, rows: 16, cols: 14, time: 75, target: 5, rockDensity: 0.22, decoyDensity: 0.28, zigzag: 0.60, detour: 0.30 },
  { name: "Level 10", marks: 60, rows: 16, cols: 14, time: 80, target: 5, rockDensity: 0.24, decoyDensity: 0.30, zigzag: 0.65, detour: 0.35 },
];

/** ---------------- Utils ---------------- */
type Dir = 0 | 1 | 2 | 3; // up,right,down,left
const DIRS: [number, number][] = [[-1,0],[0,1],[1,0],[0,-1]];
const clamp = (n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const rnd = (n:number)=>Math.floor(Math.random()*n);

type Surf = 0 | 1 | 2;       // 0=air, 1=soil, 2=rock
type WireType = "I"|"L"|"T"|"X"|".";

type Cell = {
  surf: Surf;
  revealed: boolean;
  rock: boolean;
  wire: WireType;
  rot: Dir;
};

function openDirs(w: WireType, rot: Dir): boolean[] {
  switch (w) {
    case "I": return rot % 2 === 0 ? [true,false,true,false] : [false,true,false,true];
    case "L": { const b=[true,true,false,false]; return [b[(0-rot+4)%4],b[(1-rot+4)%4],b[(2-rot+4)%4],b[(3-rot+4)%4]]; }
    case "T": { const b=[true,true,false,true];  return [b[(0-rot+4)%4],b[(1-rot+4)%4],b[(2-rot+4)%4],b[(3-rot+4)%4]]; }
    case "X": return [true,true,true,true];
    default:  return [false,false,false,false];
  }
}

/** rotación explícita para L según el set {in,out} */
function lRotFor(a: Dir, b: Dir): Dir {
  const has = (x:Dir)=>x===a||x===b;
  if (has(0) && has(1)) return 0; // up + right
  if (has(1) && has(2)) return 1; // right + down
  if (has(2) && has(3)) return 2; // down + left
  if (has(3) && has(0)) return 3; // left + up
  return 0;
}

/** pieza para conectar prev→cur→next */
function pieceFor(prev:[number,number], cur:[number,number], next?:[number,number]): {wire:WireType, rot:Dir}{
  const [pr,pc]=prev,[cr,cc]=cur;
  const dr=cr-pr, dc=cc-pc;
  const dirIn: Dir = dr===-1?0 : dr===1?2 : dc===1?1 : 3;

  if (!next) return dirIn%2===0 ? { wire:"I", rot:0 } : { wire:"I", rot:1 };

  const [nr,nc]=next; const dr2=nr-cr, dc2=nc-cc;
  const dirOut: Dir = dr2===-1?0 : dr2===1?2 : dc2===1?1 : 3;

  if ((dirIn%2)===(dirOut%2))
    return dirIn%2===0 ? { wire:"I", rot:0 } : { wire:"I", rot:1 };

  return { wire:"L", rot: lRotFor(dirIn, dirOut) };
}

/** ---------------- Componente ---------------- */
export const PowerFlowCables: React.FC<{ onClose: () => void }> = () => {
  const [missionIdx, setMissionIdx] = useState(0);
  const M = MISSIONS[missionIdx];

  const ROWS = M.rows, COLS = M.cols;

  const holderRef = useRef<HTMLDivElement|null>(null);
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const cellSizeRef = useRef(40);

  const [mode, setMode] = useState<"intro"|"play"|"win"|"lose">("intro");
  const [timeLeft, setTimeLeft] = useState(M.time);
  const [delivered, setDelivered] = useState(0);

  const gridRef = useRef<Cell[][]>([]);
  const sourceRef = useRef<{r:number,c:number}>({ r: Math.floor(ROWS/2), c: 0 });
  const batteryRef = useRef<{r:number,c:number}>({ r: Math.floor(ROWS/2), c: Math.max(0, COLS-3) });

  const truePathRef = useRef<[number,number][]>([]);
  const trueSetRef = useRef<Set<string>>(new Set());
  const pathAnimRef = useRef<{ cells:[number,number][], t:number } | null>(null);

  const runningRef = useRef(false);
  const scoreRef = useRef(0);
  const unionFlashesRef = useRef<{ r:number; c:number; dir:Dir; t:number }[]>([]);

  /** ---------- Responsive ---------- */
  useEffect(()=>{
    const measure=()=>{ const w=holderRef.current?.clientWidth ?? 560; cellSizeRef.current = clamp(Math.floor((w-16)/COLS), 26, 56); };
    measure();
    const ro=new ResizeObserver(measure);
    if(holderRef.current) ro.observe(holderRef.current);
    window.addEventListener("resize",measure);
    return ()=>{ ro.disconnect(); window.removeEventListener("resize",measure); };
  },[COLS, missionIdx]);

  /** ---------- Bloquear teclas del mundo ---------- */
  useEffect(()=>{
    const block=(e:KeyboardEvent)=>{ if(mode!=="play") return;
      if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Spacebar","w","a","s","d","W","A","S","D"].includes(e.key)){
        e.preventDefault(); e.stopPropagation();
      }
    };
    window.addEventListener("keydown",block,true);
    window.addEventListener("keyup",block,true);
    return ()=>{ window.removeEventListener("keydown",block,true); window.removeEventListener("keyup",block,true); };
  },[mode]);

  /** ---------- Generar tablero con ruta zigzag/detours ---------- */
  function buildBoard() {
    const g: Cell[][] = Array.from({length:ROWS},()=>Array.from({length:COLS},()=>({
      surf: 1 as Surf, revealed:false, rock:false, wire:"." as WireType, rot:0 as Dir
    })));

    const S = sourceRef.current = { r: Math.floor(ROWS/2), c: 0 };
    batteryRef.current = { r: Math.floor(ROWS/2), c: Math.max(0, COLS-3) }; // visible
    const B = batteryRef.current;

    // visibles
    g[S.r][S.c].surf=0; g[S.r][S.c].revealed=true;
    g[B.r][B.c].surf=0; g[B.r][B.c].revealed=true; g[B.r][B.c].rock=false;

    // rocas
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
      const nearStart = r===S.r && c<=2;
      const nearBattery = Math.abs(c-B.c)<=1 && Math.abs(r-B.r)<=1;
      if (!nearStart && !nearBattery && Math.random() < M.rockDensity) {
        g[r][c].rock=true; g[r][c].surf=2;
      }
    }

    // ----- Ruta con “zigzag” y “detour” -----
    const path: [number,number][]= [[S.r,S.c]];
    let r=S.r, c=S.c;
    let columnsSinceTurn = 0;
    while (c < B.c - 1) {
      if (Math.random() < M.detour && r > 1 && r < ROWS-2) {
        const steps = 1 + rnd(2 + Math.floor(M.detour * 3));
        const dir = Math.random() < 0.5 ? -1 : 1;
        for (let s=0;s<steps;s++){
          const nr = clamp(r + dir, 1, ROWS-2);
          if (g[nr][c].rock) { g[nr][c].rock=false; g[nr][c].surf=1; }
          r = nr; path.push([r,c]);
        }
        columnsSinceTurn = 0;
      }

      c += 1;
      if (g[r][c].rock) { g[r][c].rock=false; g[r][c].surf=1; }
      path.push([r,c]);
      columnsSinceTurn++;

      if (columnsSinceTurn >= 2 && Math.random() < M.zigzag) {
        const dir = r < B.r ? 1 : r > B.r ? -1 : (Math.random()<0.5 ? 1 : -1);
        const nr = clamp(r + dir, 1, ROWS-2);
        if (g[nr][c].rock) { g[nr][c].rock=false; g[nr][c].surf=1; }
        r = nr; path.push([r,c]);
        columnsSinceTurn = 0;
      }
    }

    while (r !== B.r) {
      const dir = r < B.r ? 1 : -1;
      const nr = clamp(r + dir, 1, ROWS-2);
      if (g[nr][c].rock) { g[nr][c].rock=false; g[nr][c].surf=1; }
      r = nr; path.push([r,c]);
    }

    if (c !== B.c - 1) { c = B.c - 1; path.push([r,c]); }

    truePathRef.current = [[S.r,S.c], ...path.slice(1), [B.r,B.c]];
    trueSetRef.current = new Set(truePathRef.current.map(([rr,cc])=>`${rr},${cc}`));

    // piezas en camino (para hit-tests/vecindad; los señuelos seguirán azules)
    for (let i=1;i<truePathRef.current.length-1;i++){
      const prev=truePathRef.current[i-1], cur=truePathRef.current[i], next=truePathRef.current[i+1];
      const { wire, rot } = pieceFor(prev, cur, next);
      g[cur[0]][cur[1]].wire = wire;
      g[cur[0]][cur[1]].rot  = rot;
      g[cur[0]][cur[1]].rock = false;
      if (g[cur[0]][cur[1]].surf===2) g[cur[0]][cur[1]].surf=1;
    }
    g[S.r][S.c].wire="T"; g[S.r][S.c].rot=1; // derecha
    g[B.r][B.c].wire="T"; g[B.r][B.c].rot=3; // izquierda

    // primer paso revelado
    if (truePathRef.current.length>=2){
      const first = truePathRef.current[1];
      g[first[0]][first[1]].surf=0; g[first[0]][first[1]].revealed=true;
    }

    // señuelos
    for (let k=0;k<Math.floor(ROWS*COLS*M.decoyDensity);k++){
      const rr=rnd(ROWS), cc=rnd(COLS);
      if (g[rr][cc].rock) continue;
      if (trueSetRef.current.has(`${rr},${cc}`)) continue;
      if ((rr===B.r && cc===B.c) || (rr===S.r && cc===S.c)) continue;

      const type = (["I","L","T"] as WireType[])[rnd(3)];
      let rot: Dir = rnd(4) as Dir;
      if (rr===B.r && cc < B.c) {
        const opensRight = (w:WireType, rrot:Dir)=>openDirs(w,rrot)[1];
        let tries=0;
        while (opensRight(type, rot) && tries++<4) rot = ((rot+1)%4) as Dir;
        if (opensRight(type, rot)) continue;
      }
      if (g[rr][cc].wire==="."){ g[rr][cc].wire=type; g[rr][cc].rot=rot; }
    }

    unionFlashesRef.current = [];
    gridRef.current = g;
  }

  function startGame(){
    buildBoard();
    scoreRef.current = 0;
    setDelivered(0);
    setTimeLeft(M.time);
    setMode("play");
    runningRef.current = true;
    pathAnimRef.current = null;
  }

  /** ---------- Timer ---------- */
  useEffect(()=>{
    if(mode!=="play") return;
    const id=setInterval(()=>setTimeLeft(t=>{
      if (t<=1){ runningRef.current=false; setMode("lose"); return 0; }
      return t-1;
    }),1000);
    return ()=>clearInterval(id);
  },[mode]);

  /** ---------- Input ---------- */
  useEffect(()=>{
    const cv=canvasRef.current; if(!cv) return;

    const toCell=(clientX:number, clientY:number)=>{
      const rect=cv.getBoundingClientRect(); const s=cellSizeRef.current;
      return { r: clamp(Math.floor((clientY-rect.top)/s),0,ROWS-1),
               c: clamp(Math.floor((clientX-rect.left)/s),0,COLS-1) };
    };

    const onClick=(e:MouseEvent|TouchEvent)=>{
      if (mode!=="play") return;
      const p="touches" in e ? e.touches[0] : (e as MouseEvent);
      const {r,c}=toCell(p.clientX,p.clientY);
      const g=gridRef.current, cell=g[r][c];
      if (cell.rock || cell.revealed) return;

      cell.surf=0; cell.revealed=true;

      // unión visual si conecta con vecino ya revelado
      const od=openDirs(cell.wire, cell.rot);
      ([0,1,2,3] as Dir[]).forEach((d)=>{
        if (!od[d]) return;
        const nr=r+DIRS[d][0], nc=c+DIRS[d][1];
        if (nr<0||nr>=ROWS||nc<0||nc>=COLS) return;
        const ncell=g[nr][nc];
        if (!ncell.revealed) return;
        const nod=openDirs(ncell.wire, ncell.rot);
        const opp=((d+2)%4) as Dir;
        if (nod[opp]) unionFlashesRef.current.push({ r, c, dir:d, t:0.4 });
      });

      const complete = truePathRef.current.every(([rr,cc])=>g[rr][cc].revealed);
      if (complete && !pathAnimRef.current) pathAnimRef.current = { cells:[...truePathRef.current], t:0 };
    };

    cv.addEventListener("mousedown", onClick);
    cv.addEventListener("touchstart", onClick, { passive:true });
    return ()=>{ cv.removeEventListener("mousedown", onClick); cv.removeEventListener("touchstart", onClick); };
  },[mode, missionIdx]);

  /** ---------- Loop & render ---------- */
  useEffect(()=>{
    if(mode!=="play") return;
    const cv=canvasRef.current!; const ctx=cv.getContext("2d")!;
    let raf=0, last=performance.now();

    const step=(now:number)=>{
      // batería fija visible
      batteryRef.current.c = Math.max(0, Math.min(batteryRef.current.c, COLS-3));

      // resize
      const ratio=window.devicePixelRatio||1;
      const s=cellSizeRef.current, W=s*COLS, H=s*ROWS;
      if (cv.width!==Math.floor(W*ratio) || cv.height!==Math.floor(H*ratio)) {
        cv.width=Math.floor(W*ratio); cv.height=Math.floor(H*ratio);
        cv.style.width=`${W}px`; cv.style.height=`${H}px`;
      }
      ctx.setTransform(ratio,0,0,ratio,0,0);

      const dt=Math.min(0.05,(now-last)/1000); last=now;

      if (runningRef.current && pathAnimRef.current) {
        pathAnimRef.current.t += dt*4;
        if (pathAnimRef.current.t >= pathAnimRef.current.cells.length-1) {
          scoreRef.current += 1; setDelivered(scoreRef.current); pathAnimRef.current=null;
          if (scoreRef.current >= MISSIONS[missionIdx].target) { runningRef.current=false; setMode("win"); }
          else { buildBoard(); }
        }
      }

      unionFlashesRef.current = unionFlashesRef.current.map(f=>({ ...f, t:f.t-dt })).filter(f=>f.t>0);

      const g=gridRef.current;
      ctx.fillStyle="#eef8ff"; ctx.fillRect(0,0,W,H);

      for (let r=0;r<ROWS;r++){
        for (let c=0;c<COLS;c++){
          const x=c*s, y=r*s, cell=g[r][c];
          if (cell.rock){ ctx.fillStyle="#6D6D6D"; ctx.fillRect(x,y,s,s); ctx.strokeStyle="rgba(0,0,0,0.25)"; ctx.strokeRect(x+0.5,y+0.5,s-1,s-1); continue; }
          if (cell.surf===1){ ctx.fillStyle="#C89B69"; ctx.fillRect(x,y,s,s); ctx.fillStyle="rgba(0,0,0,0.08)"; ctx.fillRect(x,y+s-4,s,4); }
          else {
            ctx.fillStyle="#f7fbff"; ctx.fillRect(x,y,s,s);

            const isTrue = trueSetRef.current.has(`${r},${c}`);
            if (cell.wire!==".") {
              const cx=x+s/2, cy=y+s/2;

              if (isTrue) {
                // *** DIBUJO DEL CAMINO VERDADERO POR VECINDAD ***
                const connected: boolean[] = [false,false,false,false];
                ([0,1,2,3] as Dir[]).forEach((d)=>{
                  const nr=r+DIRS[d][0], nc=c+DIRS[d][1];
                  if (nr<0||nr>=ROWS||nc<0||nc>=COLS) return;
                  if (trueSetRef.current.has(`${nr},${nc}`)) connected[d]=true;
                });

                ctx.strokeStyle = "#2e7d32";
                ctx.lineWidth=6; ctx.lineCap="round";
                ctx.beginPath();
                ([0,1,2,3] as Dir[]).forEach((d)=>{
                  if(!connected[d]) return;
                  const dx=DIRS[d][1], dy=DIRS[d][0];
                  ctx.moveTo(cx,cy); ctx.lineTo(cx+dx*(s/2-6), cy+dy*(s/2-6));
                });
                ctx.stroke();

                ctx.fillStyle = "#66bb6a";
                ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2); ctx.fill();
              } else {
                // señuelos: usan wire+rot (pueden ser I/L/T/X)
                const od=openDirs(cell.wire, cell.rot);
                ctx.strokeStyle = "#0d47a1";
                ctx.lineWidth=6; ctx.lineCap="round";
                ctx.beginPath();
                od.forEach((open,d)=>{ if(!open) return; const dx=DIRS[d][1], dy=DIRS[d][0]; ctx.moveTo(cx,cy); ctx.lineTo(cx+dx*(s/2-6), cy+dy*(s/2-6)); });
                ctx.stroke();
                ctx.fillStyle = "#1976d2"; ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2); ctx.fill();
              }
            }
          }
        }
      }

      // sol
      const S=sourceRef.current;
      ctx.fillStyle="#ffca28"; ctx.beginPath(); ctx.arc((S.c+0.5)*s,(S.r+0.5)*s, s*0.3, 0, Math.PI*2); ctx.fill();

      // batería (columna visible)
      const B=batteryRef.current;
      ctx.fillStyle="#66bb6a"; ctx.fillRect(B.c*s, B.r*s, s, s);
      ctx.strokeStyle="#2e7d32"; ctx.lineWidth=2; ctx.strokeRect(B.c*s+1, B.r*s+1, s-2, s-2);
      ctx.fillStyle="#1b5e20"; ctx.font=`${Math.floor(s*0.6)}px sans-serif`; ctx.fillText("🔋", B.c*s + s*0.2, B.r*s + s*0.8);

      // chispa
      if (pathAnimRef.current){
        const pa=pathAnimRef.current; const idx=Math.floor(pa.t); const frac=pa.t-idx;
        const from=pa.cells[idx], to=pa.cells[Math.min(idx+1, pa.cells.length-1)];
        const x2=(from[1]+(to[1]-from[1])*frac+0.5)*s, y2=(from[0]+(to[0]-from[0])*frac+0.5)*s;
        ctx.shadowColor="rgba(255,193,7,0.75)"; ctx.shadowBlur=14; ctx.fillStyle="#ffb300";
        ctx.beginPath(); ctx.arc(x2,y2, s*0.18, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
      }

      // flashes unión
      unionFlashesRef.current.forEach(({ r, c, dir, t })=>{
        const alpha=Math.max(0, Math.min(1, t/0.4));
        const x=(c+0.5)*s, y=(r+0.5)*s, dx=DIRS[dir][1], dy=DIRS[dir][0];
        const ex=x+dx*(s/2-6), ey=y+dy*(s/2-6);
        ctx.strokeStyle=`rgba(255,193,7,${0.25+0.55*alpha})`; ctx.lineWidth=8; ctx.lineCap="round";
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(ex,ey); ctx.stroke();
      });

      raf=requestAnimationFrame(step);
    };
    raf=requestAnimationFrame(step);
    return ()=>cancelAnimationFrame(raf);
  },[mode, missionIdx, COLS, ROWS]);

  /** ---------------- UI ---------------- */
  if (mode === "intro") {
    const M0 = MISSIONS[missionIdx];
    return (
      <OuterPanel className="p-2">
        <div className="flex items-center justify-between mb-2">
          <Label type="default" icon={SUNNYSIDE.icons.player}>Power Flow — Cables</Label>
        </div>

        <div className="mb-2 text-sm">Choose difficulty:</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {MISSIONS.map((m, i) => (
            <Button key={m.name} onClick={() => setMissionIdx(i)} className={i===missionIdx ? "opacity-100" : "opacity-70"}>
              {m.name}
            </Button>
          ))}
        </div>

        <div className="mb-3 text-xs opacity-80">
          <div><b>Time:</b> {M0.time}s · <b>Deliveries:</b> {M0.target} · <b>Reward:</b> {M0.marks} marks</div>
          <div>More level = more rocks, more lures and more winding routes.</div>
        </div>

        <div className="mb-3 text-sm space-y-1">
          <div><b>Target:</b> open <b>a</b> Click on a cell and discover the <b>true path</b> from the Sun to the battery (🔋).</div>
          <div>The rock (gray) can't be dug. When you reveal the entire path, the spark will travel along it, and you'll earn 1 contribution.</div>
        </div>

        <Button onClick={startGame}>Start</Button>
      </OuterPanel>
    );
  }

  if (mode === "win" || mode === "lose") {
    const won = mode === "win";
    const M0 = MISSIONS[missionIdx];
    return (
      <OuterPanel className="p-2">
        <div className="mb-2 flex items-center justify-between">
          <Label type="default" icon={SUNNYSIDE.icons.player}>Power Flow — Cables</Label>
          <div className="text-sm">Level: {M0.name}</div>
        </div>
        <div className="text-sm mb-2">
          {won ? "¡Circuitos completos! La batería se cargó." : "¡Tiempo agotado! Faltó energía."}
        </div>
        <div className="text-sm mb-4">
          Deliveries: {delivered}/{M0.target} · Reward: {won ? M0.marks : 0} marks
        </div>
        <div className="flex gap-2">
          <Button onClick={()=>setMode("intro")}>Change level</Button>
          <Button onClick={()=>{ setTimeLeft(M0.time); setMode("play"); startGame(); }}>Play Again</Button>
        </div>
      </OuterPanel>
    );
  }

  const M0 = MISSIONS[missionIdx];
  return (
    <OuterPanel className="p-2">
      <div className="mb-2 flex items-center justify-between">
        <Label type="default" icon={SUNNYSIDE.icons.player}>Power Flow — Cables</Label>
        <div className="text-sm">
          Level: {M0.name} · Time: {timeLeft}s · Deliveries: {delivered}/{M0.target}
        </div>
      </div>
      <div className="mb-2 text-xs opacity-80">
        🖱️ Open <b>one</b> cell per click. Find the <b>true path</b> to the <b>battery</b> (🔋) on the right.
      </div>
      <div ref={holderRef} className="rounded-2xl overflow-hidden border border-gray-200 w-full">
        <canvas ref={canvasRef} />
      </div>
    </OuterPanel>
  );
};
