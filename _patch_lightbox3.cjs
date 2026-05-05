const fs = require("fs");
const path = require("path");
const BASE = "d:/Сфера мастер/sfera888";

// Helper: lightbox overlay JSX
function lightboxJSX(urlExpr, label) {
  return `
            {lightboxOpen && (
              <div
                className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
                onClick={() => setLightboxOpen(false)}
              >
                <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setLightboxOpen(false)}
                    className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300"
                  >
                    ✕ Закрыть
                  </button>
                  ${label ? `<p className="text-white text-xs mb-2 font-semibold">${label}</p>` : ''}
                  <img
                    src={${urlExpr}}
                    alt="${label || 'Изображение'}"
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                  />
                </div>
              </div>
            )}`;
}

// ─── 1. ActionItemModal.tsx — ScreenshotBlock ───
const modalFile = path.join(BASE, "artifacts/crm/src/components/dashboard/ActionItemModal.tsx");
let modal = fs.readFileSync(modalFile, "utf8");

// Find ScreenshotBlock function boundaries
const sbStart = modal.indexOf("function ScreenshotBlock({ url }");
if (sbStart < 0) { console.error("ScreenshotBlock not found in ActionItemModal"); process.exit(1); }

// Find closing brace of the function (match braces)
let depth = 0;
let sbEnd = -1;
for (let i = sbStart; i < modal.length; i++) {
  if (modal[i] === '{') depth++;
  else if (modal[i] === '}') {
    depth--;
    if (depth === 0) { sbEnd = i + 1; break; }
  }
}

const oldFunc = modal.substring(sbStart, sbEnd);
console.log("Found ScreenshotBlock, length:", oldFunc.length);

const newFunc = `function ScreenshotBlock({ url }: { url: string }) {
  const [imgError, setImgError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">Скриншот оплаты:</div>
      {!imgError ? (
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block w-full text-left p-0 bg-transparent border-none"
        >
          <img
            src={url}
            alt="Скриншот оплаты"
            className="max-h-40 rounded-lg border object-contain bg-slate-100 cursor-zoom-in hover:opacity-90 transition-opacity"
            onError={() => {
              console.warn("[screenshot] failed to load:", url);
              setImgError(true);
            }}
          />
        </button>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Не удалось загрузить изображение. Возможно, хранилище файлов не настроено.</span>
          </div>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 underline hover:text-blue-800 break-all bg-transparent border-none p-0 cursor-pointer"
          >
            Открыть скриншот ↗
          </button>
          <div className="text-[10px] text-muted-foreground font-mono break-all select-all bg-white rounded px-2 py-1 border">
            {url}
          </div>
        </div>
      )}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300"
            >
              ✕ Закрыть
            </button>
            <p className="text-white text-xs mb-2 font-semibold">Скриншот оплаты</p>
            <img
              src={url}
              alt="Скриншот оплаты"
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}`;

modal = modal.substring(0, sbStart) + newFunc + modal.substring(sbEnd);
fs.writeFileSync(modalFile, modal, "utf8");
console.log("OK — ActionItemModal ScreenshotBlock → lightbox");

// ─── 2. dialogs.tsx ───
const dialogsFile = path.join(BASE, "artifacts/crm/src/pages/dialogs.tsx");
if (fs.existsSync(dialogsFile)) {
  let dlg = fs.readFileSync(dialogsFile, "utf8");
  const lines = dlg.split("\n");
  
  // Find the screenshot <a> block
  let screenshotStartLine = -1;
  let screenshotEndLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('screenshotUrl') && lines[i].includes('target="_blank"') && lines[i].includes('<a ')) {
      screenshotStartLine = i;
    }
    if (screenshotStartLine >= 0 && lines[i].includes('</a>') && i >= screenshotStartLine) {
      screenshotEndLine = i;
      break;
    }
  }
  
  if (screenshotStartLine >= 0) {
    console.log(`dialogs.tsx: screenshot <a> block at lines ${screenshotStartLine+1}-${screenshotEndLine+1}`);
    // Replace the <a>...</a> block with <button> + lightbox
    const indent = lines[screenshotStartLine].match(/^(\s*)/)[1];
    const newBlock = `${indent}<button
${indent}  type="button"
${indent}  onClick={() => setScreenshotLightbox(true)}
${indent}  className="block w-full text-left p-0 bg-transparent border-none"
${indent}>
${indent}  <img src={payload.screenshotUrl} alt="Скриншот оплаты" className="w-full rounded-xl max-h-52 object-cover border border-green-200 hover:opacity-90 transition-opacity cursor-zoom-in" />
${indent}</button>
${indent}{screenshotLightbox && (
${indent}  <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setScreenshotLightbox(false)}>
${indent}    <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
${indent}      <button onClick={() => setScreenshotLightbox(false)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>
${indent}      <p className="text-white text-xs mb-2 font-semibold">Скриншот оплаты</p>
${indent}      <img src={payload.screenshotUrl} alt="Скриншот оплаты" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
${indent}    </div>
${indent}  </div>
${indent})}`;
    
    lines.splice(screenshotStartLine, screenshotEndLine - screenshotStartLine + 1, newBlock);
    
    // Add state variable — find first useState in the component
    const firstStateIdx = lines.findIndex(l => l.includes("useState"));
    if (firstStateIdx >= 0 && !dlg.includes("screenshotLightbox")) {
      const stateIndent = lines[firstStateIdx].match(/^(\s*)/)[1];
      lines.splice(firstStateIdx + 1, 0, `${stateIndent}const [screenshotLightbox, setScreenshotLightbox] = useState(false);`);
    }
    
    dlg = lines.join("\n");
    fs.writeFileSync(dialogsFile, dlg, "utf8");
    console.log("OK — dialogs.tsx screenshot → lightbox");
  } else {
    console.log("SKIP — dialogs.tsx no screenshot <a> block found");
  }
}

