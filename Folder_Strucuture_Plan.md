# Backend Architecture & Structural Refactoring Plan

We need to address the structural issues in the backend project by refactoring the controllers, separating business logic into a dedicated **Service Layer**, using `asyncHandler` to avoid repetitive try-catch boilerplate, and standardizing API responses/errors.

---

## User Review Required

> [!IMPORTANT]
> **Global Error Response Format Standardized**: 
> Currently, the global error middleware in [app.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/app.js) returns errors as `{ status, message }`, whereas controller-level custom errors use `errorResponse` from `utils/response.js` which produces `{ success: false, error: message, ... }`. 
> I propose aligning the global error handler to also use `errorResponse`, rendering all API errors as `{ success: false, error: ... }`. Please confirm if this is acceptable or if there are legacy clients that rely specifically on `{ status, message }` format.

---

## Open Questions

> [!NOTE]
> No major logical open questions exist for this refactoring since it is focused purely on structural code cleanup without changing any database schemas or business endpoints.

---

## Proposed Changes

We will introduce a dedicated service layer, rewrite the controllers using `asyncHandler`, migrate inline business logic out of the controllers, and clean up route files.

### 1. Service Layer (New Services)

We will create new service files to hold database operations, S3 operations, and authentication logic.

#### [NEW] [authService.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/services/authService.js)
Handles OTP generation/verification, user registration inside database transactions, login credential matching, Google/GitHub OAuth logins, session caching in Redis, and password updates.

#### [NEW] [directoryService.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/services/directoryService.js)
Handles directory retrieval (populating path/counts), directory creation (validating parent folder ownership), directory renaming, and recursive directory deletion (fetching nested files, deleting from S3, bulk deleting from MongoDB).

#### [NEW] [fileService.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/services/fileService.js)
Handles file retrieval, file url generation (S3 vs CloudFront based on action), renaming (with optimistic locking & share token authorization), deletion, path resolution, upload initialization (quota checks, file size checks, pre-signed URL creation), upload completion (verifying upload state/sizes), and cancellation.

#### [NEW] [shareService.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/services/shareService.js)
Handles fetching shared users, user sharing, access updates, access removal, share link generation/updates/disabling, dashboard stats calculations, recent activity log retrieval, shared list formatting, and public resource link resolving (generating inline previews vs. download URLs).

#### [NEW] [userService.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/services/userService.js)
Handles user profile fetching, profile picture uploading, logout, session deletion in Redis, fetching all users with login and subscription status, soft/hard deleting users, user recovery, updates to roles, and custom user file/view administration operations.

---

### 2. Controller Layer (Refactoring to asyncHandler)

We will modify existing controllers to remove all manual try-catch wrappers, using `asyncHandler` instead, and deferring business actions to the newly created services.

#### [MODIFY] [authController.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/controllers/authController.js)
Wraps all functions in `asyncHandler`. Calls `authService` for business operations. Replaces inline try-catch blocks and explicit `errorResponse` calls on throw with thrown `CustomError` objects.

#### [MODIFY] [directoryController.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/controllers/directoryController.js)
Wraps functions in `asyncHandler`. Replaces recursive helper functions with calls to `directoryService`. Deploys `CustomError` for invalid or unauthorized directories.

#### [MODIFY] [fileController.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/controllers/fileController.js)
Wraps functions in `asyncHandler`. Moves transaction validation, S3 and CloudFront signing logic, upload verification, and size mapping to `fileService`.

#### [MODIFY] [shareController.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/controllers/shareController.js)
Wraps functions in `asyncHandler`. Delegates sharing logic and activity calculations to `shareService`. Converts all raw `res.json()` responses to structured `successResponse` / `errorResponse` patterns.

#### [MODIFY] [subscriptionController.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/controllers/subscriptionController.js)
Wraps functions in `asyncHandler`. Moves direct Mongoose queries (e.g. searching webhook records, invoice polling) out of the controller into service methods.

#### [MODIFY] [userController.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/controllers/userController.js)
Wraps functions in `asyncHandler`. Moves Redis SCAN operations, subscription maps, Mongoose lookups, and session management logic into `userService`.

#### [MODIFY] [webhookController.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/controllers/webhookController.js)
Wraps in `asyncHandler`. Relies on signature check helper and logs webhooks consistently.

#### [NEW] [importController.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/controllers/importController.js)
Handles import routes using `asyncHandler`, calling the existing Google Drive import service.

---

### 3. Routes & App Entry Configuration

#### [MODIFY] [importRoutes.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/routes/importRoutes.js)
Moves the inline route logic to `importController.js`.

#### [MODIFY] [app.js](file:///e:/VARUN/NodeJs_crash_course/NodeJs/projects/StorageApp-backend/server/app.js)
Standardizes the global error handling middleware to format errors consistently using the `errorResponse` helper.

---

## Verification Plan

### Automated Tests
- We will execute the existing test suite if available to verify no endpoints are broken.
- We will start the local development server (`npm run dev` or `node server/app.js` / `server.js` entry point) and verify that it starts without compile or route registration issues.

### Manual Verification
- Send requests using `curl` or Postman to key endpoints (e.g. `/auth/send-otp`, `/user`, `/directory`, `/file`) to check:
  1. Success response structure (always `{ success: true, ... }`).
  2. Error response structure (always `{ success: false, error: ... }` for both validation, database, and system errors).
  3. Proper authorization checks (JWT validation / cookies).
