import SettingItemWrap from "@/libs/components/item-wrap";
import InputItem from "@/libs/components/item-input";
import GroupList from './group-list';
import { configs, setConfigs } from "../../model";

const App = () => {
    return (
        <div class="config__tab-container fn__flex-1" style={{
            'font-size': '1.2rem',
            padding: '10px 20px'
        }}>
            <SettingItemWrap
                title="展示模式"
                description="选择书签栏展示的样式"
            >
                <InputItem
                    type='select'
                    key='viewMode'
                    value={configs['viewMode']}
                    changed={(v: any) => {
                        setConfigs('viewMode', v);
                    }}
                    options={{
                        'bookmark': '书签样式',
                        'card': '卡片样式'
                    }}
                />
            </SettingItemWrap>
            <SettingItemWrap
                title="隐藏关闭项目"
                description="开启后，隐藏那些来自被关闭的笔记本中的项目"
            >
                <InputItem
                    type='checkbox'
                    key='hideClosed'
                    value={configs['hideClosed']}
                    changed={(v: any) => {
                        setConfigs('hideClosed', v);
                    }}
                />
            </SettingItemWrap>
            <SettingItemWrap
                title="隐藏无效项目"
                description="开启后，隐藏那些被删除的项目"
            >
                <InputItem
                    type='checkbox'
                    key='hideDeleted'
                    value={configs['hideDeleted']}
                    changed={(v: any) => {
                        setConfigs('hideDeleted', v);
                    }}
                />
            </SettingItemWrap>
            <SettingItemWrap
                title="书签组"
                description="设置书签组"
                direction="row"
            >
                <GroupList/>
            </SettingItemWrap>
        </div>
    )
}

export default App;
