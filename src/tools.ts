export const TOOLS = [
  {
    name: "list_available_services",
    description: "DISCOVERY: Fetches OData services available in the SAP system.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "read_sap_data",
    description: "READ: Fetch data from SAP. Example: servicePath='/sap/opu/odata/sap/API_PURCHASEORDER', resourcePath='A_PurchaseOrder'",
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