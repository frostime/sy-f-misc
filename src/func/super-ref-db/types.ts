type RedirectMap = Record<BlockId, BlockId>; // refID -> backlinkID

interface SyncResult {
    toAdd: { id: string; isDetached: boolean; }[];
    toDelete: string[];
    toRedirect: { from: string; to: string; }[];
}