const express = require("express");
const cors = require("cors");
const authRoutes = require("./routers/authRoutes");
const aiRoutes = require('./routers/aiRoutes');
const jobRoutes = require('./routers/jobRoutes');

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", authRoutes);
app.get("/", (req, res) => res.json({ success: true, message: "Welcome to BarkatWork API" }));

// Routes mount karein:
app.use('/api/ai', aiRoutes);

app.use('/api/jobs', jobRoutes);

// 🌐 Deep Link Web Redirect Page
app.get('/job/:id', (req, res) => {
    const jobId = req.params.id;
    const playStoreUrl = "https://play.google.com/store/apps/details?id=com.barkatwork.app";
    const appDeepLink = `barkatwork://job?id=${jobId}`;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Opening BarkatWork...</title>
            <script>
                window.location.href = "${appDeepLink}";
                setTimeout(function() {
                    window.location.href = "${playStoreUrl}";
                }, 1800);
            </script>
        </head>
        <body style="font-family:sans-serif; text-align:center; padding-top:50px;">
            <h2>Opening BarkatWork Job...</h2>
            <p>If app doesn't open, <a href="${playStoreUrl}">Click Here to Download from Play Store</a></p>
        </body>
         </html>
    `);
});

module.exports = app;
