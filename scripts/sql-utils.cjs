"use strict";

function stripPsqlMetaAndCopy(sqlText) {
  const lines = sqlText.split(/\r?\n/);
  const out = [];
  let skippingCopy = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (skippingCopy) {
      if (trimmed === "\\.") {
        skippingCopy = false;
      }
      continue;
    }

    if (/^COPY\s+.+\s+FROM\s+stdin;$/i.test(trimmed)) {
      skippingCopy = true;
      continue;
    }

    if (trimmed.startsWith("\\")) {
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  for (let i = 0; i < sqlText.length; i += 1) {
    const ch = sqlText[i];
    const next = sqlText[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (dollarTag) {
      current += ch;
      if (ch === "$") {
        const maybeTag = sqlText.slice(i - dollarTag.length + 1, i + 1);
        if (maybeTag === dollarTag) {
          dollarTag = null;
        }
      }
      continue;
    }

    if (!inSingle && !inDouble) {
      if (ch === "-" && next === "-") {
        current += ch + next;
        i += 1;
        inLineComment = true;
        continue;
      }
      if (ch === "/" && next === "*") {
        current += ch + next;
        i += 1;
        inBlockComment = true;
        continue;
      }
      if (ch === "$") {
        const rest = sqlText.slice(i);
        const match = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          current += dollarTag;
          i += dollarTag.length - 1;
          continue;
        }
      }
    }

    if (ch === "'" && !inDouble) {
      const escaped = sqlText[i - 1] === "\\";
      if (!escaped) inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingle) {
      const escaped = sqlText[i - 1] === "\\";
      if (!escaped) inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (ch === ";" && !inSingle && !inDouble) {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = "";
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

module.exports = {
  splitSqlStatements,
  stripPsqlMetaAndCopy
};
