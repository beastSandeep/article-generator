const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const util = require("node:util");

const express = require("express");
const multer = require("multer");
const QRCode = require("qrcode");

const { extractArticleFromFile } = require("./src/extract");
const { normalizeArticle, renderLatex, makeSlug } = require("./src/latex");

const execFileAsync = util.promisify(execFile);

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const GENERATED_DIR = path.join(ROOT, "generated");
const PUBLIC_DIR = path.join(ROOT, "public");
const ALLOWED_ASSETS = new Set([
  "banner.png",
  "orcid.png",
  "qr.png",
  "image.png",
]);
const PORT = Number(process.env.PORT || 3000);

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static(PUBLIC_DIR));

const documentUpload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".docx", ".txt"].includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only .docx and .txt files are supported for extraction."));
  },
});

const imageUpload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".png", ".jpg", ".jpeg"].includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only .png, .jpg, and .jpeg images are supported."));
  },
});

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(DATA_DIR, { recursive: true }),
    fs.mkdir(UPLOAD_DIR, { recursive: true }),
    fs.mkdir(GENERATED_DIR, { recursive: true }),
  ]);
}

function safeDataPath(fileName) {
  const base = path.basename(fileName || "");
  const target = path.join(DATA_DIR, base);
  if (!target.startsWith(DATA_DIR)) {
    throw new Error("Invalid data file path.");
  }
  return target;
}

function safeGeneratedPath(fileName) {
  const base = path.basename(fileName || "");
  const target = path.join(GENERATED_DIR, base);
  if (!target.startsWith(GENERATED_DIR)) {
    throw new Error("Invalid generated file path.");
  }
  return target;
}

function safeUploadAssetPath(fileName) {
  const base = path.basename(fileName || "");
  const target = path.join(UPLOAD_DIR, base);
  if (!target.startsWith(UPLOAD_DIR)) {
    throw new Error("Invalid upload file path.");
  }
  return target;
}

function safeUploadFileName(originalName, prefix) {
  const ext = path.extname(originalName || "").toLowerCase();
  const stem =
    path
      .basename(originalName || "image", ext)
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "image";
  return `${prefix}-${Date.now()}-${stem}${ext}`;
}

async function listDataFiles() {
  const entries = await fs
    .readdir(DATA_DIR, { withFileTypes: true })
    .catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) =>
      [".docx", ".txt"].includes(path.extname(name).toLowerCase()),
    )
    .sort((a, b) => a.localeCompare(b));
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  try {
    require("node:child_process").execFileSync(probe, [command], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

async function compilePdf(texPath, slug) {
  const engine = commandExists("xelatex") ? "xelatex" : "pdflatex";
  const relativeTexPath = path.relative(ROOT, texPath);
  const args = [
    "-interaction=nonstopmode",
    "-halt-on-error",
    "-output-directory",
    GENERATED_DIR,
    relativeTexPath,
  ];

  await execFileAsync(engine, args, {
    cwd: ROOT,
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 5,
  });

  return {
    engine,
    pdfPath: path.join(GENERATED_DIR, `${slug}.pdf`),
  };
}

async function readLogTail(slug) {
  const logPath = path.join(GENERATED_DIR, `${slug}.log`);
  try {
    const log = await fs.readFile(logPath, "utf8");
    return log.slice(-5000);
  } catch {
    return "";
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    engines: {
      xelatex: commandExists("xelatex"),
      pdflatex: commandExists("pdflatex"),
    },
  });
});

app.get("/api/data-files", async (_req, res, next) => {
  try {
    res.json({ files: await listDataFiles() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/extract-data-file", async (req, res, next) => {
  try {
    const filePath = safeDataPath(req.body.fileName);
    await fs.access(filePath);
    const article = await extractArticleFromFile(
      filePath,
      path.basename(filePath),
    );
    res.json({ article });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/upload-extract",
  documentUpload.single("document"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No document uploaded." });
        return;
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const renamedPath = `${req.file.path}${ext}`;
      await fs.rename(req.file.path, renamedPath);
      const article = await extractArticleFromFile(
        renamedPath,
        req.file.originalname,
      );
      res.json({ article });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/upload-author-image",
  imageUpload.single("authorImage"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No author image uploaded." });
        return;
      }

      const fileName = safeUploadFileName(req.file.originalname, "author");
      const targetPath = safeUploadAssetPath(fileName);
      await fs.rename(req.file.path, targetPath);

      res.json({
        authorImage: `uploads/${fileName}`,
        originalName: req.file.originalname,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post("/api/generate", async (req, res, next) => {
  try {
    let article = normalizeArticle(req.body.article || req.body);
    const slug = `${makeSlug(article.title || "article")}-${Date.now()}`;
    const texPath = path.join(GENERATED_DIR, `${slug}.tex`);

    if (article.qrUrl) {
      const qrFile = `${slug}-qr.png`;
      const qrPath = path.join(GENERATED_DIR, qrFile);
      await QRCode.toFile(qrPath, article.qrUrl, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 512,
      });
      article = normalizeArticle({
        ...article,
        qrImage: `generated/${qrFile}`,
      });
    }

    const tex = renderLatex(article);

    await fs.writeFile(texPath, tex, "utf8");

    const result = {
      slug,
      texUrl: `/download/${slug}.tex`,
    };

    if (req.body.pdf) {
      try {
        const pdf = await compilePdf(texPath, slug);
        result.engine = pdf.engine;
        result.pdfUrl = `/download/${slug}.pdf`;
      } catch (error) {
        result.pdfError = true;
        result.error =
          "The .tex file was created, but LaTeX failed while compiling the PDF.";
        result.details = (await readLogTail(slug)) || error.message;
        res.status(422).json(result);
        return;
      }
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/download/:file", async (req, res, next) => {
  try {
    const filePath = safeGeneratedPath(req.params.file);
    await fs.access(filePath);
    res.download(filePath);
  } catch (error) {
    next(error);
  }
});

app.get("/assets/:file", async (req, res, next) => {
  try {
    const file = path.basename(req.params.file);
    if (!ALLOWED_ASSETS.has(file)) {
      res.status(404).send("Asset not found");
      return;
    }
    res.sendFile(path.join(ROOT, file));
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const message =
    error && error.message ? error.message : "Unexpected server error.";
  res.status(error.status || 500).json({ error: message });
});

async function startServer(port) {
  await ensureDirs();

  const server = app.listen(port, () => {
    const address = server.address();
    console.log(
      `Article LaTeX Generator running at http://localhost:${address.port}`,
    );
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < PORT + 20) {
      startServer(port + 1).catch((nextError) => {
        console.error(nextError);
        process.exit(1);
      });
      return;
    }
    console.error(error);
    process.exit(1);
  });
}

startServer(PORT).catch((error) => {
  console.error(error);
  process.exit(1);
});
