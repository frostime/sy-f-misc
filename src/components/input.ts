/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-25 14:17:28
 * @FilePath     : /src/components/input.ts
 * @LastEditTime : 2024-03-25 14:25:11
 * @Description  : 
 */
export const textInput = (value: string) => {
    let textInputElement: HTMLInputElement = document.createElement('input');
    textInputElement.className = 'b3-text-field fn__flex-center fn__size200';
    textInputElement.value = value;
    return textInputElement
}

export const numberInput = (value: number) => {
    let numberInputElement: HTMLInputElement = document.createElement('input');
    numberInputElement.className = 'b3-text-field fn__flex-center fn__size200';
    numberInputElement.type = 'number';
    numberInputElement.value = value.toString();
    return numberInputElement
}

export const textArea = (value: string) => {
    let textareaElement: HTMLTextAreaElement = document.createElement('textarea');
    textareaElement.className = "b3-text-field fn__block";
    textareaElement.value = value;
    return textareaElement
}

export const button = (label: string, callback: () => void) => {
    let buttonElement: HTMLButtonElement = document.createElement('button');
    buttonElement.className = "b3-button b3-button--outline fn__flex-center fn__size200";
    buttonElement.innerText = label;
    buttonElement.onclick = callback;
    return buttonElement
}

export const checkbox = (value: boolean) => {
    let element: HTMLInputElement = document.createElement('input');
    element.type = 'checkbox';
    element.checked = value;
    element.className = "b3-switch fn__flex-center";
    return element
}

export const select = (options: { [key: string]: string }, value?: string) => {
    let selectElement: HTMLSelectElement = document.createElement('select');
    selectElement.className = "b3-select fn__flex-center fn__size200";
    for (let val in options) {
        let optionElement = document.createElement('option');
        let text = options[val];
        optionElement.value = val;
        optionElement.text = text;
        selectElement.appendChild(optionElement);
    }
    if (value !== undefined) {
        selectElement.value = value;
    }
    return selectElement
}

export const slider = (min: number, max: number, step: number, value: number) => {
    let sliderElement: HTMLInputElement = document.createElement('input');
    sliderElement.type = 'range';
    sliderElement.className = 'b3-slider fn__size200 b3-tooltips b3-tooltips__n';
    sliderElement.ariaLabel = value.toString();
    sliderElement.min = min.toString();
    sliderElement.max = max.toString();
    sliderElement.step = step.toString();
    sliderElement.value = value.toString();
    sliderElement.onchange = () => {
        sliderElement.ariaLabel = sliderElement.value;
    }
    return sliderElement
}

