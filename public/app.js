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

function setBusy(isBusy) {
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = isBusy;
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
  setField("correspondingAuthor", authorNamesLine(getAuthors()));
}

function createAuthorRow(author = {}) {
  const fragment = authorRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".author-row");
  row.querySelector("[data-author-name]").value = author.name || "";
  row.querySelector("[data-author-orcid]").value =
    author.orcid || author.authorOrcid || "";
  authorsList.appendChild(fragment);
  syncCorrespondingAuthor();
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
  syncCorrespondingAuthor();
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

function fillForm(article) {
  const defaults = {
    articleType: "Research Article",
    issn: "2583-7397",
    pages: "01-03",
    volume: "5",
    issue: "1",
    year: "2026",
    issuePeriod: "Jan-Feb",
    journalWebsite: "https://ijaicitjournal.com/",
    qrUrl: "",
    citation: "",
    authorBio: "",
    authorImage: "",
  };
  const fields = [
    "articleType",
    "issn",
    "title",
    "affiliation",
    "doi",
    "abstract",
    "keywords",
    "receivedDate",
    "acceptedDate",
    "publishedDate",
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

  fields.forEach((name) =>
    setField(name, article[name] ?? defaults[name] ?? ""),
  );
  setAuthors(normalizeAuthorsFromArticle(article));
  syncCorrespondingAuthor();

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
  const authors = getAuthors();
  const names = authorNamesLine(authors);
  article.authorsList = authors;
  article.authors = names;
  article.correspondingAuthor = names;
  article.orcid = authors[0] ? authors[0].orcid : "";
  article.authorOrcid = article.orcid;
  return article;
}

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

document
  .querySelector("#extractDataFile")
  .addEventListener("click", extractSelectedFile);
document
  .querySelector("#extractUpload")
  .addEventListener("click", extractUploadedFile);
document
  .querySelector("#generateTex")
  .addEventListener("click", () => generate(false));
document
  .querySelector("#generatePdf")
  .addEventListener("click", () => generate(true));
document
  .querySelector("#addAuthor")
  .addEventListener("click", () => createAuthorRow());
authorImageUpload.addEventListener("change", uploadAuthorImage);

authorsList.addEventListener("input", syncCorrespondingAuthor);
authorsList.addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-author")) {
    return;
  }

  event.target.closest(".author-row").remove();
  if (!authorsList.querySelector(".author-row")) {
    createAuthorRow();
  }
  syncCorrespondingAuthor();
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
