// Lightbox patcher — replaces <a target="_blank"> image links with lightbox overlays
const fs = require("fs");
const BASE = "d:/Сфера мастер/sfera888";

function patchFile(filePath, replacer) {
  if (!fs.existsSync(filePath)) { console.log("SKIP — " + filePath + " not found"); return; }
  let content = fs.readFileSync(filePath, "utf8");
  const result = replacer(content);
  if (result !== content) {
    fs.writeFileSync(filePath, result, "utf8");
    console.log("OK — patched " + filePath);
  } else {
    console.log("NO CHANGE — " + filePath);
  }
}

// ─── 1. ActionItemModal.tsx — ScreenshotBlock ───
patchFile(BASE + "/artifacts/crm/src/components/dashboard/ActionItemModal.tsx", (c) => {
  const start = c.indexOf("function ScreenshotBlock({ url }");
  if (start < 0) return c;
  let depth = 0, end = -1;
  for (let i = start; i < c.length; i++) {
    if (c[i] === '{') depth++;
    else if (c[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) return c;
  const old = c.substring(start, end);
  const rep = [
    'function ScreenshotBlock({ url }: { url: string }) {',
    '  const [imgError, setImgError] = useState(false);',
    '  const [lightboxOpen, setLightboxOpen] = useState(false);',
    '  return (',
    '    <div className="space-y-1">',
    '      <div className="text-xs text-muted-foreground">Скриншот оплаты:</div>',
    '      {!imgError ? (',
    '        <button type="button" onClick={() => setLightboxOpen(true)} className="block w-full text-left p-0 bg-transparent border-none">',
    '          <img',
    '            src={url}',
    '            alt="Скриншот оплаты"',
    '            className="max-h-40 rounded-lg border object-contain bg-slate-100 cursor-zoom-in hover:opacity-90 transition-opacity"',
    '            onError={() => { console.warn("[screenshot] failed to load:", url); setImgError(true); }}',
    '          />',
    '        </button>',
    '      ) : (',
    '        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">',
    '          <div className="flex items-center gap-2 text-xs text-amber-700">',
    '            <AlertTriangle className="w-4 h-4 shrink-0" />',
    '            <span>Не удалось загрузить изображение. Возможно, хранилище файлов не настроено.</span>',
    '          </div>',
    '          <button type="button" onClick={() => setLightboxOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 underline hover:text-blue-800 break-all bg-transparent border-none p-0 cursor-pointer">',
    '            Открыть скриншот ↗',
    '          </button>',
    '          <div className="text-[10px] text-muted-foreground font-mono break-all select-all bg-white rounded px-2 py-1 border">',
    '            {url}',
    '          </div>',
    '        </div>',
    '      )}',
    '      {lightboxOpen && (',
    '        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxOpen(false)}>',
    '          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>',
    '            <button onClick={() => setLightboxOpen(false)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>',
    '            <p className="text-white text-xs mb-2 font-semibold">Скриншот оплаты</p>',
    '            <img src={url} alt="Скриншот оплаты" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />',
    '          </div>',
    '        </div>',
    '      )}',
    '    </div>',
    '  );',
    '}'
  ].join('\n');
  return c.substring(0, start) + rep + c.substring(end);
});

// ─── 2. dialogs.tsx ───
patchFile(BASE + "/artifacts/crm/src/pages/dialogs.tsx", (c) => {
  // Add state if not present
  if (!c.includes("screenshotLightbox")) {
    c = c.replace(
      /const \[([^\]]+)\]\s*=\s*useState\(/,
      (m) => m + "" // just find first useState
    );
    const idx = c.indexOf("useState(");
    if (idx >= 0) {
      const lineStart = c.lastIndexOf("\n", idx) + 1;
      const indent = c.substring(lineStart, idx).match(/^\s*/)[0];
      c = c.substring(0, lineStart) + indent + "const [screenshotLightbox, setScreenshotLightbox] = useState(false);\n" + c.substring(lineStart);
    }
  }
  // Replace <a href={payload.screenshotUrl} target="_blank" ...>...</a>
  c = c.replace(
    /<a href=\{payload\.screenshotUrl\}[^>]*target="_blank"[^>]*>\s*\n\s*<img[^>]*\/>\s*\n\s*<\/a>/,
    [
      '<button type="button" onClick={() => setScreenshotLightbox(true)} className="block w-full text-left p-0 bg-transparent border-none">',
      '              <img src={payload.screenshotUrl} alt="Скриншот оплаты" className="w-full rounded-xl max-h-52 object-cover border border-green-200 hover:opacity-90 transition-opacity cursor-zoom-in" />',
      '            </button>',
      '            {screenshotLightbox && (',
      '              <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setScreenshotLightbox(false)}>',
      '                <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>',
      '                  <button onClick={() => setScreenshotLightbox(false)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>',
      '                  <p className="text-white text-xs mb-2 font-semibold">Скриншот оплаты</p>',
      '                  <img src={payload.screenshotUrl} alt="Скриншот оплаты" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />',
      '                </div>',
      '              </div>',
      '            )}'
    ].join('\n')
  );
  return c;
});

// ─── 3. master-chat.tsx — photoUrl + screenshotUrl ───
patchFile(BASE + "/artifacts/crm/src/pages/master-chat.tsx", (c) => {
  // Add state if not present
  if (!c.includes("chatPhotoLightbox")) {
    const idx = c.indexOf("useState(");
    if (idx >= 0) {
      const lineStart = c.lastIndexOf("\n", idx) + 1;
      const indent = c.substring(lineStart, idx).match(/^\s*/)[0];
      c = c.substring(0, lineStart) + indent + "const [chatPhotoLightbox, setChatPhotoLightbox] = useState<string | null>(null);\n" + c.substring(lineStart);
    }
  }
  // Replace photoUrl <a>...</a>
  c = c.replace(
    /<a href=\{resolvePhotoUrl\(msg\.photoUrl\)\}[^>]*target="_blank"[^>]*>\s*\n\s*<img[^>]*\/>\s*\n\s*<\/a>/,
    [
      '<button type="button" onClick={() => setChatPhotoLightbox(resolvePhotoUrl(msg.photoUrl))} className="block mb-2 w-full text-left p-0 bg-transparent border-none">',
      '                                  <img src={resolvePhotoUrl(msg.photoUrl)} alt="фото" className="rounded-xl max-w-full max-h-52 object-cover cursor-zoom-in" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />',
      '                                </button>'
    ].join('\n')
  );
  // Add lightbox overlay before </Popover>
  if (!c.includes("chatPhotoLightbox &&")) {
    c = c.replace("</Popover>", [
      '{chatPhotoLightbox && (',
      '            <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setChatPhotoLightbox(null)}>',
      '              <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>',
      '                <button onClick={() => setChatPhotoLightbox(null)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>',
      '                <img src={chatPhotoLightbox} alt="Фото" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />',
      '              </div>',
      '            </div>',
      '          )}',
      '</Popover>'
    ].join('\n'));
  }
  // Also handle screenshotUrl in chat if present
  c = c.replace(
    /<a href=\{[^}]*screenshotUrl[^}]*\}[^>]*target="_blank"[^>]*>\s*\n\s*<img[^>]*cursor-zoom-in[^>]*\/>\s*\n\s*<\/a>/,
    (match) => {
      // Extract the URL expression from the <a href={...}>
      const urlMatch = match.match(/href=\{([^}]+)\}/);
      const urlExpr = urlMatch ? urlMatch[1] : '""';
      return [
        '<button type="button" onClick={() => setChatPhotoLightbox(' + urlExpr + ')} className="block w-full text-left p-0 bg-transparent border-none">',
        match.match(/<img[^>]*>/)[0],
        '</button>'
      ].join('\n');
    }
  );
  return c;
});

