const { normalizeArticle, renderLatex } = require("./src/latex");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const util = require("node:util");

const execFileAsync = util.promisify(execFile);

async function testTable() {
  // Simulate the output of the Table Builder utility
  const tableLatex = `\\begin{center}
\\begin{tabular}{|l|l|l|}
\\hline
\\textbf{Header 1} & \\textbf{Header 2} & \\textbf{Header 3} \\\\
\\hline
Row 1 Col 1 & Row 1 Col 2 & Row 1 Col 3 \\\\
\\hline
Row 2 Col 1 & Row 2 Col 2 & Row 2 Col 3 \\\\
\\hline
\\end{tabular}
\\end{center}`;

  console.log("Simulating Table LaTeX insertion...");
  
  const articleData = {
    title: "Table Test Article",
    authors: "Test Author",
    affiliation: "Test University",
    abstract: "This is a test of the table utility.",
    bodyText: "First paragraph.\n\n" + tableLatex + "\n\nLast paragraph.",
    referencesText: "1. Reference 1"
  };

  try {
    const normalized = normalizeArticle(articleData);
    const tex = renderLatex(normalized);
    
    // Check if the table survived without being escaped
    if (tex.includes("\\textbackslash{}begin{center}")) {
      console.error("FAIL: Table was incorrectly escaped!");
    } else if (tex.includes("\\begin{center}") && tex.includes("&")) {
      console.log("SUCCESS: Table preserved as raw LaTeX.");
    } else {
      console.log("FAIL: Table code not found in output.");
    }

    const texPath = path.join(__dirname, "generated", "test-table.tex");
    await fs.mkdir(path.join(__dirname, "generated"), { recursive: true });
    await fs.writeFile(texPath, tex, "utf8");
    
    console.log("Compiling PDF...");
    await execFileAsync("xelatex", [
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-output-directory",
      path.join(__dirname, "generated"),
      texPath,
    ]);
    console.log("PDF compiled successfully with table!");

  } catch (error) {
    console.error("Test failed:");
    console.error(error.message);
    if (error.stdout) console.log("Log tail:", error.stdout.slice(-1000));
  }
}

testTable();
