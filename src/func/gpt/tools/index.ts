/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-11 16:59:06
 * @FilePath     : /src/func/gpt/tools/index.ts
 * @LastEditTime : 2025-05-11 20:02:03
 * @Description  :
 */
// 导出类型和工具执行器
export * from './types';
export { ToolExecutor } from './executor';

// 导出审核UI组件和适配器
export {
    ToolExecutionApprovalUI,
    ToolResultApprovalUI,
    ChatUIAdapter,
    ChatInDocUIAdapter,
    DefaultUIAdapter
} from './approval-ui';

// 导入工具
import { ToolExecutor } from './executor';
import fetchTool from './fetch';
import * as utilsTools from './utils';



export const toolExecutorFactory = () => {
    // 注册工具
    const toolExecutor = new ToolExecutor();
    toolExecutor.registerTool(fetchTool);
    toolExecutor.registerToolModule(utilsTools);
    return toolExecutor;
}

