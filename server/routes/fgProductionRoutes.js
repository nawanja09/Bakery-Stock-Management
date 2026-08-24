// server/routes/fgProductionRoutes.js
//
// FG - Finished Goods Production (NEW, INDEPENDENT MODULE)
// Mounted at /api/fg-production in server.js
// This does NOT reuse or touch the existing /api/finished-goods-* routes.

const express = require('express');
const router = express.Router();
const fgProductionController = require('../controllers/fgProductionController');

// IMPORTANT: literal routes must be declared before the ':id' param routes
// so they aren't accidentally captured by the wildcard.

// Reports
router.get('/reports/recipes', fgProductionController.getRecipesReport);

// Ravon POS integration - FG Item dropdown source (must be declared before
// the '/:id' routes below so 'items' isn't captured as an :id param)
router.get('/items', fgProductionController.getPosItems);

// FG Production (header)
router.get('/', fgProductionController.getAllFgProduction);
router.post('/', fgProductionController.createFgProduction);

// Recipes nested under a FG Production item
router.get('/:id/recipes', fgProductionController.getRecipesForFg);
router.post('/:id/recipes', fgProductionController.addRecipe);

// Recipe by its own id
router.put('/recipes/:recipeId', fgProductionController.updateRecipe);
router.delete('/recipes/:recipeId', fgProductionController.deleteRecipe);

// FG Production (header) by id - declared last among GET/PUT/DELETE with
// a single path segment so literal routes above always win first.
router.get('/:id', fgProductionController.getFgProductionById);
router.put('/:id', fgProductionController.updateFgProduction);
router.delete('/:id', fgProductionController.deleteFgProduction);

module.exports = router;
