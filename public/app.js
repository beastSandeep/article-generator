const form = document.querySelector("#articleForm");
const dataFile = document.querySelector("#dataFile");
const uploadFile = document.querySelector("#uploadFile");
const statusBox = document.querySelector("#status");
const downloads = document.querySelector("#downloads");
const details = document.querySelector("#details");
const authorsList = document.querySelector("#authorsList");
const authorRowTemplate = document.querySelector("#authorRowTemplate");
const authorImageUpload = document.querySelector("#authorImageUpload");
const authorImageStatus = document.querySelector("#authorImageStatus");
const bodyImageUpload = document.querySelector("#bodyImageUpload");
const bodyImageResult = document.querySelector("#bodyImageResult");

function setBusy(isBusy) {
  document
    .querySelectorAll("button, input[type='file'], input[type='number']")
    .forEach((el) => {
      el.disabled = isBusy;
    });
}

function setStatus(message, detailText = "") {
  statusBox.textContent = message;
  details.textContent = detailText;
  details.classList.toggle("visible", Boolean(detailText));
}

function setDownloads(result) {
  downloads.innerHTML = "";

  if (result.texUrl) {
    const link = document.createElement("a");
    link.href = result.texUrl;
    link.textContent = "Download .tex";
    downloads.appendChild(link);
  }

  if (result.pdfUrl) {
    const link = document.createElement("a");
    link.href = result.pdfUrl;
    link.textContent = "Download .pdf";
    downloads.appendChild(link);
  }
}

function getField(name) {
  return form.elements[name];
}

function setField(name, value) {
  const field = getField(name);
  if (field) {
    field.value = value || "";
  }
}

function splitAuthorNames(value) {
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines;
  }

  return text
    .split(/\s*(?:&|\band\b|;)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
}

function authorNamesLine(authors) {
  return authors
    .map((author) => author.name)
    .filter(Boolean)
    .join(", ");
}

function getAuthors() {
  return Array.from(authorsList.querySelectorAll(".author-row"))
    .map((row) => ({
      name: row.querySelector("[data-author-name]").value.trim(),
      orcid: row.querySelector("[data-author-orcid]").value.trim(),
    }))
    .filter((author) => author.name || author.orcid);
}

function syncCorrespondingAuthor() {
  const field = getField("correspondingAuthor");
  // Only auto-fill if the field is currently empty
  if (!field.value.trim()) {
    field.value = authorNamesLine(getAuthors());
  }
}

function createAuthorRow(author = {}) {
  const fragment = authorRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".author-row");
  row.querySelector("[data-author-name]").value = author.name || "";
  row.querySelector("[data-author-orcid]").value =
    author.orcid || author.authorOrcid || "";
  authorsList.appendChild(fragment);
}

function setAuthors(authors) {
  authorsList.innerHTML = "";

  const cleanAuthors = Array.isArray(authors)
    ? authors.filter((author) => author && (author.name || author.orcid))
    : [];

  if (!cleanAuthors.length) {
    createAuthorRow();
    return;
  }

  cleanAuthors.forEach((author) => createAuthorRow(author));
}

function normalizeAuthorsFromArticle(article) {
  if (Array.isArray(article.authorsList) && article.authorsList.length) {
    return article.authorsList.map((author) => ({
      name: author.name || "",
      orcid: author.orcid || author.authorOrcid || "",
    }));
  }

  const names = splitAuthorNames(article.authors);
  const firstOrcid = article.authorOrcid || article.orcid || "";

  if (!names.length) {
    return firstOrcid ? [{ name: "", orcid: firstOrcid }] : [];
  }

  return names.map((name, index) => ({
    name,
    orcid: index === 0 ? firstOrcid : "",
  }));
}

/**
 * Converts date from various formats to YYYY-MM-DD for <input type="date">
 */
