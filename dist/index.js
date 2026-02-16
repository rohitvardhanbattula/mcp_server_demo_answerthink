"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const passport_1 = __importDefault(require("passport"));
const xsenv_1 = require("@sap/xsenv");
const xsenv_2 = __importDefault(require("@sap/xsenv"));
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const tools_js_1 = require("./tools.js");
const sapService_js_1 = require("./sapService.js");
const app = (0, express_1.default)();
app.use((0, compression_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const services = xsenv_2.default.getServices({ uaa: { tag: 'xsuaa' } });
passport_1.default.use(new xsenv_1.JWTStrategy(services.uaa));
app.use(passport_1.default.initialize());
const authMiddleware = passport_1.default.authenticate('JWT', { session: false });
const mcpServer = new index_js_1.Server({ name: "hardened-sap-mcp", version: "4.1.0" }, { capabilities: { tools: {} } });
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
        if (name === "list_available_services") {
            const result = await (0, sapService_js_1.genericSapRead)("/sap/opu/odata/IWFND/CATALOGSERVICE", "ServiceCollection", { "$top": "50", "$select": "TechnicalName,Title" });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        throw new Error(`Tool not found: ${name}`);
    }
    catch (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
});
let transport;
app.get('/sse', authMiddleware, async (req, res) => {
    transport = new sse_js_1.SSEServerTransport('/messages', res);
    await mcpServer.connect(transport);
});
app.post('/messages', authMiddleware, async (req, res) => {
    if (transport) {
        await transport.handlePostMessage(req, res);
    }
    else {
        res.status(404).send("Session Expired");
    }
});
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`MCP Server started on port ${port}`);
});
