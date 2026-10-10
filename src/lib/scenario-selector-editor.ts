export type SelectorEditorType = "text" | "role" | "css" | "label" | "placeholder";

export interface SelectorEditorState {
  type: SelectorEditorType;
  value: string;
}

const SELECTOR_TYPES = new Set<SelectorEditorType>([
  "text",
  "role",
  "css",
  "label",
  "placeholder",
]);

function isSelectorType(value: string): value is SelectorEditorType {
  return SELECTOR_TYPES.has(value as SelectorEditorType);
}

/**
 * Removes a UI list marker only when it looks like a two-digit scenario step
 * marker immediately followed by a target word. A value already parsed by this
 * helper is therefore safe to parse repeatedly without accumulating changes.
 */
function removeAccidentalStepMarker(value: string): string {
  return value.replace(/^(?:0[1-9]|1[0-9]|20)(?=[A-Z][a-z])/u, "");
}

export function parseSelectorEditor(value: string): SelectorEditorState {
  const separator = value.indexOf("=");
  if (separator > 0) {
    const rawType = value.slice(0, separator).toLowerCase();
    if (isSelectorType(rawType)) {
      return {
        type: rawType,
        value: removeAccidentalStepMarker(value.slice(separator + 1)),
      };
    }
  }
  return { type: "css", value };
}

export function serializeSelectorEditor(state: SelectorEditorState): string {
  return `${state.type}=${state.value}`;
}
