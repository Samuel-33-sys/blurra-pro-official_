import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import Stripe from "stripe";
import { Resend } from "resend";
import dotenv from "dotenv";
import { customAlphabet } from "nanoid";
import cors from "cors";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Initialize Database
const db = new Database(process.env.DATABASE_PATH || "database.sqlite");
db.exec(`
  CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    plan TEXT NOT NULL,
    amount INTEGER,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    stripe_session_id TEXT UNIQUE
  );
`);

// Initialize external services
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const resend = new Resend(process.env.RESEND_API_KEY || "");
const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ123456789", 4);

function generateLicenseKey() {
  return `BLUR-${nanoid()}-${nanoid()}-${nanoid()}`;
}

// Middleware
app.use(cors());

// Webhook needs raw body for signature verification
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ""
    );
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_details?.email;
    const amount = session.amount_total;
    const plan = session.metadata?.plan || "Solo";
    const paymentType = session.mode === 'subscription' ? 'monthly' : 'one-time';

    if (email) {
      const key = generateLicenseKey();
      const expiresAt = paymentType === 'monthly' ? 
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : 
        null;

      try {
        db.prepare(`
          INSERT INTO keys (license_key, email, plan, amount, expires_at, stripe_session_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(key, email, plan, amount, expiresAt, session.id);

        // Send Email via Resend
        await resend.emails.send({
          from: "Blurra <no-reply@updates.blurra.app>",
          to: email,
          subject: "Your Blurra Activation Key",
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #eee; border-radius: 20px;">
              <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 24px;">Welcome to Blurra Pro!</h1>
              <p style="font-size: 16px; color: #666; margin-bottom: 32px;">Your privacy shield is ready. Use the activation key below in the extension popup to get started.</p>
              
              <div style="background: #f8fafc; padding: 32px; border-radius: 12px; text-align: center; margin-bottom: 32px;">
                <span style="font-size: 12px; font-weight: 900; letter-spacing: 0.1em; color: #94a3b8; text-transform: uppercase;">Your Activation Key</span>
                <div style="font-size: 24px; font-weight: 800; margin-top: 8px; color: #0f172a; font-family: monospace;">${key}</div>
              </div>

              <div style="font-size: 14px; color: #666; margin-bottom: 32px;">
                <p><strong>Plan:</strong> ${plan}</p>
                <p><strong>Expiration:</strong> ${expiresAt ? new Date(expiresAt).toLocaleDateString() : 'Lifetime'}</p>
              </div>

              <a href="${process.env.BASE_URL}" style="display: inline-block; background: #000; color: #fff; padding: 16px 32px; border-radius: 99px; text-decoration: none; font-weight: 700;">Open Extension Settings</a>
              
              <p style="margin-top: 40px; font-size: 12px; color: #94a3b8;">
                If you have any questions, just reply to this email.
              </p>
            </div>
          `
        });
      } catch (err) {
        console.error("Error processing key generation:", err);
      }
    }
  }

  res.json({ received: true });
});

// Regular API JSON body parser for other routes
app.use(express.json());

// API Endpoint for Extension Validation
app.post("/api/validate-key", (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ valid: false, message: "Key is required" });

  const record = db.prepare("SELECT * FROM keys WHERE license_key = ?").get(key) as any;

  if (!record) {
    return res.json({ valid: false, message: "Key invalid or not found" });
  }

  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    return res.json({ valid: false, message: "Key has expired" });
  }

  const features = {
    maxUsers: record.plan === 'Agency' ? 999 : (record.plan === 'Team' ? 10 : 1),
    whitelabel: record.plan === 'Agency'
  };

  res.json({ 
    valid: true, 
    plan: record.plan, 
    expires: record.expires_at,
    features 
  });
});

// Success Page Session Retrieval
app.get("/api/success-session", (req, res) => {
  const session_id = req.query.session_id as string;
  if (!session_id) return res.status(400).json({ error: "Session ID required" });

  const record = db.prepare("SELECT license_key, email FROM keys WHERE stripe_session_id = ?").get(session_id) as any;

  if (!record) {
    return res.status(404).json({ error: "Session not found or processing. Please check your email." });
  }

  res.json({ key: record.license_key, email: record.email });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