// ─── 3. master-chat.tsx — photo in chat ───
const chatFile = path.join(BASE, "artifacts/crm/src/pages/master-chat.tsx");
if (fs.existsSync(chatFile)) {
  let chat = fs.readFileSync(chatFile, "utf8");
  const lines = chat.split("\n");
  
  // Find photoUrl <a> block
  let photoStartLine = -1;
  let photoEndLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('photoUrl') && lines[i].includes('target="_blank"') && lines[i].includes('<a ')) {
      photoStartLine = i;
    }
    if (photoStartLine >= 0 && lines[i].includes('</a>') && i >= photoStartLine) {
      photoEndLine = i;
      break;
    }
  }
  
  if (photoStartLine >= 0) {
    console.log(`master-chat.tsx: photo <a> block at lines ${photoStartLine+1}-${photoEndLine+1}`);
    const indent = lines[photoStartLine].match(/^(\s*)/)[1];
    const newBlock = `${indent}<button
${indent}  type="button"
${indent}  onClick={() => setChatPhotoLightbox(resolvePhotoUrl(msg.photoUrl))}
${indent}  className="block mb-2 w-full text-left p-0 bg-transparent border-none"
${indent}>
${indent}  <img src={resolvePhotoUrl(msg.photoUrl)} alt="фото" className="rounded-xl max-w-full max-h-52 object-cover cursor-zoom-in" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
${indent}</button>`;
    
    lines.splice(photoStartLine, photoEndLine - photoStartLine + 1, newBlock);
    
    // Add state
    if (!chat.includes("chatPhotoLightbox")) {
      const firstStateIdx = lines.findIndex(l => l.includes("useState"));
      if (firstStateIdx >= 0) {
        const stateIndent = lines[firstStateIdx].match(/^(\s*)/)[1];
        lines.splice(firstStateIdx + 1, 0, `${stateIndent}const [chatPhotoLightbox, setChatPhotoLightbox] = useState<string | null>(null);`);
      }
    }
    
    // Add lightbox overlay before closing </Popover> or at end of component
    if (!chat.includes("chatPhotoLightbox &&")) {
      const popoverCloseIdx = lines.findIndex(l => l.includes("</Popover>"));
      if (popoverCloseIdx >= 0) {
        const overlayIndent = "            ";
        const overlay = `${overlayIndent}{chatPhotoLightbox && (
${overlayIndent}  <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setChatPhotoLightbox(null)}>
${overlayIndent}    <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
${overlayIndent}      <button onClick={() => setChatPhotoLightbox(null)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>
${overlayIndent}      <img src={chatPhotoLightbox} alt="Фото" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
${overlayIndent}    </div>
${overlayIndent}  </div>
${overlayIndent})}`;
        lines.splice(popoverCloseIdx, 0, overlay);
      }
    }
    
    chat = lines.join("\n");
    fs.writeFileSync(chatFile, chat, "utf8");
    console.log("OK — master-chat.tsx photo → lightbox");
  } else {
    console.log("SKIP — master-chat.tsx no photo <a> block found");
  }
}

