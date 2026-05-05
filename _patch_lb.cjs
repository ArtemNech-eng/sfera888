const fs = require("fs");
const path = require("path");
const BASE = "d:/Сфера мастер/sfera888";

// ─── 1. ActionItemModal.tsx — ScreenshotBlock ───
const modalFile = path.join(BASE, "artifacts/crm/src/components/dashboard/ActionItemModal.tsx");
let modal = fs.readFileSync(modalFile, "utf8");
const sbStart = modal.indexOf("function ScreenshotBlock({ url }");
if (sbStart < 0) { console.error("ScreenshotBlock not found"); process.exit(1); }
let depth = 0, sbEnd = -1;
for (let i = sbStart; i < modal.length; i++) {
  if (modal[i] === '{') depth++;
  else if (modal[i] === '}') { depth--; if (depth === 0) { sbEnd = i + 1; break; } }
}
console.log("Found ScreenshotBlock at", sbStart, "to", sbEnd, "len:", sbEnd - sbStart);

const newSB = [
  'function ScreenshotBlock({ url }: { url: string }) {',
  '  const [imgError, setImgError] = useState(false);',
  '  const [lightboxOpen, setLightboxOpen] = useState(false);',
  '  return (',
  '    <div className="space-y-1">',
  '      <div className="text-xs text-muted-foreground">Скриншот оплаты:</div>',
  '      {!imgError ? (',
  '        <button type="button" onClick={() => setLightboxOpen(true)} className="block w-full text-left p-0 bg-transparent border-none">',
  '          <img src={url} alt="Скриншот оплаты" className="max-h-40 rounded-lg border object-contain bg-slate-100 cursor-zoom-in hover:opacity-90 transition-opacity" onError={() => { console.warn("[screenshot] failed to load:", url); setImgError(true); }} />',
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
  '          <div className="text-[10px] text-muted-foreground font-mono break-all select-all bg-white rounded px-2 py-1 border">{url}</div>',
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
  '}',
].join('\n');

modal = modal.substring(0, sbStart) + newSB + modal.substring(sbEnd);
fs.writeFileSync(modalFile, modal, "utf8");
console.log("OK — ActionItemModal ScreenshotBlock → lightbox");

// ─── 2. dialogs.tsx ───
const dialogsFile = path.join(BASE, "artifacts/crm/src/pages/dialogs.tsx");
if (fs.existsSync(dialogsFile)) {
  let dlg = fs.readFileSync(dialogsFile, "utf8");
  const lines = dlg.split("\n");
  let ssStart = -1, ssEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('screenshotUrl') && lines[i].includes('target="_blank"') && lines[i].includes('<a ')) ssStart = i;
    if (ssStart >= 0 && lines[i].includes('</a>') && i >= ssStart) { ssEnd = i; break; }
  }
  if (ssStart >= 0) {
    const ind = lines[ssStart].match(/^(\s*)/)[1];
    const block = [
      ind + '<button type="button" onClick={() => setScreenshotLightbox(true)} className="block w-full text-left p-0 bg-transparent border-none">',
      ind + '  <img src={payload.screenshotUrl} alt="Скриншот оплаты" className="w-full rounded-xl max-h-52 object-cover border border-green-200 hover:opacity-90 transition-opacity cursor-zoom-in" />',
      ind + '</button>',
      ind + '{screenshotLightbox && (',
      ind + '  <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setScreenshotLightbox(false)}>',
      ind + '    <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>',
      ind + '      <button onClick={() => setScreenshotLightbox(false)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>',
      ind + '      <p className="text-white text-xs mb-2 font-semibold">Скриншот оплаты</p>',
      ind + '      <img src={payload.screenshotUrl} alt="Скриншот оплаты" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />',
      ind + '    </div>',
      ind + '  </div>',
      ind + ')}',
    ].join('\n');
    lines.splice(ssStart, ssEnd - ssStart + 1, block);
    if (!dlg.includes("screenshotLightbox")) {
      const si = lines.findIndex(l => l.includes("useState"));
      if (si >= 0) { const si2 = lines[si].match(/^(\s*)/)[1]; lines.splice(si+1, 0, si2+'const [screenshotLightbox, setScreenshotLightbox] = useState(false);'); }
    }
    fs.writeFileSync(dialogsFile, lines.join("\n"), "utf8");
    console.log("OK — dialogs.tsx screenshot → lightbox");
  } else { console.log("SKIP — dialogs.tsx no screenshot <a>"); }
}

