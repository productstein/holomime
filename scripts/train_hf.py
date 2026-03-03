#!/usr/bin/env python3
"""
holomime HuggingFace TRL trainer — subprocess spawned from Node CLI.

Emits JSON progress events to stdout (one per line).
All other output goes to stderr so the TypeScript provider can cleanly parse progress.

Usage:
  python scripts/train_hf.py \
    --data training_data.jsonl \
    --base-model meta-llama/Llama-3.2-1B \
    --output-dir ./holomime-ft-counselor \
    --method sft \
    --epochs 3

Optional:
  --push          Push to HuggingFace Hub after training
  --hub-repo      Hub repo name (e.g. user/holomime-counselor-dpo)
"""

import argparse
import json
import sys
import os
from pathlib import Path


def emit(stage: str, message: str, percent: int | None = None):
    """Emit a JSON progress event to stdout."""
    event = {"stage": stage, "message": message}
    if percent is not None:
        event["percent"] = percent
    print(json.dumps(event), flush=True)


def load_dataset_from_file(data_path: str, method: str):
    """Load training data from holomime export format."""
    from datasets import Dataset

    with open(data_path, "r") as f:
        # Try JSON array first, fall back to JSONL
        content = f.read().strip()
        if content.startswith("{"):
            # holomime export JSON wrapper
            wrapper = json.loads(content)
            examples = wrapper.get("examples", [])
        elif content.startswith("["):
            examples = json.loads(content)
        else:
            # JSONL
            examples = [json.loads(line) for line in content.split("\n") if line.strip()]

    if method == "dpo":
        # DPO format: prompt, chosen, rejected
        records = []
        for ex in examples:
            records.append({
                "prompt": ex.get("prompt", ""),
                "chosen": ex.get("chosen", ""),
                "rejected": ex.get("rejected", ""),
            })
        return Dataset.from_list(records)
    else:
        # SFT format: instruction/input/output → text
        records = []
        for ex in examples:
            instruction = ex.get("instruction", "")
            inp = ex.get("input", "")
            output = ex.get("output", "")
            if inp:
                text = f"### Instruction:\n{instruction}\n\n### Input:\n{inp}\n\n### Response:\n{output}"
            else:
                text = f"### Instruction:\n{instruction}\n\n### Response:\n{output}"
            records.append({"text": text})
        return Dataset.from_list(records)