// ─── 4. master-chat.tsx — screenshotUrl in chat ───
// Check for screenshotUrl pattern too
if (fs.existsSync(chatFile)) {
  let chat2 = fs.readFileSync(chatFile, "utf8");
  // Find screenshotUrl <a> or <img> with cursor-zoom-in
  const lines2 = chat2.split("\n");
  let ssStartLine = -1;
  let ssEndLine = -1;
  for (let i = 0; i < lines2.length; i++) {
    if (lines2[i].includes('screenshotUrl') && lines2[i].includes('cursor-zoom-in')) {
      // Find surrounding <a>...</a> or just the <img>
      // Go back to find <a
      for (let j = i; j >= Math.max(0, i - 3); j--) {
        if (lines2[j].includes('<a ')) { ssStartLine = j; break; }
      }
      if (ssStartLine < 0) ssStartLine = i;
      // Go forward to find </a>
      for (let j = i; j < Math.min(lines2.length, i + 3); j++) {
        if (lines2[j].includes('</a>')) { ssEndLine = j; break; }
      }
      if (ssEndLine < 0) ssEndLine = i;
      break;
    }
  }
  
  if (ssStartLine >= 0 && ssEndLine >= 0 && ssStartLine !== photoStartLine) {
    console.log(`master-chat.tsx: screenshotUrl block at lines ${ssStartLine+1}-${ssEndLine+1}`);
    // This is the screenshot in chat messages — replace similarly
    // For now just log it
    for (let j = ssStartLine; j <= ssEndLine; j++) {
      console.log((j+1) + ": " + lines2[j]);
    }
  }
}

// ─── 5. master-drawer.tsx — screenshotUrl ───
const drawerFile = path.join(BASE, "artifacts/crm/src/components/master-drawer.tsx");
if (fs.existsSync(drawerFile)) {
  let drawer = fs.readFileSync(drawerFile, "utf8");
  const lines = drawer.split("\n");
  
  // Find screenshotUrl <a> block
  let ssStartLine = -1;
  let ssEndLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('screenshotUrl') && lines[i].includes('cursor-zoom-in')) {
      for (let j = i; j >= Math.max(0, i - 3); j--) {
        if (lines[j].includes('<a ')) { ssStartLine = j; break; }
      }
      if (ssStartLine < 0) ssStartLine = i;
      for (let j = i; j < Math.min(lines.length, i + 3); j++) {
        if (lines[j].includes('</a>')) { ssEndLine = j; break; }
      }
      if (ssEndLine < 0) ssEndLine = i;
      break;
    }
  }
  
  if (ssStartLine >= 0) {
    console.log(`master-drawer.tsx: screenshot block at lines ${ssStartLine+1}-${ssEndLine+1}`);
    for (let j = Math.max(0, ssStartLine - 1); j <= Math.min(lines.length - 1, ssEndLine + 1); j++) {
      console.log((j+1) + ": " + lines[j]);
    }
    
    const indent = lines[ssStartLine].match(/^(\s*)/)[1];
    const newBlock = `${indent}<button
${indent}  type="button"
${indent}  onClick={() => setDrawerScreenshotLightbox(order.screenshotUrl)}
${indent}  className="block w-full text-left p-0 bg-transparent border-none"
${indent}>
${indent}  <img
${indent}    src={order.screenshotUrl}
${indent}    alt="Скриншот оплаты"
${indent}    className="w-full rounded-lg border border-emerald-200 object-cover max-h-36 hover:opacity-90 transition-opacity cursor-zoom-in"
${indent}  />
${indent}</button>`;
    
    lines.splice(ssStartLine, ssEndLine - ssStartLine + 1, newBlock);
    
    // Add state
    if (!drawer.includes("drawerScreenshotLightbox")) {
      const firstStateIdx = lines.findIndex(l => l.includes("useState"));
      if (firstStateIdx >= 0) {
        const stateIndent = lines[firstStateIdx].match(/^(\s*)/)[1];
        lines.splice(firstStateIdx + 1, 0, `${stateIndent}const [drawerScreenshotLightbox, setDrawerScreenshotLightbox] = useState<string | null>(null);`);
      }
    }
    
    // Add lightbox overlay before </SheetContent>
    if (!drawer.includes("drawerScreenshotLightbox &&")) {
      const sheetCloseIdx = lines.findIndex(l => l.includes("</SheetContent>"));
      if (sheetCloseIdx >= 0) {
        const overlayIndent = "          ";
        const overlay = `${overlayIndent}{drawerScreenshotLightbox && (
${overlayIndent}  <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setDrawerScreenshotLightbox(null)}>
${overlayIndent}    <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
${overlayIndent}     