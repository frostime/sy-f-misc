/*
 * Chat Utils - 统一导出入口
 */


// Multimodal
export * from './msg-modal';

// Message Builder
export * from './msg-builder';

// Content Extractor
export * from './msg-content';

// Session Utils
export * from './msg-item';

// Validation
// export * from './validation';

// ============================================================================
// 便捷的默认导出
// ============================================================================

import { createMessage } from './msg-builder';
import { extractMessageContent } from './msg-content';
// import { validateContentForModel } from './validation';

export default {
    createMessage,
    extractContent: extractMessageContent,
    // validateContentForModel
};
