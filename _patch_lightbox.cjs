const fs = require("fs");
const path = require("path");

// ─── 1. ActionItemModal.tsx — ScreenshotBlock лайтбокс ───
const modalFile = path.join(__dirname, "artifacts/crm/src/components/dashboard/ActionItemModal.tsx");
let modal = fs.readFileSync(modalFile, "utf8");

const oldScreenshot = `function ScreenshotBlock({ url }: { url: string }) {
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

const newScreenshot = `function ScreenshotBlock({ url }: { url: string }) {
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

if (modal.includes(oldScreenshot)) {
  modal = modal.replace(oldScreenshot, newScreenshot);
  fs.writeFileSync(modalFile, modal, "utf8");
  console.log("OK — ActionItemModal ScreenshotBlock → lightbox");
} else {
  console.error("NOT FOUND in ActionItemModal");
}

// ─── 2. dialogs.tsx — скриншот оплаты лайтбокс ───
const dialogsFile = path.join(__dirname, "artifacts/crm/src/pages/dialogs.tsx");
if (fs.existsSync(dialogsFile)) {
  let dlg = fs.readFileSync(dialogsFile, "utf8");
  // Find screenshot pattern: <a href={...} target="_blank"> <img ... screenshotUrl ... /> </a>
  const oldDlg = `<a href={payload.screenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
              <img src={payload.screenshotUrl} alt="Скриншот оплаты" className="w-full rounded-xl max-h-52 object-cover border border-green-200 hover:opacity-90 transition-opacity cursor-zoom-in" />
            </a>`;
  const newDlg = `<button
              type="button"
              onClick={() => setScreenshotLightbox(true)}
              className="block w-full text-left p-0 bg-transparent border-none"
            >
              <img src={payload.screenshotUrl} alt="Скриншот оплаты" className="w-full rounded-xl max-h-52 object-cover border border-green-200 hover:opacity-90 transition-opacity cursor-zoom-in" />
            </button>
            {screenshotLightbox && (
              <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setScreenshotLightbox(false)}>
                <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setScreenshotLightbox(false)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>
                  <p className="text-white text-xs mb-2 font-semibold">Скриншот оплаты</p>
                  <img src={payload.screenshotUrl} alt="Скриншот оплаты" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
                </div>
              </div>
            )}`;
  if (dlg.includes(oldDlg)) {
    // Add state variable
    dlg = dlg.replace(
      /const \[.*useState.*\n/,
      (m) => m + `  const [screenshotLightbox, setScreenshotLightbox] = useState(false);\n`
    );
    dlg = dlg.replace(oldDlg, newDlg);
    fs.writeFileSync(dialogsFile, dlg, "utf8");
    console.log("OK — dialogs.tsx screenshot → lightbox");
  } else {
    console.log("SKIP — dialogs.tsx pattern not found (may already be patched or different)");
  }
} else {
  console.log("SKIP — dialogs.tsx not found");
}

// ─── 3. master-chat.tsx — фото в чате лайтбокс ───
const chatFile = path.join(__dirname, "artifacts/crm/src/pages/master-chat.tsx");
if (fs.existsSync(chatFile)) {
  let chat = fs.readFileSync(chatFile, "utf8");
  // Pattern: <a href={resolvePhotoUrl(msg.photoUrl)} target="_blank"> <img ... /> </a>
  const oldChat = `<a href={resolvePhotoUrl(msg.photoUrl)} target="_blank" rel="noopener noreferrer" className="block mb-2">
                                  <img src={resolvePhotoUrl(msg.photoUrl)} alt="фото" className="rounded-xl max-w-full max-h-52 object-cover cursor-zoom-in" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                </a>`;
  const newChat = `<button
                                  type="button"
                                  onClick={() => setChatPhotoLightbox(resolvePhotoUrl(msg.photoUrl))}
                                  className="block mb-2 w-full text-left p-0 bg-transparent border-none"
                                >
                                  <img src={resolvePhotoUrl(msg.photoUrl)} alt="фото" className="rounded-xl max-w-full max-h-52 object-cover cursor-zoom-in" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                </button>`;
  if (chat.includes(oldChat)) {
    // Add state
    if (!chat.includes("chatPhotoLightbox")) {
      chat = chat.replace(
        /const \[.*useState.*\n/,
        (m) => m + `  const [chatPhotoLightbox, setChatPhotoLightbox] = useState<string | null>(null);\n`
      );
    }
    chat = chat.replace(oldChat, newChat);
    // Add lightbox overlay at end of return, before closing fragment
    const lightboxOverlay = `
            {chatPhotoLightbox && (
              <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setChatPhotoLightbox(null)}>
                <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setChatPhotoLightbox(null)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>
                  <img src={chatPhotoLightbox} alt="Фото" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
                </div>
              </div>
            )}`;
    // Insert before the last </> or </div> at component end — find a good spot
    if (!chat.includes("chatPhotoLightbox &&")) {
      // Add before the closing of the main return
      chat = chat.replace("</Popover>", `</Popover>${lightboxOverlay}`);
    }
    fs.writeFileSync(chatFile, chat, "utf8");
    console.log("OK — master-chat.tsx photo → lightbox");
  } else {
    console.log("SKIP — master-chat.tsx pattern not found");
  }
} else {
  console.log("SKIP — master-chat.tsx not found");
}

// ─── 4. master-drawer.tsx — скриншот оплаты лайтбокс ───
const drawerFile = path.join(__dirname, "artifacts/crm/src/components/master-drawer.tsx");
if (fs.existsSync(drawerFile)) {
  let drawer = fs.readFileSync(drawerFile, "utf8");
  // Find: <a href={...screenshotUrl...} target="_blank"> <img ... cursor-zoom-in /> </a>
  const patterns = [
    {
      old: `<a href={order.screenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={order.screenshotUrl}
                            alt="Скриншот оплаты"
                            className="w-full rounded-lg border border-emerald-200 object-cover max-h-36 hover:opacity-90 transition-opacity cursor-zoom-in"
                          />
                        </a>`,
      new: `<button
                          type="button"
                          onClick={() => setDrawerScreenshotLightbox(order.screenshotUrl)}
                          className="block w-full text-left p-0 bg-transparent border-none"
                        >
                          <img
                            src={order.screenshotUrl}
                            alt="Скриншот оплаты"
                            className="w-full rounded-lg border border-emerald-200 object-cover max-h-36 hover:opacity-90 transition-opacity cursor-zoom-in"
                          />
                        </button>`
    }
  ];
  let patched = false;
  for (const p of patterns) {
    if (drawer.includes(p.old)) {
      if (!drawer.includes("drawerScreenshotLightbox")) {
        drawer = drawer.replace(
          /const \[.*useState.*\n/,
          (m) => m + `  const [drawerScreenshotLightbox, setDrawerScreenshotLightbox] = useState<string | null>(null);\n`
        );
      }
      drawer = drawer.replace(p.old, p.new);
      patched = true;
    }
  }
  if (patched) {
    // Add lightbox overlay
    if (!drawer.includes("drawerScreenshotLightbox &&")) {
      const overlay = `
          {drawerScreenshotLightbox && (
            <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setDrawerScreenshotLightbox(null)}>
              <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                <button onClick={() => setDrawerScreenshotLightbox(null)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>
                <p className="text-white text-xs mb-2 font-semibold">Скриншот оплаты</p>
                <img src={drawerScreenshotLightbox} alt="Скриншот оплаты" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
              </div>
            </div>
          )}`;
      drawer = drawer.replace("</SheetContent>", `${overlay}</SheetContent>`);
    }
    fs.writeFileSync(drawerFile, drawer, "utf8");
    console.log("OK — master-drawer.tsx screenshot → lightbox");
  } else {
    console.log("SKIP — master-drawer.tsx pattern not found");
  }
} else {
  console.log("SKIP — master-drawer.tsx not found");
}

console.log("\nDone!");
