export type ModuleTransitionOperation = 'load' | 'unload';

type ModuleLifecycle<TPlugin> = {
    name: string;
    load: (plugin: TPlugin) => void | Promise<void>;
    unload: (plugin?: TPlugin) => void | Promise<void>;
};

export const settleModuleTransitions = async <TPlugin>(
    operation: ModuleTransitionOperation,
    modules: ModuleLifecycle<TPlugin>[],
    plugin: TPlugin,
    logError: (message: string, error: unknown) => void = console.error
): Promise<void> => {
    await Promise.all(modules.map(async module => {
        try {
            await module[operation](plugin);
            if (operation === 'load') {
                console.debug(`Load ${module.name}`);
            }
        } catch (error) {
            logError(
                `[fmisc] Failed to ${operation} module ${module.name}. Reload the SiYuan UI if fmisc state appears inconsistent:`,
                error
            );
        }
    }));
};
