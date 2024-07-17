interface ISrc {
    doc: DocumentId;
    recursive: boolean;
}

interface IWorkspace {
    ip: string;
    port: number;
    token: string;
}

interface ITraget extends IWorkspace {
    box: string;
    path: string;
}

interface IPostProps {
    src: ISrc;
    target: ITraget;
}

