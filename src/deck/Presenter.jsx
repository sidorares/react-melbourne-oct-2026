import { useEffect, useState } from 'react';
import { Stage } from './Stage.jsx';
import { StepContext } from './steps.js';

function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The speaker's window (press `p` in the deck). It follows the audience
 * window over a BroadcastChannel, and drives it: navigate from either.
 * "Next" is what the next click shows: the slide's next build step, or the
 * next slide.
 */
export function Presenter({ slides, index, step, next, prev }) {
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const current = slides[index];
  const upcoming =
    step < current.steps
      ? { slide: current, step: step + 1, label: `step ${step + 1}` }
      : slides[index + 1]
        ? { slide: slides[index + 1], step: 0, label: `slide ${index + 2}` }
        : null;
  return (
    <div className="presenter">
      <header className="presenter__bar">
        <span>
          <b>{index + 1}</b> / {slides.length}
          {current.steps > 0 && (
            <>
              {' '}
              · step <b>{step}</b> / {current.steps}
            </>
          )}{' '}
          · {current.section}
        </span>
        <span>
          elapsed <b>{clock(now - start)}</b>{' '}
          <button type="button" onClick={() => setStart(Date.now())}>
            reset
          </button>
        </span>
        <span>
          {new Date(now).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <span className="presenter__nav">
          <button type="button" onClick={prev}>
            ← prev
          </button>
          <button type="button" onClick={next}>
            next →
          </button>
        </span>
      </header>
      <div className="presenter__current">
        <StepContext.Provider value={step}>
          <Stage label={index + 1}>{current.element}</Stage>
        </StepContext.Provider>
      </div>
      <aside className="presenter__side">
        <div className="presenter__next">
          {upcoming ? (
            <>
              <StepContext.Provider value={upcoming.step}>
                <Stage label={upcoming.label}>{upcoming.slide.element}</Stage>
              </StepContext.Provider>
              <p className="presenter__next-label">next: {upcoming.label}</p>
            </>
          ) : (
            <p className="presenter__end">End of deck</p>
          )}
        </div>
        <div className="presenter__notes">
          {current.notes ?? <p className="presenter__empty">No notes.</p>}
        </div>
      </aside>
    </div>
  );
}
