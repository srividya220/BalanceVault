import { Router } from 'express';
import { applicationController } from '../controllers/applicationController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

// POST /applications — customer submits a new account application
router.post('/', applicationController.submitApplication.bind(applicationController));

// GET /applications/my — customer views own applications
router.get('/my', applicationController.getMyApplications.bind(applicationController));

// GET /applications — admin views all applications
router.get('/', applicationController.getAllApplications.bind(applicationController));

// PATCH /applications/:id/approve — admin approves
router.patch('/:id/approve', applicationController.approveApplication.bind(applicationController));

// PATCH /applications/:id/reject — admin rejects
router.patch('/:id/reject', applicationController.rejectApplication.bind(applicationController));

export default router;
