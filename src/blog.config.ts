export const blogConfig = {
    // Threshold for storing files in D1 vs R2 (in bytes)
    // 1MB = 1048576 bytes. Cloudflare D1 has a 1MB row limit.
    // We set it slightly lower than 1MB to account for other column data.
    DB_STORAGE_THRESHOLD: 1024 * 1024 * 0.9, // 0.9 MB

    // Maximum total attachment size (in bytes)
    // 200MB = 209715200 bytes
    MAX_ATTACHMENT_SIZE: 1024 * 1024 * 200, // 200 MB

    // Allowed file types (optional)
    ALLOWED_EXTENSIONS: ['.zip', '.pdf', '.jpg', '.png', '.txt'],
};
