import { createContext, useContext } from 'react';

/**
 * The build step of the slide being rendered: 0 before the first click on
 * it, then 1, 2, … In the overview and in print it is the slide's last step,
 * so a slide is shown in its final state. Outside a slide: Infinity.
 */
export const StepContext = createContext(Infinity);

/** The current build step, for components that change with it. */
export function useStep() {
  return useContext(StepContext);
}
