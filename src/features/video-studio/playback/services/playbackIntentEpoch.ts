/**
 * Monotonic seek epoch shared by playback-adjacent async boundaries.
 * A seek creates a new epoch; callbacks belonging to older epochs are stale.
 */
export class PlaybackIntentEpoch {
  private value = 0;

  get current(): number {
    return this.value;
  }

  advance(): number {
    this.value += 1;
    return this.value;
  }

  isCurrent(epoch: number): boolean {
    return epoch === this.value;
  }
}
