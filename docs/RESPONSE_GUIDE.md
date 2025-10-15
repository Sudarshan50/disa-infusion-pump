# Response Utilities and Error Handling Guide

This guide explains how to use the standardized response utilities and global error handling system in the Infusion Backend API.

## 📁 File Structure

```
src/
├── lib/
│   ├── responseUtils.js      # Response utility functions
│   └── customErrors.js       # Custom error classes
├── middleware/
│   └── errorHandler.js       # Global error handler middleware
├── controllers/
│   └── exampleController.js  # Example usage
└── routes/
    └── exampleRoutes.js      # Example routes
```

## 🚀 Quick Start

### Testing the API

1. **Start the server:**

   ```bash
   npm run dev
   ```

2. **Test endpoints:**

   ```bash
   # Health check
   curl http://localhost:3000/

   # API status
   curl http://localhost:3000/api/status

   # Success response example
   curl http://localhost:3000/api/example/success

   # Error response examples
   curl http://localhost:3000/api/example/error?type=not-found
   curl http://localhost:3000/api/example/error?type=validation
   curl http://localhost:3000/api/example/error?type=bad-request
   curl http://localhost:3000/api/example/error?type=server-error

   # Create example (POST)
   curl -X POST http://localhost:3000/api/example/create \
     -H "Content-Type: application/json" \
     -d '{"name": "John Doe", "email": "john@example.com"}'
   ```

## 📚 Response Utilities

### Success Responses

```javascript
import { successResponse } from "../lib/responseUtils.js";

// Basic success response
successResponse(res, data, "Operation successful");

// Success with status code
successResponse(res, data, "Created successfully", 201);

// Success without data
successResponse(res, null, "Operation completed");
```

**Response Format:**

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "timestamp": "2025-10-03T10:30:00.000Z"
}
```

### Error Responses

```javascript
import { errorResponse } from "../lib/responseUtils.js";

// Basic error response
errorResponse(res, "Something went wrong", 500);

// Error with additional details
errorResponse(res, "Validation failed", 400, validationErrors);
```

**Response Format:**

```json
{
  "success": false,
  "message": "Something went wrong",
  "errors": null,
  "timestamp": "2025-10-03T10:30:00.000Z"
}
```

### Specialized Response Functions

```javascript
import {
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  validationErrorResponse,
} from "../lib/responseUtils.js";

// 404 Not Found
notFoundResponse(res, "User not found");

// 401 Unauthorized
unauthorizedResponse(res, "Invalid credentials");

// 403 Forbidden
forbiddenResponse(res, "Access denied");

// 400 Validation Error
validationErrorResponse(res, errors, "Invalid input data");
```

## 🚨 Error Handling

### Custom Error Classes

```javascript
import {
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  BadRequestError,
  ConflictError,
} from "../lib/customErrors.js";

// Throw custom errors
throw new NotFoundError("User not found");
throw new ValidationError("Invalid data", validationErrors);
throw new UnauthorizedError("Access denied");
throw new BadRequestError("Missing required fields");
throw new ConflictError("Email already exists");
```

### Async Error Handling

**Method 1: Using asyncErrorHandler wrapper**

```javascript
import { asyncErrorHandler } from "../middleware/errorHandler.js";

const getUser = asyncErrorHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError("User not found");
  }
  successResponse(res, user, "User retrieved successfully");
});
```

**Method 2: Using try-catch with next()**

```javascript
const createUser = async (req, res, next) => {
  try {
    const user = await User.create(req.body);
    successResponse(res, user, "User created successfully", 201);
  } catch (error) {
    next(error); // Pass to global error handler
  }
};
```

### Global Error Handler Features

The global error handler automatically handles:

- ✅ Custom errors with appropriate status codes
- ✅ MongoDB validation and cast errors
- ✅ JWT token errors
- ✅ File upload errors (Multer)
- ✅ JSON syntax errors
- ✅ 404 routes
- ✅ Development vs production error details
- ✅ Request logging with useful context

## 🛡️ Best Practices

### 1. Controller Structure

```javascript
import { successResponse } from "../lib/responseUtils.js";
import { NotFoundError, ValidationError } from "../lib/customErrors.js";
import { asyncErrorHandler } from "../middleware/errorHandler.js";

export const getUser = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;

  // Validation
  if (!id) {
    throw new ValidationError("User ID is required");
  }

  // Business logic
  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Success response
  successResponse(res, user, "User retrieved successfully");
});
```

### 2. Route Protection

```javascript
import { UnauthorizedError } from "../lib/customErrors.js";

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    throw new UnauthorizedError("No token provided");
  }

  // Verify token logic...
  next();
};
```

### 3. Input Validation

```javascript
import { ValidationError } from "../lib/customErrors.js";

const validateUserInput = (data) => {
  const errors = [];

  if (!data.email) {
    errors.push({ field: "email", message: "Email is required" });
  }

  if (!data.password || data.password.length < 8) {
    errors.push({
      field: "password",
      message: "Password must be at least 8 characters",
    });
  }

  if (errors.length > 0) {
    throw new ValidationError("Validation failed", errors);
  }
};
```

## 📝 Environment Configuration

Set up your environment variables:

```env
NODE_ENV=development
PORT=3000
```

- In **development**: Detailed error messages and stack traces
- In **production**: Generic error messages for security

## 🔧 Extending the System

### Adding New Error Types

```javascript
// In customErrors.js
export class PaymentError extends CustomError {
  constructor(message = "Payment processing failed") {
    super(message, 402); // Payment Required
  }
}
```

### Adding New Response Types

```javascript
// In responseUtils.js
export const paginatedResponse = (
  res,
  data,
  pagination,
  message = "Success"
) => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination,
    timestamp: new Date().toISOString(),
  });
};
```

## 📊 Response Status Codes

| Code | Type                  | Usage                                 |
| ---- | --------------------- | ------------------------------------- |
| 200  | OK                    | Successful GET, PUT, PATCH            |
| 201  | Created               | Successful POST                       |
| 400  | Bad Request           | Validation errors, malformed requests |
| 401  | Unauthorized          | Authentication required               |
| 403  | Forbidden             | Insufficient permissions              |
| 404  | Not Found             | Resource doesn't exist                |
| 409  | Conflict              | Resource already exists               |
| 500  | Internal Server Error | Unexpected server errors              |

This system provides a consistent, maintainable approach to handling responses and errors across your entire API.
