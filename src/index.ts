import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools.js';
import { genericSapRead, genericSapWrite } from './sapService.js';

const app = express();
app.use(compression()); // Makes data transfer much faster for large SAP payloads
app.use(cors());

const mcpServer = new Server(
  { name: "production-sap-mcp", version: "3.1.0" },
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

    if (name === "inspect_metadata") {
      const result = await genericSapRead(String(args?.servicePath), "$metadata");
      const textOutput = typeof result === 'string' ? result : JSON.stringify(result);
      return { content: [{ type: "text", text: "SCHEMA START\n" + textOutput.substring(0, 15000) + "\nSCHEMA END" }] };
    }

    throw new Error(`Tool ${name} not found`);
  } catch (error: any) {
    return { content: [{ type: "text", text: `Runtime Error: ${error.message}` }], isError: true };
  }
});

let transport: SSEServerTransport;

app.get('/sse', async (req, res) => {
  console.log("-> Claude connected via SSE");
  transport = new SSEServerTransport('/messages', res);
  await mcpServer.connect(transport);
});

app.post('/messages', async (req, res) => {
  if (transport) await transport.handlePostMessage(req, res);
  else res.status(404).send("Session Lost");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 SAP MCP Bridge active on port ${PORT}`));