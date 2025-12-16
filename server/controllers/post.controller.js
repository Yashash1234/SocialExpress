const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");
dayjs.extend(relativeTime);

const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const formatCreatedAt = require("../utils/timeConverter");

const Post = require("../models/post.model");
const Community = require("../models/community.model");
const Comment = require("../models/comment.model");
const User = require("../models/user.model");
const Relationship = require("../models/relationship.model");
const Report = require("../models/report.model");
const PendingPost = require("../models/pendingPost.model");

// -----------------------------------------------------
// Utility Functions
// -----------------------------------------------------

// Extract Cloudinary public_id from a URL
const extractPublicId = (url) => {
  if (!url) return null;
  const parts = url.split("/");
  const file = parts.pop();
  return file.split(".")[0];
};

// Delete Cloudinary file safely
const deleteCloudinaryFile = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "auto" });
  } catch (err) {
    console.error("Cloudinary delete error:", err);
  }
};

// -----------------------------------------------------
// 1. CREATE POST (multipart upload → Cloudinary)
// -----------------------------------------------------
const createPost = async (req, res) => {
  try {
    const { communityId, content } = req.body;
    const { userId, file } = req;

    // Check membership
    const community = await Community.findOne({
      _id: communityId,
      members: userId,
    });

    if (!community) {
      // delete uploaded file if unauthorized
      if (file?.path) {
        const uploadedPublicId = extractPublicId(file.filename);
        await deleteCloudinaryFile(uploadedPublicId);
      }

      return res.status(401).json({ message: "Unauthorized to post in this community" });
    }

    let fileUrl = null;
    let fileType = null;

    // Upload file to Cloudinary
    if (file) {
      const uploaded = await cloudinary.uploader.upload(file.path, {
        folder: "community_posts",
        resource_type: "auto",
      });

      fileUrl = uploaded.secure_url;
      fileType = uploaded.resource_type;
    }

    const newPost = new Post({
      user: userId,
      community: communityId,
      content,
      fileUrl,
      fileType,
    });

    const savedPost = await newPost.save();

    const post = await Post.findById(savedPost._id)
      .populate("user", "name avatar")
      .populate("community", "name")
      .lean();

    post.createdAt = dayjs(post.createdAt).fromNow();

    res.json(post);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating post" });
  }
};

// -----------------------------------------------------
// 2. CONFIRM PENDING POST
// -----------------------------------------------------
const confirmPost = async (req, res) => {
  try {
    const { confirmationToken } = req.params;
    const userId = req.userId;

    const pendingPost = await PendingPost.findOne({
      confirmationToken,
      user: userId,
      status: "pending",
    });

    if (!pendingPost) {
      return res.status(404).json({ message: "Post not found" });
    }

    const newPost = new Post({
      user: pendingPost.user,
      community: pendingPost.community,
      content: pendingPost.content,
      fileUrl: pendingPost.fileUrl,
      fileType: pendingPost.fileType,
    });

    await PendingPost.deleteOne({ confirmationToken });

    const savedPost = await newPost.save();

    const post = await Post.findById(savedPost._id)
      .populate("user", "name avatar")
      .populate("community", "name")
      .lean();

    post.createdAt = dayjs(post.createdAt).fromNow();

    res.json(post);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error publishing post" });
  }
};

// -----------------------------------------------------
// 3. REJECT POST (delete Cloudinary file)
// -----------------------------------------------------
const rejectPost = async (req, res) => {
  try {
    const { confirmationToken } = req.params;
    const userId = req.userId;

    const pendingPost = await PendingPost.findOne({
      confirmationToken,
      user: userId,
      status: "pending",
    });

    if (!pendingPost) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (pendingPost.fileUrl) {
      const publicId = extractPublicId(pendingPost.fileUrl);
      await deleteCloudinaryFile(publicId);
    }

    await pendingPost.deleteOne();

    res.json({ message: "Post rejected" });
  } catch (error) {
    res.status(500).json({ message: "Error rejecting post" });
  }
};

// -----------------------------------------------------
// 4. DELETE POST (delete Cloudinary file)
// -----------------------------------------------------
const deletePost = async (req, res) => {
  try {
    const id = req.params.id;
    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.fileUrl) {
      const publicId = extractPublicId(post.fileUrl);
      await deleteCloudinaryFile(publicId);
    }

    await post.deleteOne();

    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    res.status(404).json({ message: "An error occurred while deleting the post" });
  }
};

