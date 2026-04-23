const { parseSections, normalizeWhitespace } = require("./text");

/**
 * Advanced LaTeX renderer that preserves math and common LaTeX commands.
 */
function smartEscape(text, options = {}) {
  if (!text) return "";

  // 1. Split text by math delimiters ($...$, $$...$$, \(...\), \[...\])
  const mathParts = text.split(/(\$\$[\s\S]*?\$?\$|\$[\s\S]*?\$|\\\[[\s\S]*?\\\]|\\\(.*?\\\))/g);
  
  return mathParts.map((part, index) => {
    if (index % 2 === 1) return part; // Protected math block
    
    // 2. Protect LaTeX commands, line breaks, and optionally ampersands
    const tokens = ["\\\\[a-zA-Z*]+(?:\\[[^\\]]*\\])?(?:\\{[^{}]*\\})*", "\\\\\\\\"];
    if (options.preserveAmpersand) {
      tokens.push("&");
    }
    
    const commandRegex = new RegExp(`(${tokens.join("|")})`, "g");
    const segments = part.split(commandRegex);
    
    return segments.map((seg, segIndex) => {
      if (segIndex % 2 === 1) {
        return seg;
      }
      
      // 3. For actual plain text, escape standard LaTeX special characters
      return seg
        .replace(/\\/g, "\\textbackslash{}")
        .replace(/&/g, "\\&")
        .replace(/%/g, "\\%")
        .replace(/#/g, "\\#")
        .replace(/_/g, "\\_")
        .replace(/{/g, "\\{")
        .replace(/}/g, "\\}")
        .replace(/\^/g, "\\textasciicircum{}")
        .replace(/~/g, "\\textasciitilde{}");
    }).join("");
  }).join("");
}

function latexParagraphs(value) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return "";
  }
  
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs
    .map((paragraph) => {
      const trimmed = paragraph.trim();
      
      // Raw block detection (contains \begin{...} or is a block formula)
      const isRaw = trimmed.includes("\\begin{") || 
                    trimmed.startsWith("$$");
      
      if (isRaw) {
        return smartEscape(trimmed, { preserveAmpersand: true });
      }
      
      return smartEscape(trimmed);
    })
    .join("\n\n");
}

function makeSlug(value) {
  const slug = String(value || "article")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[-\s]+/g, "-")
    .toLowerCase();
  return slug || "article";
}

function currentYear() {
  return new Date().getFullYear();
}

