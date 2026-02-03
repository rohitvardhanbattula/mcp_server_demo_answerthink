"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOLS = void 0;
exports.TOOLS = [
    {
        name: "read_sap_data",
        description: "Read data from SAP. IMPORTANT: SAP is case-sensitive (use 'City' not 'city'). If filtering on many-to-one relations fails, query the child entity directly. Always use $select for speed.",
        inputSchema: {
            type: "object",
            properties: {
                servicePath: { type: "string", description: "Base OData path (e.g., /sap/opu/odata/sap/API_BUSINESS_PARTNER)" },
                resourcePath: { type: "string", description: "EntitySet or specific ID (e.g., 'A_BusinessPartner' or 'A_BusinessPartner(\'1001\')')" },
                parameters: {
                    type: "object",
                    description: "OData query options: $filter, $select, $top, $expand"
                }
            },
            required: ["servicePath", "resourcePath"]
        }
    },
    {
        name: "write_sap_data",
        description: "Post, Patch, or Delete data. Requires a JSON payload.",
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
    },
    {
        name: "inspect_metadata",
        description: "Retrieve the technical $metadata to check correct field casing and relationships.",
        inputSchema: {
            type: "object",
            properties: { servicePath: { type: "string" } },
            required: ["servicePath"]
        }
    }
];
