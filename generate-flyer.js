const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');

async function createFlyer() {
  // Создаём документ A4 в горизонтальной ориентации
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([842, 595]); // A4 landscape (points)
  
  const { width, height } = page.getSize();
  
  // Загружаем шрифт
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Заголовок
  const titleLines = [
    'УКЛАДКА',
    'ТРОТУАРНОЙ',
    'ПЛИТКИ',
    'УСТАНОВКА',
    'БОРДЮРОВ',
    'ЛЮБОЙ',
    'СЛОЖНОСТИ'
  ];
  
  let y = height - 80;
  const fontSize = 36;
  
  for (const line of titleLines) {
    const textWidth = font.widthOfString(line, fontSize);
    const x = (width - textWidth) / 2;
    page.drawText(line, { x, y, size: fontSize, font });
    y -= 45;
  }
  
  // Телефоны
  const phones = [
    ['8961', '4476', '174', 'Владимир'],
    ['8964', '2228', '751', 'Александр'],
    ['8961', '4476', '174', 'Владимир'],
    ['8964', '2228', '751', 'Александр'],
  ];
  
  const stripWidth = (width - 80) / 4;
  const startX = 40;
  const startY = 80;
  
  for (let i = 0; i < phones.length; i++) {
    const x = startX + i * stripWidth;
    
    // Рамка
    page.drawRectangle({
      x: x,
      y: startY,
      width: stripWidth - 10,
      height: 120,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    // Текст в полоске
    let textY = startY + 100;
    const phoneFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    for (let j = 0; j < phones[i].length; j++) {
      page.drawText(phones[i][j], {
        x: x + 8,
        y: textY,
        size: 10,
        font: phoneFont,
      });
      textY -= 18;
    }
  }
  
  // Сохраняем
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('flyer.pdf', pdfBytes);
  console.log('PDF создан: flyer.pdf');
}

createFlyer().catch(console.error);
