import { TogglClient } from "./client";
import { solidDialog } from "@/libs/dialog";

export const showTogglDialog = () => {
    solidDialog({
        title: 'Toggl Timer',
        loader: () => <TogglClient onClose={() => {}} />,
        width: '400px',
        height: '500px'
    });
}; 