function firstAuthorName(authors) {
  return String(authors || "")
    .replace(/\*/g, "")
    .split(/,|&| and /i)[0]
    .trim();
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

function normalizeAuthorsList(article) {
  const legacyOrcid = article.authorOrcid || article.orcid || "";

  if (Array.isArray(article.authorsList) && article.authorsList.length) {
    return article.authorsList
      .map((author, index) => ({
        name: String(author.name || "").trim(),
        orcid: String(
          author.orcid ||
            author.authorOrcid ||
            (index === 0 ? legacyOrcid : ""),
        ).trim(),
      }))
      .filter((author) => author.name || author.orcid);
  }

  const names = splitAuthorNames(
    article.authors || article.correspondingAuthor,
  );
  if (!names.length) {
    return [];
  }

  return names.map((name, index) => ({
    name,
    orcid: index === 0 ? legacyOrcid : "",
  }));
}

function joinAuthorNames(authorsList) {
  return authorsList
    .map((author) => author.name)
    .filter(Boolean)
    .join(", ");
}

function normalizeDoi(doi) {
  const clean = String(doi || "")
    .trim()
    .replace(/^https?:\/\/doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");

  if (!clean) {
    return { id: "", url: "" };
  }

  return {
    id: clean,
    url: `https://doi.org/${clean}`,
  };
}

function sanitizeUrl(url) {
  return String(url || "")
    .trim()
    .replace(/[{}\\]/g, "");
}

function latexAssetPath(value, fallback) {
  const raw = String(value || fallback || "")
    .trim()
    .replace(/\\/g, "/");

  if (!raw || raw.includes("..") || /[{}]/.test(raw)) {
    return fallback;
  }

  return raw.replace(/#/g, "\\#").replace(/%/g, "\\%");
}

function normalizeArticle(input) {
  const article = { ...(input || {}) };
  const authorsList = normalizeAuthorsList(article);
  const authorNames = joinAuthorNames(authorsList);
  const firstAuthor = authorsList.find((authorItem) => authorItem.name);
  const year = article.year || currentYear();
  const author =
    (firstAuthor && firstAuthor.name) ||
    firstAuthorName(article.authors) ||
    article.correspondingAuthor ||
    "Author";
  const pages = article.pages || "01-03";
  const volume = article.volume || "5";
  const issue = article.issue || "1";
  const issuePeriod = article.issuePeriod || "Jan-Feb";
  const normalizedAuthorsList = authorsList.length
    ? authorsList
    : [{ name: author, orcid: article.authorOrcid || article.orcid || "" }];
  const normalizedAuthorNames =
    joinAuthorNames(normalizedAuthorsList) || author;
  const authorOrcid =
    normalizedAuthorsList.find((authorItem) => authorItem.orcid)?.orcid ||
    article.authorOrcid ||
    article.orcid ||
    "";

  return {
    articleType: article.articleType || "Research Article",
    journalShort: article.journalShort || "Int. Jr. of Contemp. Res. in Multi.",
    bannerPath: article.bannerPath || "banner.png",
    peerReviewText: article.peerReviewText || "PEER-REVIEWED JOURNAL",
    issuePeriod,
    headerIssue:
      article.headerIssue ||
      `Volume ${volume} Issue ${issue} [ ${issuePeriod} ] Year ${year}`,
    journalWebsite: article.journalWebsite || "https://ijaicitjournal.com/",
    journalCitation:
      article.journalCitation || "Int J Contemp Res Multidiscip.",
    issn: article.issn || "2583-7397",
    title: article.title || "Untitled Article",
    authorsList: normalizedAuthorsList,
    authors: normalizedAuthorNames,
    affiliation: article.affiliation || "",
    correspondingAuthor: article.correspondingAuthor || normalizedAuthorNames,
    authorOrcid,
    orcid: authorOrcid,
    doi: article.doi || "",
    abstract: article.abstract || "",
    keywords: article.keywords || "",
    bodyText: article.bodyText || "",
    sections:
      Array.isArray(article.sections) && article.sections.length
        ? article.sections
        : parseSections(article.bodyText || ""),
    referencesText: article.referencesText || "",
    references:
      Array.isArray(article.references) && article.references.length
        ? article.references
        : splitReferences(article.referencesText || ""),
    receivedDate: article.receivedDate || "",
    acceptedDate: article.acceptedDate || "",
    publishedDate: article.publishedDate || "",
    volume,
    issue,
    year,
    pages,
    issueLine:
      article.issueLine || `IJCRM: ${volume}(${issue}); ${year}: ${pages}`,
    plagiarismChecked: article.plagiarismChecked || "Yes",
    peerReviewProcess: article.peerReviewProcess || "Yes",
    citation: article.citation || "",
    authorBio: article.authorBio || "",
    qrUrl: article.qrUrl || "",
    qrImage: article.qrImage || "qr.png",
    authorImage: article.authorImage || "image.png",
    licenseName:
      article.licenseName ||
      "Creative Commons Attribution 4.0 International License (CC BY 4.0)",
    licenseUrl:
      article.licenseUrl || "https://creativecommons.org/licenses/by/4.0/",
  };
}

function splitReferences(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  const numbered = normalized
    .split(/\n(?=\s*(?:\[\d+\]|\d+\.\s+))/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (numbered.length > 1) {
    return numbered;
  }

  const lineItems = normalized
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  return lineItems.length > 1 ? lineItems : numbered;
}

function renderHref(url, text) {
  const cleanUrl = sanitizeUrl(url);
  if (!cleanUrl) {
    return smartEscape(text || "");
  }
  return `\\href{${cleanUrl}}{${smartEscape(text || cleanUrl)}}`;
}

function renderMetadata(article) {
  const rows = [
    { label: "ISSN No:", value: article.issn },
    { label: "Received:", value: article.receivedDate || "" },
    { label: "Accepted:", value: article.acceptedDate || "" },
    { label: "Published:", value: article.publishedDate || "" },
    { value: article.issueLine },
    {
      raw: `\\textcopyright{}${article.year}, All Rights Reserved`,
    },
    { label: "Plagiarism Checked:", value: article.plagiarismChecked },
    { label: "Peer Review Process:", value: article.peerReviewProcess },
  ];

  return rows
    .filter((row) => row.raw || row.value !== "")
    .map((row) => {
      if (row.raw) {
        return `\\item ${row.raw}`;
      }
      if (!row.label) {
        return `\\item ${smartEscape(row.value)}`;
      }
      return `\\item \\textbf{${smartEscape(row.label)}} ${smartEscape(row.value)}`;
    })
    .join("\n");
}

function renderCitation(article) {
  if (article.citation) {
    return smartEscape(article.citation);
  }

  const author =
    firstAuthorName(article.authors) || article.correspondingAuthor || "Author";
  return smartEscape(
    `${author}. ${article.title}. ${article.journalCitation} ${article.year};${article.volume}(${article.issue}):${article.pages}.`,
  );
}

function renderSections(sections) {
  if (!sections.length) {
    return "";
  }

  return sections
    .map((section) => {
      const heading = section.heading
        ? `\\vspace{8pt}\n\\noindent\n\\textcolor{journalblue}{\\textbf{${smartEscape(section.heading.toUpperCase())}}}\n\n`
        : "";
      const body = `\\noindent\n${latexParagraphs(section.content)}`;
      return `${heading}${body}`;
    })
    .join("\n\n");
}

function stripReferenceNumber(reference) {
  return String(reference || "")
    .replace(/^\s*\[\d+\]\s*/, "")
    .replace(/^\s*\d+\.\s*/, "")
    .trim();
}

function renderReferences(references) {
  if (!references.length) {
    return "";
  }

  const items = references
    .map(
      (reference) =>
        `\\item ${latexParagraphs(stripReferenceNumber(reference))}`,
    )
    .join("\n\n");

  return `\\vspace{8pt}
\\noindent
\\textcolor{journalblue}{\\textbf{REFERENCES}}

\\begin{enumerate}[leftmargin=*, itemsep=-2pt, label=\\arabic*.]
${items}
\\end{enumerate}`;
}

function renderAuthorLink(author, options = {}) {
  const name = smartEscape(author.name || "");
  if (!name) {
    return "";
  }

  const url = sanitizeUrl(author.orcid || author.authorOrcid);
  let iconPrefix = "";
  if (url) {
    iconPrefix = `\\href{${url}}{\\includegraphics[height=8pt]{orcid.png}}~`;
  }

  const authorText = options.bold ? `\\textbf{${name}}` : name;
  return `${iconPrefix}${authorText}`;
}

function renderAuthorLinks(authorsList, options = {}) {
  return authorsList
    .map((author) => renderAuthorLink(author, options))
    .filter(Boolean)
    .join(", ");
}

function renderFontSetup(article) {
  return `\\usepackage{fontspec}
\\setmainfont{Times New Roman}
\\usepackage[varg]{newtxmath}`;
}

function renderLatex(input) {
  const article = normalizeArticle(input);
  const doi = normalizeDoi(article.doi);
  const authorLinks = renderAuthorLinks(article.authorsList, { bold: true });
  const correspondingAuthorLinks = renderAuthorLinks(article.authorsList);
  const qrImagePath = latexAssetPath(article.qrImage, "qr.png");
  const authorImagePath = latexAssetPath(article.authorImage, "image.png");
  const doiBlock = doi.id
    ? `\\textcolor{journalblue}{\\textbf{DOI:}}~${renderHref(doi.url, `doi:${doi.id}`)}`
    : "";
  
  const authorBio = article.authorBio
    ? latexParagraphs(article.authorBio)
    : `\\textbf{${smartEscape(article.correspondingAuthor)}} ${article.authorsList.length > 1 ? "are" : "is"} associated with ${smartEscape(article.affiliation || "the institution.")}`;

  // Use the banner from the article data
  const bannerImage = article.bannerPath;

  return String.raw`\documentclass[12pt,a4paper]{article}

\usepackage[top=0.8in, bottom=0.8in, left=1cm, right=1cm]{geometry}
${renderFontSetup(article)}
\usepackage{fancyhdr}
\usepackage{xcolor}
\usepackage{setspace}
\usepackage{enumitem}
\usepackage{graphicx}
\usepackage[none]{hyphenat}
\usepackage[most]{tcolorbox}
\usepackage{multicol}
\usepackage{amsmath}
\usepackage{booktabs, array, multirow}
\usepackage[colorlinks=true, linkcolor=linkblue, urlcolor=linkblue]{hyperref}

\setstretch{1.15}
\sloppy
\emergencystretch=2em

% ---------------- COLORS ----------------
\definecolor{linkblue}{RGB}{0,0,200}
\definecolor{lightgray}{RGB}{220,220,220}
\definecolor{journalblue}{RGB}{0,31,95}
\definecolor{journalred}{RGB}{255,0,0}

% ---------------- HEADER ----------------
\pagestyle{fancy}
\fancyhf{}

\setlength{\headheight}{23pt}
\setlength{\headsep}{10pt}

\fancyhead[L]{%
  \fontsize{9}{12}\selectfont
  \spaceskip=0.2em
  \textcolor{journalblue}{\textbf{\textit{${smartEscape(article.journalShort)}}}}%
}

\fancyhead[C]{%
  \fontsize{9}{12}\selectfont
  \spaceskip=0.2em
  \textcolor{journalred}{\textbf{\textit{${smartEscape(article.peerReviewText)}}}}%
}

\fancyhead[R]{%
  \fontsize{9}{12}\selectfont
  \spaceskip=0.2em
  \textcolor{journalblue}{\textbf{\textit{${smartEscape(article.headerIssue)}}}}%
}

\renewcommand{\headrulewidth}{0.8pt}
\renewcommand{\headrule}{\hbox to\headwidth{\color{journalblue}\leaders\hrule height \headrulewidth\hfill}}

% ---------------- FOOTER ----------------
\fancyfoot[C]{%
\begin{minipage}{\textwidth}
    \rule{\textwidth}{0.5pt}\\[3pt]
    \begin{minipage}{0.05\textwidth}
        \small \thepage
    \end{minipage}%
    \begin{minipage}{0.02\textwidth}
        \centering
        \raisebox{0.5\height}{\textcolor{journalblue}{\textbar}}
    \end{minipage}%
    \begin{minipage}{0.9\textwidth}
        \fontsize{7}{8}\selectfont
        \textcopyright{} ${article.year} ${smartEscape(article.correspondingAuthor)}. This is an open-access article distributed under the terms of the ${smartEscape(article.licenseName)}.
        ${renderHref(article.licenseUrl, article.licenseUrl)}
    \end{minipage}%
\end{minipage}%
}

\begin{document}

% ---------------- BANNER ----------------
\noindent
\includegraphics[width=\textwidth]{${bannerImage}}

\vspace{4pt}

% ---------------- ARTICLE TYPE STRIP ----------------
\noindent
\colorbox{lightgray}{%
    \parbox{\textwidth}{%
        \vspace{2pt}
        \fontsize{10}{10}\selectfont
        \textcolor{journalblue}{\textbf{\textit{${smartEscape(article.articleType)}}}}%
        \vspace{2pt}%
    }%
}

% ---------------- TITLE ----------------
\begin{center}
    \fontsize{18}{22}\bfseries\textbf{%
    ${smartEscape(article.title)}
    }%
\end{center}

% ---------------- AUTHOR BLOCK ----------------
\begin{center}
{\fontsize{11}{14}\selectfont 
${authorLinks}} \\[6pt]

{\fontsize{10}{12}\selectfont
${latexParagraphs(article.affiliation)}
}
\end{center}

% ---------------- CORRESPONDING + DOI ----------------
\noindent
\begin{minipage}[t]{0.6\textwidth}
    \fontsize{10}{12}\selectfont
    \textcolor{journalblue}{\textbf{Corresponding Author:}}
    ${smartEscape(article.correspondingAuthor)}
\end{minipage}
\hfill
\begin{minipage}[t]{0.40\textwidth}
    \fontsize{10}{12}\selectfont
    \raggedleft\hspace{0pt}
    ${doiBlock}
\end{minipage}

\vspace{6pt}

% ---------------- ABSTRACT + MANUSCRIPT INFORMATION ----------------
\noindent
\begin{tcolorbox}[
    colback=white,
    colframe=lightgray,
    boxrule=0.6pt,
    arc=0pt,
    left=0pt,
    right=0pt,
    top=0pt,
    bottom=0pt,
]

\begin{minipage}[t]{0.64\textwidth}

\fontsize{10}{12}\selectfont

\noindent
\colorbox{lightgray}{
\parbox{\dimexpr\linewidth-2\fboxsep}{
\vspace{2pt}
\textcolor{journalblue}{\textbf{Abstract}}
\vspace{2pt}
}}

\vspace{4pt}

${latexParagraphs(article.abstract)}

\end{minipage}
\hfill
{\color{lightgray}\vrule width 0.5pt}
\hfill
\begin{minipage}[t]{0.34\textwidth}

\fontsize{8}{10}\selectfont

\noindent
\colorbox{lightgray}{
\parbox{\dimexpr\linewidth-2\fboxsep}{
\vspace{2pt}
\centering \textcolor{journalblue}{\textbf{Manuscript Information}}
\vspace{2pt}
}}

\begin{itemize}[leftmargin=*, itemsep=-4pt]
${renderMetadata(article)}
\end{itemize}

\vspace{4pt}
{\color{lightgray}\hrule}
\vspace{4pt}

\noindent
\colorbox{lightgray}{
\parbox{\dimexpr\linewidth-2\fboxsep}{
\vspace{2pt}
\centering \textcolor{journalblue}{\textbf{How to Cite this Article}}
\vspace{2pt}
}}

\vspace{2pt}

${renderCitation(article)}

\vspace{4pt}
{\color{lightgray}\hrule}
\vspace{4pt}

\centering
\textcolor{journalblue}{\textbf{Access this Article Online}}

\vspace{4pt}

\includegraphics[width=0.4\linewidth]{${qrImagePath}}

\vspace{2pt}

{\fontsize{8}{9}\selectfont
\textcolor{journalblue}{${smartEscape(article.journalWebsite)}}
}

\end{minipage}

\end{tcolorbox}

% ---------------- KEYWORDS ----------------
\noindent
\begin{minipage}[t]{1\textwidth}
    \fontsize{10}{12}\selectfont
    \textcolor{journalblue}{\textbf{KEYWORDS:}} 
    ${smartEscape(article.keywords)}
\end{minipage}

\vspace{6pt}

\setlength{\columnsep}{20pt}
\begin{multicols}{2}
\fontsize{10}{12}\selectfont

${renderSections(article.sections)}

${renderReferences(article.references)}

% ---------------- AUTHOR + LICENSE BOX ----------------
\noindent
\begin{tcolorbox}[
    colback=white,
    colframe=black!60,
    boxrule=0.5pt,
    arc=0pt,
    left=2pt,
    right=2pt,
    top=2pt,
    bottom=2pt,
    boxsep=0pt,
]

\noindent
\colorbox{black!10}{
\parbox{\dimexpr\linewidth-2\fboxsep}{
\centering
\vspace{2pt}
\textbf{Creative Commons (CC) License}
\vspace{2pt}
}}

\fontsize{8}{10}\selectfont This article is an open-access article distributed under the terms and conditions of the ${smartEscape(article.licenseName)}. This license permits use, distribution, and reproduction according to the license terms, provided the original author and source are credited.

\vspace{2pt}
{\color{black!40}\hrule height 0.3pt}
\vspace{2pt}

\noindent
\colorbox{black!10}{
\parbox{\dimexpr\linewidth-2\fboxsep}{
\centering
\vspace{2pt}
\textbf{About the corresponding author}
\vspace{2pt}
}}

\noindent
\begin{minipage}[t]{0.20\textwidth}
\vspace{0pt}
\includegraphics[width=\linewidth]{${authorImagePath}}
\end{minipage}
\hspace{8pt}
\begin{minipage}[t]{0.75\textwidth}

\fontsize{8}{10}\selectfont ${authorBio}

\end{minipage}

\end{tcolorbox}

\end{multicols}

\end{document}
`;
}

module.exports = {
  normalizeArticle,
  renderLatex,
  makeSlug,
  smartEscape,
};
