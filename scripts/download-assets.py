"""Download the exact, unmodified assets exported by Figma MCP."""
from pathlib import Path
import concurrent.futures
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
code = (ROOT / 'docs/figma-reference.jsx').read_text()
base = re.search(r'const assetPathPrefix = "([^"]+)"', code)[1]
names = {'img1': 'house-family', 'imgImage': 'hero-staircase', 'imgImage1': 'philosophy-living', 'imgImage2': 'philosophy-dining', 'img2': 'botanical', 'imgImage3': 'craft-workshop', 'img3': 'wood-shavings', 'img4': 'open-door', 'imgImage4': 'event-open-house', 'imgImage5': 'event-consultation', 'imgImage6': 'work-natural', 'imgImage7': 'work-light', 'imgImage8': 'work-renovation', 'imgIcon': 'arrow-news', 'imgIcon1': 'arrow-list', 'imgIcon2': 'arrow-detail', 'imgIcon3': 'mail'}

def fetch(item):
    var, source = item
    target = ROOT / 'dist/assets' / (names[var] + Path(source).suffix)
    subprocess.run(['curl', '-f', '-L', '--retry', '2', '-sS', '-o', str(target), base + '/' + source], check=True)
    return target.name, target.stat().st_size

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for result in pool.map(fetch, re.findall(r'const (\w+) = `\$\{assetPathPrefix\}/([^`]+)`', code)):
            print(*result)
    subprocess.run(['curl', '-f', '-L', '-sS', '-o', str(ROOT / 'docs/screenshots/figma-desktop.png'), 'https://www.figma.com/api/mcp/asset/2803b086-82a0-43c8-8e96-d055397f9625.png'], check=True)
