#!/usr/bin/env node

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Type alias for a note object.
 */
type Note = { title: string, content: string };

/**
 * Simple in-memory storage for notes.
 * In a real implementation, this would likely be backed by a database.
 */
const notes: { [id: string]: Note } = {
  "1": { title: "First Note", content: "This is note 1" },
  "2": { title: "Second Note", content: "This is note 2" }
};

/**
 * Create an MCP server with capabilities for resources (to list/read notes),
 * tools (to create new notes), and prompts (to summarize notes).
 */
const server = new Server(
  {
    name: "flomo-mcp",
    version: "0.0.1",
  },
  {
    capabilities: {
      tools: {
        "listChanged": true
      },
      resources: {
        "listChanged": true
      },
      prompts: {
        "listChanged": true
      },
    },
  }
);


server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "summarize_weather",
        description: "summarize weather",
        arguments: [{
          name: "weather",
          description: "Weather report in JSON format",
          required: true
        }]
      }
    ]
  };
});


server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  // 根据 prompt 名称返回相应的消息模板
  if (name === "summarize_weather") {
    const weather = args?.weather;
    
    if (!weather) {
      throw new Error("Weather argument is required");
    }
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please summarize the following weather report:\n\n${JSON.stringify(weather, null, 2)}\n\n
            Provide a concise, human-readable summary including temperature, conditions, and any important weather information.
            And answer in Chinese.`
          }
        }
      ]
    };
  }
  
  throw new Error(`Unknown prompt: ${name}`);
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const cities = listCity();
  return {
    resources: cities.map(city => ({
      name: city.name,
      description: city.name,
      uri: `city://${city.adcode}`,
      mimeType: "text/plain",
    })),
  };
});


server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const adcode = request.params.uri.split("://")[1];
  const city = getCity(adcode);
  if (!city) {
    throw new Error("City not found");
  }
  return {
    contents: [{
      uri: "city://" + city.adcode,
      mimeType: "text/plain",
      text: "city: " + city.name + " adcode: " + city.adcode,
    }]
  };
});



/**
 * Handler that lists available tools.
 * Exposes a single "create_note" tool that lets clients create new notes.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_weather",
        description: "get weather by adcode",
        inputSchema: {
          type: "object",
          properties: {
            adcode: {
              type: "string",
              description: "Adcode of the city"
            }
          },
          required: ["adcode"]
        }
      },
      {
        name: "write_note",
        description: "write note to flomo",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Text content of the note with Markdown formatting"
            }
          },
          required: ["content"]
        }
      }
    ]
  };
});

import { FlomoClient } from "./flomo.js"
import { getCity, getWeather, listCity } from "./gaode.js";

/**
 * Handler for the create_note tool.
 * Creates a new note with the provided title and content, and returns success message.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "get_weather": {
      const adcode = String(request.params.arguments?.adcode);
      if (!adcode) {
        throw new Error("Adcode is required");
      }
      const weather = await getWeather(adcode);
      return {
        content: [{
          type: "application/json",
          data: weather
        }]
      };
    }

    case "write_note": {

      if (!apiUrl) {
        throw new Error("API URL is required");
      }

      const content = String(request.params.arguments?.content);
      if (!content) {
        throw new Error("Title and content are required");
      }



      const flomo = new FlomoClient({ apiUrl });
      const result = await flomo.writeNote({ content });

      if (!result.memo || !result.memo.slug) {
        throw new Error(
          `Failed to write note: ${result.message || "unknown error"}`
        );
      }

      const flomoUrl = `https://v.flomoapp.com/mine/?memo_id=${result.memo.slug}`;

      return {
        content: [{
          type: "text",
          text: `write note success: view at: ${flomoUrl}`
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});


function parseArgs() {
  const args: Record<string, string> = {};

  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      args[key] = value;
    }
  });

  return args;
}

const args = parseArgs();
const apiUrl = args.flomo_api_url || process.env.FLOMO_API_URL || "";


/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});