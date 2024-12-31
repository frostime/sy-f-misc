import { thisPlugin } from "@frostime/siyuan-plugin-kits"

const rootName = 'chat-assets';


const saveImageFile = async (image: Blob, fileName: string) => {
    const plugin = thisPlugin();
    if (fileName.startsWith('/')) {
        fileName = fileName.slice(1);
    }
    // ensure ext is png or jpg or jpeg
    const ext = fileName.split('.').pop();
    if (!['png', 'jpg', 'jpeg'].includes(ext)) {
        fileName += '.png';
    }

    fileName = `${rootName}/${fileName}`;
    await plugin.saveBlob(fileName, image);
    return `data/storage/petal/${thisPlugin().name}/${fileName}`;
}


const loadImageFile = async (fileName: string) => {
    const plugin = thisPlugin();
    if (fileName.startsWith('/')) {
        fileName = fileName.slice(1);
    }
    fileName = `${rootName}/${fileName}`;
    const blob = await plugin.loadBlob(fileName);
    return blob;
}
