const generateConfirmationToken = require("../../utils/confirmationToken");
const Community = require("../../models/community.model");
const PendingPost = require("../../models/pendingPost.model");
const cloudinary = require("cloudinary").v2; 

// Cloudinary init directly here (using .env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const postConfirmation = async (req, res, next) => {
  if (!req.failedDetection) return next();

  const confirmationToken = generateConfirmationToken(req.userId);

  try {
    const { content, communityId } = req.body;
    const { userId, file } = req;

    // Check if user is in the community
    const community = await Community.findOne({
      _id: communityId,
      members: userId,
    });

    if (!community) {
      // If unauthorized and a file was uploaded → delete the Cloudinary asset safely
      if (file?.path) {
        await cloudinary.uploader.destroy(file.filename, {
          resource_type: "auto",
        });
      }

      return res.status(401).json({
        message: "Unauthorized to post in this community",
      });
    }

    let fileUrl = null;
    let fileType = null;

    // Upload file to Cloudinary
    if (file) {
      const uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: "community_posts",
        resource_type: "auto",
      });

      fileUrl = uploadResult.secure_url;
      fileType = uploadResult.resource_type;
    }

    // Save pending post
    const newPendingPost = new PendingPost({
      user: userId,
      community: communityId,
      content,
      fileUrl,
      fileType,
      confirmationToken,
      status: "pending",
    });

    await newPendingPost.save();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }

  return res.status(403).json({
    type: "failedDetection",
    confirmationToken,
  });
};

module.exports = postConfirmation;
