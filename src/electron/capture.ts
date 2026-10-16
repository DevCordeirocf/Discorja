interface CaptureGrant {
  id: string;
  audio: boolean;
  expires: number;
  generation: number;
}

/** Short, one-use grants. Cancellation also invalidates an asynchronous source lookup. */
export class CaptureAuthorization {
  private selected: CaptureGrant | null = null;
  private generation = 0;

  select(id: string, audio: unknown, platform: string, now = Date.now()): void {
    this.cancel();
    if (typeof audio !== 'boolean' || (audio && platform !== 'win32'))
      throw new Error(
        'Captura de som do computador indisponível. Use somente vídeo.',
      );
    this.selected = {
      id,
      audio,
      expires: now + 15000,
      generation: this.generation,
    };
  }

  pending(now = Date.now()): boolean {
    return Boolean(this.selected && now <= this.selected.expires);
  }

  consume(audioRequested: boolean, now = Date.now()): CaptureGrant | null {
    const grant = this.selected;
    this.selected = null;
    if (!grant || now > grant.expires || (audioRequested && !grant.audio))
      return null;
    return grant;
  }

  current(grant: CaptureGrant): boolean {
    return grant.generation === this.generation && Date.now() <= grant.expires;
  }

  cancel(): void {
    this.generation++;
    this.selected = null;
  }
}

export function displayMediaPermission(
  pending: boolean,
  mediaTypes: unknown,
): boolean {
  // Device capture identifies audio/video here. Desktop capture uses an empty list.
  return pending && Array.isArray(mediaTypes) && mediaTypes.length === 0;
}
