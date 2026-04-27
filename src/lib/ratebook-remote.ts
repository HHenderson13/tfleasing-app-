import { db } from "@/db";
import { sql } from "drizzle-orm";
import { Client as FtpClient } from "basic-ftp";
import SftpClient from "ssh2-sftp-client";
import { posix as pathPosix } from "node:path";
import { Writable } from "node:stream";
import { z } from "zod";

export const RATEBOOK_REMOTE_PROTOCOLS = ["ftp", "ftps", "sftp"] as const;
export type RatebookRemoteProtocol = (typeof RATEBOOK_REMOTE_PROTOCOLS)[number];

const baseRemoteSettingsSchema = z.object({
  protocol: z.enum(RATEBOOK_REMOTE_PROTOCOLS),
  host: z.string().trim().min(1, "Host is required."),
  port: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    return Number.parseInt(String(value), 10);
  }, z.number().int().min(1).max(65535).nullable()),
  username: z.string().trim().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
  remotePath: z.string().trim().optional().default(""),
});

export type RatebookRemoteSettingsInput = z.input<typeof baseRemoteSettingsSchema>;
export type ParsedRatebookRemoteSettings = z.output<typeof baseRemoteSettingsSchema>;

export function getDefaultRemotePort(protocol: RatebookRemoteProtocol) {
  return protocol === "sftp" ? 22 : 21;
}

export function parseRatebookRemoteSettings(
  input: RatebookRemoteSettingsInput,
  opts?: { requireRemotePath?: boolean },
): ParsedRatebookRemoteSettings {
  const parsed = baseRemoteSettingsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid remote settings.");
  }
  if (opts?.requireRemotePath && parsed.data.remotePath.length === 0) {
    throw new Error("Remote path is required.");
  }
  return parsed.data;
}

export async function ensureRatebookRemoteSettingsTable() {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS ratebook_remote_settings (
      id text PRIMARY KEY NOT NULL,
      protocol text NOT NULL DEFAULT 'sftp',
      host text NOT NULL,
      port integer,
      username text NOT NULL,
      password text NOT NULL,
      remote_path text NOT NULL DEFAULT '',
      updated_at integer NOT NULL
    )
  `);
}

export async function testRatebookRemoteConnection(input: RatebookRemoteSettingsInput) {
  const settings = parseRatebookRemoteSettings(input);
  if (settings.protocol === "sftp") {
    return testSftpConnection(settings);
  }
  return testFtpConnection(settings);
}

export async function downloadRatebookRemoteFile(input: RatebookRemoteSettingsInput) {
  const settings = parseRatebookRemoteSettings(input, { requireRemotePath: true });
  const buffer = settings.protocol === "sftp"
    ? await downloadSftpFile(settings)
    : await downloadFtpFile(settings);

  return {
    buffer,
    filename: pathPosix.basename(settings.remotePath) || settings.remotePath,
    remotePath: settings.remotePath,
    protocol: settings.protocol,
  };
}

async function testFtpConnection(settings: ParsedRatebookRemoteSettings) {
  const client = new FtpClient(30_000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: settings.host,
      port: settings.port ?? getDefaultRemotePort(settings.protocol),
      user: settings.username,
      password: settings.password,
      secure: settings.protocol === "ftps",
    });
    if (!settings.remotePath) {
      const cwd = await client.pwd();
      return { message: `Connection OK. Current remote folder: ${cwd}` };
    }
    const size = await client.size(settings.remotePath);
    return {
      message: `Connection OK. Found ${pathPosix.basename(settings.remotePath)} (${formatBytes(size)}).`,
    };
  } catch (error) {
    throw new Error(toRemoteErrorMessage(error, settings.remotePath));
  } finally {
    client.close();
  }
}

async function downloadFtpFile(settings: ParsedRatebookRemoteSettings) {
  const client = new FtpClient(60_000);
  client.ftp.verbose = false;
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });

  try {
    await client.access({
      host: settings.host,
      port: settings.port ?? getDefaultRemotePort(settings.protocol),
      user: settings.username,
      password: settings.password,
      secure: settings.protocol === "ftps",
    });
    await client.downloadTo(sink, settings.remotePath);
    return Buffer.concat(chunks);
  } catch (error) {
    throw new Error(toRemoteErrorMessage(error, settings.remotePath));
  } finally {
    client.close();
  }
}

async function testSftpConnection(settings: ParsedRatebookRemoteSettings) {
  const client = new SftpClient("ratebook-remote");
  try {
    await client.connect({
      host: settings.host,
      port: settings.port ?? getDefaultRemotePort(settings.protocol),
      username: settings.username,
      password: settings.password,
      readyTimeout: 30_000,
    });
    if (!settings.remotePath) {
      const cwd = await client.cwd();
      return { message: `Connection OK. Current remote folder: ${cwd}` };
    }
    const exists = await client.exists(settings.remotePath);
    if (!exists) throw new Error("Remote file not found.");
    if (exists === "d") throw new Error("Remote path points to a directory, not a file.");
    const stat = await client.stat(settings.remotePath);
    return {
      message: `Connection OK. Found ${pathPosix.basename(settings.remotePath)} (${formatBytes(stat.size)}).`,
    };
  } catch (error) {
    throw new Error(toRemoteErrorMessage(error, settings.remotePath));
  } finally {
    try {
      await client.end();
    } catch {
      // Ignore shutdown errors after a failed connect or transfer.
    }
  }
}

async function downloadSftpFile(settings: ParsedRatebookRemoteSettings) {
  const client = new SftpClient("ratebook-remote");
  try {
    await client.connect({
      host: settings.host,
      port: settings.port ?? getDefaultRemotePort(settings.protocol),
      username: settings.username,
      password: settings.password,
      readyTimeout: 30_000,
    });
    const downloaded = await client.get(settings.remotePath);
    if (!Buffer.isBuffer(downloaded)) {
      throw new Error("Remote server returned an unexpected response.");
    }
    return downloaded;
  } catch (error) {
    throw new Error(toRemoteErrorMessage(error, settings.remotePath));
  } finally {
    try {
      await client.end();
    } catch {
      // Ignore shutdown errors after a failed connect or transfer.
    }
  }
}

function toRemoteErrorMessage(error: unknown, remotePath: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (remotePath) {
    return `Could not access ${remotePath}: ${message}`;
  }
  return `Could not connect to the remote server: ${message}`;
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
