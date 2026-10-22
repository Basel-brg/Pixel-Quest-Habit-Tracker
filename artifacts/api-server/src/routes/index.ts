import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pixelQuestRouter from "./pixel-quest";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pixelQuestRouter);

export default router;
