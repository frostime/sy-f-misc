import { SettingGroupsPanel} from './components/setting-panels';

const generalSetting: ISettingItem[] = [
    {
        type: 'checkbox',
        title: 'Checkbox',
        description: 'This is a checkbox',
        key: 'checkboxKey',
        value: true
    },
    {
        type: 'textinput',
        title: 'Text Input',
        description: 'This is a text input',
        key: 'textInputKey',
        value: 'Default text',
        placeholder: 'Enter text'
    },
    {
        type: 'select',
        title: 'Select',
        description: 'This is a select dropdown',
        key: 'selectKey',
        value: 'option1',
        options: {
            'option1': 'Option 1',
            'option2': 'Option 2',
            'option3': 'Option 3'
        }
    },
    {
        type: 'slider',
        title: 'Slider',
        description: 'This is a slider',
        key: 'sliderKey',
        value: 50,
        slider: {
            min: 0,
            max: 100,
            step: 1
        }
    }
];

const group2: ISettingItem[] = [
    {
        type: 'checkbox',
        title: '测试检测',
        description: 'This is a checkbox',
        key: 'checkboxKey',
        value: false
    }
];

export const initSettingUI = () => {
    const settingDialog = new SettingGroupsPanel();
    settingDialog.addGroup('General Settings', generalSetting);
    settingDialog.addGroup('Group 2', group2);
    settingDialog.render();

    settingDialog.bindChangedEvent(({ group, key, value }) => {
        console.log(`Group: ${group}, Key: ${key}, Value: ${value}`);
    });
    settingDialog.bindButtonClickEvent(({ key }) => {
        console.log(`Button clicked: ${key}`);
    });

    return settingDialog;
}