function formatDateForInput(dateStr) {
  if (!dateStr) return "";

  const clean = dateStr.trim();

  // Try to parse DD-MM-YYYY
  const parts = clean.split(/[-\/.]/);
  if (parts.length === 3) {
    let day, month, year;
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      [year, month, day] = parts;
    } else {
      // DD-MM-YYYY
      [day, month, year] = parts;
    }
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch (e) {}

  return "";
}

/**
 * Converts YYYY-MM-DD to DD-MM-YYYY for LaTeX
 */
function formatDateForLatex(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}-${month}-${year}`;
}
function fillForm(article) {
  const defaults = {
    articleType: "Research Article",
    journalShort: "Int. Jr. of Contemp. Res. in Multi.",
    bannerPath: "banner.png",
    issn: "2583-7397",
    pages: "1",
    volume: "5",
    issue: "1",
    year: "2026",
    issuePeriod: "Jan-Feb",
    journalWebsite: "www.multiarticlesjournal.com ",
    qrUrl: "",
    citation: "",
    authorBio: "",
    authorImage: "",
  };
  const fields = [
    "articleType",
    "journalShort",
    "bannerPath",
    "issn",
    "title",
    "affiliation",
    "correspondingAuthor",
    "doi",
    "abstract",
    "keywords",
    "pages",
    "volume",
    "issue",
    "year",
    "issuePeriod",
    "journalWebsite",
    "qrUrl",
    "citation",
    "bodyText",
    "referencesText",
    "authorBio",
    "authorImage",
  ];

  fields.forEach((name) => {
    let value = article[name] ?? defaults[name] ?? "";
    if (name === "pages" && typeof value === "string") {
      // Extract only the first number if it's a range like "01-03"
      const match = value.match(/\d+/);
      value = match ? match[0] : value;
    }
    setField(name, value);
  });

  // Dates
  setField("receivedDate", formatDateForInput(article.receivedDate));
  setField("acceptedDate", formatDateForInput(article.acceptedDate));
  setField("publishedDate", formatDateForInput(article.publishedDate));

  setAuthors(normalizeAuthorsFromArticle(article));

  // Only auto-fill corresponding author if not provided by extraction
  if (article.correspondingAuthor) {
    setField("correspondingAuthor", article.correspondingAuthor);
  } else {
    syncCorrespondingAuthor();
  }

  if (
    Array.isArray(article.references) &&
    article.references.length &&
    !article.referencesText
  ) {
    setField("referencesText", article.references.join("\n"));
  }
}

function collectArticle() {
  const data = new FormData(form);
  const article = {};
  for (const [key, value] of data.entries()) {
    article[key] = String(value).trim();
  }

  // Convert dates back to DD-MM-YYYY
  article.receivedDate = formatDateForLatex(article.receivedDate);
  article.acceptedDate = formatDateForLatex(article.acceptedDate);
  article.publishedDate = formatDateForLatex(article.publishedDate);

  const authors = getAuthors();
  article.authorsList = authors;
  article.authors = authorNamesLine(authors);

  article.orcid = authors[0] ? authors[0].orcid : "";
  article.authorOrcid = article.orcid;
  return article;
}

document.addEventListener("alpine:init", () => {
  Alpine.data("mathHelper", () => ({
    formula: "",
    insert(snippet) {
      this.formula += snippet;
      this.updatePreview();
    },
    setExample(ex) {
      this.formula = ex;
      this.updatePreview();
    },
    updatePreview() {
      this.$nextTick(() => {
        const el = this.$refs.mathPreview;
        if (!this.formula.trim()) {
          el.innerHTML =
            '<span style="color:var(--muted); font-size: 1rem;">Preview will appear here...</span>';
          return;
        }
        if (window.MathJax) {
          el.innerHTML = this.formula.includes("$")
            ? this.formula
            : "$$ " + this.formula + " $$";
          MathJax.typesetPromise([el]);
        } else {
          el.textContent = this.formula;
        }
      });
    },
    clearFormula() {
      this.formula = "";
      this.$refs.mathPreview.innerHTML =
        '<span style="color:var(--muted); font-size: 1rem;">Preview will appear here...</span>';
    },
    copyToBody() {
      const body = document.querySelector("textarea[name='bodyText']");
      const start = body.selectionStart;
      const end = body.selectionEnd;
      const finalMath = this.formula.trim();
      body.value =
        body.value.substring(0, start) +
        finalMath +
        body.value.substring(end);
      body.focus();
      body.dispatchEvent(new Event("input"));
      this.clearFormula();
    },
  }));

  Alpine.data("tableHelper", () => ({
    rows: 3,
    cols: 3,
    hasHeader: true,
    data: [],
    latex: "",
    init() {
      this.buildGrid();
    },
    buildGrid() {
      const newData = [];
      for (let r = 0; r < this.rows; r++) {
        const row = [];
        for (let c = 0; c < this.cols; c++) {
          row.push(this.data[r]?.[c] || "");
        }
        newData.push(row);
      }
      this.data = newData;
    },
    reset() {
      this.rows = 3;
      this.cols = 3;
      this.data = [];
      this.latex = "";
      this.buildGrid();
    },
    generate() {
      let res =
        "\\begin{center}\n\\begin{tabular}{" +
        "|l".repeat(this.cols) +
        "|}\n\\hline\n";
      this.data.forEach((row, r) => {
        const cells = row.map((cell, c) => {
          let val = cell.trim() || "~";
          return this.hasHeader && r === 0 ? `\\textbf{${val}}` : val;
        });
        res += cells.join(" & ") + " \\\\\n\\hline\n";
      });
      res += "\\end{tabular}\n\\end{center}";
      this.latex = res;
    },
    copyToBody() {
      const body = document.querySelector("textarea[name='bodyText']");
      body.value = body.value.trim() + "\n\n" + this.latex;
      body.dispatchEvent(new Event("input"));
      alert("Table code appended to Article Body!");
    },
  }));
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (payload.texUrl) {
      return payload;
    }
    throw new Error(
      payload.error || `Request failed with status ${response.status}`,
    );
  }
  return payload;
}

async function loadDataFiles() {
  const { files } = await requestJson("/api/data-files");
  dataFile.innerHTML = "";

  if (!files.length) {
    const option = document.createElement("option");
    option.textContent = "No DOCX files found";
    option.value = "";
    dataFile.appendChild(option);
    return;
  }

  files.forEach((file) => {
    const option = document.createElement("option");
    option.value = file;
    option.textContent = file;
    dataFile.appendChild(option);
  });
}

async function extractSelectedFile() {
  if (!dataFile.value) {
    setStatus("Choose a data file first.");
    return;
  }

  setBusy(true);
  setStatus("Extracting data file...");
  try {
    const payload = await requestJson("/api/extract-data-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: dataFile.value }),
    });
    fillForm(payload.article);
    setStatus(
      `Extracted ${dataFile.value}. Review and edit the fields before generating.`,
    );
  } catch (error) {
    setStatus("Could not extract the selected file.", error.message);
  } finally {
    setBusy(false);
  }
}

async function extractUploadedFile() {
  if (!uploadFile.files.length) {
    setStatus("Choose a DOCX or TXT file to upload.");
    return;
  }

  const body = new FormData();
  body.append("document", uploadFile.files[0]);

  setBusy(true);
  setStatus("Uploading and extracting file...");
  try {
    const payload = await requestJson("/api/upload-extract", {
      method: "POST",
      body,
    });
    fillForm(payload.article);
    setStatus(
      `Extracted ${uploadFile.files[0].name}. Review and edit the fields before generating.`,
    );
  } catch (error) {
    setStatus("Could not extract the uploaded file.", error.message);
  } finally {
    setBusy(false);
  }
}

async function uploadAuthorImage() {
  if (!authorImageUpload.files.length) {
    return;
  }

  const body = new FormData();
  body.append("authorImage", authorImageUpload.files[0]);

  setBusy(true);
  authorImageStatus.textContent = "Uploading author image...";
  try {
    const payload = await requestJson("/api/upload-author-image", {
      method: "POST",
      body,
    });
    setField("authorImage", payload.authorImage);
    authorImageStatus.textContent = `Using ${payload.originalName}.`;
  } catch (error) {
    setField("authorImage", "");
    authorImageUpload.value = "";
    authorImageStatus.textContent = `Image upload failed: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

