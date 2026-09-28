const User = require("../models/User");

const adminMiddleware = async (req, res, next) => {
    try {

        console.log("JWT :", req.user);

        const user = await User.findById(req.user.id);

        console.log("DB USER :", user);
        console.log("ROLE :", user.role);
        console.log("TYPE :", typeof user.role);
        console.log("COMPARE :", user.role === "ADMIN");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admins only."
            });
        }

        next();

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = adminMiddleware;