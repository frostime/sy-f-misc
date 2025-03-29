import { sharedConfigs } from "@/func/shared-configs";
import { ButtonInput } from "@/libs/components/Elements";
import { Rows } from "@/libs/components/Elements/Flex";
import { showMessage } from "siyuan";


let cp: any;
try {
    cp = window?.require?.('child_process');
} catch (e) {
    cp = null;
}

export const LoadModuleFileButtonGroup = (props: {
    moduleFilePath: string;
    reloadModule: () => Promise<boolean>
}) => {
    return (
        <Rows>

            <ButtonInput
                label="编辑"
                onClick={() => {
                    if (!cp) {
                        showMessage('非桌面端环境无法编辑代码', 3000, 'error');
                        return;
                    }
                    const jsPath = props.moduleFilePath;
                    let editorCmd = sharedConfigs('codeEditor') + ' ' + jsPath;
                    try {
                        cp.exec(editorCmd);
                    } catch (error) {
                        showMessage(`打开编辑器失败: ${error.message}`, 3000, 'error');
                    }
                }}
            />
            <ButtonInput
                label="重新导入"
                onClick={async () => {
                    const flag = await props.reloadModule();
                    if (flag) {
                        showMessage('导入成功', 3000);
                    }
                }}
            />
        </Rows>
    )
}
