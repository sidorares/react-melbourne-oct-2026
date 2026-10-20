// Run with: npm start   (a Mac, or an X server / DISPLAY)
//
// A trailer for react-x11 and @react-x11/components, fully automated. The
// trailer itself is ./main.tsx, and every argument it takes is listed
// there; this file only decides what runs it.
//
// **React's production build, always.** A trailer measures what an app
// ships, and React's development build is a different program: for every
// component it renders it logs a performance-track entry with a diff of the
// props, and `structuredClone`s the diff to do it — a table handed a
// million rows was a 6.4-second stall in the first cut of this demo, in
// React's logging and nowhere else. So NODE_ENV is set before React is
// first imported, which is why the trailer is a dynamic import below and
// not a static one (those are hoisted above any statement).
//
// **Bun, where it is installed.** The npm script runs this under Bun, whose
// JavaScriptCore starts faster and whose `Bun.spawn({ terminal })` gives the
// terminal shot a pty with no native module, were it to want one (its
// shell here is scripted). Under Node it runs the same: `npm run start:node`.
process.env.NODE_ENV ??= 'production';

await import('./main.js');
