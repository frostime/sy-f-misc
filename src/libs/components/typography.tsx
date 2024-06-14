/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-25 14:19:10
 * @FilePath     : /src/libs/components/typography.tsx
 * @LastEditTime : 2024-06-13 11:08:52
 * @Description  : 
 */
import { Dynamic } from "solid-js/web";


const Typography = (props: {markdown: string, fontSize?: string;}) => {
    const lute = window.Lute!.New();
    let content = lute.Md2HTML(props.markdown);
    return (
    <div class="item__readme b3-typography" style={{
        'font-size': props.fontSize ?? 'initial'
    }}>
        <Dynamic component={content}/>
    </div>
    );
}

export default Typography;
