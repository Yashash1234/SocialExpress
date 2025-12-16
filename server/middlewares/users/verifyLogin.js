const nodemailer = require("nodemailer");
const SuspiciousLogin = require("../../models/suspiciousLogin.model");
const UserContext = require("../../models/context.model");
const EmailVerification = require("../../models/email.model");
const { query, validationResult } = require("express-validator");
const { verifyLoginHTML } = require("../../utils/emailTemplates");

const CLIENT_URL = process.env.CLIENT_URL;


const verifyLoginValidation = [
  query("email").isEmail().normalizeEmail(),
  query("id").isLength({ min: 24, max: 24 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    next();
  },
];
const sendLoginVerificationEmail = async (req, res) => {
  const USER = process.env.EMAIL_USER;
  const PASS = process.env.EMAIL_PASS;

  const currentContextData = req.currentContextData;
  const { email, name } = req.user;

  const id = currentContextData.id;
  const verificationLink = `${CLIENT_URL}/verify-login?id=${id}&email=${email}`;
  const blockLink = `${CLIENT_URL}/block-device?id=${id}&email=${email}`;

  try {
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: USER,
        pass: PASS,
      },
    });

    await transporter.sendMail({
      from: `"VibeShare Security" <${USER}>`,
      to: email,
      subject: "Verify recent login attempt",
      html: verifyLoginHTML(name, verificationLink, blockLink, currentContextData),
    });

    await EmailVerification.create({
      email,
      verificationCode: id,
      for: "login",
    });

    return res.status(401).json({
      message:
        "Access blocked due to suspicious activity. A verification email has been sent to your inbox.",
    });
  } catch (err) {
    console.log("Login verification email failed:", err.message);
    return res.status(500).json({ message: "Something went wrong while sending the email." });
  }
};


const verifyLogin = async (req, res) => {
  const { id, email } = req.query;

  try {
    const suspiciousLogin = await SuspiciousLogin.findById(id);

    if (!suspiciousLogin || suspiciousLogin.email !== email) {
      return res.status(400).json({ message: "Invalid verification link" });
    }

    const newContextData = new UserContext({
      user: suspiciousLogin.user,
      email: suspiciousLogin.email,
      ip: suspiciousLogin.ip,
      city: suspiciousLogin.city,
      country: suspiciousLogin.country,
      device: suspiciousLogin.device,
      deviceType: suspiciousLogin.deviceType,
      browser: suspiciousLogin.browser,
      os: suspiciousLogin.os,
      platform: suspiciousLogin.platform,
    });

    await newContextData.save();
    await SuspiciousLogin.findOneAndUpdate(
      { _id: { $eq: id } },
      { $set: { isTrusted: true, isBlocked: false } },
      { new: true }
    );

    res.status(200).json({ message: "Login verified" });
  } catch (err) {
    res.status(500).json({ message: "Could not verify your login" });
  }
};

const blockLogin = async (req, res) => {
  const { id, email } = req.query;

  try {
    const suspiciousLogin = await SuspiciousLogin.findById(id);

    if (!suspiciousLogin || suspiciousLogin.email !== email) {
      return res.status(400).json({ message: "Invalid verification link" });
    }

    await SuspiciousLogin.findOneAndUpdate(
      { _id: { $eq: id } },
      { $set: { isBlocked: true, isTrusted: false } },
      { new: true }
    );

    res.status(200).json({ message: "Login blocked" });
  } catch (err) {
    res.status(500).json({ message: "Could not block your login" });
  }
};

module.exports = {
  verifyLoginValidation,
  sendLoginVerificationEmail,
  verifyLogin,
  blockLogin,
};
