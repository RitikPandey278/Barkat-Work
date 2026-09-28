const express = require("express");
const cors = require("cors");
const authRoutes = require("./routers/authRoutes");
const userRoutes = require("./routers/userRoutes");

const app = express();

app.disable("x-powered-by");

// Middleware
app.use(
    cors({
        origin: process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
            : true,
        credentials: true
    })
);

app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);

app.use("/api/user", userRoutes);

app.get("/", (req, res) =>{
    res.json({
        success: true,
        message: "Welcome to BarkatWork API"
    });

    
});
module.exports = app;