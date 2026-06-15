import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config";
import routes from "./routes";

const app = express();

app.use(express.json());
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use("/api/v1", routes);

app.listen(config.PORT, () => {
  console.log("Auth service is running on port", config.PORT);
});

