import { exportMdContent } from "@/api";
import type FMiscPlugin from "@/index";
import { confirmDialogSync } from "@/libs/dialog";
import { EventMenu, showMessage } from "siyuan";
import { IGetDocInfo, IProtyle } from "siyuan/types";

const username = "frostime";

let headers = {
    'Authorization': '',
    'Content-Type': 'application/json'
};

const updateToken = (plugin: FMiscPlugin) => {
    let password = plugin.getConfig('Misc', 'sypaiToken');
    const credentials = `${username}:${password}`;
    const token = Buffer.from(credentials).toString('base64');
    headers.Authorization = `Basic ${token}`;
}

const Type: Record<string, number> = {
    未分类: 1,
    CSS: 2,
    JS: 3,
    开发: 4,
    内测: 5,
    字体: 6,
    新闻: 9,
    模板: 14,
    笔记模板: 15,
    教程: 16,
    链滴优选: 43
};
type ValuesOf<T> = T[keyof T];
// type TypeNames = keyof typeof Type;
type TypeValues = ValuesOf<typeof Type>; // 结果是：number


const sendPaper = async (title: string, content: string, catergory: TypeValues) => {
    showMessage('正在发布到思源派...', 4000);
    const url = "https://sypai.cc/wp-json/wp/v2/posts";
    const post = {
        title: title,
        status: 'publish',
        content: content,
        categories: catergory
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(post)
        });

        if (response.status === 201) {
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

const lute = window.Lute.New();

const selectType = async () => {
    let ele = document.createElement('div');
    ele.style.display = 'flex';
    ele.innerHTML = `
<select class="select-type fn__flex-1">
    ${Object.keys(Type).map(key => `<option value="${Type[key]}">${key}</option>`).join('')}
</select>
`;
    let initial = (ele.querySelector('.select-type') as HTMLSelectElement).value;
    let catergory: number = parseInt(initial);
    ele.querySelector('.select-type').addEventListener('change', (e) => {
        let choosen = (e.target as HTMLSelectElement).value;
        catergory = parseInt(choosen);
        // console.debug(`选中了 ${choosen}`);
    });
    await confirmDialogSync({
        title: '选择发布类型',
        width: '400px',
        content: ele
    });
    return catergory;
}

const publish = async (e: CustomEvent<{
    menu: EventMenu,
    protyle: IProtyle,
    data: IGetDocInfo,
}>) => {
    if (headers.Authorization === '') {
        showMessage('请先设置思源派密码', 3000, 'error');
        return;
    }
    console.log(e.detail);
    let name = e.detail.data.name;
    let docId = e.detail.data.rootID;
    let { menu } = e.detail;
    menu.addItem({
        icon: 'iconEmoji',
        label: '发布到思源派',
        click: async () => {
            let catergory = await selectType();
            if (catergory === undefined) return;
            console.log(`发布到思源派：${name} --> ${catergory}`);
            let res = await exportMdContent(docId);
            let markdown: string = res.content;
            let html = lute.Md2HTML(markdown);
            sendPaper(name, html, catergory);
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
    updateToken(plugin);
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin.eventBus.off('click-editortitleicon', publish);
    fmisc = null;
}
