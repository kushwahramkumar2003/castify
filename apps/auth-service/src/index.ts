import cors from "cors";
import express from "express";
import { config } from "./config";
import routes from "./routes";

const app = express();

app.use(express.json());
app.use(cors());
app.use("/api/v1", routes);

app.listen(config.PORT, () => {
  console.log("Auth service is running on port", config.PORT);
});