async function generate(pdf) {
  setBusy(true);
  setDownloads({});
  setStatus(
    pdf ? "Generating LaTeX and compiling PDF..." : "Generating LaTeX...",
  );

  try {
    const payload = await requestJson("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article: collectArticle(), pdf }),
    });

    setDownloads(payload);
    if (payload.pdfUrl) {
      // Dispatch event to Alpine live preview
      window.dispatchEvent(new CustomEvent('update-preview', { 
        detail: { pdfUrl: payload.pdfUrl } 
      }));
    }
    if (payload.pdfError) {
      setStatus(
        "The .tex file was created, but PDF compilation failed.",
        payload.details || payload.error || "",
      );
      return;
    }

    const engine = payload.engine ? ` using ${payload.engine}` : "";
    setStatus(`Generated successfully${engine}.`);
  } catch (error) {
    setStatus("Generation failed.", error.message);
  } finally {
    setBusy(false);
  }
}

async function uploadBodyImage() {
  if (!bodyImageUpload.files.length) {
    return;
  }

  const body = new FormData();
  body.append("image", bodyImageUpload.files[0]);

  setBusy(true);
  bodyImageResult.textContent = "Uploading image...";
  try {
    const payload = await requestJson("/api/upload-image", {
      method: "POST",
      body,
    });
    const latexCode = `\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{${payload.imageUrl}}\n\\end{center}`;
    bodyImageResult.innerHTML = `Success! Copy this into the Article Body:<br/><code style="display:block;background:#eee;padding:5px;margin-top:5px;user-select:all;word-break:break-all;">${latexCode}</code>`;
  } catch (error) {
    bodyImageResult.textContent = `Upload failed: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

async function clearFolder(folder) {
  if (
    !confirm(
      `Are you sure you want to clear all files in the ${folder} folder?`,
    )
  ) {
    return;
  }

  setBusy(true);
  try {
    const payload = await requestJson("/api/clear-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    alert(payload.message);
    if (folder === "generated") {
      setDownloads({});
      setStatus("No file generated yet.");
    }
  } catch (error) {
    alert(`Failed to clear folder: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

document
  .querySelector("#extractDataFile")
  .addEventListener("click", extractSelectedFile);
document
  .querySelector("#extractUpload")
  .addEventListener("click", extractUploadedFile);
document
  .querySelector("#generatePdf")
  .addEventListener("click", () => generate(true));
document.querySelector("#addAuthor").addEventListener("click", () => {
  createAuthorRow();
  syncCorrespondingAuthor();
});
document
  .querySelector("#clearUploads")
  .addEventListener("click", () => clearFolder("uploads"));
document
  .querySelector("#clearGenerated")
  .addEventListener("click", () => clearFolder("generated"));
authorImageUpload.addEventListener("change", uploadAuthorImage);
bodyImageUpload.addEventListener("change", uploadBodyImage);

authorsList.addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-author")) {
    return;
  }

  event.target.closest(".author-row").remove();
  if (!authorsList.querySelector(".author-row")) {
    createAuthorRow();
  }
});

form.addEventListener("reset", () => {
  setDownloads({});
  setStatus("Form cleared.");
  authorImageStatus.textContent =
    "Uses the default author image until a new image is uploaded.";
  setTimeout(() => setAuthors([]), 0);
});

loadDataFiles().catch((error) => {
  setStatus("Could not load data files.", error.message);
});

setAuthors([]);
