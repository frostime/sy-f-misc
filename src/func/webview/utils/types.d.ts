
export interface ElectronParams {
    /**
     * x coordinate.
     */
    x: number;
    /**
     * y coordinate.
     */
    y: number;
    /**
     * URL of the link that encloses the node the context menu was invoked on.
     */
    linkURL: string;
    /**
     * Text associated with the link. May be an empty string if the contents of the
     * link are an image.
     */
    linkText: string;
    /**
     * URL of the top level page that the context menu was invoked on.
     */
    pageURL: string;
    /**
     * URL of the subframe that the context menu was invoked on.
     */
    frameURL: string;
    /**
     * Source URL for the element that the context menu was invoked on. Elements with
     * source URLs are images, audio and video.
     */
    srcURL: string;
    /**
     * Type of the node the context menu was invoked on. Can be `none`, `image`,
     * `audio`, `video`, `canvas`, `file` or `plugin`.
     */
    mediaType: ('none' | 'image' | 'audio' | 'video' | 'canvas' | 'file' | 'plugin');
    /**
     * Whether the context menu was invoked on an image which has non-empty contents.
     */
    hasImageContents: boolean;
    /**
     * Whether the context is editable.
     */
    isEditable: boolean;
    /**
     * Text of the selection that the context menu was invoked on.
     */
    selectionText: string;
    /**
     * Title text of the selection that the context menu was invoked on.
     */
    titleText: string;
    /**
     * Alt text of the selection that the context menu was invoked on.
     */
    altText: string;
    /**
     * Suggested filename to be used when saving file through 'Save Link As' option of
     * context menu.
     */
    suggestedFilename: string;
    /**
     * Rect representing the coordinates in the document space of the selection.
     */
    selectionRect: any;
    /**
     * Start position of the selection text.
     */
    selectionStartOffset: number;
    /**
     * The referrer policy of the frame on which the menu is invoked.
     */
    referrerPolicy: any;
    /**
     * The misspelled word under the cursor, if any.
     */
    misspelledWord: string;
    /**
     * An array of suggested words to show the user to replace the `misspelledWord`.
     * Only available if there is a misspelled word and spellchecker is enabled.
     */
    dictionarySuggestions: string[];
    /**
     * The character encoding of the frame on which the menu was invoked.
     */
    frameCharset: string;
    /**
     * If the context menu was invoked on an input field, the type of that field.
     * Possible values include `none`, `plainText`, `password`, `other`.
     */
    inputFieldType: ('none' | 'plainText' | 'password' | 'other');
    /**
     * If the context is editable, whether or not spellchecking is enabled.
     */
    spellcheckEnabled: boolean;
    /**
     * Input source that invoked the context menu. Can be `none`, `mouse`, `keyboard`,
     * `touch`, `touchMenu`, `longPress`, `longTap`, `touchHandle`, `stylus`,
     * `adjustSelection`, or `adjustSelectionReset`.
     */
    menuSourceType: ('none' | 'mouse' | 'keyboard' | 'touch' | 'touchMenu' | 'longPress' | 'longTap' | 'touchHandle' | 'stylus' | 'adjustSelection' | 'adjustSelectionReset');
    /**
     * The flags for the media element the context menu was invoked on.
     */
    mediaFlags: any;
    /**
     * These flags indicate whether the renderer believes it is able to perform the
     * corresponding action.
     */
    editFlags: any;
}

export interface IWebApp {
    name: string;
    iconName: string;
    iconSvg: string;
    iconSymbolSize: number;
    title: string;
    isTopBar: boolean;
    topBarPostion: "left" | "right"; // Assuming only left or right is valid
    script: string;
    css: string;
    proxy: string;
    url: string;
    debug: boolean;
    internal: boolean;
    referer: string;
    openTab: () => void;
}
