const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const { isProfileComplete } = require("../services/whatsappAuthService");

const uploadProfileImage = (file) => {
    return new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "P-MART/Profile-Images"
            },
            (error, result) => {

                if (error) {
                    return reject(error);
                }

                resolve(result);
            }
        );

        streamifier
            .createReadStream(file.buffer)
            .pipe(stream);
    });
};


// GET PROFILE
const getProfile = async (req, res) => {

    try {

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            user,
            profileComplete: isProfileComplete(user)
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }
};


// UPDATE PROFILE
const updateProfile = async (req, res) => {

    try {

        const {
            name,
            // email,
            // gender,
            // dateOfBirth,
            // city,
            // state,
            // pincode,
            // profileImage
        } = req.body;


        const user = await User.findById(req.user.id);

        if (!user) {

            return res.status(404).json({
                success: false,
                message: "User not found"
            });

        }


        if (name !== undefined) {
            user.name = name.trim();
        }


        if (email !== undefined) {
            user.email = email.trim();
        }


        if (gender !== undefined) {
            user.gender = gender;
        }


        if (dateOfBirth !== undefined) {

            const parsedDate = new Date(dateOfBirth);

            if (Number.isNaN(parsedDate.getTime())) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid date of birth"
                });

            }

            user.dateOfBirth = parsedDate;
        }


        if (city !== undefined) {
            user.city = city.trim();
        }


        if (state !== undefined) {
            user.state = state.trim();
        }


        if (pincode !== undefined) {
            user.pincode = pincode.trim();
        }


        // Profile image
        if (req.file) {

            const uploadResult =
                await uploadProfileImage(req.file);

            user.profileImage =
                uploadResult.secure_url;

        } else if (profileImage !== undefined) {

            user.profileImage = profileImage;

        }


        await user.save();


        return res.status(200).json({

            success: true,

            message: "Profile updated successfully",

            user,

            profileComplete: isProfileComplete(user)

        });

    } catch (error) {

        console.error(
            "UPDATE PROFILE ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message: error.message

        });

    }

};


module.exports = {
    getProfile,
    updateProfile
};