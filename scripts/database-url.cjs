"use strict";

function parseAndValidateDatabaseUrl(contextLabel) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }

  const host = parsed.hostname.trim();
  const port = parsed.port ? parsed.port.trim() : "(from-url-default)";
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).trim();
  const username = decodeURIComponent(parsed.username || "").trim();
  const password = decodeURIComponent(parsed.password || "").trim();

  if (!host) {
    throw new Error("DATABASE_URL is missing hostname");
  }
  if (!database) {
    throw new Error("DATABASE_URL is missing database name");
  }
  if (!username) {
    throw new Error("DATABASE_URL is missing username");
  }
  if (!password) {
    throw new Error("DATABASE_URL is missing password");
  }

  console.log(`[${contextLabel}] Target host=${host} port=${port} database=${database} username=${username}`);
  return { databaseUrl, host, port, database };
}

function railwaySsl() {
  return { rejectUnauthorized: false };
}

module.exports = {
  parseAndValidateDatabaseUrl,
  railwaySsl
};
