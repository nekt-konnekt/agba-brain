import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'agba-brain', timestamp: new Date().toISOString() });
});

// Security headers
app.use((req, res, next) => {
  if (/^\/(signup|signup\/account|signin|forgot-password|reset-password|onboarding|onboarding\/telegram|office|ask|actions|departments|decisions)(\/.*)?$/.test(req.path)) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  next();
});

// Specific route mappings matching vercel.json
const webDir = path.join(__dirname, 'web');

app.get('/', (req, res) => res.sendFile(path.join(webDir, 'index.html')));
app.get('/for-ceos', (req, res) => res.sendFile(path.join(webDir, 'for-ceos.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(webDir, 'signup.html')));
app.get('/signup/account', (req, res) => res.sendFile(path.join(webDir, 'signup-account.html')));
app.get('/signin', (req, res) => res.sendFile(path.join(webDir, 'signin.html')));
app.get('/forgot-password', (req, res) => res.sendFile(path.join(webDir, 'forgot-password.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(webDir, 'reset-password.html')));
app.get('/onboarding', (req, res) => res.sendFile(path.join(webDir, 'onboarding.html')));
app.get('/onboarding/telegram', (req, res) => res.sendFile(path.join(webDir, 'onboarding-telegram.html')));

app.get('/office', (req, res) => res.sendFile(path.join(webDir, 'office.html')));
app.get('/ask', (req, res) => res.sendFile(path.join(webDir, 'office.html')));
app.get('/actions', (req, res) => res.sendFile(path.join(webDir, 'office.html')));
app.get('/departments', (req, res) => res.sendFile(path.join(webDir, 'office.html')));
app.get('/decisions', (req, res) => res.sendFile(path.join(webDir, 'office.html')));

app.get('/app.js', (req, res) => res.sendFile(path.join(webDir, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(webDir, 'styles.css')));
app.get('/design-system.css', (req, res) => res.sendFile(path.join(webDir, 'design-system.css')));
app.get('/onboarding-styles.css', (req, res) => res.sendFile(path.join(webDir, 'onboarding-styles.css')));
app.get('/agba-logo.svg', (req, res) => res.sendFile(path.join(webDir, 'agba-logo.svg')));
app.get('/agba-wordmark.svg', (req, res) => res.sendFile(path.join(webDir, 'agba-wordmark.svg')));
app.get('/robots.txt', (req, res) => res.sendFile(path.join(webDir, 'robots.txt')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(webDir, 'sitemap.xml')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(webDir, 'agba-logo.svg')));
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(webDir, 'agba-logo.svg')));

// Serve static assets from /web
app.use('/web', express.static(webDir));
app.use(express.static(__dirname));

// Fallback for any other HTML route
app.get('*', (req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Agba Brain server running on http://0.0.0.0:${PORT}`);
});