// ─── 4. master-drawer.tsx — screenshotUrl ───
patchFile(BASE + "/artifacts/crm/src/components/master-drawer.tsx", (c) => {
  // Find screenshotUrl <a>...</a> block (not PassportPhotoLink which already has lightbox)
  const lines = c.split("\n");
  let ssStart = -1, ssEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("screenshotUrl") && lines[i].includes("cursor-zoom-in")) {
      for (let j = i; j >= Math.max(0, i - 3); j--) {
        if (lines[j].includes("<a ")) { ssStart = j; break; }
      }
      if (ssStart < 0) ssStart = i;
      for (let j = i; j < Math.min(lines.length, i + 3); j++) {
        if (lines[j].includes("</a>")) { ssEnd = j; break; }
      }
      if (ssEnd < 0) ssEnd = i;
      break;
    }
  }
  if (ssStart < 0) return c; // no screenshotUrl with cursor-zoom-in found

  // Add state
  if (!c.includes("drawerScreenshotLightbox")) {
    const idx = c.indexOf("useState(");
    if (idx >= 0) {
      const lineStart = c.lastIndexOf("\n", idx) + 1;
      const indent = c.substring(lineStart, idx).match(/^\s*/)[0];
      c = c.substring(0, lineStart) + indent + "const [drawerScreenshotLightbox, setDrawerScreenshotLightbox] = useState<string | null>(null);\n" + c.substring(lineStart);
    }
  }

  // Replace the <a>...</a> block
  const indent = lines[ssStart].match(/^(\s*)/)[1];
  const newBlock = [
    indent + '<button',
    indent + '  type="button"',
    indent + '  onClick={() => setDrawerScreenshotLightbox(order.screenshotUrl)}',
    indent + '  className="block w-full text-left p-0 bg-transparent border-none"',
    indent + '>',
    indent + '  <img',
    indent + '    src={order.screenshotUrl}',
    indent + '    alt="Скриншот оплаты"',
    indent + '    className="w-full rounded-lg border border-emerald-200 object-cover max-h-36 hover:opacity-90 transition-opacity cursor-zoom-in"',
    indent + '  />',
    indent + '</button>'
  ].join('\n');
  lines.splice(ssStart, ssEnd - ssStart + 1, newBlock);

  // Add lightbox overlay before </SheetContent>
  if (!c.includes("drawerScreenshotLightbox &&")) {
    const sheetIdx = lines.findIndex(l => l.includes("</SheetContent>"));
    if (sheetIdx >= 0) {
      const oi = "          ";
      const overlay = [
        oi + '{drawerScreenshotLightbox && (',
        oi + '  <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setDrawerScreenshotLightbox(null)}>',
        oi + '    <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>',
        oi + '      <button onClick={() => setDrawerScreenshotLightbox(null)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>',
        oi + '      <p className="text-white text-xs mb-2 font-semibold">Скриншот оплаты</p>',
        oi + '      <img src={drawerScreenshotLightbox} alt="Скриншот оплаты" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />',
        oi + '    </div>',
        oi + '  </div>',
        oi + ')}'
      ].join('\n');
      lines.splice(sheetIdx, 0, overlay);
    }
  }
  return lines.join("\n");
});

console.log("\nAll done!");
