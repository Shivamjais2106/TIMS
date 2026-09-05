import { Router, Request, Response } from 'express';
import { firmsIngestTask } from '../jobs/firmsIngest.job';

const router = Router();

router.post('/trigger-firms', async (req: Request, res: Response) => {
  try {
    console.log('Manual FIRMS trigger called...');
    await firmsIngestTask();
    res.status(200).json({ status: 'success', message: 'FIRMS ingest triggered — check logs for result' });
  } catch (err: any) {
    console.error('Manual FIRMS trigger failed:', err);
    res.status(500).json({ status: 'error', message: err.message, stack: err.stack });
  }
});

export default router;