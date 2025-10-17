import cors from "cors";
import "dotenv/config";
import express from "express"
import { apikey } from "./serverClient";

const app = express()
app.use(express.json());
app.use(cors({origin: "*"}))

app.get("/", (req, res) => {
    res.json({
        message: "AI writing Assistant server is running", 
        apikey: apikey
    })
})

app.listen(3000, () => {
    console.log("server is running on port 3000")
});
