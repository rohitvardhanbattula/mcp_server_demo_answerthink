import { executeHttpRequest } from '@sap-cloud-sdk/http-client';

const DESTINATION = 'demo_destination';

export async function genericSapRead(servicePath: string, resourcePath: string, params?: Record<string, string>) {
  try {
    const response = await executeHttpRequest(
      { destinationName: DESTINATION },
      {
        method: 'get',
        url: `${servicePath}/${resourcePath}`,
        params: { ...params, '$format': 'json' },
        timeout: 45000,
        headers: { 'Accept': 'application/json' }
      }
    );
    return { success: true, data: response.data };
  } catch (error: any) {
    return { success: false, error: error.response?.data?.error?.message?.value || error.message };
  }
}

export async function genericSapWrite(method: 'post' | 'patch' | 'delete', servicePath: string, resourcePath: string, payload: any) {
  try {
    const headers: Record<string, string> = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (method !== 'post') headers['If-Match'] = '*';

    const response = await executeHttpRequest(
      { destinationName: DESTINATION },
      {
        method: method,
        url: `${servicePath}/${resourcePath}`,
        data: payload,
        headers: headers,
        csrfProtection: true,
        timeout: 45000
      }
    );
    return { success: true, data: response.data || { status: "Success", code: response.status } };
  } catch (error: any) {
    return { success: false, error: error.response?.data?.error?.message?.value || error.message };
  }
}