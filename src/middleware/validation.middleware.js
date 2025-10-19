const { validationResult } = require('express-validator');
const ApiError = require('../utils/apiError');

const validate = (req, _res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => error.msg);
    throw ApiError.badRequest(errorMessages.join(', '));
  }
  
  next();
};

module.exports = validate;
