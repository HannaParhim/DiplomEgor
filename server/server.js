import http from "node:http";
import app from "./app.js";
import config from "./config/index.js";
import { bootstrapBackgroundJobs } from "./services/jobBootstrap.js";
import { initRealtime } from "./services/realtimeService.js";

const server = http.createServer(app);
initRealtime(server);

bootstrapBackgroundJobs();

server.listen(config.port, () => {
  console.log(`LMS-сервер запущен на http://localhost:${config.port}`);
});
