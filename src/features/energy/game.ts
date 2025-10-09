// Tipos/conjuntos de prueba para el capítulo de Energía (solo cliente).
export type EnergyTier = "basic" | "advanced" | "expert";

export const ENERGY_LEVELS: Record<
  EnergyTier,
  { minKwh: number; label: string }
> = {
  basic: { minKwh: 10, label: "Basic" },
  advanced: { minKwh: 50, label: "Advanced" },
  expert: { minKwh: 150, label: "Expert" },
};
