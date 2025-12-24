export function convertJsonToTs(json, interfaceName = "Root") {
    try {
        if (Array.isArray(json)) {
            const typeStr = determineType(json);
            if (typeStr.startsWith("object")) {
                const depth = calculateArrayDepth(json);
                let baseObj = json;
                for (let i = 0; i < depth; i++) baseObj = baseObj[0];

                if (typeof baseObj === "object" && baseObj !== null && !Array.isArray(baseObj)) {
                    const childName = capitalize(pluralToSingular(interfaceName));
                    const effectiveChildName = childName === interfaceName ? `${interfaceName}Element` : childName;
                    const nested = parseObject(baseObj, effectiveChildName);
                    const brackets = typeStr.substring("object".length);
                    return `type ${interfaceName} = ${effectiveChildName}${brackets};\n\n${nested}`;
                }
            }
            return `type ${interfaceName} = ${typeStr};`;
        }
        return parseObject(json, interfaceName);
    }
    catch (error) {
        if (error instanceof Error &&
            error.message.startsWith("Circular reference detected")) {
            throw error; // Re-throw circular reference errors directly
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Error converting JSON to TypeScript: ${errorMessage}`);
    }
}
function determineType(value) {
    if (Array.isArray(value)) {
        if (value.length === 0)
            return "any[]"; // Explicitly handle empty arrays

        const depth = calculateArrayDepth(value);
        let current = value;
        for (let i = 0; i < depth; i++) current = current[0];

        if (Array.isArray(current)) {
            return `any${"[]".repeat(depth + 1)}`;
        }

        const baseType = determineType(current);
        return `${baseType}${"[]".repeat(depth)}`;
    }
    else if (value === null || value === undefined) {
        return "any"; // Null or undefined maps to `any`
    }
    else if (typeof value === "string" && isISODate(value)) {
        return "Date"; // ISO date strings map to `Date`
    }
    else if (typeof value === "object") {
        return "object"; // Generic object type
    }
    return typeof value; // Fallback to primitive JavaScript types
}
function isISODate(value) {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    return isoDateRegex.test(value);
}
function calculateArrayDepth(arr) {
    let depth = 0;
    while (Array.isArray(arr) && arr.length > 0) {
        depth++;
        arr = arr[0];
    }
    return depth;
}
function pluralToSingular(name) {
    if (name.endsWith("ies"))
        return name.slice(0, -3) + "y";
    if (name.endsWith("s"))
        return name.slice(0, -1);
    return name;
}
function capitalize(name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
}
function formatKeysToOptional(content, optionalKeys) {
    let result = JSON.stringify(content, null, 2)
        .replace(/"/g, "")
        .replace(/,/g, "");
    Object.keys(content).forEach((key) => {
        const keyRegex = new RegExp(`${key}:`, "g");
        result = optionalKeys.includes(key)
            ? result.replace(keyRegex, `${key}?:`)
            : result.replace(keyRegex, `${key}:`);
    });
    return result;
}
function parseObject(obj, parentName = "Root", seen = new Set(), rootName = parentName // To track root for circular references
) {
    if (seen.has(obj)) {
        throw new Error(`Circular reference detected in ${rootName}`);
    }
    seen.add(obj);
    const optionalKeys = [];
    const nestedInterfaces = [];
    const parsedObject = {};
    Object.entries(obj).forEach(([key, value]) => {
        if (value === null || value === undefined) {
            optionalKeys.push(key); // Mark key as optional
        }

        if (Array.isArray(value)) {
            const depth = calculateArrayDepth(value);
            let current = value;
            for (let i = 0; i < depth; i++) current = current[0];

            const brackets = "[]".repeat(depth);
            if (Array.isArray(current)) {
                // Empty array at depth
                parsedObject[key] = `any${brackets}[];`;
            } else {
                const baseType = determineType(current);
                if (baseType === "object" && current !== null) {
                    const childName = capitalize(pluralToSingular(key));
                    nestedInterfaces.push(parseObject(current, childName, seen, rootName));
                    parsedObject[key] = `${childName}${brackets};`;
                } else {
                    parsedObject[key] = `${baseType}${brackets};`;
                }
            }
        }
        else {
            const fieldType = determineType(value);
            if (fieldType === "object" && value !== null && typeof value === "object") {
                const childName = capitalize(pluralToSingular(key));
                nestedInterfaces.push(parseObject(value, childName, seen, rootName));
                parsedObject[key] = `${childName};`;
            }
            else {
                parsedObject[key] = `${fieldType};`;
            }
        }
    });
    seen.delete(obj);
    const formattedContent = formatKeysToOptional(parsedObject, optionalKeys);
    return `interface ${parentName} ${formattedContent}

${nestedInterfaces.join("\n")}`;
}

