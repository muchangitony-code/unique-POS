"use strict";

const { parseAndValidateDatabaseUrl } = require("./database-url.cjs");

const INVALID_SESSION_SECRETS = new Set([
  "change-me-to-a-long-random-string",
  "unconfigured-placeholder-change-me",
  "change-me",
  "admin123"
]);

function validateStartupEnv() {
  parseAndValidateDatabaseUrl("startup-env");

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required.");
  }
  if (sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET must be at least 16 characters.");
  }
  if (INVALID_SESSION_SECRETS.has(sessionSecret)) {
    throw new Error("SESSION_SECRET must be replaced with a strong deployment-specific secret.");
  }

  const nodeEnv = process.env.NODE_ENV || "production";

  const rawPort = process.env.PORT || "8080";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid TCP port. Received: ${rawPort}`);
  }
  process.env.PORT = String(port);

  return {
    nodeEnv,
    port
  };
}

if (require.main === module) {
  try {
    const result = validateStartupEnv();
    console.log("[startup-env] OK", result);
  } catch (err) {
    console.error("[startup-env] Failed", err.message || err);
    process.exit(1);
  }
}

module.exports = {
  validateStartupEnv
};
