require("dotenv").config();

const app = require("./app");
const { connectWhatsApp } = require("./services/whatsappService");

// Chạy WhatsApp Service chỉ khi ở môi trường Local (không chạy trên Vercel)
if (!process.env.VERCEL) {
  connectWhatsApp();
}

// Route mặc định kiểm tra trạng thái Backend
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "BarkatWork Backend API đang chạy thành công trên Vercel!"
  });
});

// Kiểm tra nếu chạy ở Local thì mới dùng app.listen
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`BarkatWork API listening on ${PORT}`));
}

// Xuất app để Vercel xử lý theo dạng Serverless Function
module.exports = app;