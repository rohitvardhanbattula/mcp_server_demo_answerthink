"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOLS = void 0;
exports.TOOLS = [
    {
        name: "list_available_services",
        description: "Search the SAP Service Catalog. Use this FIRST to verify service paths and prevent guessing non-existent APIs.",
        inputSchema: { type: "object", properties: {} }
    },
    {
        name: "read_sap_data",
        description: "Read SAP data. Limits to 100 records per call. Always use $select for faster performance.",
        inputSchema: {
            type: "object",
            properties: {
                servicePath: { type: "string" },
                resourcePath: { type: "string" },
                parameters: { type: "object" }
            },
            required: ["servicePath", "resourcePath"]
        }
    },
    {
        name: "write_sap_data",
        description: "Create, Update, or Delete SAP records. Automatically handles CSRF and ETag logic based on the HTTP method.",
        inputSchema: {
            type: "object",
            properties: {
                method: { type: "string", enum: ["post", "patch", "delete"] },
                servicePath: { type: "string" },
                resourcePath: { type: "string" },
                payload: { type: "object" }
            },
            required: ["method", "servicePath", "resourcePath", "payload"]
        }
    }
];
