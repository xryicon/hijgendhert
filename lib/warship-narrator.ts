// One sound at a time. Async downloads cannot restart narration after mute/exit.
export class SeaNarrator {
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private source: AudioBufferSourceNode | null = null;
  private generation = 0;
  private disposed = false;
  constructor(private context: AudioContext, private fetcher: typeof fetch = fetch) {}
  async unlock() { await this.context.resume(); if (this.context.state !== 'running') throw new Error('Geluid is geblokkeerd. Klik opnieuw op Geluid aan.'); }
  private buffer(url: string) {
    let result = this.buffers.get(url);
    if (!result) {
      result = (async () => {
        const response = await this.fetcher(url, { signal: AbortSignal.timeout(12000), cache: 'force-cache' });
        if (!response.ok) throw new Error('De voice-over kon niet worden geladen.');
        return this.context.decodeAudioData(await response.arrayBuffer());
      })();
      this.buffers.set(url, result);
      void result.catch(() => { this.buffers.delete(url); });
    }
    return result;
  }
  preload(urls: readonly string[]) { urls.forEach(url => { void this.buffer(url).catch(() => {}); }); }
  stop() { this.generation++; this.source?.stop(); this.source?.disconnect(); this.source = null; }
  async play(url: string, offset: () => number, failed: (message: string) => void) {
    this.stop(); const generation = this.generation;
    try {
      const buffer = await this.buffer(url);
      if (this.disposed || generation !== this.generation) return;
      await this.unlock();
      if (this.disposed || generation !== this.generation) return;
      const seek = Math.max(0, offset());
      if (seek >= buffer.duration) return;
      const source = this.context.createBufferSource();
      source.buffer = buffer; source.connect(this.context.destination);
      this.source = source; source.start(0, seek);
    } catch (error) {
      if (!this.disposed && generation === this.generation) failed(error instanceof Error ? error.message : 'Klik opnieuw op Geluid aan.');
    }
  }
  dispose() { this.disposed = true; this.stop(); void this.context.close().catch(() => {}); }
}
