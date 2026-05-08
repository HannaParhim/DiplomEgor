import { io } from "socket.io-client";

const apiUrl = import.meta.env.VITE_API_URL ?? "/api";

const getSocketUrl = () =>
  apiUrl.startsWith("http")
    ? apiUrl.replace(/\/api\/?$/i, "")
    : window.location.origin;

export const createRealtimeSocket = (token) =>
  io(getSocketUrl(), {
    auth: {
      token
    },
    transports: ["websocket", "polling"],
    reconnection: true
  });
