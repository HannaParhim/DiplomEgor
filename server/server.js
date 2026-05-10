import http from "node:http";
import app from "./app.js";
import config from "./config/index.js";
// import { bootstrapBackgroundJobs } from "./services/jobBootstrap.js";
// import { initRealtime } from "./services/realtimeService.js";

const server = http.createServer(app);
// initRealtime(server);
// bootstrapBackgroundJobs();

const PORT = process.env.PORT || config.port || 4000;
server.listen(PORT, () => {
  console.log(`LMS-сервер запущен на порту ${PORT}`);
});