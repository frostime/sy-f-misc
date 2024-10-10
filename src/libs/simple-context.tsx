import { createContext, useContext, ParentComponent, JSX } from "solid-js";
// import { createStore } from "solid-js/store";

const defaultState: Record<string, any> = {};

const SimpleContext = createContext<Record<string, any>>(defaultState);

export const SimpleContextProvider: ParentComponent<{
    children: JSX.Element;
    state: Record<string, any>;
}> = (props) => {
    // const [state, _] = createStore(defaultState);

    return (
        <SimpleContext.Provider value={props.state}>
            {props.children}
        </SimpleContext.Provider>
    );
};

export const useSimpleContext = () => useContext(SimpleContext);