// -----------------------------------------------------
// 5. GET SINGLE POST
// -----------------------------------------------------
const findPostById = async (postId) =>
  await Post.findById(postId)
    .populate("user", "name avatar")
    .populate("community", "name")
    .lean();

const findCommentsByPostId = async (postId) =>
  await Comment.find({ post: postId })
    .sort({ createdAt: -1 })
    .populate("user", "name avatar")
    .lean();

const countSavedPosts = async (postId) =>
  await User.countDocuments({ savedPosts: postId });

const findReportByPostAndUser = async (postId, userId) =>
  await Report.findOne({ post: postId, reportedBy: userId });

const formatComments = (comments) =>
  comments.map((comment) => ({
    ...comment,
    createdAt: dayjs(comment.createdAt).fromNow(),
  }));

const getPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;

    const post = await findPostById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comments = await findCommentsByPostId(postId);

    post.comments = formatComments(comments);
    post.dateTime = formatCreatedAt(post.createdAt);
    post.createdAt = dayjs(post.createdAt).fromNow();
    post.savedByCount = await countSavedPosts(postId);

    const report = await findReportByPostAndUser(postId, userId);
    post.isReported = !!report;

    res.json(post);
  } catch (error) {
    res.status(500).json({ message: "Error getting post" });
  }
};

// -----------------------------------------------------
// 6. GET POSTS FEED
// -----------------------------------------------------
const getPosts = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 10, skip = 0 } = req.query;

    const communities = await Community.find({ members: userId });
    const communityIds = communities.map((c) => c._id);

    const posts = await Post.find({
      community: { $in: communityIds },
    })
      .sort({ createdAt: -1 })
      .populate("user", "name avatar")
      .populate("community", "name")
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const formattedPosts = posts.map((post) => ({
      ...post,
      createdAt: dayjs(post.createdAt).fromNow(),
    }));

    const totalPosts = await Post.countDocuments({
      community: { $in: communityIds },
    });

    res.json({ formattedPosts, totalPosts });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving posts" });
  }
};

// -----------------------------------------------------
// 7. GET COMMUNITY POSTS
// -----------------------------------------------------
const getCommunityPosts = async (req, res) => {
  try {
    const communityId = req.params.communityId;
    const userId = req.userId;

    const { limit = 10, skip = 0 } = req.query;

    const isMember = await Community.findOne({
      _id: communityId,
      members: userId,
    });

    if (!isMember) {
      return res.status(401).json({
        message: "Unauthorized to view posts in this community",
      });
    }

    const posts = await Post.find({ community: communityId })
      .sort({ createdAt: -1 })
      .populate("user", "name avatar")
      .populate("community", "name")
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const formattedPosts = posts.map((post) => ({
      ...post,
      createdAt: dayjs(post.createdAt).fromNow(),
    }));

    const totalCommunityPosts = await Post.countDocuments({ community: communityId });

    res.json({ formattedPosts, totalCommunityPosts });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving posts" });
  }
};

// -----------------------------------------------------
// 8. FOLLOWING USERS' POSTS
// -----------------------------------------------------
const getFollowingUsersPosts = async (req, res) => {
  try {
    const communityId = req.params.id;
    const userId = req.userId;

    const following = await Relationship.find({ follower: userId });
    const followingIds = following.map((rel) => rel.following);

    const posts = await Post.find({
      user: { $in: followingIds },
      community: communityId,
    })
      .sort({ createdAt: -1 })
      .populate("user", "name avatar")
      .populate("community", "name")
      .limit(20)
      .lean();

    const formattedPosts = posts.map((post) => ({
      ...post,
      createdAt: dayjs(post.createdAt).fromNow(),
    }));

    res.json(formattedPosts);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------
// 9. LIKE / UNLIKE POST
// -----------------------------------------------------
const populatePost = async (post) => {
  const savedByCount = await User.countDocuments({ savedPosts: post._id });

  return {
    ...post.toObject(),
    createdAt: dayjs(post.createdAt).fromNow(),
    savedByCount,
  };
};

const likePost = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.userId;

    const updatedPost = await Post.findOneAndUpdate(
      { _id: id, likes: { $ne: userId } },
      { $addToSet: { likes: userId } },
      { new: true }
    )
      .populate("user", "name avatar")
      .populate("community", "name");

    if (!updatedPost) {
      return res.status(404).json({ message: "Post not found" });
    }

    const formattedPost = await populatePost(updatedPost);
    res.json(formattedPost);
  } catch (error) {
    res.status(500).json({ message: "Error liking post" });
  }
};

