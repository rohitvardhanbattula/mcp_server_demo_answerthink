import { executeHttpRequest } from '@sap-cloud-sdk/http-client';

const DESTINATION = 'demo_destination';
const MAX_RECORDS = 100; // Prevents middleware from dropping sessions on massive reads

/**
 * Universal Reader: Hardened against timeouts and URL-encoding errors
 */
export async function genericSapRead(servicePath: string, resourcePath: string, params?: Record<string, string>) {
  const startTime = Date.now();
  try {
    const isMetadata = resourcePath === '$metadata';
    const isSingleRecord = resourcePath.includes('(');
    const queryParams = new URLSearchParams();

    // 1. STABILITY GUARD: Strip forbidden query options for single records and cap collections
    if (params) {
      const forbiddenForSingle = ['$top', '$skip', '$orderby', '$inlinecount', '$skiptoken'];
      for (const [key, value] of Object.entries(params)) {
        if (isSingleRecord && forbiddenForSingle.includes(key)) continue;
        queryParams.append(key, value);
      }
    }

    if (!isMetadata) {
      if (!queryParams.has('$format')) queryParams.set('$format', 'json');
      // Enforce MAX_RECORDS only for collections to prevent middleware drops
      if (!isSingleRecord) {
        const top = parseInt(queryParams.get('$top') || '50');
        if (top > MAX_RECORDS) queryParams.set('$top', MAX_RECORDS.toString());
      }
    }

    const queryString = queryParams.toString();
    const finalUrl = `${servicePath}/${resourcePath}${queryString ? `?${queryString}` : ''}`;
    console.log(`[READ] Executing: ${finalUrl}`);

    const response = await executeHttpRequest(
      { destinationName: DESTINATION },
      {
        method: 'get',
        url: finalUrl,
        timeout: 90000, // Increased to 90s for resilience
        headers: {
          'Accept': isMetadata ? 'application/xml, */*' : 'application/json'
        }
      }
    );

    console.log(`[PERF] Response in ${Date.now() - startTime}ms`);
    return response.data;
  } catch (error: any) {
    const status = error.response?.status;
    const details = error.response?.data?.error?.message?.value || error.message;
    console.error(`[READ ERROR] Status: ${status} - ${details}`);
    return { error: details, status };
  }
}

/**
 * Universal Writer: Conditional ETag handling to prevent 501 errors
 */
export async function genericSapWrite(method: 'post' | 'patch' | 'delete', servicePath: string, resourcePath: string, payload: any) {
  try {
    console.log(`[${method.toUpperCase()}] Target: ${resourcePath}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // FIX: Only apply If-Match for PATCH/DELETE. Including it in POST causes 501 errors.
    if (method === 'patch' || method === 'delete') {
      headers['If-Match'] = '*';
    }

    const response = await executeHttpRequest(
      { destinationName: DESTINATION },
      {
        method: method,
        url: `${servicePath}/${resourcePath}`,
        data: payload,
        headers: headers,
        csrfProtection: true, // Automates the security handshake
        timeout: 60000
      }
    );
    return response.data || { status: "Success", code: response.status };
  } catch (error: any) {
    const status = error.response?.status;
    const details = error.response?.data?.error?.message?.value || error.message;
    console.error(`[WRITE ERROR] Status: ${status} - ${details}`);
    return { error: details, status };
  }
}