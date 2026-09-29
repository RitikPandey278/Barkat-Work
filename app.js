const express = require("express");
const cors = require("cors");
const authRoutes = require("./routers/authRoutes");

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", authRoutes);
app.get("/", (req, res) => res.json({ success: true, message: "Welcome to BarkatWork API" }));

module.exports = app;
