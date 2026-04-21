# Blurra - Professional Screen Privacy

Blurra is a high-performance browser extension designed for professionals who share their screens. It allows you to instantly blur sensitive data, PII, or entire sections of a webpage with a single click or draw.

## features

- **One-Click Element Blur**: Hover over any HTML element and click to blur it instantly.
- **Precision Text Blur**: Highlight text to blur specific fragments.
- **Area selection Blur**: Draw rectangles to blur custom regions.
- **Persistence**: Blurs stay active across page reloads (configurable).
- **Pro Licensing System**: Built-in Stripe integration with activation key generation.

## Full-Stack Architecture

This project is a full-stack application built with:
- **Frontend**: React + Vite + Tailwind CSS + Lucide Icons + Motion.
- **Backend**: Express.js (serving API and Stripe webhooks).
- **Database**: SQLite (for local license management).
- **Payments**: Stripe (Webhook processing).
- **Email**: Resend (Automated delivery of license keys).

## Setup & installation

1. **Clone the repository**
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your credentials:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `RESEND_API_KEY`
   - `BASE_URL`

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```

## Extension Setup

To load the extension into your browser:
1. Go to `chrome://extensions/`.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked".
4. Select the `public/extension` folder from this repository.

## Deployment

The application is configured to run on platforms like Render, Railway, or Vercel. 
- Ensure `NODE_ENV` is set to `production`.
- The server automatically serves the build production frontend from the `dist/` folder.

## License

MIT © Blurra Team
