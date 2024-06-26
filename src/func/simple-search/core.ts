/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : choyy, frostime
 * @Date         : 2024-04-19 13:13:57
 * @FilePath     : /src/func/simple-search/core.ts
 * @LastEditTime : 2024-04-29 17:00:52
 * @Description  : 拷贝「简易搜索插件」 v0.2.0
 * @Source       : https://github.com/choyy/simple-search/blob/v0.2.0/index.js
 */
import * as siyuan from "siyuan";


const querySelector = (selector: string) => document.querySelector(selector) as HTMLElement;


let g_keywords = [];

const Constant = {
    NO_ARGUMENTS: "",
    SQL_PREFIX: "select * from blocks where ",
    SQL_DEFAULT_ORDER_BY: "order by case type \
    when 'd' then 1\
    when 'h' then 2\
    when 'i' then 3\
    when 'p' then 4\
    when 't' then 5\
    when 'b' then 6\
    when 'c' then 7\
    when 'm' then 8\
    when 'l' then 9\
    when 's' then 10\
    when 'html' then 11\
    when 'widget' then 12\
    when 'query_embed' then 13\
    when 'iframe' then 14\
    end, updated desc",
    SEARCH_METHOD: {
        KEYWORDS: ':w',
        QUERY_SYNTAX: ':q',
        SQL: ':s',
        REGEX: ':r'
    },
    SEARCH_METHOD_REGEX: /^:[wqrs]/,
    TYPE_FILTER_REGEX: /^@[dhlptbsicmoOL1-6]+$/
}


/**
 * 将搜索语法翻译为sql语句, prefix 为对应的搜索模式
 * @param searchTokens 
 * @returns 
 */
function translateSearchInput(searchTokens: string) {
    if (searchTokens.length < 2 || searchTokens.match(Constant.SEARCH_METHOD_REGEX) != null) {
        return searchTokens;
    }
    let tokenItems = searchTokens.split(" ");
    let argKeywords = []; // 搜索关键词

    let argTypeFilters = ""; // 搜索选项
    const HasTypeFilter = () => argTypeFilters !== "";

    let argExcluded = []; // 排除的关键词
    const HasExcluded = () => argExcluded.length !== 0;

    const SEARCH_METHOD = Constant.SEARCH_METHOD;

    for (let i = 0; i < tokenItems.length; i++) {
        if (tokenItems[i] == "" || tokenItems[i] == "-") {
            continue;
        } else if (tokenItems[i].match(Constant.TYPE_FILTER_REGEX) != null) {
            argTypeFilters += tokenItems[i].substring(1, tokenItems[i].length);
        }
        else if (tokenItems[i].match(/^-.+/) != null) {
            argExcluded.push(tokenItems[i].substring(1, tokenItems[i].length));
            // HasExcluded = true;
        }
        else {
            argKeywords.push(tokenItems[i]);
        }
    }
    g_keywords = argKeywords;
    if ((!HasTypeFilter()) && (!HasExcluded())) {
        // 仅有关键词时使用关键词查询
        return SEARCH_METHOD.KEYWORDS + searchTokens;
    } else if ((!HasTypeFilter()) && (HasExcluded())) {
        // 仅有关键词和排除关键词是使用查询语法查询
        let query_syntax = SEARCH_METHOD.QUERY_SYNTAX;
        for (let i = 0; i < argKeywords.length; i++) {
            query_syntax += " " + argKeywords[i];
        }
        for (let i = 0; i < argExcluded.length; i++) {
            query_syntax += " NOT " + argExcluded[i];
        }
        return query_syntax;
    }

    //NOTE: 此处去掉了原始的 -e 命令

    /***** 搜索关键字 *****/
    // sql 搜索关键词
    let sql_key_words = "";
    if (argKeywords.length != 0) {
        sql_key_words += "content like '%" + argKeywords[0] + "%' ";
        for (let i = 1; i < argKeywords.length; i++) {
            sql_key_words += "and content like '%" + argKeywords[i] + "%' ";
        }
    }
    for (let i = 0; i < argExcluded.length; i++) {
        sql_key_words += "and content not like '%" + argExcluded[i] + "%' ";
    }

    if (sql_key_words != "") {
        sql_key_words = "(" + sql_key_words + ") ";
    } else {
        return SEARCH_METHOD.KEYWORDS;
    }

    /***** 类型过滤 *****/

    //NOTE: 此处去掉了原始的 /k 命令

    let sql_types = argTypeFilters;
    let sql_standard_types = sql_types.replace(/[oOL1-6]/g, "");      // 思源标准块类型
    let sql_special_types = sql_types.replace(/[dhlptbsicm]/g, "");  // 特殊类型
    let sql_type_rlike = "";                                      // sql筛选块的语句
    if (sql_standard_types != "") {                  // 标准类型的sql语句
        sql_type_rlike += "type rlike '^[" + sql_standard_types + "]$' ";
    }
    if (sql_special_types.match(/[1-6]/g) != null) { // 搜索子标题的sql语句
        if (sql_type_rlike != "") sql_type_rlike += "or ";
        sql_type_rlike += "subtype rlike '^h[" + sql_special_types.replace(/[^\d]/g, "") + "]$' ";
    }
    if (sql_special_types.match(/[oO]/g) != null) {  // 搜索待办的sql语句
        if (sql_type_rlike != "") sql_type_rlike += "or ";
        let todo_type = "";
        if (sql_special_types.match(/o/g) != null && sql_special_types.match(/O/g) == null) {
            todo_type = "and markdown like '%[ ] %'"
        } else if (sql_special_types.match(/O/g) != null && sql_special_types.match(/o/g) == null) {
            todo_type = "and markdown like '%[x] %'"
        }
        sql_type_rlike += "(subtype like 't' and type not like 'l' " + todo_type + ") ";
    }
    if (sql_special_types.match(/L/g) != null) {       // 搜索带链接的块的sql语句
        if (sql_type_rlike != "") sql_type_rlike += "or ";
        sql_type_rlike += "(type rlike '^[htp]$' and markdown like '%[%](%)%') ";
    }
    sql_type_rlike = "and (" + sql_type_rlike + ") ";
    sql_types = sql_types.replace(/[oOL1-6]/g, "");

    /***** 排序 *****/
    let sql_order_by = "order by case type";
    const type_order = {
        "d": " when 'd' then ",
        "h": " when 'h' then ",
        "i": " when 'i' then ",
        "p": " when 'p' then ",
        "t": " when 't' then ",
        "b": " when 'b' then ",
        "c": " when 'c' then ",
        "m": " when 'm' then ",
        "l": " when 'l' then ",
        "s": " when 's' then ",
    }
    if (sql_types != "") {
        for (let i = 0; i < sql_types.length; i++) {
            sql_order_by += type_order[sql_types[i]] + i.toString();
        }
        sql_order_by += " end, updated desc";
    } else {
        sql_order_by = Constant.SQL_DEFAULT_ORDER_BY;
    }

    // 完整sql语句
    return SEARCH_METHOD.SQL + Constant.SQL_PREFIX + sql_key_words + sql_type_rlike + sql_order_by;
}