const unlikePost = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.userId;

    const updatedPost = await Post.findOneAndUpdate(
      { _id: id, likes: userId },
      { $pull: { likes: userId } },
      { new: true }
    )
      .populate("user", "name avatar")
      .populate("community", "name");

    if (!updatedPost) {
      return res.status(404).json({ message: "Post not found" });
    }

    const formattedPost = await populatePost(updatedPost);
    res.json(formattedPost);
  } catch (error) {
    res.status(500).json({ message: "Error unliking post" });
  }
};

// -----------------------------------------------------
// 10. ADD COMMENT
// -----------------------------------------------------
const addComment = async (req, res) => {
  try {
    const { content, postId } = req.body;
    const userId = req.userId;

    const newComment = new Comment({
      user: userId,
      post: postId,
      content,
    });

    await newComment.save();

    await Post.findOneAndUpdate(
      { _id: postId },
      { $addToSet: { comments: newComment._id } }
    );

    res.json({ message: "Comment added successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error adding comment" });
  }
};

// -----------------------------------------------------
// 11. SAVE / UNSAVE POST
// -----------------------------------------------------
const saveOrUnsavePost = async (req, res, op) => {
  try {
    const id = req.params.id;
    const userId = req.userId;

    const update = {};
    update[op] = { savedPosts: id };

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      update,
      { new: true }
    )
      .select("savedPosts")
      .populate({
        path: "savedPosts",
        populate: { path: "community", select: "name" },
      });

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    const formattedPosts = updatedUser.savedPosts.map((post) => ({
      ...post.toObject(),
      createdAt: dayjs(post.createdAt).fromNow(),
    }));

    res.json(formattedPosts);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const savePost = (req, res) => saveOrUnsavePost(req, res, "$addToSet");
const unsavePost = (req, res) => saveOrUnsavePost(req, res, "$pull");

// -----------------------------------------------------
// 12. GET SAVED POSTS
// -----------------------------------------------------
const getSavedPosts = async (req, res) => {
  try {
    const userId = req.userId;

    const communityIds = await Community.find({ members: userId }).distinct("_id");

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const saved = await Post.find({
      _id: { $in: user.savedPosts },
      community: { $in: communityIds },
    })
      .populate("user", "name avatar")
      .populate("community", "name")
      .lean();

    const formatted = saved.map((post) => ({
      ...post,
      createdAt: dayjs(post.createdAt).fromNow(),
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------------
// 13. GET PUBLIC POSTS
// -----------------------------------------------------
const getPublicPosts = async (req, res) => {
  try {
    const publicUserId = req.params.publicUserId;
    const currentUserId = req.userId;

    const isFollowing = await Relationship.exists({
      follower: currentUserId,
      following: publicUserId,
    });

    if (!isFollowing) return res.json([]);

    const commonCommunities = await Community.find({
      members: { $all: [currentUserId, publicUserId] },
    }).distinct("_id");

    const posts = await Post.find({
      user: publicUserId,
      community: { $in: commonCommunities },
    })
      .populate("user", "_id name avatar")
      .populate("community", "_id name")
      .sort("-createdAt")
      .limit(10)
      .lean();

    const formatted = posts.map((post) => ({
      ...post,
      createdAt: dayjs(post.createdAt).fromNow(),
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const clearPendingPosts = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== "moderator") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const date = new Date();
    date.setHours(date.getHours() - 1);

    await PendingPost.deleteMany({ createdAt: { $lte: date } });

    res.status(200).json({ message: "Pending posts cleared" });
  } catch (error) {
    res.status(500).json({ message: "Error clearing pending posts" });
  }
};


// -----------------------------------------------------
// EXPORT ALL
// -----------------------------------------------------
module.exports = {
  createPost,
  confirmPost,
  rejectPost,
  deletePost,
  getPost,
  getPosts,
  getCommunityPosts,
  getFollowingUsersPosts,
  likePost,
  unlikePost,
  addComment,
  savePost,
  unsavePost,
  getSavedPosts,
  getPublicPosts,
  clearPendingPosts,
};
