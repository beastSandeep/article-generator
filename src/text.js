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
  if (!trimmed) {
    return false;
  }

  // Reject lines that look like LaTeX commands or table rows
  if (trimmed.includes('&') || trimmed.includes('\\\\') || trimmed.startsWith('\\')) {
    return false;
  }

  const knownEnglish =
    /^(?:\d+(?:\.\d+)*\.?\s*)?(introduction|literature review|review of literature|background|material and methods|materials and methods|methodology|research methodology|research design|data sources and triangulation|literature search strategy|data analysis|data management and manual analysis|outcome of the methodological process|researcher bias control|results?|discussion|conclusion|reflection|acknowledgements?|conflict of interest|limitations?|case studies?.*)\s*:?\s*$/i;
  const knownBengali =
    /^(ভূমিকা|পূর্ববর্তী গবেষণার পর্যালোচনা|আলোচনা|উপসংহার|তথ্যসূত্র)\s*:?\s*$/i;
  const numberedHeading = /^\d+(?:\.\d+)*\.?\s+.{3,120}$/;

  if (knownEnglish.test(trimmed) || knownBengali.test(trimmed)) {
    return true;
  }

  return numberedHeading.test(trimmed) && !/[.!?।]$/.test(trimmed);
}

function normalizeHeading(line) {
  return line.trim().replace(/\s*:$/, '');
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
    current.content.push(trimmed);
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
