const inventoryV3 = require('./inventory-v3.cjs');

/**
 * Mount the authoritative V3 inventory API directly on the real Express app.
 * This replaces the old generated-bundle/source-string patch mechanism.
 */
function mountInventoryV3Routes(app) {
  if (!app || typeof app.use !== 'function') {
    throw new TypeError('mountInventoryV3Routes requires an Express app');
  }
  if (!inventoryV3 || typeof inventoryV3.mount !== 'function') {
    throw new Error('Inventory V3 module does not expose mount(app)');
  }
  inventoryV3.mount(app);
}

module.exports = { mountInventoryV3Routes };
