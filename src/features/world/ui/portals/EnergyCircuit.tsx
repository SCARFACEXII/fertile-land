import React, { useEffect, useMemo, useRef, useState } from "react";
import { OuterPanel } from "components/ui/Panel";
import { Button } from "components/ui/Button";
import { Label } from "components/ui/Label";
import { useAppTranslation } from "lib/i18n/useAppTranslations";

/**
 * Energy Circuit – puzzle de rotar piezas.
 * Conecta el SOL (izquierda) con la BATERÍA (derecha) antes de que termine el tiempo.
 * Controles: clic izquierdo para rotar 90°.
 */

type CellType = "I" | "L" | "T" | "X" | "empty";
type Dir = 0 | 1 | 2 | 3; // 0=up,1=right,2=down,3=left

type Cell = {
  type: CellType;
  rot: Dir;        // 0..3
  fixed?: boolean; // no rota (p.ej. Sol/Batería/cables fijos)
};

const DIRS: [number, number][] = [
  [-1, 0], // up
  [0, 1],  // right
  [1, 0],  // down
  [0, -1], // left
];

const openDirs = (c: Cell): boolean[] => {
  // devuelve [up,right,down,left] true si hay conexión
  switch (c.type) {
    case "I": {
      // vertical (up,down) cuando rot=0/2, horizontal (right,left) cuando rot=1/3
      if (c.rot % 2 === 0) return [true, false, true, false];
      return [false, true, false, true];
    }
    case "L": {
      // abre en dos direcciones contiguas: up+right con rot=0; luego rota
      const base = [true, true, false, false];
      const r = c.rot;
      return [base[(0 - r + 4) % 4], base[(1 - r + 4) % 4], base[(2 - r + 4) % 4], base[(3 - r + 4) % 4]];
    }
    case "T": {
      // tres direcciones: up,right,left con rot=0; rota resto
      const base = [true, true, false, true];
      const r = c.rot;
      return [base[(0 - r + 4) % 4], base[(1 - r + 4) % 4], base[(2 - r + 4) % 4], base[(3 - r + 4) % 4]];
    }
    case "X":
      return [true, true, true, true];
    default:
      return [false, false, false, false];
  }
};

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const EnergyCircuit: React.FC<{ onClose: () => void }> = () => {
  const { t } = useAppTranslation();

  const [mode, setMode] = useState<"intro" | "play" | "win" | "lose">("intro");
  const [timeLeft, setTimeLeft] = useState(45);
  const [moves, setMoves] = useState(0);

  const rows = 6;
  const cols = 9;
  const cellSize = 56; // se escala dentro del panel con CSS

  // tablero inicial
  const [grid, setGrid] = useState<Cell[][]>(() => {
    // plantilla con camino garantizado y piezas aleatorias alrededor
    const g: Cell[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ type: "empty", rot: 0 as Dir }))
    );

    // coloca sol y batería
    g[Math.floor(rows / 2)][0] = { type: "T", rot: 1, fixed: true };        // Sol (representado como T fija)
    g[Math.floor(rows / 2)][cols - 1] = { type: "T", rot: 3, fixed: true }; // Batería

    // traza un sendero serpenteante fijo aproximado
    let r = Math.floor(rows / 2);
    for (let c = 1; c < cols - 1; c++) {
      const up = r > 1 && Math.random() < 0.35;
      const down = r < rows - 2 && Math.random() < 0.35;
      if (up) r--;
      else if (down) r++;
      g[r][c] = { type: "I", rot: 1 as Dir }; // horizontal
    }

    // agrega piezas aleatorias alrededor
    const pool: CellType[] = ["I", "L", "T", "I", "L", "T", "X", "I", "L", "empty"];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (g[i][j].type === "empty") {
          const type = pool[Math.floor(Math.random() * pool.length)];
          g[i][j] = { type, rot: (Math.floor(Math.random() * 4) as Dir) };
        }
      }
    }

    // desordenar rotaciones del camino horizontal
    for (let c = 1; c < cols - 1; c++) {
      if (g[r][c].type === "I") g[r][c].rot = (Math.random() < 0.5 ? 0 : 1) as Dir;
    }

    return g;
  });

  // timer
  useEffect(() => {
    if (mode !== "play") return;
    setTimeLeft(45);
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [mode]);

  // comprobar conexión
  const connectedMask = useMemo(() => {
    // BFS desde el sol
    const startR = Math.floor(rows / 2);
    const startC = 0;
    const q: [number, number][] = [[startR, startC]];
    const seen = new Set<string>([`${startR},${startC}`]);

    const ok = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;

    while (q.length) {
      const [r, c] = q.shift()!;
      const cell = grid[r][c];
      const open = openDirs(cell);
      for (let d = 0 as Dir; d < 4; d = ((d + 1) as Dir)) {
        if (!open[d]) continue;
        const [dr, dc] = DIRS[d];
        const nr = r + dr, nc = c + dc;
        if (!ok(nr, nc)) continue;
        const ncell = grid[nr][nc];
        const nopen = openDirs(ncell);
        const opposite = ((d + 2) % 4) as Dir;
        if (nopen[opposite]) {
          const key = `${nr},${nc}`;
          if (!seen.has(key)) {
            seen.add(key);
            q.push([nr, nc]);
          }
        }
      }
    }

    return seen; // celdas alcanzadas
  }, [grid]);

  // gana/pierde
  useEffect(() => {
    if (mode !== "play") return;
    const goalR = Math.floor(rows / 2);
    const goalC = cols - 1;
    if (connectedMask.has(`${goalR},${goalC}`)) {
      setMode("win");
    } else if (timeLeft === 0) {
      setMode("lose");
    }
  }, [mode, connectedMask, timeLeft]);

  // pintar sobre <canvas>
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = canvasRef.current!;
    const px = cellSize * cols;
    const py = cellSize * rows;
    cv.width = px * devicePixelRatio;
    cv.height = py * devicePixelRatio;
    cv.style.width = `${px}px`;
    cv.style.height = `${py}px`;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    // fondo
    ctx.fillStyle = "#e9f6ff";
    ctx.fillRect(0, 0, px, py);

    // grid
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const x = j * cellSize;
        const y = i * cellSize;
        const cell = grid[i][j];

        // tile
        ctx.fillStyle = connectedMask.has(`${i},${j}`) ? "#fff8e1" : "#f4fbff";
        ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);

        // piezas
        ctx.save();
        ctx.translate(x + cellSize / 2, y + cellSize / 2);
        ctx.rotate((Math.PI / 2) * cell.rot);

        const wire = (w: number, h: number) => {
          ctx.fillStyle = connectedMask.has(`${i},${j}`) ? "#ffb300" : "#90caf9";
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.strokeStyle = connectedMask.has(`${i},${j}`) ? "#ef6c00" : "#1976d2";
          ctx.lineWidth = 2;
          ctx.strokeRect(-w / 2, -h / 2, w, h);
        };

        switch (cell.type) {
          case "I":
            wire(cellSize * 0.7, 10);
            break;
          case "L":
            wire(cellSize * 0.7, 10);
            ctx.rotate(Math.PI / 2);
            wire(cellSize * 0.7, 10);
            break;
          case "T":
            wire(cellSize * 0.7, 10);
            ctx.rotate(Math.PI / 2); wire(cellSize * 0.7, 10);
            ctx.rotate(Math.PI / 2); wire(cellSize * 0.7, 10);
            break;
          case "X":
            wire(cellSize * 0.7, 10);
            ctx.rotate(Math.PI / 2); wire(cellSize * 0.7, 10);
            break;
        }
        ctx.restore();

        // marcas especiales
        if (i === Math.floor(rows / 2) && j === 0) {
          ctx.fillStyle = "#ffca28";
          ctx.beginPath(); ctx.arc(x + 16, y + cellSize / 2, 12, 0, Math.PI * 2); ctx.fill();
        }
        if (i === Math.floor(rows / 2) && j === cols - 1) {
          ctx.fillStyle = "#66bb6a";
          ctx.fillRect(x + cellSize - 28, y + cellSize / 2 - 12, 24, 24);
        }
      }
    }
  }, [grid, connectedMask, cellSize, rows, cols]);

  // click para rotar
  const onClickCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== "play") return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const j = Math.floor(cx / cellSize);
    const i = Math.floor(cy / cellSize);
    if (i < 0 || i >= rows || j < 0 || j >= cols) return;

    const cell = grid[i][j];
    if (cell.fixed || cell.type === "empty") return;

    const next: Cell = { ...cell, rot: (((cell.rot + 1) % 4) as Dir) };
    const g2 = grid.map((row, ri) => row.map((c, ci) => (ri === i && ci === j ? next : c)));
    setGrid(g2);
    setMoves((m) => m + 1);
  };

  const startGame = () => {
    setMode("play");
    setMoves(0);
    setTimeLeft(45);
  };

  if (mode === "intro") {
    return (
      <OuterPanel className="p-2">
        <div className="flex items-center justify-between mb-2">
          <Label type="default" icon="⚡">{t("portal.energycircuit.title")}</Label>
        </div>
        <div className="mb-3 text-sm">{t("portal.energycircuit.description")}</div>
        <Button onClick={startGame}>{t("energycircuit.start")}</Button>
      </OuterPanel>
    );
  }

  if (mode === "win" || mode === "lose") {
    const won = mode === "win";
    return (
      <OuterPanel className="p-2">
        <div className="mb-2 flex items-center justify-between">
          <Label type="default" icon="⚡">{t("portal.energycircuit.title")}</Label>
        </div>
        <div className="text-sm mb-2">
          {won ? t("energycircuit.win") : t("energycircuit.lose")}
        </div>
        <div className="text-sm mb-4">
          {t("energycircuit.stats", { moves, time: 45 - timeLeft })}
        </div>
        <Button onClick={startGame}>{t("energycircuit.playAgain")}</Button>
      </OuterPanel>
    );
  }

  return (
    <OuterPanel className="p-2">
      <div className="mb-2 flex items-center justify-between">
        <Label type="default" icon="⚡">{t("portal.energycircuit.title")}</Label>
        <div className="text-sm">
          {t("energycircuit.time")}: {timeLeft}s · {t("energycircuit.moves")}: {moves}
        </div>
      </div>
      <div className="rounded-2xl overflow-hidden border border-gray-200 w-full" style={{ overflow: "auto" }}>
        <canvas ref={canvasRef} onClick={onClickCanvas} />
      </div>
    </OuterPanel>
  );
};
