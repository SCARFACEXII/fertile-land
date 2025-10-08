import React, { useEffect, useMemo, useRef, useState } from "react";
import { OuterPanel } from "components/ui/Panel";
import { Button } from "components/ui/Button";
import { Label } from "components/ui/Label";
import { SUNNYSIDE } from "assets/sunnyside";

type CellType = "I" | "L" | "T" | "X" | "empty";
type Dir = 0 | 1 | 2 | 3; // 0=up,1=right,2=down,3=left
type Cell = { type: CellType; rot: Dir; fixed?: boolean };

const DIRS: [number, number][] = [
  [-1, 0], [0, 1], [1, 0], [0, -1],
];

const openDirs = (c: Cell): boolean[] => {
  switch (c.type) {
    case "I": return c.rot % 2 === 0 ? [true,false,true,false] : [false,true,false,true];
    case "L": {
      const base = [true,true,false,false]; // up+right
      const r = c.rot;
      return [base[(0-r+4)%4], base[(1-r+4)%4], base[(2-r+4)%4], base[(3-r+4)%4]];
    }
    case "T": {
      const base = [true,true,false,true]; // up+right+left
      const r = c.rot;
      return [base[(0-r+4)%4], base[(1-r+4)%4], base[(2-r+4)%4], base[(3-r+4)%4]];
    }
    case "X": return [true,true,true,true];
    default:  return [false,false,false,false];
  }
};

