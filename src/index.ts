import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import xsenv from '@sap/xsenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools.js';
import { genericSapRead, genericSapWrite } from './sapService.js';

const xssec = require('@sap/xssec');
const passport = require('passport');

const app = express();
const port = (process.env.PORT || 8080) as number;

// --- XSUAA Configuration ---
let uaaCredentials: any;
try {
  const services = xsenv.getServices({ uaa: { tag: 'xsuaa' } });
  uaaCredentials = services.uaa;
  console.log("✅ XSUAA Bound:", uaaCredentials.url);
} catch (error) {
  console.error("❌ Critical: XSUAA service binding required!");
  process.exit(1);
}

passport.use('jwt', new xssec.JWTStrategy(uaaCredentials));
app.use(passport.initialize());

app.use(cors({ origin: ['https://chat.openai.com', 'https://chatgpt.com'], credentials: true }));

// 🔥 CRITICAL FIX: DO NOT USE app.use(express.json()) HERE!
// The MCP SDK must read the raw stream. If Express parses it first, the SDK times out.

interface AuthRequest extends Request { authInfo?: any; }

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: any, user: any, info: any) => {
    if (err || !user) return res.status(401).json({ error: "Unauthorized", details: info?.message });
    req.authInfo = user;
    next();
  })(req, res, next);
};

const mcpServer = new Server({ name: "sap-mcp-v5", version: "5.0.0" }, { capabilities: { tools: {} } });

interface Session { transport: SSEServerTransport; heartbeat: NodeJS.Timeout | null; }
const sessions = new Map<string, Session>();

// --- Discovery Paths ---
const discoveryPaths = [
  '/.well-known/openid-configuration',
  '/sse/.well-known/openid-configuration',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource'
];

app.get(discoveryPaths, (req: Request, res: Response) => {
  res.json({
    issuer: uaaCredentials.url,
    authorization_endpoint: `${uaaCredentials.url}/oauth/authorize`,
    token_endpoint: `${uaaCredentials.url}/oauth/token`,
    jwks_uri: `${uaaCredentials.url}/token_keys`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    mcpServers: { "/sse": { "stdout": "/messages" } }
  });
});

// --- SSE Endpoint ---
app.get('/sse', authMiddleware, async (req: AuthRequest, res: Response) => {
  console.log(`[SSE] Incoming connection attempt...`);
  
  // Headers to stop Gorouter from buffering or dropping us
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const transport = new SSEServerTransport('/messages', res);
  const sessionId = transport.sessionId;
  
  console.log(`🔌 SSE Session Established: ${sessionId}`);
  sessions.set(sessionId, { transport, heartbeat: null });

  try {
    await mcpServer.connect(transport);
    
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': keep-alive\n\n');
    }, 15000);

    const session = sessions.get(sessionId);
    if (session) session.heartbeat = heartbeat;

  } catch (error) {
    console.error(`❌ MCP Connect failed: ${(error as Error).message}`);
    sessions.delete(sessionId);
  }

  req.on('close', () => {
    console.log(`⚠️ SSE Connection dropped by client/proxy: ${sessionId}`);
    const session = sessions.get(sessionId);
    if (session && session.heartbeat) clearInterval(session.heartbeat);
    sessions.delete(sessionId);
  });
});

// --- Messages Router ---
const messageHandler = async (req: AuthRequest, res: Response) => {
  const sessionId = req.query.sessionId as string;
  console.log(`[MSG] Incoming POST to /messages for Session: ${sessionId}`);
  
  const session = sessions.get(sessionId);

  if (!session) {
    console.error(`❌ Rejecting message: Session ${sessionId} not found in memory. Active:`, Array.from(sessions.keys()));
    return res.status(400).json({ error: `Session missing or expired. Reconnect required.` });
  }

  try {
    // The SDK handles parsing the raw req stream here
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error(`❌ Transport handling error: ${(error as Error).message}`);
    res.status(500).json({ error: (error as Error).message });
  }
};

app.post('/messages', authMiddleware, messageHandler);
app.post('/sse', authMiddleware, messageHandler);

// --- Tools ---
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;
  console.log(`🛠️ Tool Triggered: ${name}`);
  
  try {
    switch (name) {
      case "list_available_services":
        const catalog = await genericSapRead('/sap/opu/odata/IWFND/CATALOGSERVICE;v=2', 'ServiceCollection', { $select: 'ExternalName,ExternalServiceName', $top: '20' });
        const services = catalog.success ? (catalog.data?.d?.results || []) : [];
        return { content: [{ type: "text", text: JSON.stringify({ services: services.map((s: any) => ({ name: s.ExternalServiceName || s.ExternalName, path: `/sap/opu/odata/sap/${s.ExternalServiceName || s.ExternalName}` })) }, null, 2) }] };
      case "read_sap_data":
        return { content: [{ type: "text", text: JSON.stringify(await genericSapRead(String(args?.servicePath), String(args?.resourcePath), args?.parameters), null, 2) }] };
      case "write_sap_data":
        return { content: [{ type: "text", text: JSON.stringify(await genericSapWrite(args?.method as any, String(args?.servicePath), String(args?.resourcePath), args?.payload), null, 2) }] };
      default: throw new Error(`Tool ${name} not found`);
    }
  } catch (err: any) {
    return { content: [{ type: "text", text: `❌ ERROR: ${err.message}` }], isError: true };
  }
});

app.listen(port, () => console.log(`🚀 SAP MCP Active on port ${port}`));