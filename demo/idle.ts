// Work done while nothing is looking.
//
// The trailer's data is large — a million table rows, a quarter of a million
// stars — and building any of it in the frame a scene first shows would be
// that frame dropped. So each dataset is a generator that yields every few
// thousand items, and a pump runs them in slices of a few milliseconds,
// between frames, from the moment the window is up: during the intro and
// the cards, whose animations Core Animation runs while this thread works.
//
// `Prepared.get()` is the escape hatch: a scene that arrives before its data
// is finished finishes it on the spot. On a fast machine nothing ever takes
// it; on a slow one the cut is late rather than the scene empty.
type Job = Generator<void, void, void>;

const SLICE_MS = 5;
const queue: Prepared<unknown>[] = [];
let pumping = false;

export class Prepared<T> {
  private value: T | undefined;
  private job: Job | null = null;
  private done = false;

  constructor(
    readonly name: string,
    private readonly make: (out: (value: T) => void) => Job,
  ) {}

  /** Start building it, in slices, behind whatever is already queued. */
  start(): this {
    if (this.job || this.done) return this;
    this.job = this.make((v) => (this.value = v));
    queue.push(this as Prepared<unknown>);
    pump();
    return this;
  }

  /** One step of the build; true when it has finished. */
  step(): boolean {
    if (this.done) return true;
    if (!this.job) this.job = this.make((v) => (this.value = v));
    if (this.job.next().done) this.done = true;
    return this.done;
  }

  get ready(): boolean {
    return this.done;
  }

  /** The value, built here and now if the pump has not got to it. */
  get(): T {
    while (!this.step()) {
      /* finish it */
    }
    return this.value as T;
  }
}

function pump(): void {
  if (pumping) return;
  pumping = true;
  const slice = (): void => {
    const end = performance.now() + SLICE_MS;
    while (queue.length && performance.now() < end) {
      if (queue[0].step()) queue.shift();
    }
    if (queue.length) setTimeout(slice, 1);
    else pumping = false;
  };
  setTimeout(slice, 1);
}
