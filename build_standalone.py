from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "shiling_mobile.html"


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    lucide = (ROOT / "vendor" / "lucide.min.js").read_text(encoding="utf-8")
    app = (ROOT / "app.js").read_text(encoding="utf-8")

    html = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        f"<style>\n{css}\n</style>",
    )
    html = html.replace(
        '<script src="vendor/lucide.min.js"></script>',
        f"<script>\n{lucide}\n</script>",
    )
    html = html.replace(
        '<script src="app.js"></script>',
        f"<script>\n{app}\n</script>",
    )

    OUTPUT.write_text(html, encoding="utf-8")
    print(f"built={OUTPUT}")
    print(f"size={OUTPUT.stat().st_size}")


if __name__ == "__main__":
    main()
