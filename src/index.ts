import express from 'express';
import cors from 'cors';
import compression from 'compression';
import passport from 'passport';
import xsenv from '@sap/xsenv';
import * as xssec from '@sap/xssec';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools.js';
import { genericSapRead, genericSapWrite } from './sapService.js';

const app = express();
app.use(compression());
app.use(cors());
app.use(express.json());
const services = xsenv.getServices({ uaa: { tag: 'xsuaa' } });
const getStrategy = () => {
  const lib = xssec as any;
  const StrategyClass = lib.XssecPassportStrategy || lib.default?.XssecPassportStrategy || lib.JWTStrategy || lib.Strategy;
  
  if (typeof StrategyClass !== 'function') {
    throw new Error("Critical: Could not find a valid Passport Strategy constructor in @sap/xssec.");
  }
  return StrategyClass;
};

const Strategy = getStrategy();
passport.use(new (Strategy as any)(services.uaa));
app.use(passport.initialize());
const authMiddleware = passport.authenticate('JWT', { session: false });
const mcpServer = new Server(
  { name: "hardened-sap-mcp", version: "4.1.0" },
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
    
    if (name === "write_sap_data") {
      const result = await genericSapWrite(args?.method as any, String(args?.servicePath), String(args?.resourcePath), args?.payload);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "list_available_services") {
      const result = await genericSapRead("/sap/opu/odata/IWFND/CATALOGSERVICE", "ServiceCollection", { "$top": "50", "$select": "TechnicalName,Title" });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error: any) {
    return { 
      content: [{ type: "text", text: `SAP Error: ${error.message}` }], 
      isError: true 
    };
  }
});

// --- 3. Transport & Routes ---

let transport: SSEServerTransport | null = null;

// SSE Connection Endpoint
app.get('/sse', authMiddleware, async (req, res) => {
  console.log("🔌 New MCP Client connected via SSE");
  transport = new SSEServerTransport('/messages', res);
  await mcpServer.connect(transport);

  res.on('close', () => {
    console.log("🔌 MCP Client disconnected");
    transport = null;
  });
});

app.post('/messages', authMiddleware, async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).send("No active MCP session. Please connect to /sse first.");
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 Hardened SAP MCP Server running on port ${port}`);
  console.log(`🔒 Authentication: XSUAA JWT Strategy Active`);
});