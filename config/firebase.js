const admin = require("firebase-admin");

let firestore;

const getFirestore = () => {
    if (firestore) {
        return firestore;
    }

    if (!admin.apps.length) {
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        let serviceAccount = null;

        if (serviceAccountJson) {
            try {
                serviceAccount = JSON.parse(serviceAccountJson);
            } catch {
                throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
            }
        }

        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
                })
            });
        } else {
            throw new Error(
                "Firebase credentials are missing. Configure FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
            );
        }
    }

    firestore = admin.firestore();
    return firestore;
};

module.exports = { getFirestore };
