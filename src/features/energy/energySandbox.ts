// Minimal helpers para energía local: sumar producción o consumo temporal.

export type EnergyDelta = {
  production?: number; // +kWh/h
  consumption?: number; // +kWh/h
};

export function withTemporaryDelta(
  apply: (d: EnergyDelta) => void,
  clear: (d: EnergyDelta) => void,
  delta: EnergyDelta,
  ms: number,
) {
  apply(delta);
  const id = setTimeout(() => clear(delta), ms);
  return () => clearTimeout(id);
}
