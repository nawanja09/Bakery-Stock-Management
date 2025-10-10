const express = require('express');
const router = express.Router();
const finishedGoodsIngredientsController = require('../controllers/finishedGoodsIngredientsController');

router.get('/raw-materials', finishedGoodsIngredientsController.getRawMaterials);
router.post('/', finishedGoodsIngredientsController.createFinishedGoodsIngredients);
router.get('/:finishedGoodId', finishedGoodsIngredientsController.getIngredientsByFinishedGood);
router.put('/', finishedGoodsIngredientsController.updateFinishedGoodsIngredients);
router.delete('/:id', finishedGoodsIngredientsController.deleteIngredient);

module.exports = router;