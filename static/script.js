// script.js - handles UI interactions, generate request, highlight helper, and PDF export.

(function () {
  const textInput = document.getElementById("text_input");
  const pdfInput = document.getElementById("pdf_file");
  const numInput = document.getElementById("num_questions");
  const diffInput = document.getElementById("difficulty");
  const generateBtn = document.getElementById("generate_btn");
  const hlBtn = document.getElementById("hl_btn");
  const exportBtn = document.getElementById("export_pdf");
  const loader = document.getElementById("loader");
  const quizOutput = document.getElementById("quiz-output");
  const questionsList = document.getElementById("questions");
  const status = document.getElementById("status");
  const errorBox = document.getElementById("error");
  const notes = document.getElementById("notes");
  const helpToggle = document.getElementById("help_toggle");
  const resultMeta = document.getElementById("result-meta");

  function showStatus(msg) {
    status.hidden = false;
    status.textContent = msg;
  }
  function hideStatus() {
    status.hidden = true;
    status.textContent = "";
  }

  function showLoader() {
    loader.hidden = false;
    quizOutput.hidden = true;
    errorBox.hidden = true;
    resultMeta.textContent = "";
  }
  function hideLoader() {
    loader.hidden = true;
  }

  function showError(msg) {
    errorBox.hidden = false;
    errorBox.textContent = msg;
  }

  function clearResults() {
    questionsList.innerHTML = "";
    quizOutput.hidden = true;
    errorBox.hidden = true;
    resultMeta.textContent = "";
  }

  function renderQuestions(questions) {
    questionsList.innerHTML = "";
    questions.forEach(q => {
      const li = document.createElement("li");
      li.textContent = q;
      questionsList.appendChild(li);
    });
    quizOutput.hidden = false;
    resultMeta.textContent = `(${questions.length} generated)`;
  }

  // Wrap current selection with <hl> ... <hl>
  function wrapSelectionWithHL() {
    const ta = textInput;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) {
      showStatus("Select some text first to highlight as the answer.");
      setTimeout(hideStatus, 2500);
      return;
    }
    const before = ta.value.slice(0, start);
    const sel = ta.value.slice(start, end);
    const after = ta.value.slice(end);
    ta.value = before + "<hl>" + sel + "<hl>" + after;
    // restore caret
    const newStart = start + 4;
    ta.setSelectionRange(newStart, newStart + sel.length);
    ta.focus();
  }

  // Convert form data to FormData and POST to /generate
  async function generateQuestions() {
    clearResults();
    hideStatus();
    const text = textInput.value.trim();
    const num = Math.max(1, Math.min(20, parseInt(numInput.value || "3", 10)));
    const diff = diffInput.value || "medium";

    if (!text && !pdfInput.files.length) {
      showStatus("Please paste text or upload a PDF before generating.");
      setTimeout(hideStatus, 3000);
      return;
    }

    const form = new FormData();
    form.append("text_input", text);
    form.append("num_questions", String(num));
    form.append("difficulty", diff);
    if (pdfInput.files.length) form.append("pdf_file", pdfInput.files[0]);

    showLoader();

    try {
      const res = await fetch("/generate", { method: "POST", body: form });
      const data = await res.json();
      hideLoader();

      if (!res.ok) {
        showError(data.error || "Server error while generating questions.");
        return;
      }

      if (data.questions && data.questions.length) {
        renderQuestions(data.questions);
      } else {
        showError(data.error || "No questions generated.");
      }
    } catch (err) {
      hideLoader();
      showError("Network or server error: " + String(err));
      console.error(err);
    }
  }

  // Export current questions to a PDF using html2pdf
  function exportToPDF() {
    if (!questionsList.children.length) {
      showStatus("No questions to export.");
      setTimeout(hideStatus, 2000);
      return;
    }
    const el = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "Generated Questions";
    el.appendChild(title);
    const ol = document.createElement("ol");
    Array.from(questionsList.children).forEach(li => {
      const item = document.createElement("li");
      item.textContent = li.textContent;
      ol.appendChild(item);
    });
    el.appendChild(ol);

    const opt = {
      filename: 'edugen-questions.pdf',
      margin: 10,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    if (typeof window.html2pdf !== 'undefined') {
      window.html2pdf().set(opt).from(el).save();
    } else {
      showError("PDF export library not loaded.");
    }
  }

  // Event listeners
  generateBtn.addEventListener("click", generateQuestions);
  hlBtn.addEventListener("click", wrapSelectionWithHL);
  exportBtn.addEventListener("click", exportToPDF);
  helpToggle.addEventListener("click", () => {
    notes.hidden = !notes.hidden;
  });

  // Allow pressing Ctrl+Enter to generate
  textInput.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") {
      generateQuestions();
    }
  });
})();