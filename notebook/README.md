# Custom Quantized LLM Notebook Assets

This folder contains everything needed to bootstrap a custom OmniBrowser planner model using Google Colab:

- `custom_quantized_llm_colab.ipynb` — QLoRA fine-tune + MLC quantization workflow.
- `data/omnibrowser_planner_train.jsonl` — starter training dataset (500 rows, JSONL chat format).
- `scripts/generate_dataset.mjs` — generates chain-based training data that matches `src/core/prompt.ts`.
- `scripts/validate_dataset.mjs` — validates assistant JSON shape + selector correctness.

## Generate dataset

```bash
node notebook/scripts/generate_dataset.mjs 300 notebook/data/omnibrowser_planner_train.jsonl
```

With explicit seed:

```bash
node notebook/scripts/generate_dataset.mjs 500 notebook/data/omnibrowser_planner_train.jsonl 1337
```

## Validate dataset

```bash
node notebook/scripts/validate_dataset.mjs notebook/data/omnibrowser_planner_train.jsonl
```

## Colab usage

1. Upload `notebook/data/omnibrowser_planner_train.jsonl` to Colab.
2. Open and run `notebook/custom_quantized_llm_colab.ipynb`.
3. Set your Hugging Face repo names inside the notebook cells.
4. Train, merge, quantize (`q4f16_1`), and upload.

## Notes

- The dataset is intentionally a starter baseline; expand to 200-500+ high-quality real traces before final training.
- Rows are generated as linked 3-5 step chains with accumulated history/memory and 6-15 distractor candidates per step.
- Keep selector strings exact. Any mismatch between candidates and `action.selector` will degrade planner reliability.
