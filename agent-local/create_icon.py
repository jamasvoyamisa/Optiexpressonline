"""Genera icon.ico para el build del ejecutable."""
from PIL import Image, ImageDraw, ImageFont


def create_icon():
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = size // 16
    draw.ellipse(
        [margin, margin, size - margin - 1, size - margin - 1],
        fill="#2563eb",
        outline="#1d4ed8",
        width=max(1, size // 40),
    )

    font_size = int(size * 0.5)
    font = None
    for name in ("segoeui.ttf", "segoeuib.ttf", "arial.ttf", "Arial Bold.ttf"):
        try:
            font = ImageFont.truetype(name, font_size)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()

    text = "O"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) // 2
    y = (size - th) // 2 - size // 20
    draw.text((x, y), text, fill="#FFFFFF", font=font)

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save("icon.ico", format="ICO", sizes=ico_sizes)
    print("icon.ico generado correctamente")


if __name__ == "__main__":
    create_icon()
