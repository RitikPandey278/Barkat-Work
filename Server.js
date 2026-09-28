require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");

const { ensureLoginTokenIndexes } = require("./services/whatsappAuthService");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await connectDB();
        await ensureLoginTokenIndexes();

        app.listen(PORT, () => {
            console.log(`Listening on ${PORT}`);
        });
    } catch (error) {
        console.log(error.message);
        process.exit(1);
    }
};

startServer();
module.exports = app;