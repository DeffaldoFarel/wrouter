import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: isDev ? "debug" : "info",
  base: { app: "wrouter", version: "1.0.0" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
