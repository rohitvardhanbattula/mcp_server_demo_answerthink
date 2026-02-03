"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const tools_js_1 = require("./tools.js");
const sapService_js_1 = require("./sapService.js");
const app = (0, express_1.default)();
app.use((0, compression_1.default)()); // Makes data transfer much faster for large SAP payloads
app.use((0, cors_1.default)());
const mcpServer = new index_js_1.Server({ name: "production-sap-mcp", version: "3.1.0" }, { capabilities: { tools: {} } });
mcpServer.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools: tools_js_1.TOOLS }));
mcpServer.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        if (name === "read_sap_data") {
            const result = await (0, sapService_js_1.genericSapRead)(String(args?.servicePath), String(args?.resourcePath), args?.parameters);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        if (name === "write_sap_data") {
            const result = await (0, sapService_js_1.genericSapWrite)(args?.method, String(args?.servicePath), String(args?.resourcePath), args?.payload);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        if (name === "inspect_metadata") {
            const result = await (0, sapService_js_1.genericSapRead)(String(args?.servicePath), "$metadata");
            const textOutput = typeof result === 'string' ? result : JSON.stringify(result);
            return { content: [{ type: "text", text: "SCHEMA START\n" + textOutput.substring(0, 15000) + "\nSCHEMA END" }] };
        }
        throw new Error(`Tool ${name} not found`);
    }
    catch (error) {
        return { content: [{ type: "text", text: `Runtime Error: ${error.message}` }], isError: true };
    }
});
let transport;
app.get('/sse', async (req, res) => {
    console.log("-> Claude connected via SSE");
    transport = new sse_js_1.SSEServerTransport('/messages', res);
    await mcpServer.connect(transport);
});
app.post('/messages', async (req, res) => {
    if (transport)
        await transport.handlePostMessage(req, res);
    else
        res.status(404).send("Session Lost");
});
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 SAP MCP Bridge active on port ${PORT}`));
