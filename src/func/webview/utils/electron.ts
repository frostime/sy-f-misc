//minimum, replace some types with any
declare namespace Electron {
    interface Clipboard {
        availableFormats(type?: string): string[];
        clear(type?: string): void;
        has(format: string, type?: string): boolean;
        read(type?: string): string;
        readBookmark(): { title: string, url: string };
        readBuffer(format: string): Buffer;
        readFindText(): string;
        readHTML(type?: string): string;
        readImage(type?: string): NativeImage;
        readRTF(type?: string): string;
        readText(type?: string): string;
        write(data: any, type?: string): void;
        writeBookmark(title: string, url: string, type?: string): void;
        writeBuffer(format: string, buffer: Buffer, type?: string): void;
        writeFindText(text: string): void;
        writeHTML(markup: string, type?: string): void;
        writeImage(image: NativeImage, type?: string): void;
        writeRTF(text: string, type?: string): void;
        writeText(text: string, type?: string): void;
    }

    interface ContextBridge {
        exposeInMainWorld(apiKey: string, api: any): void;
    }

    interface CrashReporter {
        addExtraParameter(key: string, value: string): void;
        getChildProcessCrashReporter(): CrashReporter;
        getParameters(): Record<string, string>;
        removeExtraParameter(key: string): void;
        start(options: any): void;
    }

    interface IpcRenderer extends NodeJS.EventEmitter {
        invoke(channel: string, ...args: any[]): Promise<any>;
        postMessage(channel: string, message: any, transfer?: MessagePort[]): void;
        send(channel: string, ...args: any[]): void;
        sendSync(channel: string, ...args: any[]): any;
        sendTo(windowId: number, channel: string, ...args: any[]): void;
        sendToHost(channel: string, ...args: any[]): void;
    }

    interface NativeImage {
        toPNG(options?: any): Buffer;
        toJPEG(quality: number): Buffer;
        toBitmap(options?: any): Buffer;
        toDataURL(options?: any): string;
        getBitmap(options?: any): Buffer;
        getNativeHandle(): Buffer;
        isEmpty(): boolean;
        getSize(): any;
        setTemplateImage(option: boolean): void;
        isTemplateImage(): boolean;
        crop(rect: any): NativeImage;
        resize(options: any): NativeImage;
        getAspectRatio(): number;
        addRepresentation(options: any): void;
    }

    interface Shell {
        showItemInFolder(fullPath: string): void;
        openPath(path: string): Promise<string>;
        openExternal(url: string, options?: any): Promise<void>;
        moveItemToTrash(fullPath: string): boolean;
        beep(): void;
        writeShortcutLink(shortcutPath: string, operation: 'create' | 'update' | 'replace', options: any): boolean;
        readShortcutLink(shortcutPath: string);
    }

    interface WebFrame {
        executeJavaScript(code: string, userGesture?: boolean, callback?: (result: any) => void): Promise<any>;
        executeJavaScriptInIsolatedWorld(worldId: number, scripts: any[], userGesture?: boolean): Promise<any>;
        setIsolatedWorldInfo(worldId: number, info: any): void;
        setIsolatedWorldSecurityOrigin(worldId: number, securityOrigin: string): void;
        setIsolatedWorldContentSecurityPolicy(worldId: number, csp: string): void;
        getResourceUsage(): any;
        getWebFrameId(): number;
        getZoomFactor(): number;
        getZoomLevel(): number;
        setZoomFactor(factor: number): void;
        setZoomLevel(level: number): void;
    }

    interface NativeTheme {
        shouldUseDarkColors: boolean;
        shouldUseHighContrastColors: boolean;
        shouldUseInvertedColorScheme: boolean;
        themeSource: 'system' | 'light' | 'dark';
    }
}

export interface IElectron {
    clipboard: Electron.Clipboard;
    contextBridge: Electron.ContextBridge;
    crashReporter: Electron.CrashReporter;
    ipcRenderer: Electron.IpcRenderer;
    nativeImage: Electron.NativeImage;
    shell: Electron.Shell;
    webFrame: Electron.WebFrame;
}

export const electron: IElectron = globalThis
    ?.require
    ?.("electron");

export default electron;

export const clipboard = electron?.clipboard;
export const contextBridge = electron?.contextBridge;
export const crashReporter = electron?.crashReporter;
export const ipcRenderer = electron?.ipcRenderer;
export const nativeImage = electron?.nativeImage;
export const shell = electron?.shell;
export const webFrame = electron?.webFrame;
