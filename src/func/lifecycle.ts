export type ModuleTransitionOperation = 'load' | 'unload';

type ModuleLifecycle<TPlugin> = {
    name: string;
    load: (plugin: TPlugin, signal?: AbortSignal) => void | Promise<void>;
    unload: (plugin?: TPlugin) => void | Promise<void>;
};

export const settleModuleTransitions = async <TPlugin>(
    operation: ModuleTransitionOperation,
    modules: ModuleLifecycle<TPlugin>[],
    plugin: TPlugin,
    signal?: AbortSignal,
    logError: (message: string, error: unknown) => void = console.error
): Promise<void> => {
    await Promise.all(modules.map(async module => {
        try {
            await module[operation](plugin, signal);
            if (operation === 'load') {
                console.debug(`Load ${module.name}`);
            }
        } catch (error) {
            logError(`Failed to ${operation} module ${module.name}:`, error);
        }
    }));
};
