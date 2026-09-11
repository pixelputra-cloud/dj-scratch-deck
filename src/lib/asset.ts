/**
 * Resolve a path to a file that ships in `public/` against the app's deploy
 * base (`import.meta.env.BASE_URL`), so the build works under a sub-path — e.g.
 * GitHub Pages' `/<repo>/` — as well as at a domain root.
 *
 * Vite rebases asset URLs in HTML and CSS automatically, but NOT string
 * literals in JS/TS. Every runtime reference to a `public/` file (fetch URLs,
 * <img src>, worklet/model paths) must go through here.
 *
 *   asset('models/hand_landmarker.task') // -> '/dj-scratch-deck/models/hand_landmarker.task'
 *   asset('/controls/start-stop-on.png') // leading slash is fine too
 */
export function asset(path: string): string {
  // BASE_URL always ends with '/'
  return import.meta.env.BASE_URL + path.replace(/^\/+/, '')
}
