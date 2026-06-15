import { Router } from "express";
import { signup, login, refresh, logout } from "../controller/auth.controller";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
