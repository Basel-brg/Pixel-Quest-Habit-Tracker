import express, { type Express } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

function toOrigin(value: string): string | undefined {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

const trustedOrigins = new Set<string>([
  "https://pixel-quest-habit-tracker.replit.app",
  ...(process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((domain) => toOrigin(domain.trim()))
    .filter((origin): origin is string => Boolean(origin)),
  ...(process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => toOrigin(origin.trim()))
    .filter((origin): origin is string => Boolean(origin)),
]);

if (process.env.NODE_ENV === "development") {
  for (const origin of [
    process.env.REPLIT_DEV_DOMAIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]) {
    const normalized = origin ? toOrigin(origin) : undefined;
    if (normalized) trustedOrigins.add(normalized);
  }
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      callback(null, origin && trustedOrigins.has(origin) ? origin : false);
    },
  }),
);
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
