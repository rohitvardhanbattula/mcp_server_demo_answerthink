import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import xsenv from '@sap/xsenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools.js';
import { genericSapRead, genericSapWrite, DESTINATION_NAME } from './sapService.js';

const xssec = require('@sap/xssec');
const passport = require('passport');

const app = express();
const port = (process.env.PORT || 8080) as number;

// We're behind the CF/BTP Gorouter, which terminates TLS. Trust its
// X-Forwarded-* headers so req.protocol/req.hostname are correct, otherwise
// every metadata URL we generate below comes out as http:// instead of https://.
app.set('trust proxy', true);

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

app.use(cors({
  origin: ['https://chat.openai.com', 'https://chatgpt.com', 'https://claude.ai'],
  credentials: true,
  // The client has to be able to read this header to find our metadata
  // document after a 401 - it's not exposed by default in the browser fetch API.
  exposedHeaders: ['WWW-Authenticate']
}));

// 🔥 CRITICAL FIX: DO NOT USE app.use(express.json()) HERE!
// The MCP SDK must read the raw stream. If Express parses it first, the SDK times out.

interface AuthRequest extends Request { authInfo?: any; }

// Helper: the externally-visible base URL of this app (https://<route>)
function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

// Helper: build the RFC9728 "protected resource metadata" URL for a given
// resource path, per the MCP Authorization spec: insert the well-known
// segment *before* the resource's own path.
function resourceMetadataUrl(req: Request, resourcePath: string): string {
  return `${baseUrl(req)}/.well-known/oauth-protected-resource${resourcePath}`;
}

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: any, user: any, info: any) => {
    if (err || !user) {
      // Point the client at our protected-resource metadata so it can discover
      // the authorization server and start the OAuth flow. Without this header
      // MCP clients (ChatGPT, Claude, etc.) have no reliable way to find it.
      res
        .status(401)
        .set('WWW-Authenticate', `Bearer realm="sap-mcp", resource_metadata="${resourceMetadataUrl(req, req.path)}"`)
        .json({ error: "Unauthorized", details: info?.message });
      return;
    }
    req.authInfo = user;
    next();
  })(req, res, next);
};

const mcpServer = new Server({ name: "sap-mcp-v5", version: "5.0.0" }, { capabilities: { tools: {} } });

interface Session { transport: SSEServerTransport; heartbeat: NodeJS.Timeout | null; }
const sessions = new Map<string, Session>();

// $XSAPPNAME in xs-security.json is only a build-time placeholder - XSUAA
// expands it to the real (often suffixed, e.g. "mcp-sap-appname!t12345")
// app name at deploy time. We must use that resolved name here too, or
// XSUAA will reject the scope as invalid_scope when ChatGPT requests it.
const SCOPES_SUPPORTED = ['read', 'write', 'admin'].map(s => `${uaaCredentials.xsappname}.${s}`);

// --- OAuth Authorization Server Metadata (RFC 8414) ---
// This describes XSUAA itself. Note XSUAA does not implement RFC 7591 Dynamic
// Client Registration, so there is intentionally no `registration_endpoint`
// here - clients like ChatGPT/Claude must be configured with a pre-registered
// Client ID/Secret (from your XSUAA service key) rather than self-registering.
app.get(['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration'], (req: Request, res: Response) => {
  res.json({
    issuer: uaaCredentials.url,
    authorization_endpoint: `${uaaCredentials.url}/oauth/authorize`,
    token_endpoint: `${uaaCredentials.url}/oauth/token`,
    jwks_uri: `${uaaCredentials.url}/token_keys`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    scopes_supported: SCOPES_SUPPORTED,
    subject_types_supported: ["public"]
  });
});

// --- OAuth Protected Resource Metadata (RFC 9728) ---
// Served both at the root and at the resource-specific path (/sse), since
// different clients look in either place depending on how they derived the
// resource URL. `resource` MUST exactly match the URL the client is calling.
app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/sse'], (req: Request, res: Response) => {
  res.json({
    resource: `${baseUrl(req)}/sse`,
    authorization_servers: [uaaCredentials.url],
    bearer_methods_supported: ["header"],
    scopes_supported: SCOPES_SUPPORTED
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
        if (!catalog.success) {
          // Don't silently return an empty list - surface the real reason
          // (bad/missing destination, network issue, auth failure, etc.)
          // so it's actually possible to diagnose from the tool output.
          return { content: [{ type: "text", text: `❌ Could not reach SAP via destination '${DESTINATION_NAME}': ${catalog.error}` }], isError: true };
        }
        const services = catalog.data?.d?.results || [];
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