/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-25 14:19:10
 * @FilePath     : /src/components/typography.ts
 * @LastEditTime : 2024-03-25 14:24:27
 * @Description  : 
 */

/**
 * Create a typography component
 * @param markdown 
 * @returns A div element with the markdown content
 * @example
 * ```ts
 * const readme = `
 * # Hello World
 * This is a markdown content
 * `;
 * const typography = typography(readme);
 * typography.setFontSize('16px');
 * document.body.appendChild(typography);
 * ```
 */
export const typography = (markdown: string) => {
    const lute = window.Lute!.New();
    let content = lute.Md2HTML(markdown);
    const html = `
    <div class="item__readme b3-typography">
        ${content}
    </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = html;

    div['setFontSize'] = (size: string) => {
        div.style.fontSize = size;
    }

    return div;
}
