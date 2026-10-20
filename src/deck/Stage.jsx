import { useLayoutEffect, useRef, useState } from 'react';

export const WIDTH = 1920;
export const HEIGHT = 1080;

/**
 * The react-x11 example browser (react-x11-components' examples/browser)
 * mounts an <iframe>'s document only where no transform but a translation
 * is around it, and nothing fixed to the viewport is: a scaled stage, or a
 * `position: fixed` deck, leaves the playground slide blank there. In that
 * browser the canvas is shown at 1:1, centred, and cropped by a window
 * smaller than 1920×1080, the deck is absolute rather than fixed, and the
 * progress bar, which a cropped slide's iframe runs under, is left out.
 */
export const UNSCALED =
  typeof navigator !== 'undefined' &&
  /react-x11-components/.test(navigator.userAgent);

/**
 * A 1920×1080 canvas scaled to fit its box (or to a fixed scale, for
 * thumbnails and print). Slides are authored in canvas pixels, so a layout
 * looks the same on a laptop, a projector and in the PDF.
 *
 * In development it also says when a slide's content is taller or wider
 * than the canvas: the stage gets `data-overflow` (outlined in red in the
 * overview) and the console names the slide.
 */
export function Stage({ children, scale: fixedScale, label }) {
  const ref = useRef(null);
  const canvas = useRef(null);
  const [scale, setScale] = useState(fixedScale ?? 1);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    if (fixedScale) return undefined;
    const el = ref.current;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / WIDTH, height / HEIGHT));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedScale]);

  useLayoutEffect(() => {
    const slide = canvas.current?.firstElementChild;
    if (!slide) return;
    const over =
      slide.scrollHeight > HEIGHT + 1 || slide.scrollWidth > WIDTH + 1;
    setOverflow(over);
    if (over && import.meta.env.DEV) {
      console.warn(
        `deck: slide ${label ?? ''} overflows the canvas ` +
          `(${slide.scrollWidth}×${slide.scrollHeight})`,
      );
    }
  });

  const sized = fixedScale
    ? { width: WIDTH * fixedScale, height: HEIGHT * fixedScale }
    : undefined;
  return (
    <div
      className="stage"
      ref={ref}
      style={sized}
      data-overflow={overflow || undefined}
    >
      <div
        className="stage__canvas"
        ref={canvas}
        style={{
          transform:
            UNSCALED && !fixedScale
              ? 'translate(-50%, -50%)'
              : `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
