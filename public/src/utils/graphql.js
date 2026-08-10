"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphqlRequest = graphqlRequest;
exports.gql = gql;
async function graphqlRequest(options) {
    const { url, query, variables, headers, signal, throwOnError = true } = options;
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(headers || {}),
        },
        body: JSON.stringify({ query, variables }),
        signal,
    });
    const text = await resp.text();
    let json;
    try {
        json = text ? JSON.parse(text) : {};
    }
    catch (e) {
        // Non-JSON response
        const err = {
            message: `Invalid JSON response (${resp.status}): ${text?.slice(0, 256)}`,
        };
        if (throwOnError)
            throw Object.assign(new Error(err.message), { response: resp });
        return { errors: [err] };
    }
    // GraphQL spec: payload is 200 OK with possible errors[]
    if (!resp.ok) {
        const message = json?.error || json?.message || `HTTP ${resp.status}`;
        const err = { message };
        if (throwOnError)
            throw Object.assign(new Error(message), { response: resp, body: json });
        return { errors: [err] };
    }
    if (json?.errors && json.errors.length > 0) {
        if (throwOnError) {
            const message = json.errors
                .map((e) => e?.message)
                .filter(Boolean)
                .join('; ');
            throw Object.assign(new Error(message || 'GraphQL error'), {
                response: resp,
                errors: json.errors,
            });
        }
        return { errors: json.errors };
    }
    return { data: json?.data };
}
// Convenience: template literal tag for inline queries
function gql(strings, ...expr) {
    let result = '';
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < expr.length)
            result += String(expr[i]);
    }
    return result;
}