// ─── 3. master-chat.tsx — photoUrl ───
const chatFile = path.join(BASE, "artifacts/crm/src/pages/master-chat.tsx");
if (fs.existsSync(chatFile)) {
  let chat = fs.readFileSync(chatFile, "utf8");
  const lines = chat.split("\n");
  let ps = -1, pe = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('photoUrl') && lines[i].includes('target="_blank"') && lines[i].includes('<a ')) ps = i;
    if (ps >= 0 && lines[i].includes('</a>') && i >= ps) { pe = i; break; }
  }
  if (ps >= 0) {
    const ind = lines[ps].match(/^(\s*)/)[1];
    const block = [
      ind + '<button type="button" onClick={() => setChatPhotoLightbox(resolvePhotoUrl(msg.photoUrl))} className="block mb-2 w-full text-left p-0 bg-transparent border-none">',
      ind + '  <img src={resolvePhotoUrl(msg.photoUrl)} alt="фото" className="rounded-xl max-w-full max-h-52 object-cover cursor-zoom-in" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />',
      ind + '</button>',
    ].join('\n');
    lines.splice(ps, pe - ps + 1, block);
    if (!chat.includes("chatPhotoLightbox")) {
      const si = lines.findIndex(l => l.includes("useState"));
      if (si >= 0) { const si2 = lines[si].match(/^(\s*)/)[1]; lines.splice(si+1, 0, si2+'const [chatPhotoLightbox, setChatPhotoLightbox] = useState<string | null>(null);'); }
    }
    if (!chat.includes("chatPhotoLightbox &&")) {
      const pi = lines.findIndex(l => l.includes("</Popover>"));
      if (pi >= 0) {
        const oi = "            ";
        const ov = [
          oi+'{chatPhotoLightbox && (',
          oi+'  <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setChatPhotoLightbox(null)}>',
          oi+'    <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>',
          oi+'      <button onClick={() => setChatPhotoLightbox(null)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>',
          oi+'      <img src={chatPhotoLightbox} alt="Фото" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />',
          oi+'    </div>',
          oi+'  </div>',
          oi+')}',
        ].join('\n');
        lines.splice(pi, 0, ov);
      }
    }
    fs.writeFileSync(chatFile, lines.join("\n"), "utf8");
    console.log("OK — master-chat.tsx photo → lightbox");
  } else { console.log("SKIP — master-chat.tsx no photo <a>"); }
}

// ─── 4. master-chat.tsx — screenshotUrl ───
if (fs.existsSync(chatFile)) {
  let chat2 = fs.readFileSync(chatFile, "utf8");
  const lines2 = chat2.split("\n");
  let ss = -1, se = -1;
  for (let i = 0; i < lines2.length; i++) {
    if (lines2[i].includes('screenshotUrl') && lines2[i].includes('cursor-zoom-in')) {
      for (let j = i; j >= Math.max(0,i-3); j--) { if (lines2[j].includes('<a ')) { ss = j; break; } }
      if (ss < 0) ss = i;
      for (let j = i; j < Math.min(lines2.length,i+3); j++) { if (lines2[j].includes('</a>')) { se = j; break; } }
      if (se < 0) se = i;
      break;
    }
  }
  if (ss >= 0 && se >= 0) {
    console.log("master-chat.tsx screenshotUrl at lines", ss+1, "-", se+1);
    for (let j = ss; j <= se; j++) console.log((j+1)+":", lines2[j]);
    // Replace with button + lightbox (reuse chatPhotoLightbox state)
    const ind = lines2[ss].match(/^(\s*)/)[1];
    const block = [
      ind + '<button type="button" onClick={() => setChatPhotoLightbox(order.screenshotUrl)} className="block w-full text-left p-0 bg-transparent border-none">',
      ind + '  <img src={order.screenshotUrl} alt="Скриншот оплаты" className="w-full rounded-lg border border-emerald-200 object-cover max-h-40 hover:opacity-90 transition-opacity cursor-zoom-in" />',
      ind + '</button>',
    ].join('\n');
    lines2.splice(ss, se - ss + 1, block);
    fs.writeFileSync(chatFile, lines2.join("\n"), "utf8");
    console.log("OK — master-chat.tsx screenshotUrl → lightbox (reuses chatPhotoLightbox)");
  } else { console.log("SKIP — master-chat.tsx no screenshotUrl block"); }
}

// ─── 5. master-drawer.tsx — screenshotUrl ───
const drawerFile = path.join(BASE, "artifacts/crm/src/components/master-drawer.tsx");
if (fs.existsSync(drawerFile)) {
  let drawer = fs.readFileSync(drawerFile, "utf8");
  const lines = drawer.split("\n");
  let ss = -1, se = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('screenshotUrl') && lines[i].includes('cursor-zoom-in')) {
      for (let j = i; j >= Math.max(0,i-3); j--) { if (lines[j].includes('<a ')) { ss = j; break; } }
      if (ss < 0) ss = i;
      for (let j = i; j < Math.min(lines.length,i+3); j++) { if (lines[j].includes('</a>')) { se = j; break; } }
      if (se < 0) se = i;
      break;
    }
  }
  if (ss >= 0) {
    console.log("master-drawer.tsx screenshot at lines", ss+1, "-", se+1);
    const ind = lines[ss].match(/^(\s*)/)[1];
    const block = [
      ind + '<button type="button" onClick={() => setDrawerScreenshotLightbox(order.screenshotUrl)} className="block w-full text-left p-0 bg-transparent border-none">',
      ind + '  <img src={order.screenshotUrl} alt="Скриншот оплаты" className="w-full rounded-lg border border-emerald-200 object-cover max-h-36 hover:opacity-90 transition-opacity cursor-zoom-in" />',
      ind + '</button>',
    ].join('\n');
    lines.splice(ss, se - ss + 1, block);
    if (!drawer.includes("drawerScreenshotLightbox")) {
      const si = lines.findIndex(l => l.includes("useState"));
