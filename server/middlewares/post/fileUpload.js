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
  params: (req, file) => ({
    folder: "VibeShare_uploads",
    resource_type: "auto", // allows image + video uploads
  }),
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/")
    ) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

function fileUpload(req, res, next) {
  upload.any()(req, res, (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Error uploading file",
        error: err.message,
      });
    }

    if (!req.files || req.files.length === 0) {
      return next();
    }

    const file = req.files[0];

    req.file = file;
    req.fileUrl = file.path; // Cloudinary public URL
    req.fileType = file.mimetype.split("/")[0]; // "image" or "video"

    next();
  });
}

module.exports = fileUpload;
