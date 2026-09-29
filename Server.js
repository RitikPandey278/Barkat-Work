require("dotenv").config();
const axios = require("axios");
const app = require("./app");
const { connectWhatsApp } = require("./services/whatsappService");

// Root Health-Check Route (Render aur Vercel uptime check ke liye)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "BarkatWork Backend API is running successfully!"
  });
});

// Port configuration aur Local/Render Server Startup
const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL) {
  // Local environment mein WhatsApp service connect karein
  connectWhatsApp();

  app.listen(PORT, () => {
    console.log(`BarkatWork API listening on port ${PORT}`);

    // Self-Ping Service: Render Server ko sleep mode mein jaane se rokne ke liye
    const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    
    setInterval(async () => {
      try {
        await axios.get(RENDER_URL);
        console.log("Keep-alive self-ping sent successfully!");
      } catch (err) {
        console.error("Keep-alive ping error:", err.message);
      }
    }, 14 * 60 * 1000); // Har 14 minute mein ping karega
  });
}

module.exports = app;