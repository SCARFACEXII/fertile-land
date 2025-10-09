// flags.ts
export type FeatureName = "MEMORY_BETA" | "ENERGY_CHAPTER_BETA"; // 👈 nuevo

export const FEATURE_FLAGS: Partial<Record<FeatureName, boolean>> = {
  MEMORY_BETA: false,
  ENERGY_CHAPTER_BETA: import.meta.env.DEV === true, // solo en dev
};

// helper ya existente:
export function hasFeatureAccess(state: any, feature: FeatureName) {
  return !!FEATURE_FLAGS[feature];
}
