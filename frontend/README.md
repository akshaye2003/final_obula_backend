# Obula

Turn your talking video into a polished clip with AI B-roll and word-level captions.

## Setup

1. **Copy environment variables**
   ```bash
   cp .env.example .env
   ```

2. **Configure `.env`**
   - `VITE_API_URL` – Backend API base URL (default: `http://localhost:8000`)
   - `VITE_GOOGLE_CLIENT_ID` – Google OAuth Client ID from [Google Cloud Console](https://console.cloud.google.com/)
     - Enable Google Identity / Google+ API
     - Create OAuth 2.0 credentials (Web application)
     - Add authorized origins: `http://localhost:5173`, production URL

3. **Install and run**
   ```bash
   npm install
   npm run dev
   ```

   **Resolving warnings:**
   - **Node.js version**: Use Node 20 or 22 (see `engines` in package.json). With nvm: `nvm use`
   - **`Unknown env config devdir`**: Run `npm run dev:clean` or `./scripts/dev.sh` to start the dev server with a clean env

4. **Backend**
   - Ensure the backend runs on `http://localhost:8000` (or update `VITE_API_URL`)
   - Required: `POST /api/auth/google` for sign-in
   - Required: `POST /api/upload` and `POST /api/process` (or `POST /api/jobs` + `GET /api/jobs/:id` for progress)
   - See the frontend spec for full API details

## Routes

- `/` – Landing (public)
- `/signin` – Sign in with Google
- `/upload` – Upload, process, and download (protected)
