const I18N = {
    zh_CN: {
        warn: '⚠️ 注意Asset目录已更改！',
        menuLabel: '同本地 Markdown 文件同步',
        notSet: '请先选择导出目录',
        docName: '文档名称',
        docNameDesc: '导出的 Markdown 文件名',
        exportDir: '导出文档目录',
        exportDirDesc: '导出的 *.md 文件会被保存到这里',
        mdExportDirPlaceholder: 'MD 文件导出目录',
        choose: '选择',
        assetDir: '资源文件目录',
        assetDirDesc: 'Markdown 文件中的资源文件（如图片等）会被保存到这里',
        assetPrefix: 'Asset路径前缀',
        assetPrefixDesc: 'Markdown 文件中的图片路径前缀, 可以是绝对路径、 相对路径或者自行填写',
        absolutePath: '绝对路径',
        relativePath: '相对路径',
        succssConfirm: '已经导出到: {0}；是否需要跳转到文件夹？',
        mdfilepath: 'Markdown 文件路径',
        assetpattern: 'MD 文件中资源链接的样式'
    },
    en_US: {
        warn: '⚠️ Warning: Asset directory has changed!',
        menuLabel: 'Sync With Local Markdown File',
        notSet: 'Please select the export directory first',
        docName: 'Document Name',
        docNameDesc: 'Name of the exported Markdown file',
        exportDir: 'Export Document Directory',
        exportDirDesc: 'The exported *.md file will be saved to this directory',
        mdExportDirPlaceholder: 'MD File Export Directory',
        choose: 'Choose',
        assetDir: 'Asset Directory',
        assetDirDesc: 'The directory where the assets (such as images) in the Markdown file are saved',
        assetPrefix: 'Asset Path Prefix',
        assetPrefixDesc: 'The prefix for image paths in the Markdown file. It can be an absolute path, relative path, or custom.',
        absolutePath: 'Absolute Path',
        relativePath: 'Relative Path',
        succssConfirm: 'Exported to: {0}; Do you want to jump to the folder?',
        mdfilepath: 'MD File Path',
        assetpattern: 'Pattern of asset link in Markdown file'
    }
};


let i18n: typeof I18N.zh_CN = window.siyuan.config.lang in I18N ? I18N[window.siyuan.config.lang] : I18N.en_US;
export default i18n;