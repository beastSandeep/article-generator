function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isKnownHeading(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 150) {
    return false;
  }

  // 0. Force Normal Marker (New)
  if (trimmed.startsWith('--') && trimmed.endsWith('--')) {
    return false;
  }

  // 1. Explicit Bold markers (Very Robust)
  if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
    return true;
  }

  // 2. Reject lines that look like LaTeX commands, table rows, or math
  if (trimmed.includes('&') || trimmed.includes('\\\\') || trimmed.startsWith('\\') || trimmed.startsWith('$$')) {
    return false;
  }

  // 3. Known Keywords (English)
  const knownEnglish =
    /^(?:\d+(?:\.\d+)*\.?\s*)?(abstract|summary|introduction|literature review|review of literature|background|material and methods|materials and methods|methodology|research methodology|research design|data sources|data analysis|results?|discussion|conclusion|reflection|acknowledgements?|conflict of interest|limitations?|references?|bibliography|case studies?.*)\s*:?\s*$/i;

  if (knownEnglish.test(trimmed)) {
    return true;
  }

  // 4. Structural Heuristics:
  // - Starts with a number (e.g., 1.1)
  // - OR is ALL CAPS and relatively short
  // - AND doesn't end with typical sentence punctuation
  const isNumbered = /^\d+(?:\.\d+)*\.?\s+.+$/.test(trimmed);
  const isAllCaps = trimmed.length > 4 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  const endsWithPunctuation = /[.!?।]$/.test(trimmed);

  return (isNumbered || isAllCaps) && !endsWithPunctuation;
}

function normalizeHeading(line) {
  return line
    .trim()
    .replace(/^\*\*|\*\*$/g, '') // Remove Bold **
    .replace(/\s*:$/, ''); // Remove trailing colon
}

function parseSections(text) {
  const lines = normalizeWhitespace(text).split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) {
        current.content.push('');
      }
      continue;
    }

    if (isKnownHeading(trimmed)) {
      if (current) {
        sections.push({
          heading: current.heading,
          content: current.content.join('\n').trim()
        });
      }
      current = { heading: normalizeHeading(trimmed), content: [] };
      continue;
    }

    if (!current) {
      current = { heading: 'Introduction', content: [] };
    }

    // Strip force normal markers if present
    const contentLine = trimmed.startsWith('--') && trimmed.endsWith('--')
      ? trimmed.slice(2, -2).trim()
      : trimmed;

    current.content.push(contentLine);
  }

  if (current) {
    sections.push({
      heading: current.heading,
      content: current.content.join('\n').trim()
    });
  }

  return sections.filter((section) => section.heading || section.content);
}

module.exports = {
  normalizeWhitespace,
  isKnownHeading,
  parseSections
};
