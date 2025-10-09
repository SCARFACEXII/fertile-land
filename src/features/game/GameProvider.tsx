/**
 * GameProvider extendido con:
 *  - Bloqueo global de inputs del mundo (para minijuegos)
 *  - Sandbox de energía local (producción, consumo, capacidad y tick)
 *
 * No rompe APIs existentes. Todo lo que ya usas sigue igual.
 */

import { useState, useCallback, useEffect } from "react";
import { useActor, useInterpret } from "@xstate/react";
import React, { useContext } from "react";

import * as Auth from "features/auth/lib/Provider";
import {
  cacheShortcuts,
  getShortcuts,
} from "features/farming/hud/lib/shortcuts";
import { startGame, MachineInterpreter } from "./lib/gameMachine";
import { InventoryItemName } from "./types/game";
import {
  cacheShowAnimationsSetting,
  getShowAnimationsSetting,
} from "features/farming/hud/lib/animations";
import {
  cacheEnableQuickSelectSetting,
  getEnableQuickSelectSetting,
} from "features/farming/hud/lib/quickSelect";
import {
  cacheShowTimersSetting,
  getShowTimersSetting,
} from "features/farming/hud/lib/timers";

/** ---------------- Energy sandbox (local) ---------------- */
type EnergyState = {
  capacity: number; // kWh máx almacenables
  stored: number; // kWh actuales
  production: number; // kWh/h simulados
  consumption: number; // kWh/h simulados
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** ---------------- Contexto ampliado ---------------- */
interface GameContext {
  // === lo que ya existía ===
  shortcutItem: (item: InventoryItemName) => void;
  selectedItem?: InventoryItemName;
  gameService: MachineInterpreter;
  showAnimations: boolean;
  toggleAnimations: () => void;
  enableQuickSelect: boolean;
  toggleQuickSelect: () => void;
  showTimers: boolean;
  toggleTimers: () => void;
  fromRoute?: string;
  setFromRoute: (route: string) => void;

  // === NUEVO: bloqueo de input del mundo ===
  lockWorldInput: (who: string) => void;
  unlockWorldInput: (who: string) => void;
  isWorldInputLocked: boolean;

  // === NUEVO: energía local para pruebas ===
  energy: EnergyState;
  setEnergy: React.Dispatch<React.SetStateAction<EnergyState>>;
}

export const Context = React.createContext<GameContext>({} as GameContext);

export const GameProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { authService } = useContext(Auth.Context);
  const [authState] = useActor(authService);

  const [gameMachine] = useState(startGame(authState.context) as any);
  // TODO - Typescript error
  const gameService = useInterpret(gameMachine) as MachineInterpreter;

  /** ---------------- Route guard existente ---------------- */
  useEffect(() => {
    const handleRouteChange = () => {
      if (
        !window.location.href.includes("visit") &&
        gameService.state.matches("visiting")
      ) {
        gameService.send("END_VISIT");
      }
    };

    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("pushstate", handleRouteChange);
    window.addEventListener("replacestate", handleRouteChange);

    handleRouteChange();

    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener("pushstate", handleRouteChange);
      window.removeEventListener("replacestate", handleRouteChange);
    };
  }, [gameService?.state?.value]);

  /** ---------------- Shortcuts & settings (existente) ---------------- */
  const [shortcuts, setShortcuts] =
    useState<InventoryItemName[]>(getShortcuts());
  const [showAnimations, setShowAnimations] = useState<boolean>(
    getShowAnimationsSetting(),
  );
  const [enableQuickSelect, setEnableQuickSelect] = useState<boolean>(
    getEnableQuickSelectSetting(),
  );
  const [showTimers, setShowTimers] = useState<boolean>(getShowTimersSetting());
  const [fromRoute, setFromRoute] = useState<string | undefined>();

  const shortcutItem = useCallback((item: InventoryItemName) => {
    const originalShortcuts = getShortcuts();
    const originalSelectedItem =
      originalShortcuts.length > 0 ? originalShortcuts[0] : undefined;

    if (originalSelectedItem === item) return;

    const items = cacheShortcuts(item);
    setShortcuts(items);
  }, []);

  const toggleAnimations = () => {
    const newValue = !showAnimations;
    setShowAnimations(newValue);
    cacheShowAnimationsSetting(newValue);
  };

  const toggleQuickSelect = () => {
    const newValue = !enableQuickSelect;
    setEnableQuickSelect(newValue);
    cacheEnableQuickSelectSetting(newValue);
  };

  const toggleTimers = () => {
    const newValue = !showTimers;
    setShowTimers(newValue);
    cacheShowTimersSetting(newValue);
  };

  const selectedItem = shortcuts.length > 0 ? shortcuts[0] : undefined;

  /** ---------------- NUEVO: bloqueo de input del mundo ----------------
   * Para evitar que las flechas/WASD muevan al bumpkin mientras se juega un minijuego.
   * Usa: lockWorldInput("powerflow") al montar y unlockWorldInput("powerflow") al desmontar.
   */
  const [locks, setLocks] = useState<Set<string>>(new Set());
  const isWorldInputLocked = locks.size > 0;

  const lockWorldInput = (who: string) =>
    setLocks((s) => (s.has(who) ? s : new Set([...s, who])));

  const unlockWorldInput = (who: string) =>
    setLocks((s) => {
      if (!s.has(who)) return s;
      const next = new Set(s);
      next.delete(who);
      return next;
    });

  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if (!isWorldInputLocked) return;
      const k = e.key;
      if (
        k === "ArrowUp" ||
        k === "ArrowDown" ||
        k === "ArrowLeft" ||
        k === "ArrowRight" ||
        k === " " ||
        k === "Spacebar" ||
        k.toLowerCase() === "w" ||
        k.toLowerCase() === "a" ||
        k.toLowerCase() === "s" ||
        k.toLowerCase() === "d"
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
  }, [isWorldInputLocked]);

  /** ---------------- NUEVO: sandbox de energía local ----------------
   * Simulación simple en cliente para probar Solar Farm, Power Flow, etc.
   * - Tick cada 1s: stored += (production - consumption) / 3600
   * - Clampea entre 0 y capacity
   */
  const [energy, setEnergy] = useState<EnergyState>({
    capacity: 120, // kWh
    stored: 20,
    production: 8, // kWh/h
    consumption: 6, // kWh/h
  });

  useEffect(() => {
    const id = setInterval(() => {
      setEnergy((e) => {
        const deltaPerSec = (e.production - e.consumption) / 3600;
        const next = clamp(e.stored + deltaPerSec, 0, e.capacity);
        if (Math.abs(next - e.stored) < 1e-6) return e;
        return { ...e, stored: next };
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  /** ---------------- Provider ---------------- */
  return (
    <Context.Provider
      value={{
        // existentes
        shortcutItem,
        selectedItem,
        gameService,
        showAnimations,
        toggleAnimations,
        enableQuickSelect,
        toggleQuickSelect,
        showTimers,
        toggleTimers,
        fromRoute,
        setFromRoute,
        // nuevos
        lockWorldInput,
        unlockWorldInput,
        isWorldInputLocked,
        energy,
        setEnergy,
      }}
    >
      {children}
    </Context.Provider>
  );
};

export const useGame = () => {
  const context = React.useContext(Context);
  const [gameState] = useActor(context.gameService);

  if (!context) {
    throw new Error("useAuth must be used within an GameProvider");
  }

  return {
    gameState,
    gameService: context.gameService,
    // atajos útiles nuevos
    lockWorldInput: context.lockWorldInput,
    unlockWorldInput: context.unlockWorldInput,
    isWorldInputLocked: context.isWorldInputLocked,
    energy: context.energy,
    setEnergy: context.setEnergy,
  };
};
