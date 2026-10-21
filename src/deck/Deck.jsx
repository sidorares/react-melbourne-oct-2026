import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collectSlides } from './collect.js';
import { Stage } from './Stage.jsx';
import { Presenter } from './Presenter.jsx';
import { StepContext } from './steps.js';

const CHANNEL = 'react-melbourne-oct-2026';

// #/12             slide 12, before its first build step
// #/12.2           slide 12, build step 2
// #/presenter/12   the speaker's window
// #/overview/12    every slide as a thumbnail
// #/print          every slide, one per page (print to PDF)
function parsePlace(text) {
  const [n, s] = (text ?? '').split('.');
  return { n: +n || 1, s: +s || 0 };
}
function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'presenter') return { mode: 'presenter', ...parsePlace(parts[1]) };
  if (parts[0] === 'overview') return { mode: 'overview', ...parsePlace(parts[1]) };
  if (parts[0] === 'print') return { mode: 'print', n: 1, s: 0 };
  return { mode: 'deck', ...parsePlace(parts[0]) };
}

function hashFor(mode, n, s = 0) {
  if (mode === 'print') return '#/print';
  const prefix = mode === 'deck' ? '' : `${mode}/`;
  return `#/${prefix}${n}${s > 0 ? `.${s}` : ''}`;
}

export function Deck({ sections }) {
  const slides = useMemo(() => collectSlides(sections), [sections]);
  const count = slides.length;
  const [route, setRoute] = useState(parseHash);
  const index = Math.min(Math.max(route.n, 1), count) - 1;
  const steps = slides[index].steps;
  const step = Math.min(Math.max(route.s, 0), steps);

  const channel = useMemo(
    () =>
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(CHANNEL),
    [],
  );

  const navigate = useCallback(
    (mode, n, s = 0, broadcast = true) => {
      const clamped = Math.min(Math.max(n, 1), count);
      const max = slides[clamped - 1].steps;
      const st = Math.min(Math.max(s, 0), max);
      history.replaceState(null, '', hashFor(mode, clamped, st));
      setRoute({ mode, n: clamped, s: st });
      if (broadcast) channel?.postMessage({ n: clamped, s: st });
    },
    [count, slides, channel],
  );
  const go = useCallback(
    (n, s = 0) => navigate(route.mode, n, s),
    [navigate, route.mode],
  );

  // → shows the slide's next build step, then the next slide;
  // ← takes steps back, then lands on the previous slide fully built
  const next = useCallback(() => {
    if (step < steps) go(index + 1, step + 1);
    else if (index < count - 1) go(index + 2, 0);
  }, [go, index, step, steps, count]);
  const prev = useCallback(() => {
    if (step > 0) go(index + 1, step - 1);
    else if (index > 0) go(index, slides[index - 1].steps);
  }, [go, index, step, slides]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!channel) return undefined;
    channel.onmessage = (e) => {
      if (typeof e.data?.n === 'number') {
        navigate(route.mode, e.data.n, e.data.s ?? 0, false);
      }
    };
    return () => {
      channel.onmessage = null;
    };
  }, [channel, navigate, route.mode]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName)) {
        return;
      }
      const n = index + 1;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case 'Enter':
          next();
          break;
        case ' ':
          if (e.shiftKey) prev();
          else next();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
          prev();
          break;
        case 'Home':
          go(1);
          break;
        case 'End':
          go(count, slides[count - 1].steps);
          break;
        case 'o':
          navigate(route.mode === 'overview' ? 'deck' : 'overview', n, step);
          break;
        case 'Escape':
          if (route.mode === 'overview') navigate('deck', n, step);
          break;
        case 'p':
          window.open(
            `${location.pathname}${location.search}${hashFor('presenter', n, step)}`,
            'react-melbourne-presenter',
            'width=1440,height=900',
          );
          break;
        case 'f':
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen?.();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [index, step, count, slides, go, next, prev, navigate, route.mode]);

  // swipe on touch screens
  const touch = useRef(null);
  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') touch.current = e.clientX;
  };
  const onPointerUp = (e) => {
    if (touch.current == null) return;
    const dx = e.clientX - touch.current;
    touch.current = null;
    if (dx < -60) next();
    else if (dx > 60) prev();
  };

  if (route.mode === 'presenter') {
    return (
      <Presenter
        slides={slides}
        index={index}
        step={step}
        next={next}
        prev={prev}
      />
    );
  }

  if (route.mode === 'print') {
    return (
      <div className="print">
        {slides.map((s, i) => (
          <StepContext.Provider key={s.id} value={s.steps}>
            <Stage scale={1} label={i + 1}>
              {s.element}
            </Stage>
          </StepContext.Provider>
        ))}
      </div>
    );
  }

  if (route.mode === 'overview') {
    return (
      <div className="overview">
        {slides.map((s, i) => (
          <button
            type="button"
            key={s.id}
            className={`overview__item${i === index ? ' is-current' : ''}`}
            onClick={() => navigate('deck', i + 1)}
          >
            <StepContext.Provider value={s.steps}>
              <Stage scale={0.16} label={i + 1}>
                {s.element}
              </Stage>
            </StepContext.Provider>
            <span className="overview__label">
              {i + 1} · {s.section}
              {s.steps > 0 ? ` · ${s.steps} steps` : ''}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="deck"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <StepContext.Provider value={step}>
        <Stage label={index + 1}>{slides[index].element}</Stage>
      </StepContext.Provider>
      <div
        className="deck__progress"
        style={{ width: `${((index + 1) / count) * 100}%` }}
      />
    </div>
  );
}
