import { Router } from 'express';
import type { ListCards } from '../../../application/deck/list-cards';
import type { ListDueCards } from '../../../application/deck/list-due-cards';
import type { ReviewCard } from '../../../application/deck/review-card';

export interface CardUseCases {
  listCards: ListCards;
  listDueCards: ListDueCards;
  reviewCard: ReviewCard;
}

export function cardRoutes(uc: CardUseCases): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const { player, q, category, due } = req.query;
    res.json(uc.listCards.execute({ player, q, category, due }));
  });

  router.get('/due', (req, res) => {
    res.json(uc.listDueCards.execute(req.query.player, req.query.limit));
  });

  router.post('/:exprId/review', (req, res) => {
    const body = req.body || {};
    res.json(uc.reviewCard.execute({
      player: req.query.player ?? body.player, expressionId: req.params.exprId, mode: body.mode, rating: body.rating,
    }));
  });

  return router;
}
