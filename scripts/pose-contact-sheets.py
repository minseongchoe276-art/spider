"""Assemble already-captured browser QA images; never alter model assets."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / 'docs' / 'qa' / 'naturalness-gallery'
groups = {
    'ground-clips': ['idle', 'walk', 'jog', 'regularRun', 'run', 'stop', 'runStop', 'femaleStop', 'turnLeft', 'turnRight', 'land', 'injuredIdle'],
    'air-clips': ['jump', 'jumpDown', 'drop', 'jumpDownVariant', 'swing', 'fall', 'fallVariant', 'fallIdle', 'roll', 'wall', 'zip'],
    'runtime-ground': ['runtime-movement-1.7', 'runtime-movement-3.8', 'runtime-movement-5.8', 'runtime-movement-7.5', 'runtime-movement-9.3', 'runtime-movement-10.3', 'runtime-walkStop-3.1', 'runtime-walkStop-3.8', 'runtime-turn-1.4', 'runtime-turn-3.4', 'runtime-wall-0.5', 'runtime-wall-1.2'],
    'runtime-air': ['runtime-movement-11.3', 'runtime-landing-0.4', 'runtime-landing-0.9', 'runtime-landing-1.4', 'runtime-roll-1.2', 'runtime-roll-1.7', 'runtime-roll-2.4', 'runtime-roll-3.4', 'runtime-swing-1', 'runtime-swing-2.3'],
}
for name, keys in groups.items():
    sheet = Image.new('RGB', (960, 400 * ((len(keys) + 2) // 3)), '#edf2f6')
    draw = ImageDraw.Draw(sheet)
    for index, key in enumerate(keys):
        image = Image.open(root / (key + '.jpg')).crop((590, 100, 1070, 680)).resize((320, 380))
        x, y = index % 3 * 320, index // 3 * 400
        sheet.paste(image, (x, y + 20))
        draw.text((x + 8, y + 4), key if key.startswith('runtime') else key + ' / clip midpoint (no runtime IK)', fill='#182b3f')
    sheet.save(root / (name + '.jpg'), quality=92)
