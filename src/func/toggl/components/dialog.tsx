import { TogglClient } from "./client";
import { solidDialog } from "@/libs/dialog";

export const showTogglDialog = () => {
    solidDialog({
        title: 'Toggl Timer',
        loader: () => <TogglClient />,
        width: '700px',
        height: '400px'
    });
}; 