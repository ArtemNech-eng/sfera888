import { useState, useRef } from "react";
import { ImagePlus, X, Loader2, ZoomIn } from "lucide-react";

interface PhotoUploaderProps {
  value: string[];
  onChange: (paths: string[]) => void;
  maxPhotos?: number;
}

const BASE = "/api";

async function uploadFile(file: File): Promise<string> {
  const urlRes = await fetch(`${BASE}/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!urlRes.ok) throw new Error("Не удалось получить URL загрузки");
  const { uploadURL, objectPath } = await urlRes.json();
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("Ошибка загрузки файла");
  return objectPath as string;
}

export function PhotoUploader({ value, onChange, maxPhotos = 8 }: PhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = maxPhotos - value.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const paths = await Promise.all(toUpload.map(uploadFile));
      onChange([...value, ...paths]);
    } catch (e) {
      console.error("Upload error:", e);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      {/* Previews grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {value.map((path, i) => (
            <div key={i} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
              <img
                src={`${BASE}/storage${path}`}
                alt={`Фото ${i + 1}`}
                className="w-full h-full object-cover"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => setPreview(`${BASE}/storage${path}`)}
                  className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-gray-700 hover:bg-white transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Upload slot */}
          {value.length < maxPhotos && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-primary"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Добавить</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Empty state — full-width drop zone */}
      {value.length === 0 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-primary", "bg-primary/5"); }}
          onDragLeave={e => { e.currentTarget.classList.remove("border-primary", "bg-primary/5"); }}
          onDrop={e => {
            e.preventDefault();
            e.currentTarget.classList.remove("border-primary", "bg-primary/5");
            handleFiles(e.dataTransfer.files);
          }}
          className="w-full py-6 rounded-2xl border-2 border-dashed border-gray-200 hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-primary"
        >
          {uploading ? (
            <>
              <Loader2 className="w-7 h-7 animate-spin" />
              <span className="text-sm font-medium">Загрузка...</span>
            </>
          ) : (
            <>
              <ImagePlus className="w-7 h-7" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Нажмите или перетащите фото</p>
                <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, WEBP · до {maxPhotos} фото</p>
              </div>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      {/* Lightbox */}
      {preview && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={preview}
            alt="Просмотр"
            className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
