import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import { loginSchema, signupSchema } from '../validators/auth.schema';

const router = Router();

router.post('/signup', authLimiter, validate({ body: signupSchema }), authController.signup);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.get('/me', requireAuth, authController.me);
router.post('/logout', requireAuth, authController.logout);

export default router;
