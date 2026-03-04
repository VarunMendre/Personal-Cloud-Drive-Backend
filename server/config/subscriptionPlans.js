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
  plan_SMPP6YUub7ZlMM: {
    name: "Standard Plan",
    tagline: "For Students & Freelancers",
    storageQuotaInBytes: 100 * 1024 ** 3, // 100 GB
    maxDevices: 2,
    maxFileSize: 1 * 1024 ** 3, // 1 GB
    billingPeriod: "Monthly",
    price: 349,
  },
  // Premium Monthly
  plan_SMPQkwuHf1bQKr: {
    name: "Premium Plan",
    tagline: "For Professionals & Creators",
    storageQuotaInBytes: 200 * 1024 ** 3, // 200 GB
    maxDevices: 3,
    maxFileSize: 2 * 1024 ** 3, // 2 GB
    billingPeriod: "Monthly",
    price: 999,
  },
  // Standard Yearly
  plan_SMPLOQNZuavDPZ: {
    name: "Standard Plan",
    tagline: "For Students & Freelancers",
    storageQuotaInBytes: 200 * 1024 ** 3, // 200 GB
    maxDevices: 2,
    maxFileSize: 1 * 1024 ** 3, // 1 GB
    billingPeriod: "Yearly",
    price: 3999,
  },
  // Premium Yearly
  plan_SMPHSrTBZSIPQl: {
    name: "Premium Plan",
    tagline: "For Professionals & Creators",
    storageQuotaInBytes: 300 * 1024 ** 3, // 300 GB
    maxDevices: 3,
    maxFileSize: 2 * 1024 ** 3, // 2 GB
    billingPeriod: "Yearly",
    price: 7999,
  },
};
