# UPS Store Portfolio and Operations Portal

This app now separates the platform Owner experience from individual UPS Store operations.

- **Owner**: portfolio dashboard, messages, Admin/Manager management by UPS Store, account/security settings.
- **Administrator**: scoped to one UPS Store; manages store staff and operations.
- **Manager**: scoped to one UPS Store; manages approved store workflows.
- **Employee**: scoped to one UPS Store; uses only employee-level workflows.

## Database Layout

The Atlas cluster uses one Owner/master database plus one miniature database per UPS Store:

```txt
storeops                  # Owner/master portfolio, logins, store records
storeops_8099             # Store 8099 miniature database
storeops_1201             # Store 1201 miniature database
storeops_2045             # Store 2045 miniature database
storeops_3310             # Store 3310 miniature database
```

Each store record in `storeops.stores` has a `databaseName` field, for example:

```txt
storeNumber: 8099
databaseName: storeops_8099
```

Bootstrap or refresh all per-store databases with:

```bash
npm run bootstrap:store-dbs
```

## Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file from `.env.example`.

3. Paste your MongoDB Atlas connection string into `MONGODB_URI`.

4. Start frontend and backend together:
   ```bash
   npm run dev
   ```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:4000/api/health`

The API starts independently from MongoDB and retries the database connection automatically. If Atlas is temporarily unavailable, `/api/health` remains available and reports the database state while database-backed routes return a clear `503` response.

## Environment Options

- `PORT`: Express API port. Defaults to `4000`.
- `HOST`: Express bind host. Defaults to `0.0.0.0`.
- `MONGODB_URI`: Required MongoDB Atlas or self-hosted MongoDB connection string.
- `MONGODB_DB_NAME`: Optional database-name override. Otherwise, the name in `MONGODB_URI` is used.
- `MONGODB_SERVER_SELECTION_TIMEOUT_MS`: MongoDB connection-attempt timeout. Defaults to `10000`.
- `MONGODB_RETRY_DELAY_MS`: Delay before retrying an unavailable database. Defaults to `5000`.
- `CLIENT_ORIGIN`: Allowed frontend origins, separated by commas when needed.
- `VITE_API_PROXY_TARGET`: Local Vite proxy destination. Defaults to `http://localhost:${PORT}`.
- `VITE_API_BASE_URL`: Production frontend API origin, for example `https://storeops-api.onrender.com`. Leave empty locally so Vite can use its `/api` proxy.

The project supports Node.js `20` and newer releases.

## Deploy With Vercel + Render

Recommended production layout:

```txt
Vercel         -> React/Vite frontend
Render         -> Express API
MongoDB Atlas  -> Database
```

### 1. Push to GitHub

Create a GitHub repository and push this project. Connect that same repository to both Render and Vercel.

### 2. Deploy the API on Render

Use the included `render.yaml` blueprint or create a Render Web Service manually.

For a no-card/free test deployment, create the Web Service manually and choose Render's free instance type. Free instances are fine for testing, but they sleep after idle time and wake up slowly. For real customer stores, upgrade the API later.

Manual Render settings:

```txt
Runtime: Node
Instance Type: Free
Build Command: npm run build:api
Start Command: npm run start:api
Health Check Path: /api/health
```

Set these Render environment variables:

```txt
HOST=0.0.0.0
MONGODB_URI=<your MongoDB Atlas connection string>
MONGODB_DB_NAME=storeops
JWT_SECRET=<long random secret>
CLIENT_ORIGIN=https://your-vercel-domain.vercel.app
SEED_DEMO_DATA=false
PLATFORM_OWNER_NAME=Preet Patel
PLATFORM_OWNER_USERNAME=preet1862
PLATFORM_OWNER_EMAIL=preetpatel1862@gmail.com
PLATFORM_OWNER_PASSWORD=<your secure owner password>
```

For `MONGODB_URI`, Render has a separate key field and value field. The key should be `MONGODB_URI`; the value should start directly with `mongodb+srv://` or `mongodb://`.

Do not paste this into Render's value field:

```txt
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/storeops
```

Paste only this style of value, using your real Atlas database username, password, and cluster host from Atlas `Connect > Drivers`:

```txt
mongodb+srv://myStoreUser:myPassword@ac-example-shard.mongodb.net/storeops?retryWrites=true&w=majority
```

Do not leave placeholders like `USERNAME`, `PASSWORD`, or `CLUSTER` in the Render value.

If the database password contains special characters like `@`, `#`, `/`, or `?`, either URL-encode them or create a simpler Atlas database password.

After Render deploys, test:

```txt
https://your-render-api.onrender.com/api/health
```

### 3. Deploy the Frontend on Vercel

Vercel settings:

```txt
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Set this Vercel environment variable:

```txt
VITE_API_BASE_URL=https://your-render-api.onrender.com
```

The included `vercel.json` rewrites frontend routes to `index.html`, so direct visits like `/auth` keep working.

### 4. Final Production Checks

1. Visit the Vercel URL.
2. Open `/auth`.
3. Sign in as the platform owner.
4. Confirm the Render health endpoint is healthy.
5. In MongoDB Atlas, verify `storeops.users`, `storeops.usersessions`, and `storeops.stores` update as expected.

If login works locally but not on Vercel, check these first:

- Vercel `VITE_API_BASE_URL` points to the Render API URL.
- Render `CLIENT_ORIGIN` exactly matches the Vercel frontend origin.
- MongoDB Atlas Network Access allows the Render service to connect.
- `JWT_SECRET` is set on Render and stays stable between deploys.

## MongoDB Atlas Notes

Use a database user with read/write access. In Atlas, also allow your current IP address under Network Access, otherwise the backend cannot connect.

Create the platform Owner with:

```bash
npm run create:owner
```

Set these values in `.env` first:

- `PLATFORM_OWNER_NAME`
- `PLATFORM_OWNER_USERNAME`
- `PLATFORM_OWNER_EMAIL`
- `PLATFORM_OWNER_PASSWORD`

Create or reset the temporary Store 8099 admin with:

```bash
npm run create:temp-store
```

Demo logins are only created when `SEED_DEMO_DATA=true` is set:

- `employee@storeops.com` / `password123`
- `manager@storeops.com` / `password123`
- `admin@storeops.com` / `password123`

## API Areas

- Auth: login, logout, profile, sessions, password change, forgot-password reset tokens
- Owner portfolio: UPS Stores, website status, payment/subscription fields, assigned Admins/Managers
- Users and permissions: Owner manages Admins/Managers; Admins manage their store users
- Messages: Owner/Admin/Manager communication, with Owner chat limited to Admins/Managers
- Audit logs and notifications
- Store operations remain available to non-Owner store roles where enabled
