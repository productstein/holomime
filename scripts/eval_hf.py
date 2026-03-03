#!/usr/bin/env python3
"""
holomime HuggingFace eval — runs inference on base and fine-tuned models.

Spawned from Node CLI. Reads test prompts from a JSON file,
runs both models, and emits JSON results to stdout.

Usage:
  python scripts/eval_hf.py \
    --prompts prompts.json \
    --base-model meta-llama/Llama-3.2-1B \
    --ft-model ./holomime-ft-counselor \
    --max-tokens 300
"""

import argparse
import json
import sys


def emit(stage: str, message: str, percent: int | None = None):
    """Emit a JSON progress event to stdout."""
    event = {"stage": stage, "message": message}
    if percent is not None:
        event["percent"] = percent
    print(json.dumps(event), flush=True)


def run_inference(model, tokenizer, prompt: str, max_tokens: int, device: str) -> str:
    """Generate a response from a model given a prompt."""
    import torch

    messages = [
        {"role": "system", "content": "You are an AI assistant. Respond naturally to the conversation."},
        {"role": "user", "content": prompt},
    ]

    # Use chat template if available, otherwise basic formatting
    if hasattr(tokenizer, "apply_chat_template") and tokenizer.chat_template:
        input_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    else:
        input_text = f"System: You are an AI assistant. Respond naturally to the conversation.\nUser: {prompt}\nAssistant:"

    inputs = tokenizer(input_text, return_tensors="pt", truncation=True, max_length=1024)
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
            pad_token_id=tokenizer.pad_token_id,
        )

    # Decode only the generated tokens (not the input)
    generated = outputs[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(generated, skip_special_tokens=True).strip()


def main():
    parser = argparse.ArgumentParser(description="HuggingFace model eval for holomime")
    parser.add_argument("--prompts", required=True, help="Path to JSON file with test prompts (string array)")
    parser.add_argument("--base-model", required=True, help="Base model ID (HF Hub or local path)")
    parser.add_argument("--ft-model", required=True, help="Fine-tuned model path (local or HF Hub)")
    parser.add_argument("--max-tokens", type=int, default=300, help="Max tokens per response")
    args = parser.parse_args()

    # Check dependencies
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import PeftModel
    except ImportError as e:
        emit("failed", f"Missing dependency: {e}. Install with: pip install -r scripts/requirements-train.txt")
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    emit("evaluating", f"Device: {device}")

    # Load prompts
    with open(args.prompts, "r") as f:
        prompts = json.load(f)

    if not prompts:
        emit("failed", "No test prompts provided")
        sys.exit(1)

    emit("evaluating", f"Loaded {len(prompts)} test prompts")

    # Load base model + tokenizer
    emit("evaluating", f"Loading base model: {args.base_model}...")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    base_model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=torch.float16 if device != "cpu" else torch.float32,
        device_map="auto" if device != "cpu" else None,
        trust_remote_code=True,
    )
    base_model.eval()

    # Run base model inference
    emit("evaluating", "Running base model inference...")
    before = []
    for i, prompt in enumerate(prompts):
        response = run_inference(base_model, tokenizer, prompt, args.max_tokens, device)
        before.append({"role": "user", "content": prompt})
        before.append({"role": "assistant", "content": response})
        pct = int(((i + 1) / (len(prompts) * 2)) * 100)
        emit("evaluating", f"Base model: {i + 1}/{len(prompts)} prompts", pct)

    # Load fine-tuned model (LoRA adapter on top of base)
    emit("evaluating", f"Loading fine-tuned model: {args.ft_model}...")
    try:
        ft_model = PeftModel.from_pretrained(base_model, args.ft_model)
        ft_model.eval()
    except Exception:
        # If not a LoRA adapter, try loading as a full model
        ft_model = AutoModelForCausalLM.from_pretrained(
            args.ft_model,
            torch_dtype=torch.float16 if device != "cpu" else torch.float32,
            device_map="auto" if device != "cpu" else None,
            trust_remote_code=True,
        )
        ft_model.eval()

    # Run fine-tuned model inference
    emit("evaluating", "Running fine-tuned model inference...")
    after = []
    for i, prompt in enumerate(prompts):
        response = run_inference(ft_model, tokenizer, prompt, args.max_tokens, device)
        after.append({"role": "user", "content": prompt})
        after.append({"role": "assistant", "content": response})
        pct = int(((len(prompts) + i + 1) / (len(prompts) * 2)) * 100)
        emit("evaluating", f"Fine-tuned model: {i + 1}/{len(prompts)} prompts", pct)

    # Emit results
    result = {
        "stage": "complete",
        "message": f"Eval complete: {len(prompts)} prompts compared",
        "percent": 100,
        "result": {
            "before": before,
            "after": after,
        },
    }
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
