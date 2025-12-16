const { check, validationResult } = require("express-validator");
const User = require("../../models/user.model");

const addUserValidator = [
  check("name")
    .isLength({ min: 2 })
    .withMessage("Name must be at least 2 characters long")
    .isLength({ max: 20 })
    .withMessage("Name cannot be more than 20 characters long")
    .isAlpha("en-US", { ignore: " -" })
    .withMessage("Name must contain only alphabets")
    .trim(),

  check("email")
    .isEmail()
    .withMessage("Invalid email address")
    .custom(async (value) => {
      const user = await User.findOne({ email: value });
      if (user) {
        throw new Error("This email is already registered");
      }
    })
    .trim(),

  check("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),

  check("role").default("general"),
];

const addUserValidatorHandler = (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  // ❗ No file deletion needed — Cloudinary handles storage

  return res.status(400).json({
    errors: errors.array().map((err) => err.msg),
  });
};

module.exports = {
  addUserValidator,
  addUserValidatorHandler,
};
