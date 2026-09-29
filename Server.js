require("dotenv").config();

const app = require("./app");
const { connectWhatsApp } = require("./services/whatsappService");

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`BarkatWork API listening on ${PORT}`));
connectWhatsApp();
