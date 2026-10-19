import { Children, cloneElement, isValidElement } from 'react';
import { components } from '../components/index.js';
import { Slide, Notes } from '../components/Slide.jsx';
import { Step } from '../components/Step.jsx';

/**
 * Number the slide's <Step>s and find how many build steps it has.
 *
 * A <Step> without `at` takes the next number in document order, after
 * the highest explicit `at` seen so far, so `<Step>` `<Step>` `<Step at={1}>`
 * reads as 1, 2, 1. Walks the element tree MDX produced, which is static:
 * nothing is rendered here.
 */
function numberSteps(node, state) {
  if (Array.isArray(node)) return node.map((n) => numberSteps(n, state));
  if (!isValidElement(node)) return node;
  let el = node;
  if (el.type === Step) {
    const at = el.props.at ?? state.next;
    state.next = Math.max(state.next, at + 1);
    state.max = Math.max(state.max, at, el.props.until ?? 0);
    if (el.props.at == null) el = cloneElement(el, { at });
  }
  const kids = el.props.children;
  if (kids == null || typeof kids !== 'object') return el;
  const walked = numberSteps(kids, state);
  return Array.isArray(walked)
    ? cloneElement(el, undefined, ...walked)
    : cloneElement(el, undefined, walked);
}

/**
 * Turn the section modules into a flat list of slides.
 *
 * Each `.mdx` file in src/slides is a section. Calling its default export
 * with no wrapper returns the fragment MDX built from the file; every
 * top-level `<Slide>` in it is one slide. Anything else at the top level
 * (stray text, markdown outside a `<Slide>`) is ignored, with a warning,
 * so a slide can't silently swallow its neighbour.
 */
export function collectSlides(sections) {
  const slides = [];
  for (const mod of sections) {
    const tree = mod.default({ components });
    // a file with one top-level element compiles to that element, not to a
    // fragment around it
    const top =
      tree?.type === Slide ? [tree] : Children.toArray(tree?.props?.children);
    for (const el of top) {
      if (!isValidElement(el)) continue;
      if (el.type !== Slide) {
        console.warn(
          `deck: content outside a <Slide> in section "${mod.section}" is not shown`,
          el,
        );
        continue;
      }
      const notes = Children.toArray(el.props.children).filter(
        (c) => isValidElement(c) && c.type === Notes,
      );
      const state = { next: 1, max: 0 };
      const numbered = numberSteps(el, state);
      slides.push({
        id: el.props.id ?? `s${slides.length + 1}`,
        section: mod.section ?? '',
        // `<Slide steps={n}>` declares steps a component counts itself
        // (through useStep), which no <Step> in the tree can tell us
        steps: Math.max(state.max, el.props.steps ?? 0),
        element: cloneElement(numbered, { section: mod.section ?? '' }),
        notes: notes.length ? notes.map((n) => n.props.children) : null,
      });
    }
  }
  return slides;
}
