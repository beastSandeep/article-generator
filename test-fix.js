const { extractArticleFromFile } = require("./src/extract");
const { renderLatex, normalizeArticle } = require("./src/latex");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const util = require("node:util");

const execFileAsync = util.promisify(execFile);

async function test() {
  const filePath = path.join(__dirname, "data", "5-2-187.docx");
  console.log(`Testing with file: ${filePath}`);
  
  try {
    const article = await extractArticleFromFile(filePath, "5-2-187.docx");
    console.log("Extraction successful.");
    console.log("Title:", article.title);
    
    const normalized = normalizeArticle(article);
    const tex = renderLatex(normalized);
    
    const texPath = path.join(__dirname, "generated", "test-5-2-187.tex");
    await fs.mkdir(path.join(__dirname, "generated"), { recursive: true });
    await fs.writeFile(texPath, tex, "utf8");
    console.log(`LaTeX written to: ${texPath}`);
    
    console.log("Attempting to compile PDF...");
    const engine = "xelatex";
    const args = [
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-output-directory",
      path.join(__dirname, "generated"),
      texPath,
    ];
    
    await execFileAsync(engine, args, { timeout: 120000 });
    console.log("PDF compiled successfully!");
    
  } catch (error) {
    console.error("Test failed:");
    console.error(error.message);
    if (error.stdout) console.error("Stdout:", error.stdout);
    if (error.stderr) console.error("Stderr:", error.stderr);
    process.exit(1);
  }
}

test();
