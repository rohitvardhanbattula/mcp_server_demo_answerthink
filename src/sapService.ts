import { executeHttpRequest } from '@sap-cloud-sdk/http-client';

const DESTINATION = 'demo_destination';

/**
 * Universal Reader: Optimized for URL safety, speed, and OData compliance.
 */
export async function genericSapRead(servicePath: string, resourcePath: string, params?: Record<string, string>) {
  const startTime = Date.now();
  try {
    const isMetadata = resourcePath === '$metadata';
    const isSingleRecord = resourcePath.includes('('); // Detects key-based access like A_BusinessPartner('123')

    // Use URLSearchParams for bulletproof encoding
    const queryParams = new URLSearchParams();
    
    if (params) {
      const forbiddenForSingle = ['$top', '$skip', '$orderby', '$inlinecount', '$skiptoken'];
      for (const [key, value] of Object.entries(params)) {
        // CLEANUP: Strip options forbidden for single record instances
        if (isSingleRecord && forbiddenForSingle.includes(key)) continue;
        queryParams.append(key, value);
      }
    }

    // Performance protection: Force JSON and default $top for collections
    if (!isMetadata) {
      if (!queryParams.has('$format')) queryParams.set('$format', 'json');
      // Only set default $top if it's NOT a single record request
      if (!isSingleRecord && !queryParams.has('$top')) queryParams.set('$top', '10'); 
    }

    const queryString = queryParams.toString();
    const finalUrl = `${servicePath}/${resourcePath}${queryString ? `?${queryString}` : ''}`;

    console.log(`[READ] Requesting: ${finalUrl}`);

    const response = await executeHttpRequest(
      { destinationName: DESTINATION },
      {
        method: 'get',
        url: finalUrl,
        headers: {
          'Accept': isMetadata ? 'application/xml, */*' : 'application/json'
        }
      }
    );

    const duration = Date.now() - startTime;
    console.log(`[PERF] SAP Response received in ${duration}ms`);
    
    return response.data;
  } catch (error: any) {
    const status = error.response?.status;
    const details = error.response?.data?.error?.message?.value || error.message;
    console.error(`[READ ERROR] Status: ${status} - ${details}`);
    return { error: details, status, tip: "Verify casing (City vs city) or query logic." };
  }
}

/**
 * Universal Writer: Optimized for CSRF and data integrity.
 */
export async function genericSapWrite(method: 'post' | 'patch' | 'delete', servicePath: string, resourcePath: string, payload: any) {
  try {
    console.log(`[${method.toUpperCase()}] Target: ${resourcePath}`);
    const response = await executeHttpRequest(
      { destinationName: DESTINATION },
      {
        method: method,
        url: `${servicePath}/${resourcePath}`,
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        csrfProtection: true 
      }
    );
    return response.data || { status: "Success", code: response.status };
  } catch (error: any) {
    console.error(`[WRITE ERROR] ${error.message}`);
    return { error: error.message, details: error.response?.data };
  }
}