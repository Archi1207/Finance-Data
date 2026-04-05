const { validationResult } = require('express-validator');

/**
 * Middleware: runs after express-validator chains.
 * Returns 422 with structured errors if validation fails.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: 'error',
      message: 'Validation failed.',
      errors: errors.array().map((e) => ({ field: e.param || e.path, message: e.msg })),
    });
  }
  next();
};

module.exports = { validate };
