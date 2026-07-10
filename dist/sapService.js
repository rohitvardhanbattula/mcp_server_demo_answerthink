import { executeHttpRequest } from '@sap-cloud-sdk/http-client';
export const DESTINATION_NAME = 'demo_destination';
const DESTINATION = DESTINATION_NAME;
export async function genericSapRead(servicePath, resourcePath, params) {
    try {
        const response = await executeHttpRequest({ destinationName: DESTINATION }, {
            method: 'get',
            url: `${servicePath}/${resourcePath}`,
            params: { ...params, '$format': 'json' },
            timeout: 45000,
            headers: { 'Accept': 'application/json' }
        });
        return { success: true, data: response.data };
    }
    catch (error) {
        return { success: false, error: error.response?.data?.error?.message?.value || error.message };
    }
}
// Lightweight EDMX parser: pulls just what an agent needs to construct a
// correct $select/$filter (property names + types) without dragging in a
// full XML parser dependency. SAP $metadata is always XML, never JSON, so
// this intentionally does NOT go through genericSapRead's $format=json path.
function parseEdmx(xml) {
    const entityTypes = {};
    const entityTypeBlocks = xml.matchAll(/<EntityType\b([^>]*)>([\s\S]*?)<\/EntityType>/g);
    for (const block of entityTypeBlocks) {
        const attrs = block[1];
        const body = block[2];
        const nameMatch = attrs.match(/Name="([^"]+)"/);
        if (!nameMatch)
            continue;
        const name = nameMatch[1];
        const key = [...body.matchAll(/<PropertyRef\s+Name="([^"]+)"/g)].map(m => m[1]);
        const properties = [...body.matchAll(/<Property\b([^>]*)\/>/g)].map(m => {
            const a = m[1];
            const get = (attr) => a.match(new RegExp(`${attr}="([^"]*)"`))?.[1];
            return {
                name: get('Name') || '',
                type: get('Type') || '',
                nullable: get('Nullable') !== 'false',
                label: get('sap:label')
            };
        });
        const navigationProperties = [...body.matchAll(/<NavigationProperty\b([^>]*)\/>/g)].map(m => {
            const a = m[1];
            const get = (attr) => a.match(new RegExp(`${attr}="([^"]*)"`))?.[1];
            return { name: get('Name') || '', relationship: get('Relationship') || '' };
        });
        entityTypes[name] = { name, key, properties, navigationProperties };
    }
    const entitySets = [...xml.matchAll(/<EntitySet\b([^>]*)\/>/g)].map(m => {
        const a = m[1];
        const get = (attr) => a.match(new RegExp(`${attr}="([^"]*)"`))?.[1];
        const entityTypeFull = get('EntityType') || '';
        return { name: get('Name') || '', entityType: entityTypeFull.split('.').pop() || entityTypeFull };
    });
    const functionImports = [...xml.matchAll(/<FunctionImport\b([^>]*?)(?:\/>|>[\s\S]*?<\/FunctionImport>)/g)].map(m => {
        const a = m[1];
        const get = (attr) => a.match(new RegExp(`${attr}="([^"]*)"`))?.[1];
        return { name: get('Name') || '', httpMethod: get('m:HttpMethod') || 'GET' };
    });
    return { entitySets, entityTypes: Object.values(entityTypes), functionImports };
}
export async function genericSapMetadata(servicePath) {
    try {
        const response = await executeHttpRequest({ destinationName: DESTINATION }, {
            method: 'get',
            url: `${servicePath}/$metadata`,
            timeout: 45000,
            headers: { 'Accept': 'application/xml' }
        });
        const xml = typeof response.data === 'string' ? response.data : String(response.data);
        return { success: true, data: parseEdmx(xml) };
    }
    catch (error) {
        return { success: false, error: error.response?.data?.error?.message?.value || error.message };
    }
}
export async function genericSapWrite(method, servicePath, resourcePath, payload) {
    try {
        const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
        if (method !== 'post')
            headers['If-Match'] = '*';
        const response = await executeHttpRequest({ destinationName: DESTINATION }, {
            method: method,
            url: `${servicePath}/${resourcePath}`,
            data: payload,
            headers: headers,
            csrfProtection: true,
            timeout: 45000
        });
        return { success: true, data: response.data || { status: "Success", code: response.status } };
    }
    catch (error) {
        return { success: false, error: error.response?.data?.error?.message?.value || error.message };
    }
}
