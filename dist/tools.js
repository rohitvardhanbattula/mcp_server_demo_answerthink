export const TOOLS = [
    {
        name: "list_available_services",
        description: "DISCOVERY: Fetches OData services available in the SAP system.",
        inputSchema: { type: "object", properties: {} }
    },
    {
        name: "get_service_metadata",
        description: "BIND: Fetch the $metadata (entity sets, properties, field names/types) for a specific SAP OData service. ALWAYS call this before read_sap_data or write_sap_data on a service you haven't queried yet in this conversation - it tells you the real field names to use in resourcePath/$select/$filter, instead of guessing.",
        inputSchema: {
            type: "object",
            properties: {
                servicePath: { type: "string", description: "e.g. '/sap/opu/odata/sap/API_PURCHASEORDER' or a path returned by list_available_services" }
            },
            required: ["servicePath"]
        }
    },
    {
        name: "read_sap_data",
        description: "READ: Fetch data from SAP. Example: servicePath='/sap/opu/odata/sap/API_PURCHASEORDER', resourcePath='A_PurchaseOrder'. Field names in $select/$filter must come from get_service_metadata for this service - do not guess them.",
        inputSchema: {
            type: "object",
            properties: {
                servicePath: { type: "string" },
                resourcePath: { type: "string" },
                parameters: { type: "object", description: "OData params like $top, $filter" }
            },
            required: ["servicePath", "resourcePath"]
        }
    },
    {
        name: "write_sap_data",
        description: "WRITE: Create (post), Update (patch), or Delete records.",
        inputSchema: {
            type: "object",
            properties: {
                method: { type: "string", enum: ["post", "patch", "delete"] },
                servicePath: { type: "string" },
                resourcePath: { type: "string" },
                payload: { type: "object" }
            },
            required: ["method", "servicePath", "resourcePath"]
        }
    }
];
