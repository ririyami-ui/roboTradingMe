// src/utils/encryption.ts
import CryptoJS from 'crypto-js';

// Secret key for internal encryption. 
// Note: In a production environment, this should ideally be combined with 
// user-specific entropy or handled via a more complex KMS.
const APP_SECRET = 'crypto-analyst-v1-secure-salt';

/**
 * Encrypt data using AES-256
 * @param {string} text - Plain text to encrypt
 * @param {string} userId - User's UID to make encryption unique per account
 * @returns {string} - Encrypted string (Base64)
 */
export const encryptData = (text: string, userId: string): string => {
    if (!text) return '';
    try {
        return CryptoJS.AES.encrypt(text, `${APP_SECRET}-${userId}`).toString();
    } catch (error) {
        console.error("Encryption failed:", error);
        return '';
    }
};

/**
 * Decrypt data using AES-256
 * @param {string} ciphertext - Encrypted string
 * @param {string} userId - User's UID used for encryption
 * @returns {string} - Decrypted plain text
 */
export const decryptData = (ciphertext: string, userId: string): string => {
    if (!ciphertext) return '';
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, `${APP_SECRET}-${userId}`);
        const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
        return decryptedText;
    } catch (error) {
        console.warn("Decryption failed (possibly invalid key or corrupt data):", error);
        return '';
    }
};
// Refresh 03/17/2026 00:21:40
