const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "VibeShare_avatars",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 500, height: 500, crop: "fill" }],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

function avatarUpload(req, res, next) {
  upload.single("avatar")(req, res, (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Error uploading avatar",
        error: err.message,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a valid image file",
      });
    }

    // Cloudinary URL
    req.avatarUrl = req.file.path;
    next();
  });
}

module.exports = avatarUpload;
