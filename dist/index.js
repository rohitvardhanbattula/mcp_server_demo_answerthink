"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const passport_1 = __importDefault(require("passport"));
const xsenv_1 = __importDefault(require("@sap/xsenv"));
const xssec = __importStar(require("@sap/xssec"));
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const tools_js_1 = require("./tools.js");
const sapService_js_1 = require("./sapService.js");
const app = (0, express_1.default)();
app.use((0, compression_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const services = xsenv_1.default.getServices({ uaa: { tag: 'xsuaa' } });
const getStrategy = () => {
    const lib = xssec;
    const StrategyClass = lib.XssecPassportStrategy || lib.default?.XssecPassportStrategy || lib.JWTStrategy || lib.Strategy;
    if (typeof StrategyClass !== 'function') {
        throw new Error("Critical: Could not find a valid Passport Strategy constructor in @sap/xssec.");
    }
    return StrategyClass;
};
const Strategy = getStrategy();
passport_1.default.use(new Strategy(services.uaa));
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
        return {
            content: [{ type: "text", text: `SAP Error: ${error.message}` }],
            isError: true
        };
    }
});
// --- 3. Transport & Routes ---
let transport = null;
// SSE Connection Endpoint
app.get('/sse', authMiddleware, async (req, res) => {
    console.log("🔌 New MCP Client connected via SSE");
    transport = new sse_js_1.SSEServerTransport('/messages', res);
    await mcpServer.connect(transport);
    res.on('close', () => {
        console.log("🔌 MCP Client disconnected");
        transport = null;
    });
});
app.post('/messages', authMiddleware, async (req, res) => {
    if (transport) {
        await transport.handlePostMessage(req, res);
    }
    else {
        res.status(404).send("No active MCP session. Please connect to /sse first.");
    }
});
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`🚀 Hardened SAP MCP Server running on port ${port}`);
    console.log(`🔒 Authentication: XSUAA JWT Strategy Active`);
});
