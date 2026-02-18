import express from 'express';
import cors from 'cors';
import xsenv from '@sap/xsenv';
const xssec = require('@sap/xssec');
const passport = require('passport');
const { JWTStrategy } = require('@sap/xssec');

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools.js';
import { genericSapRead, genericSapWrite } from './sapService.js';

const app = express();
app.use(cors());

// 1. XSUAA CREDENTIALS
let uaaCredentials: any;
try {
  const services = xsenv.getServices({ uaa: { tag: 'xsuaa' } });
  uaaCredentials = services.uaa;
  console.log("✅ XSUAA Credentials loaded. URL:", uaaCredentials.url);
} catch (error: any) {
  console.error("❌ Failed to load XSUAA credentials:", error.message);
  process.exit(1);
}

// 2. PASSPORT JWT STRATEGY
passport.use(new JWTStrategy(uaaCredentials));
app.use(passport.initialize());

// 3. AUTH MIDDLEWARE (simple & safe)
const authMiddleware = (req: any, res: any, next: any) => {
  if (req.url !== '/sse') {
    console.log(`[DEBUG] ${req.method} ${req.url}`);
  }
  
  passport.authenticate('JWT', { session: false }, (err: any, user: any, info: any) => {
    if (err) return res.status(500).json({ error: "Auth Error" });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
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
const mcpServer = new Server(
  { name: "sap-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "read_sap_data") {
      const result = await genericSapRead(String(args?.servicePath), String(args?.resourcePath), args?.parameters as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    // Add more tools here if needed
    throw new Error(`Tool not found: ${name}`);
  } catch (error: any) {
    return { content: [{ type: "text", text: `SAP Error: ${error.message}` }], isError: true };
  }
});

// 6. GLOBAL TRANSPORT (single active session for ChatGPT)
let activeTransport: SSEServerTransport | null = null;

// 7. SSE ENDPOINT - FIXED (NO MANUAL HEADERS)
app.get('/sse', authMiddleware, async (req, res) => {
  console.log("🔌 ChatGPT SSE Connection (GET)");
  
  // Create transport - LET IT HANDLE HEADERS
  activeTransport = new SSEServerTransport('/messages', res);
  
  try {
    await mcpServer.connect(activeTransport);
  } catch (error: any) {
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
  } catch (error: any) {
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
