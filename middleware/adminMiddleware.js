const jwt = require("jsonwebtoken");

const requireAdmin = (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ success: false, message: "Admin authentication required" });
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        if (String(user.role || "").toUpperCase() !== "ADMIN") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }
        req.user = user;
        return next();
    } catch (error) {
        return res.status(401).json({ success: false, message: "Invalid or expired admin token" });
    }
};

module.exports = { requireAdmin };
