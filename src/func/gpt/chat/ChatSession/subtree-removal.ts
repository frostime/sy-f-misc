interface ISubtreeRemovalSource {
    snapshot(): IChatSessionHistoryV2;
    remove(): number;
    restore(history: IChatSessionHistoryV2): void;
}

/**
 * Commit a destructive subtree operation against the authoritative local working copies.
 * Save a cut destination first: interruption can leave a duplicate, but never lose both copies.
 * Replica synchronization stays in the existing persistence layer, outside this local operation.
 */
export const commitSubtreeRemoval = (options: {
    source: ISubtreeRemovalSource;
    persistence: {
        save(history: IChatSessionHistoryV2): boolean;
        remove(id: string): void;
    };
    destination?: IChatSessionHistoryV2;
    /** Synchronous UI transition after both working copies have been saved. */
    onCommit?: () => void;
}): number => {
    const { source, persistence, destination, onCommit } = options;
    const original = source.snapshot();
    if (!original) throw new Error('无法备份原对话，已取消操作');
    let sourceChanged = false;
    let destinationAttempted = false;
    try {
        if (destination) {
            destinationAttempted = true;
            if (!persistence.save(destination)) throw new Error('新对话无法写入本地存储，已取消剪切');
        }
        const removedCount = source.remove();
        sourceChanged = true;
        if (!persistence.save(source.snapshot())) throw new Error('原对话无法写入本地存储，已取消操作');
        onCommit?.();
        return removedCount;
    } catch (error) {
        let sourceSaved = !sourceChanged;
        if (sourceChanged) {
            source.restore(original);
            sourceSaved = persistence.save(original);
        }
        if (destinationAttempted && sourceSaved) persistence.remove(destination!.id);
        // If storage also rejects rollback, keep the saved destination as a recoverable backup.
        throw error;
    }
};
