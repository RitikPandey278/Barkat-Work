const admin = require("firebase-admin");

let firestore;

const createFirebaseCredential = (serviceAccount) => {
    const projectId = serviceAccount?.projectId || serviceAccount?.project_id;
    const clientEmail = serviceAccount?.clientEmail || serviceAccount?.client_email;
    const privateKey = serviceAccount?.privateKey || serviceAccount?.private_key;

    if (!projectId || !clientEmail || !privateKey || typeof privateKey !== "string") {
        throw new Error(
            "Firebase service account is incomplete. Project ID, client email and private key are required."
        );
    }

    return admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n")
    });
};

const getFirestore = () => {
    if (firestore) {
        return firestore;
    }

    if (admin.getApps().length === 0) {
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
                credential: createFirebaseCredential(serviceAccount)
            });
        } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            admin.initializeApp({
                credential: createFirebaseCredential({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY
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
