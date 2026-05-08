import prisma from "../database/prisma.js";
import { parsePermissions } from "../utils/permissions.js";
import { unauthorized } from "../utils/errors.js";
import { verifyToken } from "../utils/jwt.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return next(unauthorized("Отсутствует Bearer-токен"));
    }

    const token = authHeader.replace("Bearer ", "");
    const payload = verifyToken(token);
    const userId = Number(payload.sub);

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        companyId: payload.companyId
      },
      include: {
        role: true
      }
    });

    if (!user || user.status !== "active") {
      return next(unauthorized("Пользователь недоступен"));
    }

    req.user = {
      id: user.id,
      companyId: user.companyId,
      roleId: user.roleId,
      email: user.email,
      name: user.name,
      status: user.status,
      permissions: parsePermissions(user.role.permissions)
    };

    return next();
  } catch (_error) {
    return next(unauthorized("Токен недействителен или истёк"));
  }
};
