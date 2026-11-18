// Starts a tiny local HTTP server and calls it through a registry using the real global fetch.
import { createServer } from "node:http";
import { createRegistry, defineEndpoint } from "../../dist/index.js";

const server = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ url: req.url, method: req.method }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const api = createRegistry(
  { echo: defineEndpoint({ method: "GET", path: "/echo/:word" }) },
  { baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 2000 },
);

console.log(
  await api.echo({ params: { word: "olá mundo" }, query: { lang: "pt-AO" } }),
);
server.close();
