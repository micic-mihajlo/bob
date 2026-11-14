export const direct = window.bob; // flag
export const indexed = window["bob"]; // flag
export const optionalIndexed = window?.["bob"]; // flag
export const globalDirect = globalThis.bob; // flag
export const globalOptional = globalThis?.bob; // flag
export const globalOptionalIndexed = globalThis?.["bob"]; // flag
