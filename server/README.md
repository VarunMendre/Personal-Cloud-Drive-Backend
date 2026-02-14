# CloudVault Backend 🚀

CloudVault is a robust, production-ready backend for a Personal Cloud Drive application. Built with **Node.js** and **Express**, it provides a secure and scalable environment for managing files and directories, integrating seamlessly with AWS storage and Razorpay for subscriptions.

## 🌟 Key Features

### 🔐 Authentication & Security
- **Multi-Layered Auth**: Custom JWT-based cookie authentication with Redis-backed session management.
- **RBAC (Role-Based Access Control)**: Granular permissions for **Owners**, **Admins**, and **Regular Users**.
- **Secure Registration**: OTP-based email verification using **Resend**.
- **Enhanced Security**: 
  - Password hashing with **Bcrypt**.
  - Request **Throttling** and **Rate Limiting** to prevent brute-force attacks.
  - Security headers with **Helmet** and strict **CORS** policies.
  - Content sanitization with **DOMPurify**.

### 📁 File & Storage Management
- **AWS S3 Integration**: High-performance multi-part file uploads and management.
- **CloudFront Support**: Signed URLs for secure and fast content delivery.
- **Hierarchical Structure**: Full CRUD operations for directories and files.
- **Resource Actions**: Rename, Move, Delete (Soft/Hard), and detailed metadata retrieval.

### 🤝 Sharing & Collaboration
- **Direct Sharing**: Share files/folders with specific users by email/ID.
- **Public Links**: Generate secure, time-limited, or permanent public share links.
- **Collaborator Management**: Add, update, or remove access permissions for shared resources.

### 💳 Subscription & Payments
- **Razorpay Integration**: Automated subscription lifecycle management (Create, Upgrade, Cancel, Resume, Pause).
- **Plan Management**: Tiered storage plans with automated limit enforcement.
- **Invoicing**: Automated generation and retrieval of subscription invoices.

### 🔄 External Integrations
- **Google Drive Import**: Seamlessly import files directly from Google Drive using Google APIs.
- **Automated CI/CD**: Custom GitHub Webhook handler for automated server deployment via bash scripts.

### ⚙️ Background Tasks (Cron Jobs)
- **Subscription Processor**: Daily checks for subscription states and renewals.
- **Storage Cleanup**: Automated cleanup of orphaned or failed uploads to save storage costs.
- **Trial Management**: Processing and transitioning of trial users.

---

## 🛠 Tech Stack

| Category | Technologies |
| :--- | :--- |
| **Runtime** | Node.js |
| **Framework** | Express.js |
| **Database** | MongoDB (Mongoose) |
| **Caching/Session** | Redis |
| **Cloud Storage** | AWS S3, CloudFront |
| **Payments** | Razorpay |
| **Validation** | Zod |
| **Communication** | Resend (Email), Axios |

---

## 🏗 Project Structure

```text
├── config/             # DB and core configurations
├── controllers/        # Business logic for API endpoints
├── cron-jobs/          # Scheduled background tasks
├── middlewares/        # Auth and validation middlewares
├── models/             # Mongoose schemas (User, File, Directory, etc.)
├── routes/             # API route definitions
├── services/           # External service integrations (AWS, Google, Razorpay)
├── utils/              # Helper functions, rate limiters, and throttlers
├── validators/         # Zod schemas for request validation
└── app.js              # Application entry point
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB & Redis
- AWS S3 Bucket & CloudFront Distribution
- Razorpay API Keys
- Google Cloud Console Project (for Drive Import)

### Installation
1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables:
   - Create a `.env` file based on `.env.example`.
   - Add your connection strings, API keys, and secrets.

4. Run the setup script:
   ```bash
   npm run setup
   ```

5. Start the server:
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

---

## 🛣 API Endpoints (Brief)

- `/auth` - Authentication (Google, Logout)
- `/user` - User registration, login, profile, and management.
- `/file` - File CRUD and uploads.
- `/directory` - Directory management.
- `/share` - Resource sharing and public links.
- `/import` - Google Drive imports.
- `/subscriptions` - Payment and plan management.

---

Developed with ❤️ for secure file management.
