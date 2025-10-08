import React, { useEffect, useRef, useState } from "react";
import { OuterPanel } from "components/ui/Panel";
import { Button } from "components/ui/Button";
import { Label } from "components/ui/Label";

type Result = { score: number; accuracyAvg: number; rounds: number };

export const SolarFarm: React.FC = () => {
  const durationSec = 30;
  const panels = 3;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [sunAngle, setSunAngle] = useState(45);
  const [timeLeft, setTimeLeft] = useState(durationSec);
  const [rounds, setRounds] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [angles, setAngles] = useState<number[]>(
    () => Array.from({ length: panels }, () => Math.random() * 360)
  );
  const [accuracies, setAccuracies] = useState<number[]>([]);

  const W = 720;
  const H = 420;

  const clampAngle = (a: number) => ((a % 360) + 360) % 360;
  const angleDiff = (a: number, b: number) => {
    let d = Math.abs(clampAngle(a) - clampAngle(b));
    return d > 180 ? 360 - d : d;
  };

  // Bloqueo de teclas del mundo mientras se juega
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if (!running) return;
      const k = e.key;
      if (
        k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight" ||
        k === " " || k === "Spacebar" ||
        k === "w" || k === "a" || k === "s" || k === "d" ||
        k === "W" || k === "A" || k === "S" || k === "D"
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", block, true);
    window.addEventListener("keyup", block, true);
    return () => {
      window.removeEventListener("keydown", block, true);
      window.removeEventListener("keyup", block, true);
    };
  }, [running]);

  // Render loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, "#87CEEB");
      grd.addColorStop(1, "#e0f7ff");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#9bd27d";
      ctx.fillRect(0, H - 110, W, 110);

      const sunR = 28, sunX = W - 80, sunY = 80;
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.rotate((sunAngle * Math.PI) / 180);
      ctx.fillStyle = "#FFD54F";
      ctx.beginPath(); ctx.arc(0, 0, sunR, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(sunR + 2, -3, 12, 6); }
      ctx.restore();

      ctx.fillStyle = "#1b1b1b";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(`Score: ${Math.round(score)}`, 20, 30);
      ctx.fillText(`Time: ${Math.max(0, timeLeft).toFixed(1)}s`, 20, 54);
      ctx.fillText(`Sun: ${Math.round(sunAngle)}°`, 20, 78);

      const barW = 220, barH = 10, tRatio = Math.max(0, timeLeft) / durationSec;
      ctx.fillStyle = "#ddd"; ctx.fillRect(20, 90, barW, barH);
      ctx.fillStyle = "#FFB300"; ctx.fillRect(20, 90, barW * tRatio, barH);

      const gap = W / (panels + 1);
      for (let i = 0; i < panels; i++) {
        const px = gap * (i + 1), py = H - 140, ang = angles[i];
        ctx.fillStyle = "#6d8396"; ctx.fillRect(px - 50, py + 32, 100, 14);
        ctx.fillStyle = "#607d8b"; ctx.fillRect(px - 4, py - 20, 8, 70);

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate((ang * Math.PI) / 180);
        ctx.fillStyle = selectedIdx === i ? "#90caf9" : "#64b5f6";
        ctx.strokeStyle = "#0d47a1"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.rect(-60, -20, 120, 40); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = "rgba(13,71,161,0.6)";
        for (let gx = -48; gx <= 48; gx += 24) { ctx.beginPath(); ctx.moveTo(gx, -18); ctx.lineTo(gx, 18); ctx.stroke(); }
        for (let gy = -12; gy <= 12; gy += 12) { ctx.beginPath(); ctx.moveTo(-58, gy); ctx.lineTo(58, gy); ctx.stroke(); }
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(50, 0); ctx.stroke();
        ctx.restore();

        const diff = angleDiff(ang, sunAngle);
        const eff = Math.max(0, 1 - diff / 60);
        const pct = Math.round(eff * 100);
        ctx.fillStyle = "#1b1b1b"; ctx.font = "bold 14px sans-serif";
        ctx.fillText(`${pct}%`, px - 16, py + 62);

        if (eff > 0.65) {
          ctx.strokeStyle = "rgba(255,179,0,0.7)";
          ctx.lineWidth = 3; ctx.beginPath();
          ctx.moveTo(px, py); ctx.lineTo(W / 2, H - 40); ctx.stroke();
        }
      }

      ctx.fillStyle = "#424242"; ctx.fillRect(W / 2 - 50, H - 64, 100, 40);
      ctx.fillStyle = "#76ff03";
      const batteryCharge = Math.min(1, score / 1000);
      ctx.fillRect(W / 2 - 46, H - 60, 92 * batteryCharge, 32);
      ctx.strokeStyle = "#212121"; ctx.lineWidth = 3;
      ctx.strokeRect(W / 2 - 50, H - 64, 100, 40);

      if (!running && timeLeft <= 0) {
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff"; ctx.font = "bold 28px sans-serif";
        ctx.fillText("¡Tiempo!", W / 2 - 60, H / 2 - 10);
        ctx.font = "bold 18px sans-serif";
        ctx.fillText(`Puntaje: ${Math.round(score)}`, W / 2 - 60, H / 2 + 20);
      }
    };

    const loop = (t: number) => {
      const dt = (t - last) / 1000; last = t;
      if (running) {
        setTimeLeft((prev) => Math.max(0, prev - dt));
        const diffs = angles.map((a) => angleDiff(a, sunAngle));
        const effs = diffs.map((d) => Math.max(0, 1 - d / 60));
        const avgEff = effs.reduce((a, b) => a + b, 0) / effs.length;
        const gain = 10 * avgEff * dt * (1 + rounds * 0.1);
        setScore((s) => s + Math.round(gain * 10) / 10);
      }
      draw();
      if (running && timeLeft <= 0) setRunning(false);
      else raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, sunAngle, angles, timeLeft, rounds, score]);

  // Sol y viento
  useEffect(() => {
    if (!running) return;
    const sunInterval = setInterval(() => {
      const next = Math.random() * 360;
      setSunAngle(next);
      setRounds((r) => r + 1);
      setAccuracies((prev) => [
        ...prev,
        ...angles.map((a) => Math.max(0, 100 - angleDiff(a, next) * (100 / 60))),
      ]);
    }, 5000);

    const windInterval = setInterval(() => {
      setAngles((arr) => arr.map((a) => clampAngle(a + (Math.random() - 0.5) * 20)));
    }, 3000);

    return () => { clearInterval(sunInterval); clearInterval(windInterval); };
  }, [running, angles]);

  // Input: mouse/touch + teclado (con preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = W; canvas.height = H;
    const rect = () => canvas.getBoundingClientRect();
    let draggingIdx: number | null = null;

    const getIdx = (x: number, y: number) => {
      const gap = W / (panels + 1), py = H - 140;
      for (let i = 0; i < panels; i++) {
        const px = gap * (i + 1);
        if (Math.abs(x - px) < 70 && Math.abs(y - py) < 40) return i;
      }
      return null;
    };
    const toAngle = (i: number, x: number, y: number) => {
      const gap = W / (panels + 1), px = gap * (i + 1), py = H - 140;
      const rad = Math.atan2(y - py, x - px);
      return clampAngle((rad * 180) / Math.PI);
    };

    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!running) return;
      const p = "touches" in e ? e.touches[0] : (e as MouseEvent);
      const x = (p.clientX - rect().left) * (W / canvas.width);
      const y = (p.clientY - rect().top) * (H / canvas.height);
      const idx = getIdx(x, y);
      draggingIdx = idx; setSelectedIdx(idx);
      if (idx !== null) setAngles(arr => arr.map((a, j) => (j === idx ? toAngle(idx, x, y) : a)));
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (draggingIdx === null) return;
      const p = "touches" in e ? e.touches[0] : (e as MouseEvent);
      const x = (p.clientX - rect().left) * (W / canvas.width);
      const y = (p.clientY - rect().top) * (H / canvas.height);
      setAngles(arr => arr.map((a, j) => (j === draggingIdx ? toAngle(draggingIdx!, x, y) : a)));
    };
    const onUp = () => { draggingIdx = null; setSelectedIdx(null); };

    const onKey = (e: KeyboardEvent) => {
      if (!running) return;
      if (e.key >= "1" && e.key <= String(panels)) {
        e.preventDefault(); e.stopPropagation();
        setSelectedIdx(Number(e.key) - 1);
      }
      if (selectedIdx !== null) {
        if (e.key === "ArrowLeft") {
          e.preventDefault(); e.stopPropagation();
          setAngles(arr => arr.map((a, j) => (j === selectedIdx ? clampAngle(a - 5) : a)));
        }
        if (e.key === "ArrowRight") {
          e.preventDefault(); e.stopPropagation();
          setAngles(arr => arr.map((a, j) => (j === selectedIdx ? clampAngle(a + 5) : a)));
        }
      }
    };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
    window.addEventListener("keydown", onKey, true);

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [running, selectedIdx]);

  const start = () => {
    setScore(0); setTimeLeft(durationSec); setRounds(0); setAccuracies([]); setRunning(true);
  };

  return (
    <OuterPanel className="p-2">
      <div className="flex items-center justify-between mb-2">
        <Label type="default" icon="☀️">Solar Farm</Label>
        {!running && (
          <Button onClick={start} className="ml-2">
            {timeLeft <= 0 ? "Reiniciar" : "Empezar"}
          </Button>
        )}
      </div>

      <div className="mb-2 text-sm space-y-1">
        <div><b>Cómo se juega</b></div>
        <div>• Alinea cada panel con el ángulo del Sol para generar energía.</div>
        <div>• <b>Selecciona panel</b> con teclas <b>1</b>, <b>2</b>, <b>3</b> o haciendo clic.</div>
        <div>• El Sol cambia cada <b>5s</b> y el viento desajusta los paneles cada <b>3s</b>.</div>
      </div>

      <div className="rounded-2xl overflow-hidden border border-gray-200">
        <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block" }} />
      </div>
    </OuterPanel>
  );
};
