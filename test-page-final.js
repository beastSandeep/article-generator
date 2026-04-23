const { renderLatex } = require('./src/latex');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const execFileAsync = util.promisify(execFile);

async function runTest() {
    const article = {
        title: "Page Number Test",
        authors: "Test Author",
        pages: "40", 
        bodyText: "This is a test of page numbering."
    };

    const tex = renderLatex(article);
    const texPath = path.join(__dirname, 'generated', 'final-test-page.tex');
    
    if (!fs.existsSync(path.join(__dirname, 'generated'))) {
        fs.mkdirSync(path.join(__dirname, 'generated'));
    }
    
    fs.writeFileSync(texPath, tex);
    console.log("TEX file generated with Start Page: 40");

    try {
        console.log("Compiling PDF...");
        await execFileAsync('xelatex', [
            '-interaction=nonstopmode',
            '-output-directory', path.join(__dirname, 'generated'),
            texPath
        ]);
        console.log("PDF Compiled: generated/final-test-page.pdf");
        
        const pdfPath = path.join(__dirname, 'generated', 'final-test-page.pdf');
        const pdfBuffer = fs.readFileSync(pdfPath);
        
        // Check for '40' in the footer area
        if (pdfBuffer.includes(Buffer.from('40'))) {
             console.log("✅ PDF binary contains '40'");
        } else {
             console.log("❌ PDF binary does NOT contain '40'");
        }

        // To be sure, we also check if it contains '1'
        if (pdfBuffer.includes(Buffer.from(' 1 '))) {
             console.log("⚠️ PDF binary contains ' 1 ' (Possible failure)");
        }

    } catch (err) {
        console.error("Compilation failed:", err.message);
    }
}

runTest();
