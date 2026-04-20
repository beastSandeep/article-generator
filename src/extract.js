const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const mammoth = require('mammoth');
const { parseSections, normalizeWhitespace, isKnownHeading } = require('./text');

const ABSTRACT_RE = /^(abstract|summary)\s*:?\s*(.*)$/i;
const KEYWORDS_RE = /^(keywords?|key words|index terms?|key terms?)\s*:?\s*(.*)$/i;
const REFERENCES_RE = /^(references?|bibliography|works cited|literature cited)\s*:?\s*$/i;
const TITLE_RE = /^(title)\s*:?\s*(.*)$/i;
const AUTHORS_RE = /^(authors?|by)\s*:?\s*(.*)$/i;
const AFFILIATION_RE = /^(affiliations?|author affiliations?|institution|department)\s*:?\s*(.*)$/i;
const DOI_RE = /\b(?:doi\s*:?\s*|https?:\/\/doi\.org\/)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i;
const ORCID_RE = /https?:\/\/orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /\b(?:contact|phone|mobile|tel\.?|telephone)\b/i;
const NON_TITLE_RE = /^(research article|original article|review article|case study|short communication|article|paper id|manuscript id)\s*:?.*$/i;

function decodeEntities(html) {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function extractRichText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const uploadsDir = path.join(process.cwd(), 'uploads');
  
  if (ext === '.docx') {
    const options = {
      convertImage: mammoth.images.inline(async (element) => {
        const buffer = await element.read();
        const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 10);
        const imageExt = element.contentType.split('/')[1] || 'png';
        const fileName = `extracted-${Date.now()}-${hash}.${imageExt}`;
        const targetPath = path.join(uploadsDir, fileName);
        
        await fs.mkdir(uploadsDir, { recursive: true });
        await fs.writeFile(targetPath, buffer);
        
        // Return a marker that we can easily find and replace
        return {
          src: `___LATEX_IMAGE_MARKER___uploads/${fileName}___`
        };
      }),
      ignoreEmptyParagraphs: false
    };

    // Convert to HTML to preserve structure and position of images
    const { value: html } = await mammoth.convertToHtml({ path: filePath }, options);
    
    // 1. Skip tables as requested (the user will create them manually)
    let processedHtml = html.replace(/<table.*?>.*?<\/table>/gs, '\n[Table Skipped - Use Table Builder]\n');
    
    // 2. Decode entities
    processedHtml = decodeEntities(processedHtml);

    // 3. Clean up HTML while preserving our image markers and basic spacing
    let text = processedHtml
      .replace(/<p.*?>/g, '\n')
      .replace(/<\/p>/g, '\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<h[1-6].*?>(.*?)<\/h[1-6]>/g, '\n$1\n')
      // Convert our image markers into LaTeX commands
      .replace(/<img src="___LATEX_IMAGE_MARKER___(.*?)\___".*?>/g, '\n\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{$1}\n\\end{center}\n')
      // Strip remaining tags
      .replace(/<[^>]+>/g, (tag) => {
        // Keep our markers if they somehow survived as attributes
        return tag.includes('___LATEX_IMAGE_MARKER___') ? tag : '';
      })
      // Final strip for any stray tags
      .replace(/<[^>]+>/g, '');
      
    return text;
  }
  
  if (ext === '.txt') {
    return fs.readFile(filePath, 'utf8');
  }
  throw new Error(`Unsupported extraction format: ${ext}`);
}

