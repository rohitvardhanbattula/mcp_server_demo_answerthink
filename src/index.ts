import express from 'express';
import cors from 'cors';
import compression from 'compression';
import passport from 'passport';
import { JWTStrategy } from '@sap/xsenv';
import xsenv from '@sap/xsenv';
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
passport.use(new JWTStrategy(services.uaa));
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
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

let transport: SSEServerTransport;

app.get('/sse', authMiddleware, async (req, res) => {
  transport = new SSEServerTransport('/messages', res);
  await mcpServer.connect(transport);
});

app.post('/messages', authMiddleware, async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).send("Session Expired");
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`MCP Server started on port ${port}`);
});