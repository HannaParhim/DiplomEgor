import { Server } from "socket.io";
import prisma from "../database/prisma.js";
import config from "../config/index.js";
import { verifyToken } from "../utils/jwt.js";

let io;

const getTokenFromSocket = (socket) => {
  const authToken = socket.handshake.auth?.token;

  if (authToken) {
    return authToken;
  }

  const authorizationHeader = socket.handshake.headers.authorization;
  return authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.replace("Bearer ", "")
    : null;
};

export function initRealtime(server) {
  io = new Server(server, {
    cors: {
      origin: config.clientUrl,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = getTokenFromSocket(socket);

      if (!token) {
        return next(new Error("UNAUTHORIZED"));
      }

      const payload = verifyToken(token);
      const user = await prisma.user.findFirst({
        where: {
          id: Number(payload.sub),
          companyId: payload.companyId,
          status: "active"
        }
      });

      if (!user) {
        return next(new Error("UNAUTHORIZED"));
      }

      socket.data.user = {
        id: user.id,
        companyId: user.companyId
      };

      return next();
    } catch (_error) {
      return next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const currentUser = socket.data.user;

    socket.join(`user:${currentUser.id}`);
    socket.join(`company:${currentUser.companyId}`);
  });

  return io;
}

export const getRealtimeServer = () => io;

export const emitToUser = (userId, eventName, payload) => {
  io?.to(`user:${userId}`).emit(eventName, payload);
};

export const emitToUsers = (userIds, eventName, payload) => {
  [...new Set(userIds.filter(Boolean))].forEach((userId) => {
    emitToUser(userId, eventName, payload);
  });
};

export const emitToCompany = (companyId, eventName, payload) => {
  io?.to(`company:${companyId}`).emit(eventName, payload);
};
