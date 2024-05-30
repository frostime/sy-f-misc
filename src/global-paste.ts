
const processors: {[key: string]: (detail: ISiyuanEventPaste) => boolean} = {
    bilibili: (detail: ISiyuanEventPaste) => {
        const pat = /^((?:【.+】\s*)+)\s*(https:\/\/www\.bilibili\.com.+)$/
        const match = detail.textPlain.match(pat);
        if (!match) return false;
        // console.log("Matched bilibili");
        // console.log(match);
        let title = match[1];
        let link = match[2];
        detail.resolve({
            textPlain: `[${title}](${link})`,
            textHTML: undefined,
            files: detail.files,
            siyuanHTML: detail.siyuanHTML
        });
        return true;
    }
};

export const addProcessor = (key: string, processor: (detail: ISiyuanEventPaste) => boolean) => {
    processors[key] = processor;
}

export const delProcessor = (key: string) => {
    delete processors[key];
}

export const onPaste = async (event: CustomEvent<ISiyuanEventPaste>) => {
    const detail = event.detail;
    for (const key in processors) {
        if (processors[key](detail) === false) continue;
        console.debug(`Paste processor ${key} matched`);
        return;
    }
}