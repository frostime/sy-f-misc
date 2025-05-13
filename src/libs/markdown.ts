/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-13 14:54:39
 * @FilePath     : /src/libs/markdown.ts
 * @LastEditTime : 2025-05-13 15:12:57
 * @Description  : Markdown related utilities
 */

/**
 * Block ID pattern for validation
 */
const BlockIDPattern = /^\d{14}-[0-9a-z]{7}$/;

/**
 * Extract block references from markdown text
 * Returns a record mapping block IDs to their anchor texts
 *
 * @param markdown The markdown text to extract references from
 * @returns Record<blockId, anchorText>
 */
export function extractBlockReferences(markdown: string): Record<string, string> {
    const result: Record<string, string> = {};

    // Pattern to match ((ID 'anchor text')) or ((ID "anchor text"))
    // Group 1: Block ID
    // Group 2: Quote type (' or ")
    // Group 3: Anchor text
    const pattern = /\(\((\d{14}-[0-9a-z]{7})\s+(['"])(.*?)\2\)\)/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(markdown)) !== null) {
        const blockId = match[1];
        const anchorText = match[3];

        // Validate block ID format
        if (BlockIDPattern.test(blockId)) {
            result[blockId] = anchorText;
        }
    }

    return result;
}

/**
 * Extract Siyuan links from markdown text
 * Returns a record mapping block IDs to their link texts
 *
 * @param markdown The markdown text to extract Siyuan links from
 * @returns Record<blockId, linkText>
 */
export function extractSiyuanLinks(markdown: string): Record<string, string> {
    const result: Record<string, string> = {};

    // Pattern to match [link text](siyuan://blocks/ID)
    // Group 1: Link text
    // Group 2: Block ID
    const pattern = /\[(.*?)\]\(siyuan:\/\/blocks\/(\d{14}-[0-9a-z]{7})\)/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(markdown)) !== null) {
        const linkText = match[1];
        const blockId = match[2];

        // Validate block ID format
        if (BlockIDPattern.test(blockId)) {
            result[blockId] = linkText;
        }
    }

    return result;
}

/**
 * Extract all references (both block references and Siyuan links) from markdown text
 * Returns a record mapping block IDs to their anchor/link texts
 * If a block ID appears in both formats, the block reference text takes precedence
 *
 * @param markdown The markdown text to extract references from
 * @returns Record<blockId, text>
 */
export function extractAllReferences(markdown: string): Record<string, string> {
    const blockRefs = extractBlockReferences(markdown);

    const siyuanLinks = extractSiyuanLinks(markdown);

    const result: Record<string, string> = { ...siyuanLinks, ...blockRefs };

    return result;
}
