// What every scene is handed by the director.
export interface SceneProps {
  /** Whether this is the shot on screen. A scene pre-rendered for the next
   *  cut is mounted under a hidden `<Activity>` with this false: React has
   *  built it at idle priority, and nothing in it runs until it is shown. */
  active: boolean;
  /** `performance.now()` of the cut that showed it — what its motion is
   *  timed from (`useTick`). */
  start: number;
  /** The scene's box, in logical pixels — what a scene needs to size its
   *  own parts in numbers (shell.tsx, `sceneBox`, says why that matters). */
  size: { width: number; height: number };
}
