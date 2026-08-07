from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser(description="Assemble PNG frames into an optimized GIF.")
    parser.add_argument("frame_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--duration", type=int, default=140)
    parser.add_argument("--width", type=int, default=1200)
    args = parser.parse_args()

    frame_paths = sorted(args.frame_dir.glob("frame-*.png"))
    if not frame_paths:
        raise SystemExit(f"No frames found in {args.frame_dir}")

    frames: list[Image.Image] = []
    for frame_path in frame_paths:
        with Image.open(frame_path) as source:
            image = source.convert("RGB")
            if image.width != args.width:
                height = round(image.height * args.width / image.width)
                image = image.resize((args.width, height), Image.Resampling.LANCZOS)
            frames.append(image.quantize(colors=192, method=Image.Quantize.MEDIANCUT))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    first, *rest = frames
    first.save(
        args.output,
        save_all=True,
        append_images=rest,
        duration=args.duration,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"Created {args.output} from {len(frames)} frames")


if __name__ == "__main__":
    main()
