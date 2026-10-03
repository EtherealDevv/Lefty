import { useMemo } from "react";

export type Mapping = [string, string];

export type MappingConflict =
  | { kind: "none" }
  | { kind: "self" }
  | { kind: "duplicate"; target: string };

export interface MappingValidation {
  conflict: MappingConflict;
  canSave: boolean;
  /** Mensaje listo para UI (verbatim de spec) o null si todo OK. */
  message: string | null;
}

/**
 * Validación en tiempo real del modal Add mapping contra el perfil activo.
 * - `self`: origen y destino iguales → "Source and target keys cannot be the same."
 * - `duplicate`: el origen ya existe → "Key 'X' is already mapped to 'Y'."
 */
export function useMappingValidation(
  srcKey: string,
  dstKey: string,
  mappings: readonly Mapping[]
): MappingValidation {
  return useMemo<MappingValidation>(() => {
    if (srcKey !== "" && srcKey === dstKey) {
      return {
        conflict: { kind: "self" },
        canSave: false,
        message: "Source and target keys cannot be the same.",
      };
    }
    const hit = mappings.find(([s]) => s === srcKey);
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
