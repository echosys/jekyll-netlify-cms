// @ts-nocheck
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

export interface ArchivePartSpec {
  filename: string;
  size: number;
}

export interface ArchiveWriterOptions {
  backupRoot: string;
  baseName: string; // e.g. backup_20260210T103012
  maxPartSizeBytes: number; // default 10 GiB
}

export class ArchiveWriter {
  private backupRoot: string;
  private baseName: string;
  private maxPartSizeBytes: bigint;

  private currentPartIndex = 1;
  private currentStream: fs.WriteStream | null = null;
  private currentArchive: archiver.Archiver | null = null;
  private currentPartPathTmp: string | null = null;
  private currentPartPathFinal: string | null = null;
  private currentBytesWritten: bigint = 0n;

  constructor(opts: ArchiveWriterOptions) {
    this.backupRoot = opts.backupRoot;
    this.baseName = opts.baseName;
    this.maxPartSizeBytes = BigInt(opts.maxPartSizeBytes || 10 * 1024 * 1024 * 1024);
    fs.mkdirSync(path.join(this.backupRoot, 'archives'), { recursive: true });
  }

  private partFilename(index: number) {
    return `${this.baseName}.part${String(index).padStart(3, '0')}.zip`;
  }

  private openNewPart() {
    if (this.currentArchive) throw new Error('current archive still open');
    this.currentPartPathFinal = path.join('archives', this.partFilename(this.currentPartIndex));
    const tmpName = this.partFilename(this.currentPartIndex) + '.tmp';
    this.currentPartPathTmp = path.join(this.backupRoot, 'archives', tmpName);
    const outPathTmp = this.currentPartPathTmp;

    this.currentStream = fs.createWriteStream(outPathTmp);
    this.currentArchive = archiver('zip', { zlib: { level: 0 }, forceZip64: true });
    this.currentArchive.pipe(this.currentStream);
    this.currentBytesWritten = 0n;
  }

  private async finalizeCurrentPart() {
    if (!this.currentArchive || !this.currentStream || !this.currentPartPathTmp || !this.currentPartPathFinal) return;
    await this.currentArchive.finalize();
    await new Promise<void>((resolve, reject) => {
      this.currentStream!.on('close', () => resolve());
      this.currentStream!.on('finish', () => resolve());
      this.currentStream!.on('error', reject);
    });
    // rename tmp -> final
    const src = this.currentPartPathTmp;
    const dst = path.join(this.backupRoot, this.currentPartPathFinal);
    fs.renameSync(src, dst);
    this.currentArchive = null;
    this.currentStream = null;
    this.currentPartPathTmp = null;
    this.currentPartPathFinal = null;
    this.currentPartIndex += 1;
  }

  // add a file (sourcePath) with its relative name inside archive
  // returns the part filename it was written into
  async addFile(sourcePath: string, nameInArchive: string) {
    const stat = fs.statSync(sourcePath);
    const fileSize = BigInt(stat.size);

    // if file alone exceeds maxPartSizeBytes, we still place it in its own part
    if (fileSize > this.maxPartSizeBytes) {
      // if there's an open part, finalize it first
      if (this.currentArchive) await this.finalizeCurrentPart();
      // open a new part for this file only
      this.openNewPart();
      this.currentArchive!.file(sourcePath, { name: nameInArchive, store: true });
      await this.finalizeCurrentPart();
      return this.partFilename(this.currentPartIndex - 1);
    }

    // ensure we have a part open
    if (!this.currentArchive) this.openNewPart();

    // if adding this file would exceed the limit, finalize current and open a new one
    if (this.currentBytesWritten + fileSize > this.maxPartSizeBytes) {
      await this.finalizeCurrentPart();
      this.openNewPart();
    }

    // add file
    this.currentArchive!.file(sourcePath, { name: nameInArchive, store: true });
    // we can't know compressed/zip overhead exactly, but since store mode, size ~ file size + small header
    this.currentBytesWritten += fileSize;
    return this.partFilename(this.currentPartIndex);
  }

  async close() {
    if (this.currentArchive) await this.finalizeCurrentPart();
  }
}
