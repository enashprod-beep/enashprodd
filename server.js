require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const Stripe = require("stripe");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DATA = path.join(__dirname, "data", "beats.json");
const UPLOADS = path.join(__dirname, "uploads");

for (const d of [
  path.join(UPLOADS, "previews"),
  path.join(UPLOADS, "files")
]) fs.mkdirSync(d, { recursive: true });

function readBeats() {
  try { return JSON.parse(fs.readFileSync(DATA, "utf8")); } catch { return []; }
}
function saveBeats(beats) {
  fs.writeFileSync(DATA, JSON.stringify(beats, null, 2));
}
function slugify(s) {
  return s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}
function admin(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return res.status(401).set("WWW-Authenticate", "Basic realm=\"EnashProdd\"").send("Authentification requise");
  const [u, p] = Buffer.from(h.slice(6), "base64").toString().split(":");
  if (u !== (process.env.ADMIN_USER || "admin") || p !== (process.env.ADMIN_PASSWORD || "change-moi"))
    return res.status(403).send("Accès refusé");
  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, file.fieldname === "preview" ? path.join(UPLOADS, "previews") : path.join(UPLOADS, "files")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomBytes(10).toString("hex") + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 250 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads/previews", express.static(path.join(UPLOADS, "previews")));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/beats", (req, res) => {
  const beats = readBeats().map(b => ({...b, privateFile: undefined}));
  res.json(beats);
});

app.get("/api/beats/:slug", (req, res) => {
  const b = readBeats().find(x => x.slug === req.params.slug);
  if (!b) return res.status(404).json({error:"Prod introuvable"});
  const safe = {...b}; delete safe.privateFile; delete safe.downloadFiles;
  res.json(safe);
});

app.post("/api/admin/beats", admin, upload.fields([
  {name:"preview", maxCount:1},
  {name:"mp3", maxCount:1},
  {name:"wav", maxCount:1},
  {name:"stems", maxCount:1}
]), (req, res) => {
  const body = req.body;
  if (!body.title || !req.files?.preview?.[0]) return res.status(400).json({error:"Titre et preview audio requis"});
  const beats = readBeats();
  let slug = slugify(body.title);
  if (!slug) slug = "prod";
  let base = slug, i = 2;
  while (beats.some(b => b.slug === slug)) slug = `${base}-${i++}`;

  const beat = {
    id: crypto.randomUUID(),
    title: body.title,
    slug,
    artist: body.artist || "EnashProdd",
    bpm: body.bpm || "",
    key: body.key || "",
    genre: body.genre || "Rap",
    description: body.description || "",
    tags: (body.tags || "").split(",").map(x=>x.trim()).filter(Boolean),
    cover: body.cover || "",
    preview: "/uploads/previews/" + req.files.preview[0].filename,
    prices: {
      mp3: Number(body.price_mp3 || 19.99),
      wav: Number(body.price_wav || 29.99),
      stems: Number(body.price_stems || 49.99),
      exclusive: Number(body.price_exclusive || 199.99)
    },
    privateFiles: {
      mp3: req.files.mp3?.[0] ? "/uploads/files/" + req.files.mp3[0].filename : "",
      wav: req.files.wav?.[0] ? "/uploads/files/" + req.files.wav[0].filename : "",
      stems: req.files.stems?.[0] ? "/uploads/files/" + req.files.stems[0].filename : ""
    },
    createdAt: new Date().toISOString()
  };
  beats.unshift(beat);
  saveBeats(beats);
  res.json({ok:true, beat:{...beat, privateFiles:undefined}});
});

app.delete("/api/admin/beats/:id", admin, (req,res)=>{
  const beats = readBeats();
  const b = beats.find(x=>x.id===req.params.id);
  if (!b) return res.status(404).json({error:"Introuvable"});
  beats.splice(beats.indexOf(b),1); saveBeats(beats);
  res.json({ok:true});
});

app.get("/api/download/:slug/:license", async (req,res)=>{
  const beats = readBeats();
  const b = beats.find(x=>x.slug===req.params.slug);
  if (!b) return res.status(404).send("Prod introuvable");
  // Démo: téléchargement protégé par un token de démo.
  // En production, ce endpoint doit être appelé uniquement après validation Stripe/webhook.
  if (req.query.demo !== "1") return res.status(402).send("Paiement requis.");
  const file = b.privateFiles?.[req.params.license];
  if (!file) return res.status(404).send("Format non disponible.");
  res.download(path.join(__dirname, file.replace(/^\//,"")), `${b.slug}-${req.params.license}${path.extname(file)}`);
});

app.post("/api/checkout", async (req,res)=>{
  const {slug, license} = req.body;
  const b = readBeats().find(x=>x.slug===slug);
  if (!b || !b.prices?.[license]) return res.status(404).json({error:"Produit introuvable"});
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.json({demo:true, url:`/checkout-demo.html?slug=${encodeURIComponent(slug)}&license=${encodeURIComponent(license)}`});
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const labels = {mp3:"Lease MP3", wav:"Lease WAV", stems:"Lease WAV + Stems", exclusive:"Exclusive"};
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "eur",
        product_data: {name: `${b.title} — ${labels[license]}`, description: "Licence EnashProdd"},
        unit_amount: Math.round(Number(b.prices[license]) * 100)
      },
      quantity: 1
    }],
    success_url: `${BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}&slug=${encodeURIComponent(slug)}&license=${encodeURIComponent(license)}`,
    cancel_url: `${BASE_URL}/prod/${encodeURIComponent(slug)}`
  });
  res.json({url: session.url});
});

app.get("/prod/:slug", (req,res)=>res.sendFile(path.join(__dirname,"public","product.html")));
app.get("/admin", (req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));

app.listen(PORT, ()=>console.log(`EnashProdd lancé sur ${BASE_URL}`));
