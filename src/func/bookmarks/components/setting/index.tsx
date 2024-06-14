import SettingItemWrap from "@/libs/components/item-wrap";
import GroupList from './group-list';

const App = () => {
    return (
        <div class="config__tab-container fn__flex-1" style={{
            'font-size': '1.2rem',
            padding: '10px 20px'
        }}>
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
