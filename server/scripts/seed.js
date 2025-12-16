// server/scripts/seed-full.js
require("dotenv").config();
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const bcrypt = require("bcrypt");
const axios = require("axios");
const path = require("path");

// Models (adjust paths if your project structure differs)
const Admin = require("../models/admin.model");
const User = require("../models/user.model");
const Community = require("../models/community.model");
const Post = require("../models/post.model");
const Comment = require("../models/comment.model");
const Rule = require("../models/rule.model");
const Relationship = require("../models/relationship.model");
const Preference = require("../models/preference.model");
const Context = require("../models/context.model");
const Report = require("../models/report.model");
const PendingPost = require("../models/pendingPost.model");

// Config Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// TUNABLES (lower numbers if you want faster / cheaper)
const TOTAL_USERS = 120;
const TOTAL_COMMUNITIES = 15;
const POSTS_PER_USER = 7; // ~ TOTAL_POSTS = TOTAL_USERS * POSTS_PER_USER
const COMMENTS_PER_POST = 4;
const MAX_FOLLOWERS_PER_USER = 40;

// utility simple faker-ish arrays (no external libs)
const firstNames = ["Arjun","Meera","Rohan","Aditi","Rahul","Priya","Karan","Simran","Aman","Nisha","Yash","Hamsini","Ria","Akhil","Sana","Mohit","Neha","Vikram","Isha","Kavya"];
const lastNames = ["Sharma","Patel","Rao","Kumar","Singh","Gupta","Joshi","Nair","Iyer","Chopra","Malhotra","Desai","Mehta","Bhat","Nandu","Fernandes"];

