export declare const DESTINATION_NAME = "demo_destination";
export declare function genericSapRead(servicePath: string, resourcePath: string, params?: Record<string, string>): Promise<{
    success: boolean;
    data: any;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    data?: undefined;
}>;
export declare function genericSapMetadata(servicePath: string): Promise<{
    success: boolean;
    data: {
        entitySets: {
            name: string;
            entityType: string;
        }[];
        entityTypes: {
            name: string;
            key: string[];
            properties: {
                name: string;
                type: string;
                nullable: boolean;
                label?: string;
            }[];
            navigationProperties: {
                name: string;
                relationship: string;
            }[];
        }[];
        functionImports: {
            name: string;
            httpMethod: string;
        }[];
    };
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
