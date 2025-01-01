import { TogglClient } from "./client";
import { solidDialog } from "@/libs/dialog";

let opened = false;
export const showTogglDialog = () => {
    if (opened) return;
    opened = true;
    solidDialog({
        title: 'Toggl Timer',
        loader: () => <TogglClient />,
        width: '700px',
        height: '400px',
        callback: () => {
            opened = false;
        }
    });
}; 