import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: process.env.SERVICE_NAME ?? "web" },
  redact: ["*.password", "*.refreshToken", "*.accessToken", "*.token", "req.headers.cookie", "req.headers.authorization"],
  timestamp: pino.stdTimeFunctions.isoTime,
});
