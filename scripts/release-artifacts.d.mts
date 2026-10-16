export function verifyRelease(
  directory: string,
  version: string,
): Promise<{ version: string; files: string[]; size: number; sha512: string }>;
