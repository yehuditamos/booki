/** Rollback compatibility shim.
 * A short-lived emergency loader referenced this filename. It is intentionally
 * inert so stale cached loaders can finish without altering Booki startup.
 */
(function(){
  'use strict';
  window.BookiBootFailOpen20260911 = false;
})();
