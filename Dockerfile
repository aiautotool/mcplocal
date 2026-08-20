FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8008
ENV MCP_ROOT=/workspace
EXPOSE 8008
CMD ["node", "src/server.js"]
