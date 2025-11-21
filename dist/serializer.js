/*MIT License

Copyright (c) 2025 Anthropic, PBC
Modified work Copyright (c) 2025 DanNsk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
/**
 * Check if a string needs to be quoted in TOON format
 */
function needsQuoting(value, delimiter = ',') {
    // Empty string
    if (value === '')
        return true;
    // Leading or trailing whitespace
    if (value !== value.trim())
        return true;
    // Matches literals
    if (value === 'true' || value === 'false' || value === 'null')
        return true;
    // Looks numeric (integers, decimals, scientific notation, leading zeros)
    if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value) || /^0\d/.test(value))
        return true;
    // Contains structural characters
    if (/[:\"\\\[\]\{\}]/.test(value))
        return true;
    // Contains control characters (newline, carriage return, tab)
    if (/[\n\r\t]/.test(value))
        return true;
    // Contains the active delimiter
    if (value.includes(delimiter))
        return true;
    // Equals "-" or starts with hyphen followed by space
    if (value === '-' || value.startsWith('- '))
        return true;
    return false;
}
/**
 * Escape a string value for TOON format
 * Only these escape sequences are allowed: \\, \", \n, \r, \t
 */
function escapeToonString(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}
/**
 * Encode a primitive value for TOON format
 */
function encodeToonPrimitive(value, delimiter = ',') {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
        if (Number.isNaN(value) || !Number.isFinite(value)) {
            return 'null';
        }
        return String(value);
    }
    if (typeof value === 'string') {
        if (needsQuoting(value, delimiter)) {
            return `"${escapeToonString(value)}"`;
        }
        return value;
    }
    // For other types, convert to string
    return encodeToonPrimitive(String(value), delimiter);
}
/**
 * Check if an array is uniform (all objects with same keys)
 */
function isUniformObjectArray(arr) {
    if (arr.length === 0)
        return false;
    // Check if first element is an object
    const first = arr[0];
    if (typeof first !== 'object' || first === null || Array.isArray(first)) {
        return false;
    }
    const keys = Object.keys(first).sort().join(',');
    // Check if all elements have the same keys and primitive values
    return arr.every(item => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return false;
        }
        const itemKeys = Object.keys(item).sort().join(',');
        if (itemKeys !== keys)
            return false;
        // Check all values are primitives (for tabular format)
        return Object.values(item).every(v => v === null ||
            typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean');
    });
}
/**
 * Check if an array contains only primitive values
 */
function isPrimitiveArray(arr) {
    return arr.every(item => item === null ||
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean');
}
/**
 * Convert a value to TOON format
 */
function toToon(value, indent = 0, key) {
    const indentStr = '  '.repeat(indent);
    const delimiter = ',';
    // Handle null/undefined
    if (value === null || value === undefined) {
        return key ? `${indentStr}${key}: null` : 'null';
    }
    // Handle primitives
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        const encoded = encodeToonPrimitive(value, delimiter);
        return key ? `${indentStr}${key}: ${encoded}` : encoded;
    }
    // Handle arrays
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return key ? `${indentStr}${key}[0]:` : '[0]:';
        }
        // Check for uniform object array (tabular format)
        if (isUniformObjectArray(value)) {
            const fields = Object.keys(value[0]);
            const header = key
                ? `${indentStr}${key}[${value.length}]{${fields.join(delimiter)}}:`
                : `[${value.length}]{${fields.join(delimiter)}}:`;
            const rows = value.map(item => {
                const values = fields.map(field => encodeToonPrimitive(item[field], delimiter));
                return `${indentStr}  ${values.join(delimiter)}`;
            });
            return [header, ...rows].join('\n');
        }
        // Check for primitive array (inline format)
        if (isPrimitiveArray(value)) {
            const items = value.map(item => encodeToonPrimitive(item, delimiter)).join(delimiter);
            return key
                ? `${indentStr}${key}[${value.length}]: ${items}`
                : `[${value.length}]: ${items}`;
        }
        // Complex array with mixed types or nested objects
        const header = key
            ? `${indentStr}${key}[${value.length}]:`
            : `[${value.length}]:`;
        const items = value.map(item => {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                // Object in array - use hyphen notation
                const obj = item;
                const keys = Object.keys(obj);
                if (keys.length === 0) {
                    return `${indentStr}  -`;
                }
                const lines = [];
                keys.forEach((k, i) => {
                    if (i === 0) {
                        // First field on hyphen line
                        const val = obj[k];
                        if (typeof val === 'object' && val !== null) {
                            lines.push(`${indentStr}  - ${k}:`);
                            lines.push(toToon(val, indent + 2));
                        }
                        else {
                            lines.push(`${indentStr}  - ${k}: ${encodeToonPrimitive(val, delimiter)}`);
                        }
                    }
                    else {
                        // Remaining fields at indent + 2
                        const val = obj[k];
                        if (typeof val === 'object' && val !== null) {
                            lines.push(`${indentStr}    ${k}:`);
                            lines.push(toToon(val, indent + 3));
                        }
                        else {
                            lines.push(`${indentStr}    ${k}: ${encodeToonPrimitive(val, delimiter)}`);
                        }
                    }
                });
                return lines.join('\n');
            }
            else {
                // Primitive or array in array
                return `${indentStr}  - ${toToon(item, 0)}`;
            }
        });
        return [header, ...items].join('\n');
    }
    // Handle objects
    if (typeof value === 'object') {
        const obj = value;
        const keys = Object.keys(obj);
        if (keys.length === 0) {
            return key ? `${indentStr}${key}:` : '';
        }
        const lines = [];
        if (key) {
            lines.push(`${indentStr}${key}:`);
        }
        const childIndent = key ? indent + 1 : indent;
        keys.forEach(k => {
            const val = obj[k];
            if (typeof val === 'object' && val !== null) {
                lines.push(toToon(val, childIndent, k));
            }
            else {
                const childIndentStr = '  '.repeat(childIndent);
                lines.push(`${childIndentStr}${k}: ${encodeToonPrimitive(val, delimiter)}`);
            }
        });
        return lines.join('\n');
    }
    // Fallback
    return String(value);
}
/**
 * Serialize data to TOON format
 */
export function serializeToToon(data) {
    return toToon(data);
}
/**
 * Serialize data to JSON format (pretty-printed)
 */
export function serializeToJson(data) {
    return JSON.stringify(data, null, 2);
}
/**
 * Serialize data based on format
 */
export function serialize(data, format) {
    switch (format) {
        case 'toon':
            return serializeToToon(data);
        case 'json':
        default:
            return serializeToJson(data);
    }
}
/**
 * Get format description for tool documentation
 */
export function getFormatDescription(format) {
    switch (format) {
        case 'toon':
            return 'TOON (Token-Oriented Object Notation) - a compact format optimized for LLMs. ' +
                'Escaping: Use \\\\ for backslash, \\" for quote, \\n for newline, \\r for carriage return, \\t for tab. ' +
                'Strings are auto-quoted when containing special characters (: " \\ [ ] { } ,) or matching literals (true/false/null).';
        case 'json':
        default:
            return 'JSON format with 2-space indentation.';
    }
}
//# sourceMappingURL=serializer.js.map