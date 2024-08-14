export const clipboard = globalThis
    ?.require
    ?.("electron")
    ?.clipboard;

export default clipboard;

export const availableFormats = clipboard?.availableFormats?.bind?.(clipboard);
export const clear = clipboard?.clear?.bind?.(clipboard);
export const has = clipboard?.has?.bind?.(clipboard);
export const read = clipboard?.read?.bind?.(clipboard);
export const readBookmark = clipboard?.readBookmark?.bind?.(clipboard);
export const readBuffer = clipboard?.readBuffer?.bind?.(clipboard);
export const readFindText = clipboard?.readFindText?.bind?.(clipboard);
export const readHTML = clipboard?.readHTML?.bind?.(clipboard);
export const readImage = clipboard?.readImage?.bind?.(clipboard);
export const readRTF = clipboard?.readRTF?.bind?.(clipboard);
export const readText = clipboard?.readText?.bind?.(clipboard);
export const write = clipboard?.write?.bind?.(clipboard);
export const writeBookmark = clipboard?.writeBookmark?.bind?.(clipboard);
export const writeBuffer = clipboard?.writeBuffer?.bind?.(clipboard);
export const writeFindText = clipboard?.writeFindText?.bind?.(clipboard);
export const writeHTML = clipboard?.writeHTML?.bind?.(clipboard);
export const writeImage = clipboard?.writeImage?.bind?.(clipboard);
export const writeRTF = clipboard?.writeRTF?.bind?.(clipboard);
export const writeText = clipboard?.writeText?.bind?.(clipboard);
