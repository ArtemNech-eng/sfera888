const fs = require("fs");
const path = require("path");
const BASE = "d:/Сфера мастер/sfera888";

// ─── 1. ActionItemModal.tsx — ScreenshotBlock лайтбокс ───
const modalFile = path.join(BASE, "artifacts/crm/src/components/dashboard/ActionItemModal.tsx");
let modal = fs.readFileSync(modalFile, "utf8");

const oldSB = `function ScreenshotBlock({ url }: { url: string }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">Скриншот оплаты:</div>
      {!imgError ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={url}
            alt="Скриншот оплаты"
            className="max-h-40 rounded-lg border object-contain bg-slate-100 cursor-zoom-in hover:opacity-90 transition-opacity"
            onError={() => {
              console.warn("[screenshot] failed to load:", url);
              setImgError(true);
            }}
          />
        </a>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Не удалось загрузить изображение. Возможно, хранилище файлов не настроено.</span>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 underline hover:text-blue-800 break-all"
          >
            Открыть скриншот напрямую ↗
          </a>
          <div className="text-[10px] text-muted-foreground font-mono break-all select-all bg-white rounded px-2 py-1 border">
            {url}
          </div>
        </div>
      )}
    </div>
  );
}`;

const newSB = `function ScreenshotBlock({ url }: { url: string }) {
  const [imgError, setImgError] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">Скриншот оплаты:</div>
      {!imgError ? (
        <button
          type="button"
          onClick={() => setLightbox(true)}
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
            onClick={() => setLightbox(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 underline hover:text-blue-800 break-all bg-transparent border-none p-0 cursor-pointer"
          >
            Открыть скриншот ↗
          </button>
          <div className="text-[10px] text-muted-foreground font-mono break-all select-all bg-white rounded px-2 py-1 border">
            {url}
          </div>
        </div>
      )}
      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(false)}
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

if (modal.includes(oldSB)) {
  modal = modal.replace(oldSB, newSB);
  fs.writeFileSync(modalFile, modal, "utf8");
  console.log("OK — ActionItemModal ScreenshotBlock → lightbox");
} else {
  console.error("NOT FOUND in ActionItemModal — dumping first 300 chars of ScreenshotBlock:");
  const idx = modal.indexOf("function ScreenshotBlock");
  if (idx >= 0) console.log(modal.substring(idx, idx + 300));
  else console.log("(function not found at all)");
}

// ─── 2. dialogs.tsx ───
const dialogsFile = path.join(BASE, "artifacts/crm/src/pages/dialogs.tsx");
if (fs.existsSync(dialogsFile)) {
  let dlg = fs.readFileSync(dialogsFile, "utf8");
  // Find the exact pattern
  const lines = dlg.split("\n");
  const matchLines = [];
  lines.forEach((l, i) => {
    if (l.includes("screenshotUrl") && l.includes("target=\"_blank\"")) {
      matchLines.push({ line: i + 1, content: l.trim() });
    }
  });
  console.log("\n--- dialogs.tsx screenshotUrl lines ---");
  matchLines.forEach(m => console.log(m.line + ": " + m.content));
  
  // Try broader pattern
  const oldDlgPattern = /<a href=\{payload\.screenshotUrl\}[^>]*target="_blank"[^>]*>\s*\n\s*<img[^>]*screenshotUrl[^>]*\/>\s*\n\s*<\/a>/;
  if (oldDlgPattern.test(dlg)) {
    console.log("REGEX MATCH in dialogs.tsx");
  } else {
    console.log("NO REGEX MATCH in dialogs.tsx — showing context around screenshotUrl:");
    lines.forEach((l, i) => {
      if (l.includes("screenshotUrl")) {
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        for (let j = start; j < end; j++) {
          console.log((j+1) + ": " + lines[j]);
        }
        console.log("---");
      }
    });
  }
} else {
  console.log("SKIP — dialogs.tsx not found");
}

// ─── 3. master-chat.tsx ───
const chatFile = path.join(BASE, "artifacts/crm/src/pages/master-chat.tsx");
if (fs.existsSync(chatFile)) {
  let chat = fs.readFileSync(chatFile, "utf8");
  const lines = chat.split("\n");
  console.log("\n--- master-chat.tsx screenshot/photo lines ---");
  lines.forEach((l, i) => {
    if ((l.includes("screenshotUrl") || (l.includes("photoUrl") && l.includes("target"))) && i < lines.length - 1) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 4);
      for (let j = start; j < end; j++) {
        console.log((j+1) + ": " + lines[j]);
      }
      console.log("---");
    }
  });
} else {
  console.log("SKIP — master-chat.tsx not found");
}

// ─── 4. master-drawer.tsx ───
const drawerFile = path.join(BASE, "artifacts/crm/src/components/master-drawer.tsx");
if (fs.existsSync(drawerFile)) {
  let drawer = fs.readFileSync(drawerFile, "utf8");
  const lines = drawer.split("\n");
  console.log("\n--- master-drawer.tsx screenshot lines ---");
  lines.forEach((l, i) => {
    if (l.includes("screenshotUrl") && !l.includes("PassportPhoto")) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 4);
      for (let j = start; j < end; j++) {
        console.log((j+1) + ": " + lines[j]);
      }
      console.log("---");
    }
  });
} else {
  console.log("SKIP — master-drawer.tsx not found");
}

console.log("\nDone scanning!");
