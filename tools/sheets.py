"""Собирает листы-развёртки: renders/<obj>/*.png -> sheets/<obj>_sheet.png
и уменьшает отдельные виды до 1024 px (сглаживание суперсэмплингом)."""
import glob, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TITLES = {
    'mug': 'Пивная кружка', 'table': 'Стол', 'bar_counter': 'Барная стойка',
    'stool_high': 'Высокий стул', 'chair_low': 'Низкий стул', 'deep_plate': 'Глубокая тарелка',
    'table_lantern': 'Настольный фонарь', 'dish_cabinet': 'Шкаф с посудой',
    'fireplace': 'Камин', 'pantry_shelf': 'Полка для продуктов',
}
VIEWS = {
    '01_front': 'Спереди', '02_back': 'Сзади', '03_left': 'Слева', '04_right': 'Справа',
    '05_top': 'Сверху', '06_front_3q': '3/4 спереди', '07_back_3q': '3/4 сзади', '08_low_3q': '3/4 спереди-слева, низко',
}
BG = (58, 58, 58)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONTB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def main(names):
    os.makedirs(os.path.join(ROOT, 'sheets'), exist_ok=True)
    f_title, f_lab = ImageFont.truetype(FONTB, 64), ImageFont.truetype(FONT, 34)
    for i, name in enumerate(names):
        d = os.path.join(ROOT, 'renders', name)
        files = sorted(glob.glob(os.path.join(d, f'{name}_*.png')))
        cell, pad, head = 700, 20, 120
        W = 4 * cell + 5 * pad
        sheet = Image.new('RGB', (W, head + 2 * (cell + 60) + pad), BG)
        dr = ImageDraw.Draw(sheet)
        dr.text((pad * 2, 30), f'{i + 1:02d}. {TITLES[name]}', font=f_title, fill=(225, 225, 225))
        for k, f in enumerate(files):
            vid = os.path.basename(f)[len(name) + 1:-4]
            im = Image.open(f).convert('RGB')
            if im.width > 1024:
                im = im.resize((1024, 1024), Image.LANCZOS)
                im.save(f)
            x = pad + (k % 4) * (cell + pad)
            y = head + (k // 4) * (cell + 60)
            sheet.paste(im.resize((cell, cell), Image.LANCZOS), (x, y))
            dr.text((x + 10, y + cell + 8), VIEWS.get(vid, vid), font=f_lab, fill=(200, 200, 200))
        sheet.save(os.path.join(ROOT, 'sheets', f'{i + 1:02d}_{name}_sheet.png'))
        print('sheet', name)

if __name__ == '__main__':
    order = list(TITLES)
    main([n for n in order if not sys.argv[1:] or n in sys.argv[1:]])
