export const SUBSCRIPTION_PLANS = {
  // Free Plan (Default)
  free: {
    name: "Free",
    tagline: "Starter Plan",
    storageQuotaInBytes: 500 * 1024 ** 2, // 500 MB
    maxDevices: 1,
    maxFileSize: 100 * 1024 ** 2, // 100 MB
    billingPeriod: "Monthly",
    price: 0,
  },
  // Standard Monthly
  plan_Su5pQyZuvix08B: {
    name: "Standard Plan",
    tagline: "For Students & Freelancers",
    storageQuotaInBytes: 100 * 1024 ** 3, // 100 GB
    maxDevices: 2,
    maxFileSize: 1 * 1024 ** 3, // 1 GB
    billingPeriod: "Monthly",
    price: 99,
  },
  // Premium Monthly
  plan_Su5sJ1cVn0sA3b: {
    name: "Premium Plan",
    tagline: "For Professionals & Creators",
    storageQuotaInBytes: 200 * 1024 ** 3, // 200 GB
    maxDevices: 3,
    maxFileSize: 2 * 1024 ** 3, // 2 GB
    billingPeriod: "Monthly",
    price: 199,
  },
  // Standard Yearly
  plan_Su5qr7eEef1lwX: {
    name: "Standard Plan",
    tagline: "For Students & Freelancers",
    storageQuotaInBytes: 200 * 1024 ** 3, // 200 GB
    maxDevices: 2,
    maxFileSize: 1 * 1024 ** 3, // 1 GB
    billingPeriod: "Yearly",
    price: 999,
  },
  // Premium Yearly
  plan_Su5t5DYChiXkwM: {
    name: "Premium Plan",
    tagline: "For Professionals & Creators",
    storageQuotaInBytes: 300 * 1024 ** 3, // 300 GB
    maxDevices: 3,
    maxFileSize: 2 * 1024 ** 3, // 2 GB
    billingPeriod: "Yearly",
    price: 1999,
  },
};
