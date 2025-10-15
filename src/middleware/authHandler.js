import jwt from "jsonwebtoken";
import { UnauthorizedError, ForbiddenError } from "../lib/customErrors.js";
import { asyncErrorHandler } from "./errorHandler.js";

export function authorizeRoles(...allowedRoles) {
  return asyncErrorHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Access token required");
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!allowedRoles.includes(decoded.role)) {
        throw new ForbiddenError("Forbidden: insufficient role");
      }
      req.user = decoded;
      next();
    } catch (err) {
      if (err.name === "JsonWebTokenError") {
        throw new UnauthorizedError("Invalid token");
      } else if (err.name === "TokenExpiredError") {
        throw new UnauthorizedError("Token expired");
      } else {
        throw err;
      }
    }
  });
}