let g_last_search_method = -1;
/**
 * 不同的查询方案
 * @param i 
 *  0: 关键词查询
 *  1: 查询语法查询
 *  2: sql查询
 *  3: 正则表达式
 */
function switchSearchMethod(i: number) {
    if (g_last_search_method != i) {
        //点开设置搜索语法的菜单，并进行选择
        querySelector("#searchSyntaxCheck").click();
        //@ts-ignore
        querySelector("#commonMenu").lastChild.children[i].click();
        g_last_search_method = i;
    }
}

let g_changed_user_groupby = false;      // 记录是否切换过分组
/**
 * 切换分组状态
 * @param i, i = 0 不分组，i = 1 按文档分组
 */
function changeGroupBy(i: number) {
    if (i == 0 && g_changed_user_groupby && window.siyuan.storage['local-searchdata'].group == 0) {
        // 若分组被切换过，且默认不分组，则切换不分组
        document.getElementById("searchMore").click();
        //@ts-ignore
        querySelector("#commonMenu").lastChild.children[1].children[2].firstChild.firstChild.click();
        g_changed_user_groupby = false;
    } else if (i == 1 && !g_changed_user_groupby && window.siyuan.storage['local-searchdata'].group == 0) {
        // 若分组没切换过，且默认不分组，则按文档分组
        document.getElementById("searchMore").click();
        //@ts-ignore
        querySelector("#commonMenu").lastChild.children[1].children[2].firstChild.lastChild.click();
        g_changed_user_groupby = true;
    }
}

function highlightKeywords(search_list_text_nodes, keyword: string, highlight_type: "highlight-keywords-search-list" | "highlight-keywords-search-preview") {
    const str = keyword.trim().toLowerCase();
    const ranges = search_list_text_nodes // 查找所有文本节点是否包含搜索词
        .map((el) => {
            const text = el.textContent.toLowerCase();
            const indices = [];
            let startPos = 0;
            while (startPos < text.length) {
                const index = text.indexOf(str, startPos);
                if (index === -1) break;
                indices.push(index);
                startPos = index + str.length;
            }
            return indices.map((index) => {
                const range = document.createRange();
                range.setStart(el, index);
                range.setEnd(el, index + str.length);
                return range;
            });
        });
    const searchResultsHighlight = new Highlight(...ranges.flat()); // 创建高亮对象
    CSS.highlights.set(highlight_type, searchResultsHighlight);     // 注册高亮
}

