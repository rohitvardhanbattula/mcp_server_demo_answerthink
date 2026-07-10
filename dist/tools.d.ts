export declare const TOOLS: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            servicePath?: undefined;
            resourcePath?: undefined;
            parameters?: undefined;
            method?: undefined;
            payload?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            servicePath: {
                type: string;
                description: string;
            };
            resourcePath?: undefined;
            parameters?: undefined;
            method?: undefined;
            payload?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            servicePath: {
                type: string;
                description?: undefined;
            };
            resourcePath: {
                type: string;
            };
            parameters: {
                type: string;
                description: string;
            };
            method?: undefined;
            payload?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            method: {
                type: string;
                enum: string[];
            };
            servicePath: {
                type: string;
                description?: undefined;
            };
            resourcePath: {
                type: string;
            };
            payload: {
                type: string;
            };
            parameters?: undefined;
        };
        required: string[];
    };
})[];