function cleanLines(rawText) {
  return normalizeWhitespace(rawText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function findLine(lines, matcher, start = 0) {
  for (let index = start; index < lines.length; index += 1) {
    const match = lines[index].match(matcher);
    if (match) {
      return { index, match };
    }
  }
  return null;
}

function findNextHeading(lines, start, end = lines.length) {
  for (let index = start; index < end; index += 1) {
    if (isKnownHeading(lines[index])) {
      return { index, line: lines[index] };
    }
  }
  return null;
}

function isMostlyEnglish(rawText) {
  const letters = rawText.match(/\p{Letter}/gu) || [];
  if (letters.length < 80) {
    return true;
  }

  const latinLetters = rawText.match(/\p{Script=Latin}/gu) || [];
  return latinLetters.length / letters.length >= 0.7;
}

function createExtractionError(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isIgnorableMetadataLine(line) {
  return EMAIL_RE.test(line) || PHONE_RE.test(line) || DOI_RE.test(line) || ORCID_RE.test(line);
}

function cleanLabel(match, fallback = '') {
  return (match && match[2] ? match[2] : fallback).trim();
}

function findTitle(lines, sourceName, limit) {
  for (let index = 0; index < limit; index += 1) {
    const line = lines[index];
    const titleMatch = line.match(TITLE_RE);
    if (titleMatch && cleanLabel(titleMatch)) {
      return { title: cleanLabel(titleMatch), index };
    }

    if (
      line.length > 4 &&
      !NON_TITLE_RE.test(line) &&
      !ABSTRACT_RE.test(line) &&
      !KEYWORDS_RE.test(line) &&
      !REFERENCES_RE.test(line) &&
      !isIgnorableMetadataLine(line)
    ) {
      return { title: line, index };
    }
  }

  return {
    title: path.parse(sourceName).name || 'Untitled Article',
    index: -1
  };
}

function findDoi(lines) {
  const line = lines.find((item) => DOI_RE.test(item));
  const match = line ? line.match(DOI_RE) : null;
  return match ? match[1] : '';
}

function findOrcid(lines) {
  const line = lines.find((item) => ORCID_RE.test(item));
  const match = line ? line.match(ORCID_RE) : null;
  return match ? match[0] : '';
}

function findOrcids(lines) {
  const seen = new Set();
  const links = [];

  for (const line of lines) {
    const matches = line.match(new RegExp(ORCID_RE.source, 'gi')) || [];
    for (const match of matches) {
      if (!seen.has(match)) {
        seen.add(match);
        links.push(match);
      }
    }
  }

  return links;
}

function splitAuthorNames(value) {
  const text = String(value || '').trim();
  if (!text) {
    return [];
  }

  const lines = text
    .split('\n')
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

function extractAuthorBlock(lines, start, end) {
  const block = lines
    .slice(Math.max(0, start), Math.max(start, end))
    .filter((line) => line && !isIgnorableMetadataLine(line));

  const authorLabelIndex = block.findIndex((line) => AUTHORS_RE.test(line));
  if (authorLabelIndex >= 0) {
    const match = block[authorLabelIndex].match(AUTHORS_RE);
    const authors = cleanLabel(match);
    const affiliationLines = block
      .slice(authorLabelIndex + 1)
      .map((line) => {
        const affiliationMatch = line.match(AFFILIATION_RE);
        return affiliationMatch ? cleanLabel(affiliationMatch) : line;
      })
      .filter((line) => line && !AUTHORS_RE.test(line));

    return {
      authors: authors || affiliationLines.shift() || '',
      affiliation: affiliationLines.join('\n')
    };
  }

  const meaningfulLines = block
    .filter((line) => !NON_TITLE_RE.test(line))
    .map((line) => {
      const affiliationMatch = line.match(AFFILIATION_RE);
      return affiliationMatch ? cleanLabel(affiliationMatch) : line;
    });

  return {
    authors: meaningfulLines[0] || '',
    affiliation: meaningfulLines.slice(1).join('\n')
  };
}

function collectAbstract(lines, abstractLine, keywordLine, referencesLine) {
  if (!abstractLine) {
    return { abstract: '', endIndex: -1 };
  }

  const parts = [];
  if (abstractLine.match[2]) {
    parts.push(abstractLine.match[2]);
  }

  const heading = findNextHeading(
    lines,
    abstractLine.index + 1,
    keywordLine ? keywordLine.index : referencesLine ? referencesLine.index : lines.length
  );
  const endIndex = keywordLine
    ? keywordLine.index
    : heading
      ? heading.index
      : referencesLine
        ? referencesLine.index
        : lines.length;

  parts.push(...lines.slice(abstractLine.index + 1, endIndex));

  return {
    abstract: parts.join('\n').trim(),
    endIndex
  };
}

function looksLikeKeywordContinuation(line) {
  return line.length <= 260 && /[,;]| and /i.test(line) && !/[.!?]$/.test(line);
}

function collectKeywords(lines, keywordLine, referencesLine) {
  if (!keywordLine) {
    return { keywords: '', endIndex: -1 };
  }

  const parts = [];
  if (keywordLine.match[2]) {
    parts.push(keywordLine.match[2]);
  }

  const heading = findNextHeading(lines, keywordLine.index + 1, referencesLine ? referencesLine.index : lines.length);
  const hardEnd = heading ? heading.index : referencesLine ? referencesLine.index : lines.length;

  for (let index = keywordLine.index + 1; index < hardEnd; index += 1) {
    if (!parts.length || looksLikeKeywordContinuation(lines[index])) {
      parts.push(lines[index]);
      continue;
    }
    break;
  }

  const endIndex = heading ? heading.index : keywordLine.index + 1 + Math.max(0, parts.length - (keywordLine.match[2] ? 1 : 0));

  return {
    keywords: parts.join(' ').trim(),
    endIndex
  };
}

function splitReferences(text) {
  const normalized = text.trim();
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
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  return lineItems.length > 1 ? lineItems : numbered;
}

function parseArticleText(rawText, sourceName = '') {
  if (!isMostlyEnglish(rawText)) {
    throw createExtractionError('Auto extraction supports English documents only. Use the manual form for this file.');
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) {
    throw createExtractionError('No readable text was found in this document.');
  }

  const abstractLine = findLine(lines, ABSTRACT_RE, 0);
  const keywordLine = findLine(lines, KEYWORDS_RE, abstractLine ? abstractLine.index : 0);
  const referencesLine = findLine(lines, REFERENCES_RE, keywordLine ? keywordLine.index : abstractLine ? abstractLine.index : 0);
  const titleInfo = findTitle(lines, sourceName, abstractLine ? abstractLine.index : Math.min(lines.length, 12));

  const authorEnd = abstractLine
    ? abstractLine.index
    : keywordLine
      ? keywordLine.index
      : Math.min(lines.length, titleInfo.index + 5);
  const { authors, affiliation } = extractAuthorBlock(lines, titleInfo.index + 1, authorEnd);
  const abstractBlock = collectAbstract(lines, abstractLine, keywordLine, referencesLine);
  const keywordBlock = collectKeywords(lines, keywordLine, referencesLine);

  const bodySearchStart = keywordBlock.endIndex > -1
    ? keywordBlock.endIndex
    : abstractBlock.endIndex > -1
      ? abstractBlock.endIndex
      : titleInfo.index + 1;
  const firstBodyHeading = findNextHeading(
    lines,
    Math.max(0, bodySearchStart),
    referencesLine ? referencesLine.index : lines.length
  );
  const bodyStart = firstBodyHeading
    ? firstBodyHeading.index
    : keywordBlock.endIndex > -1
      ? keywordBlock.endIndex
      : abstractBlock.endIndex > -1
        ? abstractBlock.endIndex
        : authorEnd;
  const bodyEnd = referencesLine ? referencesLine.index : lines.length;
  
  const bodyLines = bodyStart >= 0 ? lines.slice(bodyStart, bodyEnd) : [];
  const bodyText = bodyLines.join('\n').trim();

  const referencesText = referencesLine
    ? lines.slice(referencesLine.index + 1).join('\n').trim()
    : '';

  const orcids = findOrcids(lines);
  const authorsList = splitAuthorNames(authors).map((name, index) => ({
    name,
    orcid: orcids[index] || ''
  }));
  const correspondingAuthor = authorsList.length
    ? authorsList.map((author) => author.name).join(', ')
    : authors;

  return {
    sourceName,
    articleType: 'Research Article',
    title: titleInfo.title,
    authors,
    authorsList,
    affiliation,
    correspondingAuthor,
    orcid: orcids[0] || findOrcid(lines),
    doi: findDoi(lines),
    abstract: abstractBlock.abstract,
    keywords: keywordBlock.keywords,
    bodyText,
    referencesText,
    sections: parseSections(bodyText),
    references: splitReferences(referencesText),
    authorBio: '',
    receivedDate: '',
    acceptedDate: '',
    publishedDate: '',
    pages: '01-03'
  };
}

async function extractArticleFromFile(filePath, sourceName = '') {
  const rawText = await extractRichText(filePath);
  return parseArticleText(rawText, sourceName);
}

module.exports = {
  extractArticleFromFile,
  parseArticleText
};