let g_observer: MutationObserver;
let g_search_keywords: string = "";
let g_highlight_keywords: boolean = false;

export default class SimpleSearch {

    declare app: siyuan.App;
    declare eventBus: siyuan.EventBus;

    constructor(plugin: siyuan.Plugin) {
        this.app = plugin.app;
        this.eventBus = plugin.eventBus;
    }

    // 保存关键词，确保思源搜索关键词为输入的关键词，而不是翻译后的sql语句
    private inputSearchEvent() {
        const searchInput = document.getElementById("searchInput") as any;
        const simpleSearchInput = document.getElementById("simpleSearchInput") as any;
        if (/^#.*#$/.test(searchInput.value)  // 多次点击标签搜索时更新搜索框关键词
            && searchInput.value != simpleSearchInput.value) {
            simpleSearchInput.value = searchInput.value;
            simpleSearchInput.focus();  // 聚焦到输入框
            simpleSearchInput.select(); // 选择框内内容
            g_search_keywords = searchInput.value;
        }
        window.siyuan.storage["local-searchdata"].k = g_search_keywords;
    }

    // 在界面加载完毕后高亮关键词
    private loadedProtyleStaticEvent() {
        CSS.highlights.clear();     // 清除上个高亮
        if (g_highlight_keywords) { // 判断是否需要高亮关键词
            const search_list = document.getElementById("searchList"); // 搜索结果列表的节点
            if (search_list == null) return;                            // 判断是否存在搜索界面
            const search_list_text_nodes = Array.from(search_list.querySelectorAll(".b3-list-item__text"), el => el.firstChild); // 获取所有具有 b3-list-item__text 类的节点的文本子节点
            g_keywords.forEach((keyword) => {
                highlightKeywords(search_list_text_nodes, keyword, "highlight-keywords-search-list");
            });
            const search_preview = document.getElementById("searchPreview").children[1].children[0]; // 搜索预览内容的节点
            const tree_walker = document.createTreeWalker(search_preview, NodeFilter.SHOW_TEXT);     // 创建 createTreeWalker 迭代器，用于遍历文本节点，保存到一个数组
            const search_preview_text_nodes = [];
            let current_node = tree_walker.nextNode();
            while (current_node) {
                if (current_node.textContent.trim().length > 1) {
                    search_preview_text_nodes.push(current_node);
                }
                current_node = tree_walker.nextNode();
            }
            g_keywords.forEach((keyword) => {
                highlightKeywords(search_preview_text_nodes, keyword, "highlight-keywords-search-preview");
            });
        }
    }

