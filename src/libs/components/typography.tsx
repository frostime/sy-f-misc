/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-25 14:19:10
 * @FilePath     : /src/libs/components/typography.tsx
 * @LastEditTime : 2024-07-12 14:21:03
 * @Description  : 
 */


const Typography = (props: { markdown: string, fontSize?: string; }) => {
    const lute = window.Lute!.New();
    let content = lute.Md2HTML(props.markdown);
    let font = props.fontSize ? `${props.fontSize} !important;` : 'initial';
    return (
        <div
            class="item__readme b3-typography"
            innerHTML={content}
            style={`font-size: ${font}`}
        />
    );
}

export default Typography;