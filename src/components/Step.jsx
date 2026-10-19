import { useStep } from '../deck/steps.js';

/**
 * Content that appears on a later click of the same slide (a "build").
 *
 *   at      the step it appears on: 1, 2, … Left out, it takes the next
 *           step in document order (after any explicit `at` before it).
 *           Several <Step>s can share a number to appear together.
 *   until   the last step it is shown on; it disappears after that
 *   dim     before its step, show it faded instead of hiding it
 *   inline  render a <span>, for use inside a paragraph or a table cell
 *
 * Hidden content keeps its space, so nothing on the slide moves when it
 * appears. A block <Step> adds no box of its own (display: contents): a
 * <Card> wrapped in one is still a grid or flex item of its parent.
 */
export function Step({ at = 1, until, dim = false, inline = false, children }) {
  const step = useStep();
  const shown = step >= at && (until == null || step <= until);
  const state = shown ? 'is-shown' : dim ? 'is-dim' : 'is-hidden';
  const Tag = inline ? 'span' : 'div';
  return (
    <Tag className={`build build--${inline ? 'inline' : 'block'} ${state}`}>
      {children}
    </Tag>
  );
}
