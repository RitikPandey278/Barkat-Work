require("dotenv").config();

const app = require("./app");
const { connectWhatsApp } = require("./services/whatsappService");

if (!process.env.VERCEL) {
  connectWhatsApp();
}


app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "BarkatWork Backend API đang chạy thành công trên Vercel!"
  });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`BarkatWork API listening on ${PORT}`));
}


module.exports = app;