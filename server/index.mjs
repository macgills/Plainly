import { createPlainlyServer } from "./plainly-server.mjs";

const port = Number(process.env.PORT ?? 8787);
const server = createPlainlyServer();
server.listen(port, "127.0.0.1", () => {
  console.log(`Plainly API listening on http://127.0.0.1:${port}`);
});
