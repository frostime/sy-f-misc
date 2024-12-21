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


export function createSimpleContext<T>() {
    const context = createContext<T>();

    const SimpleProvider: ParentComponent<{
        children: JSX.Element;
        state: T;
    }> = (props) => {

        return (
            <context.Provider value={props.state}>
                {props.children}
            </context.Provider>
        );
    };

    const useSimpleContext = () => {
        const runtime = useContext(context);
        if (runtime === undefined) {
            throw new Error("useSimpleContext must be used within a SimpleProvider");
        }
        return runtime;
    };

    return {
        SimpleProvider,
        useSimpleContext
    };

}