type Edge = "left" | "right" | "top" | "bottom";
const oppositeEdge: Record<Edge, Edge> = { left:"right", right:"left", top:"bottom", bottom:"top" };
const randEdgePair = (): [Edge, Edge] => {
  const edges: Edge[] = ["left","right","top","bottom"];
  const s = edges[Math.floor(Math.random()*edges.length)];
  return [s, oppositeEdge[s]];
};
const clamp = (n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

function makeBoard(rows:number, cols:number, startEdge:Edge, endEdge:Edge) {
  const g: Cell[][] = Array.from({length:rows},()=>Array.from({length:cols},()=>({type:"empty",rot:0 as Dir})));

  const sr = startEdge==="top"?0 : startEdge==="bottom"?rows-1 : Math.floor(rows/2);
  const sc = startEdge==="left"?0 : startEdge==="right"?cols-1 : Math.floor(cols/2);
  const er = endEdge==="top"?0 : endEdge==="bottom"?rows-1 : Math.floor(rows/2);
  const ec = endEdge==="left"?0 : endEdge==="right"?cols-1 : Math.floor(cols/2);

  const inletRot:Record<Edge,Dir> = { top:2, right:3, bottom:0, left:1 };
  g[sr][sc] = { type:"T", rot: inletRot[startEdge], fixed:true };
  g[er][ec] = { type:"T", rot: inletRot[endEdge],  fixed:true };

  // camino serpenteante aproximado
  let r = sr, c = sc;
  const steps = rows*cols;
  for (let k=0;k<steps;k++){
    const dr = clamp(er-r,-1,1), dc = clamp(ec-c,-1,1);
    if (Math.random()<0.6) r = clamp(r+dr,0,rows-1); else c = clamp(c+dc,0,cols-1);
    if (!(r===er && c===ec)) g[r][c] = { type:"I", rot:1 };
  }

  const pool:CellType[] = ["I","L","T","I","L","T","X","I","L","empty"];
  for (let i=0;i<rows;i++){
    for (let j=0;j<cols;j++){
      if (g[i][j].type==="empty"){
        const type = pool[Math.floor(Math.random()*pool.length)];
        g[i][j] = { type, rot:(Math.floor(Math.random()*4) as Dir) };
      }
    }
  }
  return { grid:g, start:[sr,sc] as [number,number], end:[er,ec] as [number,number] };
}

export const EnergyCircuit: React.FC<{ onClose: () => void }> = () => {
  const rows = 6, cols = 9;

  // Panel responsivo
  const holderRef = useRef<HTMLDivElement|null>(null);
  const [cellSize, setCellSize] = useState(56);
  useEffect(()=>{
    const measure = () => {
      const w = holderRef.current?.clientWidth ?? 560;
      setCellSize(clamp(Math.floor((w-16)/cols), 36, 72));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (holderRef.current) ro.observe(holderRef.current);
    window.addEventListener("resize", measure);
    return ()=>{ ro.disconnect(); window.removeEventListener("resize", measure); };
  },[cols]);

  const [mode, setMode] = useState<"intro" | "play" | "win" | "lose">("intro");
  const [timeLeft, setTimeLeft] = useState(45);
  const [moves, setMoves] = useState(0);

  // Estados SEPARADOS (esto arregla los clicks)
  const [grid, setGrid] = useState<Cell[][]>(() => {
    const p = randEdgePair(); return makeBoard(rows, cols, p[0], p[1]).grid;
  });
  const [start, setStart] = useState<[number,number]>(() => {
    const p = randEdgePair(); return makeBoard(rows, cols, p[0], p[1]).start;
  });
  const [end, setEnd] = useState<[number,number]>(() => {
    const p = randEdgePair(); return makeBoard(rows, cols, p[0], p[1]).end;
  });

  // Bloqueo de teclas del mundo mientras se juega
  useEffect(()=>{
    const block=(e:KeyboardEvent)=>{
      if (mode!=="play") return;
      const k=e.key;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Spacebar","w","a","s","d","W","A","S","D"].includes(k)){
        e.preventDefault(); e.stopPropagation();
      }
    };
    window.addEventListener("keydown",block,true);
    window.addEventListener("keyup",block,true);
    return ()=>{ window.removeEventListener("keydown",block,true); window.removeEventListener("keyup",block,true); };
  },[mode]);

  // Temporizador
  useEffect(()=>{
    if (mode!=="play") return;
    setTimeLeft(45);
    const id=setInterval(()=>setTimeLeft(t=>Math.max(0,t-1)),1000);
    return ()=>clearInterval(id);
  },[mode]);

  // Conectividad (BFS)
  const connected = useMemo(()=>{
    const q:[number,number][]= [[start[0],start[1]]];
    const seen=new Set<string>([`${start[0]},${start[1]}`]);
    const ok=(r:number,c:number)=>r>=0&&r<rows&&c>=0&&c<cols;
    while(q.length){
      const [r,c]=q.shift()!;
      const cell=grid[r][c];
      const od=openDirs(cell);
      for (let d=0 as Dir; d<4; d=((d+1) as Dir)){
        if(!od[d]) continue;
        const [dr,dc]=DIRS[d]; const nr=r+dr, nc=c+dc;
        if(!ok(nr,nc)) continue;
        const nopen=openDirs(grid[nr][nc]);
        const opp=((d+2)%4) as Dir;
        if(nopen[opp]){
          const key=`${nr},${nc}`;
          if(!seen.has(key)){ seen.add(key); q.push([nr,nc]); }
        }
      }
    }
    return seen;
  },[grid,start,rows,cols]);

  // Win/Lose
  useEffect(()=>{
    if (mode!=="play") return;
    if (connected.has(`${end[0]},${end[1]}`)) setMode("win");
    else if (timeLeft===0) setMode("lose");
  },[mode,connected,timeLeft,end]);

  // Render
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  useEffect(()=>{
    const cv=canvasRef.current; if(!cv) return;
    const ratio = typeof window!=="undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
    const px = cellSize*cols, py = cellSize*rows;
    cv.width = Math.floor(px*ratio); cv.height = Math.floor(py*ratio);
    cv.style.width=`${px}px`; cv.style.height=`${py}px`;
    const ctx=cv.getContext("2d"); if(!ctx) return;
    ctx.setTransform(ratio,0,0,ratio,0,0);

    ctx.fillStyle="#e9f6ff"; ctx.fillRect(0,0,px,py);

    const drawPort=(x:number,y:number,dir:Dir,lit:boolean)=>{
      const s=cellSize;
      ctx.save(); ctx.translate(x+s/2,y+s/2); ctx.rotate((Math.PI/2)*dir);
      ctx.fillStyle = lit ? "#ffca28" : "#90caf9";
      ctx.strokeStyle= lit ? "#ef6c00" : "#1976d2";
      ctx.lineWidth=2;
      ctx.fillRect(s*0.15,-6,s*0.2,12);
      ctx.strokeRect(s*0.15,-6,s*0.2,12);
      ctx.beginPath(); ctx.moveTo(s*0.35+2,0); ctx.lineTo(s*0.35+10,-6); ctx.lineTo(s*0.35+10,6); ctx.closePath(); ctx.fill();
      ctx.restore();
    };

    const drawWire=(x:number,y:number,lit:boolean,rot:Dir,type:CellType)=>{
      const s=cellSize; ctx.save(); ctx.translate(x+s/2,y+s/2); ctx.rotate((Math.PI/2)*rot);
      if(lit){ ctx.shadowColor="rgba(255,193,7,0.65)"; ctx.shadowBlur=12; }
      const fill = lit ? "#ffb300" : "#64b5f6";
      const stroke = lit ? "#ef6c00" : "#0d47a1";
      ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=2;
      const bar=(w:number,h:number)=>{ ctx.fillRect(-w/2,-h/2,w,h); ctx.strokeRect(-w/2,-h/2,w,h); };
      switch(type){
        case "I": bar(s*0.72,10); break;
        case "L": bar(s*0.72,10); ctx.rotate(Math.PI/2); bar(s*0.72,10); break;
        case "T": bar(s*0.72,10); ctx.rotate(Math.PI/2); bar(s*0.72,10); ctx.rotate(Math.PI/2); bar(s*0.72,10); break;
        case "X": bar(s*0.72,10); ctx.rotate(Math.PI/2); bar(s*0.72,10); break;
      }
      ctx.restore(); ctx.shadowBlur=0;
    };

    for(let i=0;i<rows;i++){
      for(let j=0;j<cols;j++){
        const x=j*cellSize, y=i*cellSize;
        const cell=grid[i][j]; const lit=connected.has(`${i},${j}`);
        ctx.fillStyle=lit?"#fff8e1":"#f4fbff";
        ctx.fillRect(x+2,y+2,cellSize-4,cellSize-4);

        openDirs(cell).forEach((isOpen,d)=>{ if(isOpen) drawPort(x,y,d as Dir,lit); });
        if(cell.type!=="empty") drawWire(x,y,lit,cell.rot,cell.type);

        if(i===start[0] && j===start[1]){
          ctx.fillStyle="#ffca28"; ctx.beginPath(); ctx.arc(x+cellSize/2,y+cellSize/2,12,0,Math.PI*2); ctx.fill();
        }
        if(i===end[0] && j===end[1]){
          ctx.fillStyle="#66bb6a"; ctx.fillRect(x+cellSize/2-12,y+cellSize/2-12,24,24);
        }
      }
    }
  },[grid,connected,cellSize,rows,cols,start,end]);

  // Click = rotar
  const onClickCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode!=="play") return;
    const target=e.target as HTMLCanvasElement;
    const rect=target.getBoundingClientRect();
    const cx=e.clientX-rect.left, cy=e.clientY-rect.top;
    const j=Math.floor(cx/cellSize), i=Math.floor(cy/cellSize);
    if(i<0||i>=rows||j<0||j>=cols) return;
    const cell=grid[i][j]; if(cell.fixed||cell.type==="empty") return;

    const next:Cell={...cell, rot:(((cell.rot+1)%4) as Dir)};
    const g2=grid.map((row,ri)=>row.map((c,ci)=>(ri===i&&ci===j?next:c)));
    setGrid(g2);
    setMoves(m=>m+1);
  };

  // Start/Restart
  const startGame = () => {
    const p = randEdgePair();
    const b = makeBoard(rows, cols, p[0], p[1]);
    setGrid(b.grid); setStart(b.start); setEnd(b.end);
    setMoves(0); setTimeLeft(45); setMode("play");
  };
  const restart = () => startGame();

  if (mode==="intro"){
    return (
      <OuterPanel className="p-2">
        <div className="flex items-center justify-between mb-2">
          <Label type="default" icon={SUNNYSIDE.icons.player}>Energy Circuit</Label>
        </div>
        <div className="mb-3 text-sm space-y-1">
          <div><b>Cómo se juega</b></div>
          <div>• Conecta el <b>Sol</b> con la <b>Batería</b> girando las piezas.</div>
          <div>• Las <b>bocas</b> (pestañas con flechas) deben mirarse entre celdas vecinas.</div>
          <div>• Las piezas conectadas al Sol se <b>iluminan amarillas</b>.</div>
          <div>• Tiempo: <b>45s</b>. Click para girar 90°.</div>
        </div>
        <Button onClick={startGame}>Empezar</Button>
      </OuterPanel>
    );
  }

  if (mode==="win" || mode==="lose"){
    const won = mode==="win";
    return (
      <OuterPanel className="p-2">
        <div className="mb-2 flex items-center justify-between">
          <Label type="default" icon={SUNNYSIDE.icons.player}>Energy Circuit</Label>
          <div className="text-sm">Tiempo: {timeLeft}s · Movs: {moves}</div>
        </div>
        <div className="text-sm mb-2">{won ? "¡Genial! La energía llegó a la batería." : "¡Tiempo! El circuito falló."}</div>
        <div className="text-sm mb-4">Movs: {moves} · Tiempo: {45 - timeLeft}s</div>
        <Button onClick={restart}>Jugar de nuevo</Button>
      </OuterPanel>
    );
  }

  return (
    <OuterPanel className="p-2">
      <div className="mb-2 flex items-center justify-between">
        <Label type="default" icon={SUNNYSIDE.icons.player}>Energy Circuit</Label>
        <div className="text-sm">Tiempo: {timeLeft}s · Movs: {moves}</div>
      </div>
      <div className="mb-2 text-xs opacity-80">
        🖱️ Click para girar. Sigue las <b>bocas con flechas</b>; lo conectado al Sol brilla <b>amarillo</b>.
      </div>
      <div ref={holderRef} className="rounded-2xl overflow-hidden border border-gray-200 w-full">
        <canvas ref={canvasRef} onClick={onClickCanvas} style={{ width:"100%", height:"auto", display:"block", cursor:"pointer" }} />
      </div>
      <div className="mt-2">
        <Button onClick={restart}>Restart</Button>
      </div>
    </OuterPanel>
  );
};
