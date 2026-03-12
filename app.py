from flask import Flask, render_template, request, jsonify
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch
from utils import extract_text_from_pdf, clean_text
import re

app = Flask(__name__)


MODEL_NAME = "valhalla/t5-small-qg-hl"

# Load tokenizer + model
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=False)


model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)
model.eval()


STOPWORDS = {
    "the","and","is","in","to","of","a","an","for","on","with","that","this","it",
    "as","are","was","were","by","be","or","from","at","which","has","have","had",
    "but","not","they","their","its","he","she","you","we","i","his","her","will",
    "can","may","also","these","those","such"
}

def extract_candidate_keywords(text, max_candidates=5):

    s = re.sub(r"[^\w\s]", " ", text.lower())
    words = s.split()
    freq = {}
    for w in words:
        if len(w) <= 3:
            continue
        if w.isdigit():
            continue
        if w in STOPWORDS:
            continue
        freq[w] = freq.get(w, 0) + 1
    candidates = sorted(freq.items(), key=lambda x: (-x[1], -len(x[0])))
    return [c[0] for c in candidates[:max_candidates]]

def highlight_first_occurrence(context, keyword):
   
    pattern = re.compile(re.escape(keyword), flags=re.IGNORECASE)
    def repl(m):
        return "<hl> " + m.group(0) + " <hl>"
    new_context, n = pattern.subn(repl, context, count=1)
    return new_context if n > 0 else None

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/generate", methods=["POST"])
def generate():
    text_input = request.form.get("text_input", "") or ""
    try:
        num_q = max(1, int(request.form.get("num_questions", 3)))
    except:
        num_q = 3

    pdf_file = request.files.get("pdf_file")
    if pdf_file:
        try:
            pdf_text = extract_text_from_pdf(pdf_file)
            text_input = (text_input + " " + pdf_text).strip()
        except Exception as e:
            return jsonify({"error": f"Failed to extract PDF: {e}"}), 400

    text_input = clean_text(text_input)
    if not text_input:
        return jsonify({"error": "Please provide text or upload PDF."}), 400

    if "<hl>" in text_input.lower():
        
        prompts = [f"generate question: {text_input}"]
    else:
        
        candidates = extract_candidate_keywords(text_input, max_candidates=max(8, num_q * 2))
        prompts = []
        used = 0
        for cand in candidates:
            highlighted = highlight_first_occurrence(text_input, cand)
            if highlighted:
                prompts.append(f"generate question: {highlighted}")
                used += 1
            if used >= num_q:
                break
        if not prompts:
            prompts = [f"generate question: {text_input}"]

    questions = []
    
    for p in prompts:
        inputs = tokenizer(p, return_tensors="pt", truncation=True, max_length=512)
        input_ids = inputs["input_ids"].to(device)
        attention_mask = inputs.get("attention_mask")
        if attention_mask is not None:
            attention_mask = attention_mask.to(device)

        with torch.no_grad():
            out = model.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                max_length=80,
                num_return_sequences=1,
                do_sample=True,
                top_p=0.9,
                top_k=50,
                temperature=0.8,
                no_repeat_ngram_size=3,
                early_stopping=True,
                pad_token_id=tokenizer.pad_token_id if tokenizer.pad_token_id is not None else 0,
                eos_token_id=tokenizer.eos_token_id if tokenizer.eos_token_id is not None else None,
            )
        raw = tokenizer.decode(out[0], skip_special_tokens=True, clean_up_tokenization_spaces=True).strip()

        raw = raw.replace("<hl>", "").strip()
        parts = [pp.strip() for pp in re.split(r'[\r\n]+', raw) if pp.strip()]
        for part in parts: # drop leading numbering like "1. " or "1) "
            part = re.sub(r'^[\d\.\)\-\s]+', '', part).strip()
            if part and part not in questions:
                questions.append(part)
        if len(questions) >= num_q:
            break

    questions = questions[:num_q]
    if not questions:
        return jsonify({"error": "No questions generated. Try highlighting answers manually using <hl>answer<hl> in the input or increase num_questions."}), 500

    return jsonify({"questions": questions})

if __name__ == "__main__":
    app.run(debug=True)