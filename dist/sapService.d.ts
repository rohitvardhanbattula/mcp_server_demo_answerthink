export declare function genericSapRead(servicePath: string, resourcePath: string, params?: Record<string, string>): Promise<{
    success: boolean;
    data: any;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
export declare function genericSapWrite(method: 'post' | 'patch' | 'delete', servicePath: string, resourcePath: string, payload: any): Promise<{
    success: boolean;
    data: any;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
