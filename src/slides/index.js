// The deck, in order. Each file is a section; each <Slide> in it is a slide.
// Add a section: create the .mdx file and add it here.
import * as intro from './01-intro.mdx';
import * as tryIt from './02-try-it.mdx';
import * as overview from './03-overview.mdx';
import * as contract from './04-contract.mdx';
import * as phases from './05-phases.mdx';
import * as priorities from './06-priorities.mdx';
import * as update from './07-update.mdx';
import * as architecture from './08-architecture.mdx';
import * as damage from './09-damage.mdx';
import * as text from './10-text.mdx';
import * as fast from './11-fast.mdx';
import * as close from './12-close.mdx';

export const sections = [
  intro,
  tryIt,
  overview,
  contract,
  phases,
  priorities,
  update,
  architecture,
  damage,
  text,
  fast,
  close,
];
