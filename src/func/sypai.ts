import { exportMdContent } from "@/api";
import type FMiscPlugin from "@/index";
import { confirmDialogSync } from "@/libs/dialog";
import { EventMenu, showMessage } from "siyuan";
import { IGetDocInfo, IProtyle } from "siyuan/types";
import { LuteUtil } from "@/libs/lute-utils";

const username = "frostime";

let headers = {
    'Content-Type': 'application/json'
};

const Type: Record<string, number> = {
    未分类: 1,
    教程: 4,
    CSS: 2,
    JS: 3,
    开发: 4,
    内测: 5,
    新闻: 9,
    模板: 14,
    笔记模板: 15,
    数据库模板: 16,
    字体: 35,
    链滴优选: 43
};
type ValuesOf<T> = T[keyof T];
// type TypeNames = keyof typeof Type;
type TypeValues = ValuesOf<typeof Type>; // 结果是：number


const sendPaper = async (title: string, content: string, catergory: TypeValues, tags: string) => {
    showMessage('正在发布到思源派...', 4000);
    const password = fmisc.getConfig('Misc', 'sypaiToken');
    const url = 'https://api.sypai.cc/submit';
    const post = {
        username: username,
        password: password,
        post_title: title,
        post_content: content,
        post_category: catergory,
        tag: tags
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(post)
        });

        console.log(response);

        if (response.ok) {
            console.log('Post created successfully');
            
            showMessage('发布成功', 4000);
            return true;
        } else {
            console.log(`Failed to create post: ${response.status}`);
            showMessage(`发布失败: ${response.status}`, 4000, 'error');
            return false;
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage(`发布失败: 异常情况`, 4000, 'error')
        return false;
    }
}

const selectType = async () => {
    let ele = document.createElement('div');
    ele.style.display = 'flex';
    ele.style.flexDirection = 'column';
    ele.style.gap = '0.5em';
    ele.innerHTML = `
<select class="b3-select fn__flex-1">
    ${Object.keys(Type).map(key => `<option value="${Type[key]}">${key}</option>`).join('')}
</select>
<input type="text" class="b3-text-field fn__flex-1" placeholder="标签1,标签2" value=""/>
`;
    let initial = (ele.querySelector('.b3-select') as HTMLSelectElement).value;
    let catergory: number = parseInt(initial);
    ele.querySelector('.b3-select').addEventListener('change', (e) => {
        let choosen = (e.target as HTMLSelectElement).value;
        catergory = parseInt(choosen);
        // console.debug(`选中了 ${choosen}`);
    });
    let tags = "";
    ele.querySelector('.b3-text-field').addEventListener('input', (e) => {
        tags = (e.target as HTMLInputElement).value;
    });

    await confirmDialogSync({
        title: '选择发布类型',
        width: '400px',
        content: ele
    });
    return {catergory, tags};
}

/**
 * 将 Lute 导出的HTML 转换为思源派支持的 HTML
 * @param html 
 */
const adpatHTML = (html: string): string => {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    //处理代码块
    let codeBlocks = wrap.querySelectorAll('pre');
    codeBlocks.forEach(pre => {
        pre.classList.add('enlighter-pre');
        const code = pre.querySelector('code');
        let classLang = code.className;
        code.classList.add('gl');
        if (classLang && classLang.startsWith('language-')) {
            let lang = classLang.substring(9);
            code.setAttribute('data-enlighter-language', lang);
        }
    });
    let paras = wrap.querySelectorAll('p');
    //处理段落中的粗体和删除线样式
    paras.forEach(p => {
        const pat = /==(.+?)==/g;
        if (pat.test(p.innerHTML)) {
            p.innerHTML = p.innerHTML.replace(pat, '<strong>$1</strong>');
        }
        const del = /~~(.+?)~~/g;
        if (del.test(p.innerHTML)) {
            p.innerHTML = p.innerHTML.replace(del, '<del>$1</del>');
        }
    });

    return wrap.innerHTML;
}

const publish = async (e: CustomEvent<{
    menu: EventMenu,
    protyle: IProtyle,
    data: IGetDocInfo,
}>) => {
    let name = e.detail.data.name;
    let docId = e.detail.data.rootID;
    let { menu } = e.detail;
    menu.addItem({
        icon: 'iconEmoji',
        label: '发布到思源派',
        click: async () => {
            let {catergory, tags} = await selectType();
            if (catergory === undefined) return;
            console.log(`发布到思源派：${name} --> ${catergory}`);
            let res = await exportMdContent(docId);
            let markdown: string = res.content;
            const lines = markdown.split('\n');
            //去掉重复的顶级标题
            if (lines.length > 1 && lines[0].startsWith('# ')) {
                markdown = lines.slice(1).join('\n');
            }
            let html = LuteUtil.mdToHtml(markdown);
            html = adpatHTML(html);
            // console.log(html);
            sendPaper(name, html, catergory, tags);
        }
    });
}

let fmisc: FMiscPlugin = null;

export let name = "SyPai";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.eventBus.on('click-editortitleicon', publish);
    fmisc = plugin;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin.eventBus.off('click-editortitleicon', publish);
    fmisc = null;
}
