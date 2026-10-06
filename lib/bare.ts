/** Set by the middleware on a request for a shared page, read by the
 *  root layout, which then renders the page on its own with none of
 *  the app's navigation around it. A layout cannot see the path it is
 *  rendering, so the middleware has to say. */
export const BARE = "x-biblo-bare";
