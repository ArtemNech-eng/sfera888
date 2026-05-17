from reportlab.lib.pagesizes import landscape, A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.units import cm
import os

# Регистрируем шрифт с поддержкой кириллицы
# Попробуем найти системный шрифт
font_paths = [
    "C:/Windows/Fonts/arialbd.ttf",  # Arial Bold
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/times.ttf",
]

font_found = None
for fp in font_paths:
    if os.path.exists(fp):
        font_found = fp
        break

if font_found:
    pdfmetrics.registerFont(TTFont('CustomFont', font_found))
    font_name = 'CustomFont'
else:
    font_name = 'Helvetica-Bold'  # Fallback

def create_flyer(output_path="flyer.pdf"):
    # Размер A4 в горизонтальной ориентации
    width, height = landscape(A4)
    
    c = canvas.Canvas(output_path, pagesize=landscape(A4))
    
    # Основной текст (заголовок)
    title_lines = [
        "УКЛАДКА",
        "ТРОТУАРНОЙ",
        "ПЛИТКИ",
        "УСТАНОВКА",
        "БОРДЮРОВ",
        "ЛЮБОЙ",
        "СЛОЖНОСТИ"
    ]
    
    # Настройки шрифта для заголовка
    c.setFont(font_name, 48)
    
    # Рисуем заголовок по центру
    y_position = height - 3*cm
    for line in title_lines:
        text_width = c.stringWidth(line, font_name, 48)
        x = (width - text_width) / 2
        c.drawString(x, y_position, line)
        y_position -= 1.8*cm
    
    # Номера телефонов в виде полосок (2 ряда по 4 номера)
    phones = [
        ["8961", "4476", "174", "Владимир"],
        ["8964", "2228", "751", "Александр"],
        ["8961", "4476", "174", "Владимир"],
        ["8964", "2228", "751", "Александр"],
    ]
    
    c.setFont(font_name, 14)
    
    # Начальная позиция для телефонов (внизу страницы)
    start_y = 3*cm
    strip_width = (width - 4*cm) / 4  # 4 колонки с отступами
    
    for col, phone in enumerate(phones):
        x = 2*cm + col * strip_width
        
        # Рисуем рамку для отрывной полоски
        c.rect(x, start_y - 4*cm, strip_width - 0.5*cm, 4.5*cm)
        
        # Текст в полоске
        text_y = start_y + 0.3*cm
        for part in phone:
            c.drawString(x + 0.3*cm, text_y, part)
            text_y -= 0.6*cm
    
    c.save()
    print(f"PDF создан: {os.path.abspath(output_path)}")

if __name__ == "__main__":
    create_flyer()
