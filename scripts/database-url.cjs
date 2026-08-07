"use strict";

const PLACEHOLDER_VALUES = new Set(["host", "localhost", "dbname", "user", "password", "example"]);

function isPlaceholder(value) {
  return PLACEHOLDER_VALUES.has(String(value || "").trim().toLowerCase());
}

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

  const placeholderFields = [];
  if (isPlaceholder(host)) placeholderFields.push("hostname");
  if (isPlaceholder(database)) placeholderFields.push("database");
  if (isPlaceholder(username)) placeholderFields.push("username");
  if (isPlaceholder(password)) placeholderFields.push("password");

  if (placeholderFields.length > 0) {
    throw new Error(
      `DATABASE_URL contains placeholder credentials in: ${placeholderFields.join(", ")}. Configure the real Railway DATABASE_URL.`
    );
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
