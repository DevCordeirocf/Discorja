export interface AudioBuildBatchOptions {
  vcvars: string;
  source: string;
  objectFile: string;
  output: string;
  compiler?: string;
}

export function createAudioBuildBatch(options: AudioBuildBatchOptions): string;
export function runWindowsBatchFile(
  scriptPath: string,
  cwd: string,
  stdio?: 'inherit' | 'pipe',
): void;
