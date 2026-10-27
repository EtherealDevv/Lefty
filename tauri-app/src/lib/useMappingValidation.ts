import { useMemo } from "react";
import { splitComboTarget } from "./comboTarget";
import { keyIdentity } from "./keyIdentity";
import type { Mapping } from "./profilesIO";

export type MappingConflict =
  | { kind: "none" }
  | { kind: "self" }
  | { kind: "duplicate"; target: string }
  | { kind: "combo" };

export interface MappingValidation {
  conflict: MappingConflict;
  canSave: boolean;
  /** Mensaje listo para UI (verbatim de spec) o null si todo OK. */
  message: string | null;
}

/**
 * Validación en tiempo real del modal Add mapping contra el perfil activo.
 * `dstKey` puede ser combo (`CTRL+S`).
 * - `self`: el origen está entre los destinos → "Source and target keys cannot be the same."
 * - `duplicate`: el origen ya existe → "Key 'X' is already mapped to 'Y'."
 * - `combo`: combo con Disabled/mouse o main vacío → mensaje específico.
 */
export function useMappingValidation(
  srcKey: string,
  dstKey: string,
  mappings: readonly Mapping[]
): MappingValidation {
  return useMemo<MappingValidation>(() => {
    const parts = splitComboTarget(dstKey);
    const srcId = keyIdentity(srcKey);
    const partIds = parts.map(keyIdentity);
    if (partIds.some((p) => p === "mouse_x1" || p === "mouse_x2")) {
      return {
        conflict: { kind: "combo" },
        canSave: false,
        message: "Mouse buttons can only start a mapping.",
      };
    }
    if (srcId !== "" && partIds.includes(srcId)) {
      return {
        conflict: { kind: "self" },
        canSave: false,
        message: "Source and target keys cannot be the same.",
      };
    }
    if (parts.length > 1) {
      if (partIds.includes("disabled")) {
        return {
          conflict: { kind: "combo" },
          canSave: false,
          message: "Combos can't include Disabled.",
        };
      }
      const main = parts[parts.length - 1];
      if (!main.trim()) {
        return {
          conflict: { kind: "combo" },
          canSave: false,
          message: "That main key can't combine — pick another one.",
        };
      }
    }
    const hit = mappings.find(([s]) => keyIdentity(s) === srcId);
    if (hit) {
      return {
        conflict: { kind: "duplicate", target: hit[1] },
        canSave: false,
        message: `Key '${srcKey}' is already mapped to '${hit[1]}'.`,
      };
    }
    return { conflict: { kind: "none" }, canSave: true, message: null };
  }, [srcKey, dstKey, mappings]);
}
