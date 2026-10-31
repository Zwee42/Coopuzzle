type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function write(level: Level, event: string, fields: Fields): void {
  if (process.env.LOG_LEVEL === "silent" || process.env.NODE_ENV === "test") return;
  const entry = {
    time: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info(event: string, fields: Fields = {}) {
    write("info", event, fields);
  },
  warn(event: string, fields: Fields = {}) {
    write("warn", event, fields);
  },
  error(event: string, fields: Fields = {}) {
    write("error", event, fields);
  },
};
