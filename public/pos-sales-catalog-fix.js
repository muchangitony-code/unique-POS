(function () {
  'use strict';

  /*
   * Retired compatibility renderer.
   *
   * The application already loads pos-catalog-compat.js, which repairs the
   * catalogue using the master product endpoint and resolves category IDs to
   * category names. This older script mounted a second renderer using the V3
   * branch-stock endpoint and maintained its own cache. The two renderers
   * could overwrite each other, causing category clicks to display an empty
   * catalogue even though the products existed.
   *
   * Keep this file as a harmless no-op so cached references to the script do
   * not produce a 404, but leave catalogue rendering to one implementation.
   */
})();
