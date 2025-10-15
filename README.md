# Infusion Backend

A Node.js Express server with Morgan logging and proper MVC architecture.

## Features

- 🚀 Express.js server with proper middleware setup
- 📝 Morgan HTTP request logging
- 🔄 CORS enabled
- 🏗️ MVC architecture with organized file structure
- 🛣️ RESTful API routes
- 🔧 Environment configuration
- 📦 Modular design with separate controllers and utilities

## Project Structure

```
infusion-backend/
├── src/
│   ├── config/
│   │   └── config.js          # Application configuration
│   ├── controllers/
│   │   ├── authController.js   # Authentication controllers
│   │   └── userController.js   # User controllers
│   ├── lib/
│   │   ├── database.js         # Database utilities
│   │   ├── responseUtils.js    # Response formatting utilities
│   │   └── validators.js       # Validation utilities
│   ├── middleware/
│   │   └── auth.js            # Custom middleware
│   └── routes/
│       ├── index.js           # Main route handler
│       ├── authRoutes.js      # Authentication routes
│       └── userRoutes.js      # User routes
├── .env.example               # Environment variables template
├── .gitignore
├── index.js                   # Main application entry point
├── package.json
└── README.md
```

## Installation

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create environment file:

   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration

## Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with nodemon (install nodemon first: `npm install -g nodemon`)

## API Endpoints

### Health Check

- `GET /health` - Server health check

### API Base

- `GET /api` - API information

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user profile

### Users

- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

## Usage

Start the server:

```bash
npm start
```

The server will be running on `http://localhost:3000`

## Development

For development with auto-restart:

```bash
npm run dev
```

## Configuration

The application uses environment variables for configuration. See `.env.example` for available options.

## License

ISC
