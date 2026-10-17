import {
  mkdir,
  stat,
  rename,
  unlink,
  appendFile,
  open,
} from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sanitizeLogEvent, type LogEvent } from '../shared/logs';

/** Serialized, bounded writes. A disk failure must never terminate a call. */
export class DesktopLogs {
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private failed = false;
  private droppedRecords = 0;
  private readonly runId = randomUUID();
  constructor(
    private readonly directory: string,
    private readonly maxBytes = 512 * 1024,
    private readonly version?: string,
  ) {}
  private file(index = 0): string {
    return path.join(
      this.directory,
      index ? `discorja.${index}.log` : 'discorja.log',
    );
  }
  private record(input: LogEvent) {
    const event = sanitizeLogEvent({
      ...input,
      details: {
        ...input.details,
        version: this.version ?? input.details?.version,
      },
    });
    if (!event) throw new Error('Evento de log inválido.');
    return {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      runId: this.runId,
      ...event,
    };
  }
  write(input: LogEvent): void {
    if (this.pending >= 100) {
      this.droppedRecords++;
      return;
    }
    const line = JSON.stringify(this.record(input)) + '\n';
    this.pending++;
    this.queue = this.queue
      .then(async () => {
        await mkdir(this.directory, { recursive: true });
        const size = await stat(this.file())
          .then((info) => info.size)
          .catch((error) => {
            if (error.code === 'ENOENT') return 0;
            throw error;
          });
        if (size + Buffer.byteLength(line) > this.maxBytes) {
          await unlink(this.file(2)).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
          for (let index = 1; index >= 0; index--)
            await rename(this.file(index), this.file(index + 1)).catch(
              (error) => {
                if (error.code !== 'ENOENT') throw error;
              },
            );
        }
        await appendFile(this.file(), line, { encoding: 'utf8', mode: 0o600 });
        this.failed = false;
      })
      .catch(() => {
        this.failed = true;
        this.droppedRecords++;
        // No raw filesystem errors: they can contain private local paths.
      })
      .finally(() => {
        this.pending--;
      });
  }
  /** Node exits immediately after a fatal exception; async writes cannot be relied on. */
  fatal(input: LogEvent): void {
    try {
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(
        path.join(this.directory, 'discorja.fatal.log'),
        JSON.stringify(this.record(input)) + '\n',
        { mode: 0o600 },
      );
    } catch {
      /* Preserve the original crash behavior. */
    }
  }
  flush(): Promise<void> {
    return this.queue;
  }
  snapshot() {
    const result = this.queue.then(() => this.readSnapshot());
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private async readSnapshot() {
    if (this.failed) throw new Error('Não foi possível gravar os logs locais.');
    const records: Record<string, unknown>[] = [];
    for (const name of [
      this.file(2),
      this.file(1),
      this.file(),
      path.join(this.directory, 'discorja.fatal.log'),
    ]) {
      const file = await open(name, 'r').catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!file) continue;
      let contents: Buffer;
      try {
        const buffer = Buffer.alloc(this.maxBytes + 2049);
        let total = 0;
        while (total < buffer.length) {
          const { bytesRead } = await file.read(
            buffer,
            total,
            buffer.length - total,
            total,
          );
          if (!bytesRead) break;
          total += bytesRead;
        }
        contents = buffer.subarray(0, total);
      } finally {
        await file.close();
      }
      // Do not export a replaced or unexpectedly large local file.
      if (contents.length > this.maxBytes + 2048)
        throw new Error('Arquivo de log excede o limite.');
      for (const line of contents.toString('utf8').split('\n')) {
        if (!line) continue;
        try {
          const raw = JSON.parse(line);
          const safe = sanitizeLogEvent(raw);
          if (
            safe &&
            typeof raw.timestamp === 'string' &&
            /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(raw.timestamp) &&
            typeof raw.runId === 'string' &&
            /^[a-f0-9-]{36}$/.test(raw.runId)
          )
            records.push({
              schemaVersion: 1,
              timestamp: raw.timestamp,
              runId: raw.runId,
              ...safe,
            });
        } catch {
          /* Ignore a partial record after an interrupted write. */
        }
      }
    }
    records.sort((a, b) =>
      String(a.timestamp).localeCompare(String(b.timestamp)),
    );
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      droppedRecords: this.droppedRecords,
      records,
    };
  }
}
