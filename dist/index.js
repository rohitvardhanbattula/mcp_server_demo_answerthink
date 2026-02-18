"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const xsenv_1 = __importDefault(require("@sap/xsenv"));
const xssec = require('@sap/xssec');
const passport = require('passport');
const { JWTStrategy } = require('@sap/xssec');
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const tools_js_1 = require("./tools.js");
const sapService_js_1 = require("./sapService.js");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// 1. XSUAA CREDENTIALS
let uaaCredentials;
try {
    const services = xsenv_1.default.getServices({ uaa: { tag: 'xsuaa' } });
    uaaCredentials = services.uaa;
    console.log("✅ XSUAA Credentials loaded. URL:", uaaCredentials.url);
}
catch (error) {
    console.error("❌ Failed to load XSUAA credentials:", error.message);
    process.exit(1);
}
// 2. PASSPORT JWT STRATEGY
passport.use(new JWTStrategy(uaaCredentials));
app.use(passport.initialize());
// 3. AUTH MIDDLEWARE (simple & safe)
const authMiddleware = (req, res, next) => {
    if (req.url !== '/sse') {
        console.log(`[DEBUG] ${req.method} ${req.url}`);
    }
    passport.authenticate('JWT', { session: false }, (err, user, info) => {
        if (err)
            return res.status(500).json({ error: "Auth Error" });
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        req.authInfo = user;
        next();
    })(req, res, next);
};
// 4. DISCOVERY ENDPOINTS (for ChatGPT discovery)
const discoveryPaths = [
    '/.well-known/openid-configuration',
    '/sse/.well-known/openid-configuration',
    '/.well-known/oauth-authorization-server',
    '/sse/.well-known/oauth-authorization-server'
];
app.get(discoveryPaths, (req, res) => {
    res.json({
        issuer: uaaCredentials.url,
        authorization_endpoint: `${uaaCredentials.url}/oauth/authorize`,
        token_endpoint: `${uaaCredentials.url}/oauth/token`,
        userinfo_endpoint: `${uaaCredentials.url}/userinfo`,
        jwks_uri: `${uaaCredentials.url}/token_keys`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        scopes_supported: ["openid"]
    });
});
// 5. MCP SERVER SETUP
const mcpServer = new index_js_1.Server({ name: "sap-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
mcpServer.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools: tools_js_1.TOOLS }));
mcpServer.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        if (name === "read_sap_data") {
            const result = await (0, sapService_js_1.genericSapRead)(String(args?.servicePath), String(args?.resourcePath), args?.parameters);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        // Add more tools here if needed
        throw new Error(`Tool not found: ${name}`);
    }
    catch (error) {
        return { content: [{ type: "text", text: `SAP Error: ${error.message}` }], isError: true };
    }
});
// 6. GLOBAL TRANSPORT (single active session for ChatGPT)
let activeTransport = null;
// 7. SSE ENDPOINT - FIXED (NO MANUAL HEADERS)
app.get('/sse', authMiddleware, async (req, res) => {
    console.log("🔌 ChatGPT SSE Connection (GET)");
    // Create transport - LET IT HANDLE HEADERS
    activeTransport = new sse_js_1.SSEServerTransport('/messages', res);
    try {
        await mcpServer.connect(activeTransport);
    }
    catch (error) {
        console.error("❌ MCP connect failed:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "MCP Server connect failed" });
        }
        activeTransport = null;
        return;
    }
    // Cleanup on disconnect
    req.on('close', () => {
        console.log("🔌 ChatGPT SSE Disconnected");
        activeTransport = null;
    });
});
// Force GET only for SSE
app.post('/sse', authMiddleware, (req, res) => {
    res.setHeader('Allow', 'GET');
    res.status(405).send("SSE requires GET method");
});
// 8. MESSAGES ENDPOINT (NO express.json() - transport handles parsing)
app.post('/messages', authMiddleware, async (req, res) => {
    const transport = activeTransport;
    if (!transport) {
        console.error("❌ POST /messages: No active SSE transport");
        return res.status(400).send("No active SSE session");
    }
    try {
        await transport.handlePostMessage(req, res);
    }
    catch (error) {
        console.error("❌ Message handling error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`🚀 SAP MCP Server running on port ${port}`);
    console.log(`📡 SSE endpoint: /sse`);
    console.log(`📨 Messages: /messages`);
});
