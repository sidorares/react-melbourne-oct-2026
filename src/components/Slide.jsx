import { Children, isValidElement } from 'react';

/**
 * Speaker notes. Lives inside a <Slide>; never drawn on the slide, shown in
 * the presenter window (press `p`). Plain markdown inside.
 */
export function Notes() {
  return null;
}

/**
 * One slide on the 1920×1080 canvas.
 *
 *   theme   'light' (default) | 'dark' | 'accent'
 *   layout  'default'  — title at the top, content flows below, footer
 *           'statement' — vertically centred, no footer
 *   source  footer text after "react-x11 · <section>"
 *   footer  false to hide the footer on a default slide
 *   bar     true draws the orange bar down the left edge (cover, thanks)
 *   gap     space between blocks, px (default 40)
 */
export function Slide({
  theme = 'light',
  layout = 'default',
  source,
  footer = true,
  bar = false,
  gap,
  section,
  className,
  style,
  children,
}) {
  const content = Children.toArray(children).filter(
    (c) => !(isValidElement(c) && c.type === Notes),
  );
  const showFooter = layout === 'default' && footer !== false;
  return (
    <section
      className={[
        'slide',
        `slide--${theme}`,
        `slide--${layout}`,
        showFooter ? 'slide--has-footer' : '',
        className ?? '',
      ].join(' ')}
      style={{ ...(gap != null ? { gap } : null), ...style }}
    >
      {bar && <div className="slide__bar" />}
      {content}
      {showFooter && (
        <p className="slide__footer">
          react-x11{section ? ` · ${section}` : ''}
          {source ? ` · ${source}` : ''}
        </p>
      )}
    </section>
  );
}