    onLayoutReady() {
        // 选择需要观察变动的节点
        const global_search_node = querySelector("body");
        // const tab_search_node = querySelector(".layout__center"); //不监听 tab 搜索页签

        // 监视子节点的增减
        const observer_conf = { childList: true };
        // 当观察到变动时执行的回调函数
        // 即当搜索界面打开时，插入新搜索框，隐藏原搜索框，然后将新搜索框内容转成sql后填入原搜索框
        const input_event = new InputEvent("input");

        const operationsAfterOpenSearch = function () {
            g_last_search_method = -1; // 每次打开搜索都要设置搜索方法
            // 插入新搜索框，隐藏原搜索框
            let originalSearchInput = document.getElementById("searchInput") as HTMLInputElement;
            let simpleSearchInput = originalSearchInput.cloneNode() as HTMLInputElement;
            simpleSearchInput.id = "simpleSearchInput";
            simpleSearchInput.value = "";
            originalSearchInput.after(simpleSearchInput);
            originalSearchInput.setAttribute("style", "width: 0; position: fixed; visibility: hidden;");
            (simpleSearchInput.nextSibling as HTMLElement).onclick = function () { // 设置清空按钮
                simpleSearchInput.value = "";
                simpleSearchInput.focus();
            }

            //监听搜索框输入事件
            const input_event_func = function () {
                g_highlight_keywords = false;
                g_search_keywords = simpleSearchInput.value;

                /**
                 * 特定前缀, 指定搜索方案
                 * 在搜索时使用 -+搜索方法+搜索关键词即可使用默认的搜索方法进行搜索。默认搜索方法分别为：
                    w（keywords）关键字
                    q（query syntax）查询语法
                    s（SQL）SQL语句搜索
                    r（regex）正则表达式
                 */
                if (g_search_keywords.length < 2) {
                    switchSearchMethod(0);
                    originalSearchInput.value = g_search_keywords;
                } else {
                    let input_translated = translateSearchInput(g_search_keywords);
                    switch (input_translated.substring(0, 2)) {
                        case Constant.SEARCH_METHOD.KEYWORDS: switchSearchMethod(0); break;
                        case Constant.SEARCH_METHOD.QUERY_SYNTAX: switchSearchMethod(1); break;
                        case Constant.SEARCH_METHOD.SQL: switchSearchMethod(2); break;
                        case Constant.SEARCH_METHOD.REGEX: switchSearchMethod(3); break;
                    }
                    //把方案前缀去掉
                    originalSearchInput.value = input_translated.slice(2, input_translated.length);
                    if (input_translated.substring(0, 2) === Constant.SEARCH_METHOD.SQL) {
                        g_highlight_keywords = true;
                        // if (input_translated.match(/'\^\[libs\]\$'/g) != null) { // 若是扩展搜索，按文档分组
                        //     changeGroupBy(1);
                        // } else { // 否则切换默认分组
                        //     changeGroupBy(0);
                        // }
                    }
                }
                originalSearchInput.dispatchEvent(input_event);
            }

            //将伪输入框的时间传导到原搜索框
            const keyboard_event_func = function (event: KeyboardEvent) {
                switch (event.keyCode) {
                    case 13:
                        originalSearchInput.dispatchEvent(new KeyboardEvent("keydown", { "keyCode": 13, "code": "KeyEnter", "key": "Enter" }));
                        break;
                    case 38:
                        originalSearchInput.dispatchEvent(new KeyboardEvent("keydown", { "keyCode": 38, "code": "KeyArrowUp", "key": "ArrowUp" }));
                        return false; // 禁用方向键原跳到行首功能
                    case 40:
                        originalSearchInput.dispatchEvent(new KeyboardEvent("keydown", { "keyCode": 40, "code": "KeyArrowDown", "key": "ArrowDown" }));
                        return false; // 禁用方向键原跳到行尾功能
                }
            }

            simpleSearchInput.value = originalSearchInput.value; // 1、原搜索框关键词为保存的g_search_keywords  2、确保点击标签搜索时不被影响
            input_event_func();
            simpleSearchInput.focus();  // 聚焦到输入框
            simpleSearchInput.select(); // 选择框内内容

            // 当在输入框中按下按键的时候，将搜索框内容转成sql后填入原搜索框
            g_search_keywords = simpleSearchInput.value;
            simpleSearchInput.oninput = input_event_func; // 监听input事件
            simpleSearchInput.onkeydown = keyboard_event_func; // enter键打开搜索结果，上下键选择
        }.bind(this);

        //判断搜索对话框是否打开
        const openSearchCallback = function (mutationsList: MutationRecord[]) {
            // console.log("Body Mutation", mutationsList);
            for (let i = 0; i < mutationsList.length; i++) {
                if (mutationsList[i].addedNodes.length == 0) return;
                let ele = mutationsList?.[i]?.addedNodes[0] as HTMLElement;
                if (ele?.getAttribute('data-key') === "dialog-globalsearch") {// 判断全局搜索
                    operationsAfterOpenSearch();
                    querySelector("#searchOpen").onclick = function () { // 确保按下在页签打开时搜索关键词不变
                        (document.getElementById("searchInput") as HTMLInputElement).value = g_search_keywords;
                    }.bind(this);
                    break;
                }
                /** 不监听 tab 搜索页签
                else if (mutationsList[i].addedNodes[0].className == "fn__flex-1 fn__flex"
                    && mutationsList[i].addedNodes[0].innerText == "搜索") {
                    operationsAfterOpenSearch(); break;
                }
                */
            }
        }.bind(this);

        this.eventBus.on("input-search", this.inputSearchEvent);
        this.eventBus.on("loaded-protyle-static", this.loadedProtyleStaticEvent);

        // 创建一个观察器实例并传入回调函数
        g_observer = new MutationObserver(openSearchCallback);
        // 开始观察目标节点
        g_observer.observe(global_search_node, observer_conf);
        // g_observer.observe(tab_search_node, observer_conf);
        // console.log("simple search start...")
    }

    onunload() {
        // 停止观察目标节点
        g_observer.disconnect();
        g_observer = null;
        this.eventBus.off("input-search", this.inputSearchEvent);
        this.eventBus.off("loaded-protyle-static", this.loadedProtyleStaticEvent);
        // console.log("simple search stop...")
    }
};
