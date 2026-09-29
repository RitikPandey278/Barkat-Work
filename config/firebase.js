const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore: getAdminFirestore } = require("firebase-admin/firestore");

let firestore;

const getCredential = () => {
    // 1. Check JSON string configuration first
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        let account;
        try {
            account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        } catch {
            throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON.");
        }
        return cert({
            projectId: account.projectId || account.project_id,
            clientEmail: account.clientEmail || account.client_email,
            privateKey: String(account.privateKey || account.private_key || "").replace(/\\n/g, "\n")
        });
    }

    // 2. Check Individual Environment Variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
        // Extra quotes (") aur escaped \n ko clean karne ke liye:
        privateKey = privateKey.trim();
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = privateKey.substring(1, privateKey.length - 1);
        }
        privateKey = privateKey.replace(/\\n/g, "\n");

        return cert({
            projectId,
            clientEmail,
            privateKey
        });
    }

    throw new Error("Firebase credentials are not configured.");
};

const getFirestore = () => {
    if (!firestore) {
        if (getApps().length === 0) initializeApp({ credential: getCredential() });
        firestore = getAdminFirestore();
    }
    return firestore;
};

module.exports = { getFirestore };