const randomName = () => {
  const f = firstNames[Math.floor(Math.random() * firstNames.length)];
  const l = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${f} ${l}`;
};
const randomEmail = (i) => `user${i+1}@vibeshare.com`;
const randomAvatar = (i) => `https://i.pravatar.cc/150?img=${(i%70)+1}`;

// helper: upload remote image to cloudinary with folder prefix
async function uploadImageToCloudinary(remoteUrl, folder = "VibeShare_uploads") {
  try {
    const res = await cloudinary.uploader.upload(remoteUrl, {
      folder,
      resource_type: "image",
      timeout: 600000,
    });
    return res.secure_url || res.url || res.public_id;
  } catch (err) {
    // fail gracefully - return null so post can be created without image
    console.warn("Cloudinary upload failed for", remoteUrl, err.message || err);
    return null;
  }
}

// delete all resources in folder (Cloudinary)
async function clearCloudinaryFolder(folder = "VibeShare_uploads") {
  console.log("Clearing Cloudinary folder:", folder);
  try {
    // list by prefix & delete in batches
    const perPage = 100;
    let nextCursor = null;
    do {
      const res = await cloudinary.api.resources({
        type: "upload",
        prefix: folder,
        max_results: perPage,
        next_cursor: nextCursor,
      });
      const resources = res.resources || [];
      if (resources.length) {
        const public_ids = resources.map((r) => r.public_id);
        await cloudinary.api.delete_resources(public_ids);
        console.log("Deleted batch:", public_ids.length);
      }
      nextCursor = res.next_cursor;
    } while (nextCursor);
    console.log("Cloudinary folder cleared.");
  } catch (err) {
    console.warn("Could not clear Cloudinary folder:", err.message || err);
  }
}

(async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected.");

    // 1) Clear DB completely
    console.log("Dropping database (this removes ALL collections)...");
    await mongoose.connection.dropDatabase();
    console.log("Database dropped.");

    // 2) Clear Cloudinary folder
    await clearCloudinaryFolder("VibeShare_uploads");

    // 3) Create admin
    const adminPw = "Admin@123";
    const admin = await Admin.create({
      username: "admin",
      password: await bcrypt.hash(adminPw, 10),
    });
    console.log("Admin created.");

    // 4) Create users
    const users = [];
    console.log(`Creating ${TOTAL_USERS} users...`);
    for (let i = 0; i < TOTAL_USERS; i++) {
      const name = randomName();
      const email = (i === TOTAL_USERS-1) ? "demo@vibeshare.com" : randomEmail(i);
      const passwordPlain = (email === "demo@vibeshare.com") ? "Demo@123" : "User@123";
      const userDoc = await User.create({
        name,
        email,
        password: await bcrypt.hash(passwordPlain, 10),
        avatar: randomAvatar(i),
        location: "India",
        bio: "Living the VibeShare life!",
        interests: "tech, music, food",
        role: i === 0 ? "moderator" : "general",
        isEmailVerified: true
      });
      users.push({ doc: userDoc, password: passwordPlain });
    }
    console.log(`${users.length} users created.`);

    // 5) Preferences & contexts: temporarily bypass encryption if present
    console.log("Adding preferences and trusted contexts (encryption bypassed temporarily)...");
    const encryptionUtilPath = path.join(__dirname, "..", "utils", "encryption.js");
    let encryptionUtil = null;
    try {
      encryptionUtil = require(encryptionUtilPath);
    } catch (e) {
      // if not present, ignore
      encryptionUtil = null;
    }
    let originalEncrypt = null;
    if (encryptionUtil && encryptionUtil.encryptField) {
      originalEncrypt = encryptionUtil.encryptField;
      encryptionUtil.encryptField = (v) => v; // store raw for seed
    }
    // preferences + contexts
    for (const u of users) {
      await Preference.create({ user: u.doc._id, enableContextBasedAuth: false });
      await Context.create({
        user: u.doc._id,
        email: u.doc.email,
        ip: "127.0.0.1",
        country: "India",
        city: "Bengaluru",
        browser: "Chrome",
        platform: "Windows",
        os: "Windows 10",
        device: "Desktop",
        deviceType: "Computer",
        isTrusted: true,
      });
    }
    // restore encryption util
    if (originalEncrypt && encryptionUtil) {
      encryptionUtil.encryptField = originalEncrypt;
    }
    console.log("Preferences & contexts created.");

    // 6) Communities & rules
    console.log("Creating communities & rules...");
    const communityNames = [
      "General","Technology","Food Lovers","Sports","Gaming","Fitness",
      "Photography","Music","Travel","Movies","Books","Business","Education","Memes","Career"
    ].slice(0, TOTAL_COMMUNITIES);

    const ruleDocs = await Rule.insertMany([
      { rule: "Be respectful", description: "No harassment or hate speech" },
      { rule: "No spam", description: "Stay on topic" },
    ]);

    const commDocs = [];
    for (let i = 0; i < communityNames.length; i++) {
      const c = await Community.create({
        name: communityNames[i],
        description: `Community for ${communityNames[i]}`,
        banner: `https://picsum.photos/800/200?random=${i+1}`,
        moderators: [users[0].doc._id],
        members: users.map(u => u.doc._id),
        bannedUsers: [],
        rules: ruleDocs.map(r=>r._id)
      });
      commDocs.push(c);
    }
    console.log(`${commDocs.length} communities created.`);

    // 7) Create following network (random)
    console.log("Seeding follow relationships...");
    const userIds = users.map(u => u.doc._id);
    for (const u of users) {
      // each user follows between 5 and MAX_FOLLOWERS_PER_USER random others
      const followCount = Math.floor(Math.random() * Math.min(MAX_FOLLOWERS_PER_USER, users.length-1)) + 5;
      const shuffled = userIds.sort(() => 0.5 - Math.random());
      let added = 0;
      for (const targetId of shuffled) {
        if (String(targetId) === String(u.doc._id)) continue;
        try {
          await Relationship.create({ follower: u.doc._id, following: targetId });
          // also update user follower/following arrays if needed (optional)
        } catch (e) {
          // ignore dupes
        }
        added++;
        if (added >= followCount) break;
      }
    }
    console.log("Follow relationships seeded.");

    // 8) Create posts (with image uploads). We'll use picsum URLs (fast) or placeholders
    console.log("Seeding posts. This will upload many images to Cloudinary — be patient or reduce POSTS_PER_USER.");
    const posts = [];
    const TOTAL_POSTS = users.length * POSTS_PER_USER;
    let uploadedCount = 0;

    // We'll limit concurrent uploads to avoid rate limit
    const uploadQueue = [];
    for (const u of users) {
      for (let p = 0; p < POSTS_PER_USER; p++) {
        // use picsum random image URL (valid)
        const remoteImageUrl = `https://picsum.photos/seed/${encodeURIComponent(u.doc._id + "-" + p)}/800/600`;
        uploadQueue.push({ userId: u.doc._id, remoteImageUrl });
      }
    }

    // function to process uploadQueue in batches
    const BATCH = 6;
    for (let i = 0; i < uploadQueue.length; i += BATCH) {
      const batch = uploadQueue.slice(i, i+BATCH);
      const promises = batch.map(async (item) => {
        const uploaded = await uploadImageToCloudinary(item.remoteImageUrl, "VibeShare_uploads");
        // create post record (image optional)
        const newPost = await Post.create({
          content: `Post by ${item.userId} — ${Math.random().toString(36).slice(2, 30)}`,
          user: item.userId,
          community: commDocs[Math.floor(Math.random() * commDocs.length)]._id,
          fileUrl: uploaded || "",
          fileType: uploaded ? "image" : "",
        });
        uploadedCount++;
        return newPost;
      });
      const created = await Promise.all(promises);
      posts.push(...created);
      console.log(`Uploaded batch ${Math.floor(i/BATCH)+1} — total posts created: ${posts.length}/${TOTAL_POSTS}`);
      // small pause to prevent too many requests
      await new Promise(r => setTimeout(r, 400));
    }

    console.log(`${posts.length} posts created (images uploaded: ${uploadedCount}).`);

    // 9) Add comments to posts
    console.log("Seeding comments...");
    for (const post of posts) {
      for (let c = 0; c < COMMENTS_PER_POST; c++) {
        const commenter = users[Math.floor(Math.random() * users.length)];
        await Comment.create({
          content: ["Nice!", "Love it", "Awesome post", "🔥🔥🔥"][Math.floor(Math.random()*4)],
          user: commenter.doc._id,
          post: post._id
        });
      }
    }
    console.log("Comments added.");

    // 10) Likes & savedPosts
    console.log("Seeding likes and saved posts...");
    for (const post of posts) {
      // random number of likes
      const likeCount = Math.floor(Math.random() * 20);
      const shuffledUsers = userIds.sort(() => 0.5 - Math.random());
      const likers = shuffledUsers.slice(0, likeCount);
      if (likers.length) {
        await Post.findByIdAndUpdate(post._id, { $addToSet: { likes: { $each: likers } } });
      }

      // random saved by some users
      const saveCount = Math.floor(Math.random() * 8);
      const savers = shuffledUsers.slice(0, saveCount);
      for (const s of savers) {
        await User.findByIdAndUpdate(s, { $addToSet: { savedPosts: post._id } });
      }
    }
    console.log("Likes and savedPosts seeded.");

    // 11) Reports & pending posts (optional small set)
    console.log("Seeding a few reports and pending posts...");
    for (let i = 0; i < 12 && i < posts.length; i++) {
      const post = posts[i];
      try {
        await Report.create({
          post: post._id,
          community: post.community,
          reportedBy: [users[(i+2)%users.length].doc._id],
          reportReason: "Inappropriate content"
        });
      } catch (e) {}
    }
    for (let i = 0; i < 10; i++) {
      await PendingPost.create({
        content: "Pending post " + i,
        fileUrl: "",
        fileType: "",
        community: commDocs[i % commDocs.length]._id,
        user: users[i % users.length].doc._id,
        confirmationToken: Math.random().toString(36).slice(2, 12)
      });
    }
    console.log("Reports & pending posts seeded.");

    // 12) Done
    console.log("\n✅ SEEDING COMPLETE ✅");
    console.log("Admin login → username: admin | password:", adminPw);
    const demo = users.find(u => u.doc.email === "demo@vibeshare.com");
    console.log("Demo login → email: demo@vibeshare.com | password:", demo ? demo.password : "Demo@123");
    console.log(`Created ${users.length} users, ${commDocs.length} communities, ${posts.length} posts.`);
    process.exit(0);
  } catch (err) {
    console.error("SEED ERROR:", err);
    process.exit(1);
  }
})();
