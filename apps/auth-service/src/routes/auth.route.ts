import { Router } from "express";
import { login, signup } from "../controller/auth.controller";

const router = Router();
router.post("/signup", signup);
router.post("/login", login);

export default router;
