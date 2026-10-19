// Layout building blocks for slides. Every one of them is plain markup with
// a class; the look lives in components.css, so restyling the deck is a CSS
// change, not an MDX one.

const cx = (...c) => c.filter(Boolean).join(' ');

/** Columns. `template` is a CSS grid-template-columns, e.g. "1fr 600px". */
export function Cols({ template = '1fr 1fr', gap = 40, align = 'start', children, style }) {
  return (
    <div
      className="cols"
      style={{ gridTemplateColumns: template, gap, alignItems: align, ...style }}
    >
      {children}
    </div>
  );
}

/** One column (or any vertical stack). */
export function Col({ gap = 24, justify, children, style }) {
  return (
    <div className="col" style={{ gap, justifyContent: justify, ...style }}>
      {children}
    </div>
  );
}

/** A grid of equal columns, e.g. cards. */
export function Grid({ cols = 3, gap = 24, children, style }) {
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * A card.
 *   variant  'panel' (default) | 'rule' (accent bar on the left, no fill)
 *            | 'top' (panel with an accent bar on top) | 'line' (top rule only)
 *            | 'inverse' (dark panel, also on a light slide) | 'dashed'
 *   tone     'blue' | 'orange' | 'muted' — the accent and the title colour
 *   label    small uppercase line above the title
 *   dense    tighter padding and 24px text, for slides with a lot on them
 */
export function Card({ title, label, tone, variant = 'panel', dense, children, style, className }) {
  return (
    <div
      className={cx('card', `card--${variant}`, tone && `tone--${tone}`, dense && 'card--dense', className)}
      style={style}
    >
      {label && <p className="card__label">{label}</p>}
      {title && <h3 className="card__title">{title}</h3>}
      {children}
    </div>
  );
}

/** A big number with a caption. */
export function Stat({ value, label, tone = 'orange' }) {
  return (
    <div className={cx('stat', `tone--${tone}`)}>
      <p className="stat__value">{value}</p>
      {label && <p className="stat__label">{label}</p>}
    </div>
  );
}

/** Small uppercase label. */
export function Eyebrow({ tone, children }) {
  return <p className={cx('eyebrow', tone && `tone--${tone}`)}>{children}</p>;
}

/** Large paragraph: a subtitle or a statement's second line. */
export function Lead({ children, style }) {
  return (
    <p className="lead" style={style}>
      {children}
    </p>
  );
}

/** Small muted paragraph: captions, measurement conditions. */
export function Small({ children, style }) {
  return (
    <p className="small" style={style}>
      {children}
    </p>
  );
}

/** Inline accents: orange (or amber on dark) and blue (or cyan on dark). */
export const O = ({ children }) => <span className="o">{children}</span>;
export const B = ({ children }) => <span className="b">{children}</span>;
/** Inline monospace. */
export const Mono = ({ children }) => <span className="mono">{children}</span>;

/** Wraps a fenced code block to change its font size (default 24px) or its
 *  padding (`pad`, px or a CSS padding; default 28px 36px). */
export function Code({ size = 24, pad, children, style }) {
  const vars = { '--code-size': `${size}px` };
  if (pad != null) vars['--code-pad'] = typeof pad === 'number' ? `${pad}px` : pad;
  return (
    <div className="code" style={{ ...vars, ...style }}>
      {children}
    </div>
  );
}

/** A screenshot: rounded, with a shadow. Pass `style` to pin it. */
export function Shot({ src, alt, width, height, style }) {
  return (
    <img
      className="shot"
      src={src}
      alt={alt}
      style={{ width, height, ...style }}
    />
  );
}

/** A numbered row: the number in an accent colour, then the text.
 *  `variant="box"` puts it on a panel; `size="lg"` is the takeaways size. */
export function Numbered({ n, tone = 'orange', variant, size, children }) {
  return (
    <div
      className={cx('numbered', `tone--${tone}`, variant && `numbered--${variant}`, size && `numbered--${size}`)}
    >
      <p className="numbered__n">{n}</p>
      <div className="numbered__body">{children}</div>
    </div>
  );
}

/** One row of a layer diagram. */
export function Layer({ name, tone, dashed, children }) {
  return (
    <div className={cx('layer', tone && `tone--${tone}`, dashed && 'layer--dashed')}>
      <p className="layer__name">{name}</p>
      <p className="layer__text">{children}</p>
    </div>
  );
}

/** A spacer that takes the remaining space in a column. */
export const Spacer = () => <div style={{ flex: 1 }} />;