def main():
    parser = argparse.ArgumentParser(description="HuggingFace TRL trainer for holomime")
    parser.add_argument("--data", required=True, help="Path to training data file")
    parser.add_argument("--base-model", required=True, help="Base model ID (HF Hub)")
    parser.add_argument("--output-dir", required=True, help="Output directory for trained model")
    parser.add_argument("--method", choices=["sft", "dpo"], default="sft", help="Training method")
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs")
    parser.add_argument("--push", action="store_true", help="Push to HuggingFace Hub")
    parser.add_argument("--hub-repo", default="", help="Hub repo name for push")
    args = parser.parse_args()

    # Step 1: Check dependencies
    emit("converting", "Checking Python dependencies...")
    try:
        import torch
        import transformers
        import trl
        import peft
        emit("converting", f"PyTorch {torch.__version__}, Transformers {transformers.__version__}, TRL {trl.__version__}")
    except ImportError as e:
        emit("failed", f"Missing dependency: {e}. Install with: pip install -r scripts/requirements-train.txt")
        sys.exit(1)

    # Check GPU
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    emit("converting", f"Device: {device}" + (" (GPU detected)" if device != "cpu" else " (CPU only — training will be slow)"))

    # Step 2: Load dataset
    emit("converting", f"Loading training data from {args.data}...")
    try:
        dataset = load_dataset_from_file(args.data, args.method)
        emit("converting", f"Loaded {len(dataset)} examples for {args.method.upper()} training")
    except Exception as e:
        emit("failed", f"Failed to load data: {e}")
        sys.exit(1)

    # Step 3: Load model + tokenizer with LoRA
    emit("uploading", f"Loading base model: {args.base_model}...")
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import LoraConfig, get_peft_model, TaskType

        tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(
            args.base_model,
            torch_dtype=torch.float16 if device != "cpu" else torch.float32,
            device_map="auto" if device != "cpu" else None,
            trust_remote_code=True,
        )

        # Apply LoRA for memory efficiency
        lora_config = LoraConfig(
            task_type=TaskType.CAUSAL_LM,
            r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
        )

        emit("uploading", "Applying LoRA adapter (r=16, alpha=32)...")

    except Exception as e:
        emit("failed", f"Failed to load model: {e}")
        sys.exit(1)

    # Step 4: Train
    emit("training", f"Starting {args.method.upper()} training ({args.epochs} epochs)...")

    try:
        from transformers import TrainingArguments

        output_dir = args.output_dir
        os.makedirs(output_dir, exist_ok=True)

        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=args.epochs,
            per_device_train_batch_size=4,
            gradient_accumulation_steps=4,
            learning_rate=2e-4,
            warmup_ratio=0.03,
            logging_steps=1,
            save_strategy="epoch",
            fp16=(device == "cuda"),
            report_to="none",
            remove_unused_columns=False,
        )

        if args.method == "dpo":
            from trl import DPOTrainer, DPOConfig

            dpo_config = DPOConfig(
                output_dir=output_dir,
                num_train_epochs=args.epochs,
                per_device_train_batch_size=4,
                gradient_accumulation_steps=4,
                learning_rate=2e-4,
                warmup_ratio=0.03,
                logging_steps=1,
                save_strategy="epoch",
                fp16=(device == "cuda"),
                report_to="none",
                remove_unused_columns=False,
            )

            trainer = DPOTrainer(
                model=model,
                args=dpo_config,
                train_dataset=dataset,
                processing_class=tokenizer,
                peft_config=lora_config,
            )
        else:
            from trl import SFTTrainer, SFTConfig

            sft_config = SFTConfig(
                output_dir=output_dir,
                num_train_epochs=args.epochs,
                per_device_train_batch_size=4,
                gradient_accumulation_steps=4,
                learning_rate=2e-4,
                warmup_ratio=0.03,
                logging_steps=1,
                save_strategy="epoch",
                fp16=(device == "cuda"),
                report_to="none",
                max_seq_length=512,
            )

            trainer = SFTTrainer(
                model=model,
                args=sft_config,
                train_dataset=dataset,
                processing_class=tokenizer,
                peft_config=lora_config,
            )

        # Override the logging callback to emit progress
        class ProgressCallback(transformers.TrainerCallback):
            def on_log(self, _args, state, control, logs=None, **kwargs):
                if logs and "loss" in logs:
                    step = state.global_step
                    total = state.max_steps
                    pct = int((step / total) * 100) if total > 0 else 0
                    loss = logs.get("loss", 0)
                    emit("training", f"Step {step}/{total} — loss: {loss:.4f}", pct)

        trainer.add_callback(ProgressCallback())
        trainer.train()

        # Save
        emit("deploying", "Saving trained model...")
        trainer.save_model(output_dir)
        tokenizer.save_pretrained(output_dir)

    except Exception as e:
        emit("failed", f"Training failed: {e}")
        sys.exit(1)

    # Step 5: Push to Hub (optional)
    model_id = output_dir
    if args.push and args.hub_repo:
        emit("deploying", f"Pushing to HuggingFace Hub: {args.hub_repo}...")
        try:
            trainer.push_to_hub(args.hub_repo)
            model_id = args.hub_repo
            emit("deploying", f"Pushed to Hub: {args.hub_repo}")
        except Exception as e:
            emit("deploying", f"Hub push failed (model saved locally): {e}")

    # Step 6: Emit final result
    result = {
        "stage": "complete",
        "message": f"Training complete: {model_id}",
        "percent": 100,
        "result": {
            "modelId": model_id,
            "baseModel": args.base_model,
            "examples": len(dataset),
            "method": args.method,
            "outputDir": output_dir,
        },
    }
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
