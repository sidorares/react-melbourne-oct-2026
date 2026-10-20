// A typist on a timeline: steps of text typed at a rate, and actions
// between them, played against a shot's clock.
//
// Every step has its start worked out once, from the lengths before it, so
// a frame that comes late types the characters it owes in one go and the
// script ends when it says it does. Typing speed is the readable kind —
// fast enough to be a demonstration, slow enough that the words land.

export type Step =
  /** Type `text`, `cps` characters a second (default: the script's). */
  | { type: string; cps?: number }
  /** Do something — a key, a command — then wait `wait` ms. */
  | { run: () => void; wait?: number }
  /** Stand still. */
  | { wait: number };

interface Timed {
  step: Step;
  at: number;
  ms: number;
}

export class Script {
  private timed: Timed[] = [];
  private index = 0;
  private typed = 0;
  readonly end: number;

  constructor(
    steps: readonly Step[],
    private readonly typeText: (text: string) => void,
    { start = 0, cps = 60 } = {},
  ) {
    let at = start;
    for (const step of steps) {
      const ms =
        'type' in step
          ? (step.type.length / (step.cps ?? cps)) * 1000
          : (step.wait ?? 0);
      this.timed.push({ step, at, ms });
      at += ms;
    }
    this.end = at;
  }

  /** Bring the document up to `t`. */
  tick(t: number): void {
    while (this.index < this.timed.length) {
      const { step, at, ms } = this.timed[this.index];
      if (t < at) return;
      if ('type' in step) {
        const due =
          ms > 0
            ? Math.min(
                step.type.length,
                Math.floor(((t - at) / ms) * step.type.length),
              )
            : step.type.length;
        if (due > this.typed) {
          this.typeText(step.type.slice(this.typed, due));
          this.typed = due;
        }
        if (due < step.type.length) return;
        this.typed = 0;
      } else if ('run' in step) {
        step.run();
      }
      this.index++;
    }
  }
}
